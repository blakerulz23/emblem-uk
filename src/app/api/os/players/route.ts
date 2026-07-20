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
  const { teamId, name, position, age, height, preferredFoot, squadNumber } = body as {
    teamId?: string;
    name?: string;
    position?: string;
    age?: number;
    height?: string;
    preferredFoot?: 'Left' | 'Right';
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
      age: age ?? null,
      height: height ?? null,
      preferred_foot: preferredFoot ?? null,
      squad_number: squadNumber ?? null,
    })
    .select()
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
