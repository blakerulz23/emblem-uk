import { NextRequest, NextResponse } from 'next/server';
import { STAFF_MY_SEASON_ERRORS, isUuid, parseStaffObservationList, staffMySeasonErrorFor } from '@/lib/my-season';
import { guardStaffMySeasonRequest, staffMySeasonJsonError } from '@/lib/my-season-api';
import { logRouteFailure } from '@/lib/route-failure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/staff/my-season?playerId=
 *
 * Staff find the note to remove. my_season_staff_list_observations runs under
 * the staff member's own session (never the service role), re-checks their
 * authority, returns text for active notes only and audits the lookup. Only
 * contract fields pass through the parser. Nothing here logs note content.
 */
export async function GET(request: NextRequest) {
  const guard = await guardStaffMySeasonRequest(request);
  if (!guard.ok) return guard.response;

  const playerId = request.nextUrl.searchParams.get('playerId');
  if (!isUuid(playerId)) return staffMySeasonJsonError(STAFF_MY_SEASON_ERRORS.invalid_input);

  const { data, error } = await guard.supabase.rpc('my_season_staff_list_observations', { p_player_id: playerId });
  if (error) {
    const mapped = staffMySeasonErrorFor(error);
    if (mapped.code === 'failed') logRouteFailure('staff my season: list', error);
    return staffMySeasonJsonError(mapped);
  }
  const observations = parseStaffObservationList(data);
  if (!observations) return staffMySeasonJsonError(STAFF_MY_SEASON_ERRORS.failed);
  return NextResponse.json({ observations }, { headers: { 'Cache-Control': 'no-store' } });
}
