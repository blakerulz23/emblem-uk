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
 * Retired: a coach no longer creates their own club, team and coach link.
 * They ask for a team through POST /api/os/team-requests and staff approve
 * it (or a team invite links them). Kept as a 410 so a still-open older
 * browser tab gets a clear answer rather than a 404.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Creating a team yourself is no longer available. Request a team instead, and our team will set it up.',
      next: '/api/os/team-requests',
    },
    { status: 410 }
  );
}
