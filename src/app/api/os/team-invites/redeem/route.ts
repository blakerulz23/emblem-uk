import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { RATE_LIMIT_MESSAGE, getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { generateStoryUpdate } from '@/lib/story-updates';
import { logRouteFailure } from '@/lib/route-failure';
import { COACH_ACCESS_PAUSED_MESSAGE, DELETION_REVIEW_PENDING, isDeletionReviewPending } from '@/lib/deletion-review';

export const runtime = 'nodejs';

type TeamInviteLookupRow = {
  id: string;
  used_at: string | null;
  expires_at: string;
  team_id: string;
  teams: {
    name: string;
    clubs: { name: string; badge_url: string | null } | null;
    seasons: { label: string } | null;
  } | null;
};

/**
 * Redeeming a team invite — mirrors invites/redeem/route.ts exactly, for
 * a team instead of a player. The redeemer has no relationship to the
 * team yet, so this uses the service-role client; shares the
 * claim_attempts rate-limit log with every other code type.
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
    .from('team_invites')
    .select('id, used_at, expires_at, team_id, teams ( name, clubs ( name, badge_url ), seasons ( label ) )')
    .eq('code', code)
    .maybeSingle<TeamInviteLookupRow>();

  const valid = !!data && !data.used_at && new Date(data.expires_at) > new Date();
  await logClaimAttempt(identifier, code, valid);

  if (!valid || !data) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    inviteCode: code,
    team: data.teams ? { name: data.teams.name, season: data.teams.seasons?.label } : null,
    club: data.teams?.clubs ? { name: data.teams.clubs.name, badgeUrl: data.teams.clubs.badge_url } : null,
  });
}

const TEAM_INVITE_UNUSABLE = "This invite isn't valid or has expired";
const TEAM_INVITE_FAILED = 'Could not accept this invite. Please try again.';

type RedeemTeamInviteRow = {
  status:
    | 'redeemed'
    | 'already_redeemed_by_you'
    | 'already_active'
    | 'stale_after_end'
    | 'stale_after_expiry'
    | 'invalid'
    | typeof DELETION_REVIEW_PENDING;
  team_id: string | null;
};

/**
 * Confirms a team invite — requires auth. The whole write is one call to
 * the atomic redeem_team_invite (0088), for the session's own account:
 * it consumes the invite exactly once, sets the coach role only when the
 * profile has none, and creates or reactivates the assignment. An invite
 * issued at or before the moment this coach's previous access to the team
 * ended or expired never restores it. Every refusal reads the same as an
 * unknown or expired invite, so nothing is revealed about earlier access.
 * The one exception is the account's own state (0098): while its deletion
 * request is under staff review it gets the paused-access 409 instead.
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

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole.rpc('redeem_team_invite', {
    p_code: code,
    p_coach_profile_id: user.id,
    p_display_name: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null,
  });
  if (error) {
    // 0098: a deletion review that began while this call ran (the database
    // guard refused the assignment). Nothing changed; the invite is unused.
    if (isDeletionReviewPending(error)) {
      return NextResponse.json({ error: COACH_ACCESS_PAUSED_MESSAGE }, { status: 409 });
    }
    logRouteFailure('team invite redeem', error);
    return NextResponse.json({ error: TEAM_INVITE_FAILED }, { status: 500 });
  }
  const result = (Array.isArray(data) ? data[0] : data) as RedeemTeamInviteRow | null;

  // 0098: this account's deletion request is under staff review, so it gets
  // no coach access. Nothing changed and the invite stays unused.
  if (result?.status === DELETION_REVIEW_PENDING) {
    return NextResponse.json({ error: COACH_ACCESS_PAUSED_MESSAGE }, { status: 409 });
  }

  if (result?.status === 'already_active') {
    return NextResponse.json({ error: "You're already managing this team" }, { status: 409 });
  }
  if (result?.status === 'already_redeemed_by_you' && result.team_id) {
    // A retry by the coach who redeemed it, while that access stands: same
    // answer, nothing written, nobody notified again.
    return NextResponse.json({ ok: true, teamId: result.team_id });
  }
  if (result?.status !== 'redeemed' || !result.team_id) {
    return NextResponse.json({ error: TEAM_INVITE_UNUSABLE }, { status: 400 });
  }
  const teamId = result.team_id;

  // One story_updates row per player_id (the schema is per-player, not
  // per-team), so a coach joining a team notifies every one of that team's
  // players' guardians individually.
  const [{ data: teamPlayers }, { data: actor }] = await Promise.all([
    serviceRole.from('players').select('id, name').eq('team_id', teamId),
    serviceRole.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const actorName = actor?.display_name ?? 'A new coach';
  await Promise.all(
    (teamPlayers ?? []).map(async (p) => {
      const { data: guardianRows } = await serviceRole.from('guardians').select('profile_id').eq('player_id', p.id);
      await generateStoryUpdate({
        eventType: 'coach_connected',
        playerId: p.id,
        actorProfileId: user.id,
        recipients: (guardianRows ?? []).map((g) => ({ profileId: g.profile_id, presenceScope: `coach-player:${p.id}` })),
        title: 'Coach Connected',
        body: `${actorName} is now coaching ${p.name}'s team.`,
      });
    })
  );

  return NextResponse.json({ ok: true, teamId });
}
