import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { generateStoryUpdate } from '@/lib/story-updates';
import { activateCoachAssignment, ensureProfileRole } from '@/lib/relationship-writes';
import { logRouteFailure } from '@/lib/route-failure';

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
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
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

/** Confirms a team invite — requires auth. Single-use: rejects if already used or expired. */
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
  const { data: invite } = await serviceRole
    .from('team_invites')
    .select('id, used_at, expires_at, team_id')
    .eq('code', code)
    .maybeSingle();

  if (!invite || invite.used_at || new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This invite isn't valid or has expired" }, { status: 400 });
  }

  // coach_team.profile_id is a foreign key into profiles — must exist
  // before the assignment below, same reasoning as the guardian
  // invite/claim routes. 'coach' is set only when the profile has no role
  // yet: a parent accepting a team invite keeps the parent view and gains
  // the coach one (access comes from the relationships, not the role).
  const profile = await ensureProfileRole(serviceRole, user.id, 'coach', displayName);
  if (!profile.ok) {
    return NextResponse.json({ error: 'Could not set up your account. Please try again.' }, { status: 500 });
  }

  // Creates the assignment, or reactivates an ended/expired one for the
  // same team: a valid invite is staff's decision to (re)admit this coach.
  const assignment = await activateCoachAssignment(serviceRole, {
    teamId: invite.team_id,
    profileId: user.id,
    createdVia: 'team_invite',
    actorProfileId: user.id,
  });
  if (!assignment.ok) {
    return NextResponse.json({ error: 'Could not accept this invite. Please try again.' }, { status: 500 });
  }
  if (!assignment.changed) {
    return NextResponse.json({ error: "You're already managing this team" }, { status: 409 });
  }

  const { error: inviteUpdateError } = await serviceRole
    .from('team_invites')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', invite.id);
  if (inviteUpdateError) {
    logRouteFailure('team invite redeem: mark used', inviteUpdateError);
    return NextResponse.json({ error: 'Could not accept this invite. Please try again.' }, { status: 500 });
  }

  // One story_updates row per player_id (the schema is per-player, not
  // per-team), so a coach joining a team notifies every one of that team's
  // players' guardians individually.
  const [{ data: teamPlayers }, { data: actor }] = await Promise.all([
    serviceRole.from('players').select('id, name').eq('team_id', invite.team_id),
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

  return NextResponse.json({ ok: true, teamId: invite.team_id });
}
