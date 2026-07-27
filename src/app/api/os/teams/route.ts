import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Lists teams for a club — used by the staff approve-order club/team
 * picker (ApproveTeamOrderButton) once a club is chosen. Same "readable
 * by authenticated users" RLS as GET /api/os/clubs, no requireStaff gate.
 */
export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get('clubId');
  if (!clubId) {
    return NextResponse.json({ error: 'clubId is required' }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, seasons ( label )')
    .eq('club_id', clubId)
    .order('name', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // seasons.label is the only source for this now — season_id is NOT
  // NULL as of migration 0016, so every team has one.
  type TeamRow = { id: string; name: string; seasons: { label: string } | null };
  const teams = ((data ?? []) as unknown as TeamRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    season: t.seasons?.label,
  }));
  return NextResponse.json({ teams });
}

/**
 * A coach creates their club + team for the first time. No duplicate-club
 * detection in Phase 1 (a coach could create two clubs with the same name)
 * — acceptable for self-serve provisioning at this stage.
 *
 * seasonId is resolved client-side beforehand (via GET/POST
 * /api/os/seasons) — this route writes only season_id, the real FK.
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
  const { displayName, clubName, teamName, seasonId } = body as {
    displayName?: string;
    clubName?: string;
    teamName?: string;
    seasonId?: string;
  };

  if (!clubName?.trim() || !teamName?.trim() || !seasonId) {
    return NextResponse.json({ error: 'clubName, teamName and a season are required' }, { status: 400 });
  }

  // ActivationGate's coach-intent auto-resolve already upserted this
  // profile's role to 'coach' before this route is ever reached — this
  // upsert just adds the name on top, no conflict.
  if (displayName?.trim()) {
    await supabase.from('profiles').upsert({ id: user.id, role: 'coach', display_name: displayName.trim() });
  }

  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .insert({ name: clubName.trim() })
    .select()
    .single();
  if (clubError || !club) {
    return NextResponse.json({ error: clubError?.message ?? 'Could not create club' }, { status: 500 });
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ club_id: club.id, name: teamName.trim(), season_id: seasonId })
    .select()
    .single();
  if (teamError || !team) {
    return NextResponse.json({ error: teamError?.message ?? 'Could not create team' }, { status: 500 });
  }

  const { error: coachTeamError } = await supabase
    .from('coach_team')
    .insert({ team_id: team.id, profile_id: user.id });
  if (coachTeamError) {
    return NextResponse.json({ error: coachTeamError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, clubId: club.id, teamId: team.id });
}
