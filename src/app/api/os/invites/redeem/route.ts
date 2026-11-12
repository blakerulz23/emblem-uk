import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { RATE_LIMIT_MESSAGE, getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { maskEmail } from '@/lib/mask-email';
import { generateStoryUpdate } from '@/lib/story-updates';
import { ensurePublicPlayerId } from '@/lib/public-player-id';
import { getEligibleCoachProfileIds } from '@/lib/player-capabilities';
import { ensureProfileRole } from '@/lib/relationship-writes';
import { logRouteFailure, type DbError } from '@/lib/route-failure';
import { checkGuardianInviteRedemption, GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE, redeemerMatchesInvitedEmail } from '@/lib/guardian-invite-eligibility';
import { checkGiftFirstGuardianClaim, checkGiftOrderInviteRedemption, GIFT_PROFILE_REFUSED_MESSAGE } from '@/lib/gift-order-guardian';

export const runtime = 'nodejs';

const INVITE_INVALID_MESSAGE = "This invite isn't valid or has expired";

type InviteLookupRow = {
  id: string;
  used_at: string | null;
  expires_at: string;
  player_id: string;
  invited_email: string | null;
  players: {
    name: string;
    teams: {
      name: string;
      clubs: { name: string; badge_url: string | null } | null;
      seasons: { label: string } | null;
    } | null;
  } | null;
};

/**
 * Redeeming an invite code — the redeemer has no relationship to the
 * player yet (that's the point), so this uses the service-role client,
 * same reasoning as the card claim_token lookup. Shares the
 * claim_attempts rate-limit log with card codes.
 */
export async function GET(request: NextRequest) {
  const identifier = getRequestIdentifier(request.headers);
  if (!(await isWithinRateLimit(identifier))) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const rawCode = request.nextUrl.searchParams.get('code');
  if (!rawCode) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(rawCode);

  const serviceRole = createServiceRoleClient();
  const { data } = await serviceRole
    .from('player_invites')
    .select(
      `id, used_at, expires_at, player_id, invited_email,
       players ( name, teams ( name, clubs ( name, badge_url ), seasons ( label ) ) )`
    )
    .eq('code', code)
    .maybeSingle<InviteLookupRow>();

  const valid = !!data && !data.used_at && new Date(data.expires_at) > new Date();
  await logClaimAttempt(identifier, code, valid);

  if (!valid || !data) {
    return NextResponse.json({ found: false });
  }

  const player = data.players;
  const [firstName, ...rest] = (player?.name ?? '').trim().split(/\s+/);
  const lastInitial = rest.length ? rest[rest.length - 1][0] : '';

  // The raw address never leaves the server — only a masked display value
  // and a boolean. /api/os/invites/send-code and verify-code re-derive the
  // real address themselves when it's actually needed.
  const masked = maskEmail(data.invited_email);

  return NextResponse.json({
    found: true,
    inviteCode: code,
    hasIntendedEmail: !!masked,
    maskedEmail: masked,
    player: {
      firstName,
      lastInitial,
      team: player?.teams ? { name: player.teams.name, season: player.teams.seasons?.label } : null,
      club: player?.teams?.clubs ? { name: player.teams.clubs.name, badgeUrl: player.teams.clubs.badge_url } : null,
    },
  });
}

/** Confirms an invite — requires auth. Single-use: rejects if already used or expired. */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { inviteCode, displayName, relationship } = body as {
    inviteCode?: string;
    displayName?: string;
    relationship?: string;
  };
  if (!inviteCode) {
    return NextResponse.json({ error: 'inviteCode is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(inviteCode);

  const serviceRole = createServiceRoleClient();
  const { data: invite } = await serviceRole
    .from('player_invites')
    .select('id, used_at, expires_at, player_id, created_by, order_id, invited_email')
    .eq('code', code)
    .maybeSingle();

  if (!invite || invite.used_at || new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: INVITE_INVALID_MESSAGE }, { status: 400 });
  }

  // Before any write: an invite sent to a named recipient can only be
  // accepted by that recipient's verified account. A mismatch looks exactly
  // like an invalid invite, revealing nothing about who it was for.
  if (!redeemerMatchesInvitedEmail(invite.invited_email, user)) {
    return NextResponse.json({ error: INVITE_INVALID_MESSAGE }, { status: 400 });
  }

  // Before any write: a coach, or the invite's own creator, must not be able
  // to link themselves as a guardian, and an invite must carry real authority
  // (a current guardian, a trusted order, or a still-active coach). Every
  // refusal is the same fixed 403.
  const eligibility = await checkGuardianInviteRedemption(
    serviceRole,
    { player_id: invite.player_id, created_by: invite.created_by ?? null, order_id: invite.order_id ?? null, invited_email: invite.invited_email ?? null },
    user.id
  );
  if (eligibility.outcome === 'failed') {
    logRouteFailure('guardian invite redeem: eligibility', eligibility.error as DbError);
    return NextResponse.json({ error: 'Could not accept this invite. Please try again.' }, { status: 500 });
  }
  if (eligibility.outcome === 'refused') {
    return NextResponse.json({ error: GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE }, { status: 403 });
  }

  // Before any write: a child whose card came from a gift order (made by a
  // coach, organiser or other adult) gets its first guardian only through
  // the guardian who approved it, so an invite that reached the buyer, or
  // was forwarded, can't make them the child's guardian.
  const giftCheck = await checkGiftFirstGuardianClaim(serviceRole, invite.player_id, user);
  if (giftCheck.outcome === 'failed') {
    return NextResponse.json({ error: 'Could not accept this invite. Please try again.' }, { status: 500 });
  }
  if (giftCheck.outcome === 'refused') {
    return NextResponse.json({ error: GIFT_PROFILE_REFUSED_MESSAGE }, { status: 403 });
  }

  // Before any write, and whether or not the child already has a guardian:
  // an invite tied to a single-card gift order is redeemable only by the
  // guardian who approved that order. An older invite held by the buyer (an
  // order_approval invite, or a recovery handoff they addressed) must not
  // add them as a second guardian once the real guardian has linked.
  const giftOrderCheck = await checkGiftOrderInviteRedemption(serviceRole, invite.order_id ?? null, user);
  if (giftOrderCheck.outcome === 'failed') {
    return NextResponse.json({ error: 'Could not accept this invite. Please try again.' }, { status: 500 });
  }
  if (giftOrderCheck.outcome === 'refused') {
    return NextResponse.json({ error: GIFT_PROFILE_REFUSED_MESSAGE }, { status: 403 });
  }

  // guardians.profile_id is a foreign key into profiles — must exist
  // before the guardians insert below, same reasoning as /api/os/claim.
  // 'parent' is set only when the profile has no role yet.
  const profile = await ensureProfileRole(serviceRole, user.id, 'parent', displayName);
  if (!profile.ok) {
    return NextResponse.json({ error: 'Could not set up your account. Please try again.' }, { status: 500 });
  }

  const { error: guardianError } = await serviceRole.from('guardians').insert({
    player_id: invite.player_id,
    profile_id: user.id,
    relationship: relationship?.trim() || null,
    created_via: 'guardian_invite',
    created_by: user.id,
  });

  if (guardianError) {
    if (guardianError.code === '23505') {
      return NextResponse.json({ error: "You've already got access to this player" }, { status: 409 });
    }
    logRouteFailure('guardian invite redeem: guardian link', guardianError);
    return NextResponse.json({ error: 'Could not accept this invite. Please try again.' }, { status: 500 });
  }

  const { error: inviteUpdateError } = await serviceRole
    .from('player_invites')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', invite.id);
  if (inviteUpdateError) {
    logRouteFailure('guardian invite redeem: mark used', inviteUpdateError);
    return NextResponse.json({ error: 'Could not accept this invite. Please try again.' }, { status: 500 });
  }

  // If this invite reached a card that was never independently claimed
  // (e.g. a purchaser's "send to the right parent" handoff before anyone
  // used the original claim_token), lock it now too — the original code
  // shouldn't still work once a guardian is linked via any route.
  // Checked and retried once. If it still fails the guardian link stands
  // (the invite is already used), so the failure is logged for staff; the
  // card claim and purchaser recovery routes independently refuse a gift
  // order's card to anyone but the approving guardian or an existing
  // guardian, so an unlocked card can't add the buyer.
  const lockCards = () =>
    serviceRole.from('cards').update({ status: 'claimed' }).eq('player_id', invite.player_id).neq('status', 'claimed');
  let { error: lockError } = await lockCards();
  if (lockError) ({ error: lockError } = await lockCards());
  if (lockError) logRouteFailure('guardian invite redeem: card lock', lockError);

  // This is the other of the two genuine "first guardian ever" paths
  // (alongside POST /api/os/claim's card-token path) — a player claimed
  // purely via an order-approval invite, with the physical card never
  // tapped, still needs a public identity. Idempotent: a no-op if this
  // player was already claimed via the card path first.
  await ensurePublicPlayerId(serviceRole, invite.player_id);

  const [{ data: player }, { data: actor }] = await Promise.all([
    serviceRole.from('players').select('name').eq('id', invite.player_id).maybeSingle(),
    serviceRole.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const eligibleCoachIds = await getEligibleCoachProfileIds(serviceRole, invite.player_id);
  if (eligibleCoachIds.length) {
    await generateStoryUpdate({
      eventType: 'guardian_connected',
      playerId: invite.player_id,
      actorProfileId: user.id,
      recipients: eligibleCoachIds.map((profileId) => ({ profileId, presenceScope: `coach-player:${invite.player_id}` })),
      title: 'Guardian Connected',
      body: `${actor?.display_name ?? 'A guardian'} is now connected to ${player?.name ?? 'your player'}.`,
    });
  }

  return NextResponse.json({ ok: true, playerId: invite.player_id });
}
