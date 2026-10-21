import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { currentUkFootballSeason } from '@/lib/season';
import { resolveOrCreateSeason } from '@/lib/resolve-season';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ApproveBody = {
  mode?: 'existing' | 'new';
  teamId?: string;
  /** A season label such as "2026/27" (new team only). Resolved server-side; a season id is never accepted. */
  season?: string;
  /** Optional last day of coach access, YYYY-MM-DD. Access ends at the end of that day (UTC). */
  expiresOn?: string;
};

/**
 * Staff approve a team request: into an existing team, or a new club and
 * team created from the request. Staff membership is checked server-side
 * first; only then does the service-role client call the staff-only
 * approve_coach_team_request, which re-checks staff membership itself and
 * records this staff member in the relationship audit trail.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Team request not found' }, { status: 404 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as ApproveBody & Record<string, unknown>;
  if ('seasonId' in body || 'season_id' in body || 'p_season_id' in body) {
    return NextResponse.json({ error: 'Give the season as a label (for example 2026/27), not an id' }, { status: 400 });
  }

  let expiresAt: string | null = null;
  if (body.expiresOn) {
    if (typeof body.expiresOn !== 'string' || !DATE_RE.test(body.expiresOn)) {
      return NextResponse.json({ error: 'expiresOn must be a date (YYYY-MM-DD)' }, { status: 400 });
    }
    const end = new Date(`${body.expiresOn}T23:59:59.999Z`);
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'The access end date must be in the future' }, { status: 400 });
    }
    expiresAt = end.toISOString();
  }

  const serviceRole = createServiceRoleClient();
  let teamId: string | null = null;
  let seasonId: string | null = null;

  if (body.mode === 'existing') {
    if (typeof body.teamId !== 'string' || !UUID_RE.test(body.teamId)) {
      return NextResponse.json({ error: 'Choose an existing team' }, { status: 400 });
    }
    const { data: team } = await serviceRole.from('teams').select('id').eq('id', body.teamId).maybeSingle();
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    teamId = team.id;
  } else if (body.mode === 'new') {
    const label = typeof body.season === 'string' && body.season.trim() ? body.season : currentUkFootballSeason();
    const season = await resolveOrCreateSeason(serviceRole, label);
    if (!season.ok) {
      return NextResponse.json({ error: season.error }, { status: season.status });
    }
    seasonId = season.id;
  } else {
    return NextResponse.json({ error: "mode must be 'existing' or 'new'" }, { status: 400 });
  }

  const { data: resultingTeamId, error } = await serviceRole.rpc('approve_coach_team_request', {
    p_request_id: params.id,
    p_staff_profile_id: staffCheck.userId,
    p_team_id: teamId,
    p_expires_at: expiresAt,
    p_season_id: seasonId,
  });
  if (error) {
    if (error.message.includes('already')) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.message.includes('not found')) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.message.includes('Not authorized')) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, teamId: resultingTeamId });
}
