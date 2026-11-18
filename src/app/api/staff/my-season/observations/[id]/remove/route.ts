import { NextRequest, NextResponse } from 'next/server';
import { STAFF_MY_SEASON_ERRORS, isUuid, parseStaffRemovalStatus, staffMySeasonErrorFor, validateStaffRemovalBody } from '@/lib/my-season';
import { guardStaffMySeasonRequest, readJsonBody, staffMySeasonJsonError } from '@/lib/my-season-api';
import { logRouteFailure } from '@/lib/route-failure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/staff/my-season/observations/[id]/remove  { reason }
 *
 * Permanently erases one coach note. The RPC does the work under the staff
 * member's own session and stores the reason in its restricted table. The
 * reason is never logged or returned, and errors are fixed copy.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await guardStaffMySeasonRequest(request);
  if (!guard.ok) return guard.response;

  if (!isUuid(params.id)) return staffMySeasonJsonError(STAFF_MY_SEASON_ERRORS.invalid_input);
  const body = validateStaffRemovalBody(await readJsonBody(request));
  if (!body.ok) return staffMySeasonJsonError(STAFF_MY_SEASON_ERRORS.invalid_reason);

  const { data, error } = await guard.supabase.rpc('my_season_staff_remove_observation', { p_observation_id: params.id, p_reason: body.reason });
  if (error) {
    const mapped = staffMySeasonErrorFor(error);
    if (mapped.code === 'failed') logRouteFailure('staff my season: remove', error);
    return staffMySeasonJsonError(mapped);
  }
  const status = parseStaffRemovalStatus(data);
  if (!status) return staffMySeasonJsonError(STAFF_MY_SEASON_ERRORS.failed);
  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store' } });
}
