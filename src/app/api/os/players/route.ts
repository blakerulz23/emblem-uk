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
  // age/height/preferredFoot are deliberately no longer accepted here —
  // compatibility groundwork for the upcoming Coach Player Details feature
  // (age becomes a calculated value, not a stored one; height/preferred
  // foot move to a coach-managed edit screen). None of the three has ever
  // been set through this route in production (confirmed by a read-only
  // audit: zero non-null rows for all three across every existing player).
  // Removing them now, ahead of that feature's schema change, keeps this
  // route already compatible with the column layout that change will
  // introduce, without depending on anything it hasn't shipped yet.
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
    // Explicit column, not a bare .select() (which defaults to `*`) —
    // hardening ahead of the same upcoming schema change: once it lands
    // and revokes broad table-level SELECT, `*` would error outright for
    // referencing a column this role lacks privilege on. Only `player.id`
    // is read below, so this is a no-op today and a requirement tomorrow.
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
