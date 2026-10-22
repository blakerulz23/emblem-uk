import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { withUniqueCodeRetry } from '@/lib/claim-code';
import { isCanonicalPosition } from '@/lib/player-position';
import { isPermissionDenied } from '@/lib/permission-denied';
import { checkActiveTeamAssignment, ROSTER_ADD_DENIED_MESSAGE, ROSTER_ADD_FAILED_MESSAGE } from '@/lib/team-roster-permission';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A coach adds one roster player to a team they hold an active assignment
 * for (enforced by RLS's "players: coaches can add roster players to their
 * team" policy) and its card, generating the claim token. This is the only
 * time that token is ever returned — no endpoint re-exposes it later.
 *
 * An ended, expired, unrelated or role-only coach gets a 403 with a stable
 * message, both from the assignment check below and if RLS refuses the
 * insert anyway. Database error text never reaches the client.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  // age/height are deliberately not accepted here any more — both columns
  // are dropped in Stage 3 (0039_player_legacy_columns_contract.sql, an
  // optional, deferred migration — see its header):
  // provably unused, never written by any route, confirmed by a read-only
  // production audit. date_of_birth/height_cm are coach-managed and set
  // later, from Coach Player Details, never at roster-creation time.
  //
  // preferredFoot is also deliberately not accepted here — it moved to
  // update_player_coach_fields alongside the other four coach-owned
  // fields (see 0036_player_coach_fields_secure_expand.sql's Part 6): a
  // new roster player is created with preferred_foot left null, and it is
  // set afterward through that one validated RPC, the same as every other
  // coach-owned field. This is what keeps that RPC the *only* effective
  // write path for preferred_foot — 0036's INSERT grant no longer includes
  // the column at all, so sending it here would fail outright, not
  // silently succeed via a second, ungoverned path.
  const { teamId, name, position, squadNumber } = body as {
    teamId?: string;
    name?: string;
    position?: string;
    squadNumber?: number;
  };

  if (!teamId || !UUID.test(teamId) || !name?.trim()) {
    return NextResponse.json({ error: 'teamId and name are required' }, { status: 400 });
  }
  // Position is optional at roster-creation time, but if one is sent it
  // must be one of the five simplified categories — never a raw legacy
  // specific-position code reintroduced through this path.
  if (position && !isCanonicalPosition(position)) {
    return NextResponse.json({ error: 'Choose one of the five position categories.' }, { status: 400 });
  }

  const assignment = await checkActiveTeamAssignment(supabase, teamId, user.id);
  if (assignment === 'error') {
    console.error('Roster add: coach assignment lookup failed');
    return NextResponse.json({ error: ROSTER_ADD_FAILED_MESSAGE }, { status: 500 });
  }
  if (assignment === 'none') {
    return NextResponse.json({ error: ROSTER_ADD_DENIED_MESSAGE }, { status: 403 });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      team_id: teamId,
      name: name.trim(),
      position: position ?? null,
      squad_number: squadNumber ?? null,
    })
    // Explicit column, not a bare .select() (which defaults to `*`, and
    // now fails outright for `authenticated` —
    // 0036_player_coach_fields_secure_expand.sql revokes table-level
    // SELECT on `players` and re-grants only an explicit column list that
    // does not include date_of_birth; `*` errors if it would reference any
    // column the caller lacks privilege on). Only `player.id` is read
    // below.
    .select('id')
    .single();

  if (playerError || !player) {
    // The assignment can end between the check and the insert; RLS refuses then.
    if (isPermissionDenied(playerError)) {
      return NextResponse.json({ error: ROSTER_ADD_DENIED_MESSAGE }, { status: 403 });
    }
    console.error('Roster add: player insert failed', { code: playerError?.code ?? 'no-row' });
    return NextResponse.json({ error: ROSTER_ADD_FAILED_MESSAGE }, { status: 500 });
  }

  // cards has no client-facing insert policy at all (by design — a
  // claim_token must never be writable via an ordinary authenticated
  // request) — this insert runs via the service-role client, justified
  // since the player insert above already proved this coach's authority
  // over the team via RLS.
  const serviceRole = createServiceRoleClient();
  const cardResult = await withUniqueCodeRetry((code) =>
    serviceRole
      .from('cards')
      .insert({ claim_token: code, player_id: player.id, status: 'assigned' })
      .select()
      .single()
  );

  if (cardResult.error || !cardResult.data || !cardResult.code) {
    console.error('Roster add: claim card insert failed', { code: cardResult.error?.code ?? 'no-row' });
    return NextResponse.json({ error: 'Could not generate a claim code. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, playerId: player.id, claimToken: cardResult.code });
}
