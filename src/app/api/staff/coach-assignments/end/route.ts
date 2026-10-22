import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { logRouteFailure, raised } from '@/lib/route-failure';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staff end a coach's assignment to a team. The row is kept (with who
 * ended it, when and why) rather than deleted. The app stops treating it
 * as coach access immediately; the database enforces that once 0089 applies.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === 'string' ? body.teamId : '';
  const profileId = typeof body?.profileId === 'string' ? body.profileId : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!UUID_RE.test(teamId) || !UUID_RE.test(profileId)) {
    return NextResponse.json({ error: 'teamId and profileId are required' }, { status: 400 });
  }
  if (!reason || reason.length > 500) {
    return NextResponse.json({ error: 'A reason (up to 500 characters) is required' }, { status: 400 });
  }

  const { error } = await createServiceRoleClient().rpc('end_coach_assignment', {
    p_team_id: teamId,
    p_profile_id: profileId,
    p_staff_profile_id: staffCheck.userId,
    p_reason: reason,
  });
  // end_coach_assignment's refusals map to fixed messages; its text is never
  // returned.
  if (error) {
    if (raised(error, 'Not authorized')) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (raised(error, 'Coach assignment not found')) return NextResponse.json({ error: 'Coach assignment not found' }, { status: 404 });
    if (raised(error, 'already ended')) return NextResponse.json({ error: 'This coach assignment has already ended' }, { status: 409 });
    if (raised(error, 'A reason is required')) return NextResponse.json({ error: 'A reason (up to 500 characters) is required' }, { status: 400 });
    logRouteFailure('staff coach assignment: end', error);
    return NextResponse.json({ error: 'Could not end this coach assignment. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
