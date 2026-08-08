import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { withUniqueCodeRetry } from '@/lib/claim-code';

export const runtime = 'nodejs';

/**
 * A coach adds one roster player to a team they're already linked to
 * (enforced by RLS's "players: coaches can add roster players to their
 * team" policy) and its card, generating the claim token. This is the only
 * time that token is ever returned — no endpoint re-exposes it later.
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

  if (!teamId || !name?.trim()) {
    return NextResponse.json({ error: 'teamId and name are required' }, { status: 400 });
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
    return NextResponse.json({ error: playerError?.message ?? 'Could not create player' }, { status: 500 });
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
    return NextResponse.json({ error: cardResult.error?.message ?? 'Could not generate a claim code' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, playerId: player.id, claimToken: cardResult.code });
}
