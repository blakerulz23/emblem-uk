import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type TeamInviteLookupRow = {
  id: string;
  used_at: string | null;
  expires_at: string;
  team_id: string;
  teams: {
    name: string;
    season: string;
    clubs: { name: string; badge_url: string | null } | null;
  } | null;
};

/**
 * Redeeming a team invite — mirrors invites/redeem/route.ts exactly, for
 * a team instead of a player. The redeemer has no relationship to the
 * team yet, so this uses the service-role client; shares the
 * claim_attempts rate-limit log with every other code type.
 */
export async function GET(request: NextRequest) {
  const identifier = getRequestIdentifier(request);
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
    .select('id, used_at, expires_at, team_id, teams ( name, season, clubs ( name, badge_url ) )')
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
    team: data.teams ? { name: data.teams.name, season: data.teams.season } : null,
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
  // before the coach_team insert below, same reasoning as the guardian
  // invite/claim routes. Forces role to 'coach' — see the plan's
  // known-limitation note: a profile that's already a guardian on the
  // same account will stop seeing its parent view, since profiles has
  // only one role today. Pre-existing limitation, not introduced here.
  const profileUpsert: Record<string, unknown> = { id: user.id, role: 'coach' };
  if (displayName?.trim()) profileUpsert.display_name = displayName.trim();
  const { error: roleError } = await supabase.from('profiles').upsert(profileUpsert);
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const { error: coachTeamError } = await serviceRole
    .from('coach_team')
    .insert({ team_id: invite.team_id, profile_id: user.id });

  if (coachTeamError) {
    if (coachTeamError.code === '23505') {
      return NextResponse.json({ error: "You're already managing this team" }, { status: 409 });
    }
    return NextResponse.json({ error: coachTeamError.message }, { status: 500 });
  }

  const { error: inviteUpdateError } = await serviceRole
    .from('team_invites')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', invite.id);
  if (inviteUpdateError) {
    return NextResponse.json({ error: inviteUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, teamId: invite.team_id });
}
