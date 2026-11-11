import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { RATE_LIMIT_MESSAGE, getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

type CoachInviteLookupRow = {
  id: string;
  used_at: string | null;
  used_by: string | null;
  expires_at: string;
  player_id: string;
  // NULL once the creating guardian deletes their account.
  created_by: string | null;
  players: {
    name: string;
    teams: {
      name: string;
      clubs: { name: string; badge_url: string | null } | null;
      seasons: { label: string } | null;
    } | null;
  } | null;
};

/** The invite's creator is still a guardian of its player (not removed, not a deleted account). */
async function inviterIsCurrentGuardian(
  serviceRole: ReturnType<typeof createServiceRoleClient>,
  invite: { player_id: string; created_by: string | null }
): Promise<boolean> {
  if (!invite.created_by) return false;
  const { data } = await serviceRole
    .from('guardians')
    .select('player_id')
    .eq('player_id', invite.player_id)
    .eq('profile_id', invite.created_by)
    .maybeSingle();
  return !!data;
}

/**
 * Public lookup for a coach invite code — the redeemer (a coach) has no
 * relationship to the player yet, so this uses the service-role client,
 * same reasoning as player_invites'/team_invites' own redeem GETs. Shares
 * the claim_attempts rate-limit log with every other code type.
 *
 * Returns only firstName + lastInitial (never the full name) plus
 * team/club context if the player has one — same minimum-disclosure shape
 * player_invites/redeem/route.ts already uses, not a full player_id row.
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
    .from('coach_invites')
    .select(`id, used_at, used_by, expires_at, player_id, created_by,
       players ( name, teams ( name, clubs ( name, badge_url ), seasons ( label ) ) )`)
    .eq('code', code)
    .maybeSingle<CoachInviteLookupRow>();

  const valid =
    !!data && !data.used_at && new Date(data.expires_at) > new Date() && (await inviterIsCurrentGuardian(serviceRole, data));
  await logClaimAttempt(identifier, code, valid);

  // Invalid, expired, and already-used codes all collapse to the same
  // { found: false } — never distinguishing which, so a lookup can't be
  // used to probe whether a given code once existed.
  if (!valid || !data) {
    return NextResponse.json({ found: false });
  }

  const player = data.players;
  const [firstName, ...rest] = (player?.name ?? '').trim().split(/\s+/);
  const lastInitial = rest.length ? rest[rest.length - 1][0] : '';

  return NextResponse.json({
    found: true,
    inviteCode: code,
    player: {
      firstName,
      lastInitial,
      team: player?.teams ? { name: player.teams.name, season: player.teams.seasons?.label } : null,
      club: player?.teams?.clubs ? { name: player.teams.clubs.name, badgeUrl: player.teams.clubs.badge_url } : null,
    },
  });
}

/**
 * Confirms a coach invite — requires auth. `auth.getUser()` is the only
 * source of the profile_id ever written into coach_players; nothing here
 * accepts a coach profile id from the request body.
 *
 * Email-matching decision (documented explicitly, per the milestone
 * spec): the signed-in account is NOT required to match invited_email.
 * This follows the existing precedent exactly — player_invites/redeem's
 * POST never checks the redeemer's email against invited_email either
 * (see src/app/api/os/invites/redeem/route.ts); invited_email there and
 * here is informational/delivery-targeting only. The code itself is the
 * credential, same as every other invite/claim mechanism in this
 * codebase (card claim_token, player_invites, team_invites) — none of
 * them gate redemption on the signed-in identity matching an email on
 * file. Introducing that check only for coach_invites would be a new,
 * inconsistent security model for one invite type, not a hardening of
 * an existing one.
 *
 * Atomic (migration 0088): the whole redemption is one database call,
 * redeem_coach_invite. It claims the invite with a single conditional
 * update (unused, unexpired, creator still a guardian), then ensures the
 * coach's profile and role and creates the direct link, all in one
 * transaction, so one invite can create at most one link and a failure
 * leaves the invite unused. This route writes nothing itself.
 *
 * Idempotency: if this exact invite was already used by this exact
 * signed-in coach and their link still exists (e.g. a double-submitted
 * redemption), it succeeds again without changing anything or notifying
 * anyone. Every other unusable invite (unknown, expired, used by anyone
 * else, or created by someone no longer a guardian) gets the same generic
 * error. A coach already directly connected to this player by another
 * route gets 409, and the invite stays unused.
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
  const { inviteCode, displayName } = body as { inviteCode?: string; displayName?: string };
  if (!inviteCode) {
    return NextResponse.json({ error: 'inviteCode is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(inviteCode);

  // One atomic database call: claim, profile/role (set to 'coach' only if
  // the profile has none, so a parent keeps the parent view), and the
  // direct link. The coach is always the session's own account.
  const serviceRole = createServiceRoleClient();
  const { data: rows, error } = await serviceRole.rpc('redeem_coach_invite', {
    p_code: code,
    p_coach_profile_id: user.id,
    p_display_name: displayName?.trim() || null,
  });
  if (error) {
    return NextResponse.json({ error: 'Could not redeem this invite — try again' }, { status: 500 });
  }
  const result = (Array.isArray(rows) ? rows[0] : rows) as { status: string; player_id: string | null } | undefined;

  if (result?.status === 'already_redeemed_by_you' && result.player_id) {
    // A retry of a redemption this coach already completed: nothing changed.
    return NextResponse.json({ ok: true, playerId: result.player_id, alreadyConnected: true });
  }
  if (result?.status === 'already_connected') {
    return NextResponse.json({ error: "You're already connected to this player" }, { status: 409 });
  }
  if (result?.status !== 'redeemed' || !result.player_id) {
    return NextResponse.json({ error: "This invite isn't valid or has expired" }, { status: 400 });
  }
  const invite = { player_id: result.player_id };

  // Reuses the existing coach_connected event type as-is (already used
  // by team-invites/redeem for the team path) — only fired for a new
  // 'redeemed' result, after the database has committed the claim and the
  // link, never for the idempotent alreadyConnected return above (nothing
  // changed there to report). One invite can be 'redeemed' only once.
  const [{ data: guardianRows }, { data: player }, { data: actor }] = await Promise.all([
    serviceRole.from('guardians').select('profile_id').eq('player_id', invite.player_id),
    serviceRole.from('players').select('name').eq('id', invite.player_id).maybeSingle(),
    serviceRole.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const actorName = actor?.display_name ?? 'A coach';
  const playerName = player?.name ?? 'your player';
  const [firstName] = playerName.trim().split(/\s+/);
  await generateStoryUpdate({
    eventType: 'coach_connected',
    playerId: invite.player_id,
    actorProfileId: user.id,
    recipients: (guardianRows ?? []).map((g) => ({ profileId: g.profile_id, presenceScope: `coach-player:${invite.player_id}` })),
    title: 'Coach Connected',
    body: `${actorName} is now connected as ${firstName}'s coach.`,
  });

  return NextResponse.json({ ok: true, playerId: invite.player_id });
}
