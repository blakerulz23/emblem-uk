import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { claimPlayerForCard } from '@/lib/claim-player';
import { ensurePublicPlayerId } from '@/lib/public-player-id';
import { resolveCardCode } from '@/lib/card-lookup';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

/**
 * Looks up a card by its claim_token via the shared resolver (card-lookup.ts
 * — also used by src/app/os/page.tsx's server-side redirect for a physical
 * tap). No session required to call this: it matches "look up before auth,"
 * and this route's own rate limiting is the abuse control, not
 * authentication. Still used for the unclaimed flow's manual/auto code
 * entry (ClaimCodeEntry) — an already-claimed card's *capabilities* are
 * never resolved here anymore; that question belongs entirely to
 * /player/[publicPlayerId] now.
 */
export async function GET(request: NextRequest) {
  const identifier = getRequestIdentifier(request.headers);
  if (!(await isWithinRateLimit(identifier))) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const rawCode = request.nextUrl.searchParams.get('code');
  if (!rawCode) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(rawCode);

  const result = await resolveCardCode(code);
  await logClaimAttempt(identifier, code, result.status !== 'not_found');

  if (result.status === 'not_found') {
    return NextResponse.json({ found: false });
  }
  if (result.status === 'claimed_unavailable') {
    return NextResponse.json({ found: true, alreadyClaimed: true, status: 'claimed_unavailable' });
  }
  if (result.status === 'claimed') {
    return NextResponse.json({ found: true, alreadyClaimed: true, status: 'claimed', publicPlayerId: result.publicPlayerId });
  }

  return NextResponse.json({
    found: true,
    alreadyClaimed: false,
    status: 'unclaimed',
    claimToken: result.claimToken,
    player: result.player,
  });
}

/**
 * Confirms a claim — requires auth. Re-verifies the card is still
 * `assigned` (defense against a race between two people claiming the same
 * code at once), links the guardian, flips the card to `claimed`, and sets
 * the profile's role. The guardians insert and card-status update both run
 * via the service-role client, immediately after this route's own
 * verification — RLS's "guardians: a parent can link themselves" policy is
 * a baseline backstop, not the authoritative check here (RLS can't see
 * whether the right code was presented, only stored row state).
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
  const { claimToken, displayName, relationship } = body as {
    claimToken?: string;
    displayName?: string;
    relationship?: string;
  };
  if (!claimToken) {
    return NextResponse.json({ error: 'claimToken is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(claimToken);

  const serviceRole = createServiceRoleClient();
  const { data: card } = await serviceRole
    .from('cards')
    .select('id, status, player_id')
    .eq('claim_token', code)
    .maybeSingle();

  if (!card) {
    return NextResponse.json({ error: "This code isn't valid or has already been claimed" }, { status: 400 });
  }

  // guardians.profile_id is a foreign key into profiles — a brand-new
  // account has no profiles row yet, so this upsert must happen before
  // claimPlayerForCard's guardians insert, not after.
  const profileUpsert: Record<string, unknown> = { id: user.id, role: 'parent' };
  if (displayName?.trim()) profileUpsert.display_name = displayName.trim();
  const { error: roleError } = await supabase.from('profiles').upsert(profileUpsert);
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const result = await claimPlayerForCard(serviceRole, card, user.id, relationship?.trim() || null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Generated in the same claim transaction, per the locked decision that
  // a public identity is a property of the claim itself, never a later
  // read — immediately after the guardian link succeeds, before anything
  // else in this handler.
  await ensurePublicPlayerId(serviceRole, result.playerId);

  const [{ data: player }, { data: actor }] = await Promise.all([
    serviceRole.from('players').select('name, team_id').eq('id', result.playerId).maybeSingle(),
    serviceRole.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  if (player?.team_id) {
    const { data: coachRows } = await serviceRole.from('coach_team').select('profile_id').eq('team_id', player.team_id);
    await generateStoryUpdate({
      eventType: 'guardian_connected',
      playerId: result.playerId,
      actorProfileId: user.id,
      recipients: (coachRows ?? []).map((c) => ({ profileId: c.profile_id, presenceScope: `coach-player:${result.playerId}` })),
      title: 'Guardian Connected',
      body: `${actor?.display_name ?? 'A guardian'} is now connected to ${player?.name ?? 'your player'}.`,
    });
  }

  return NextResponse.json({ ok: true, playerId: result.playerId });
}
