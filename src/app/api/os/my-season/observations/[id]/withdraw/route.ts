import { NextRequest, NextResponse } from 'next/server';
import { MY_SEASON_ERRORS, isUuid } from '@/lib/my-season';
import { guardMySeasonRequest, mySeasonJsonError, mySeasonRpcError } from '@/lib/my-season-api';

export const runtime = 'nodejs';

/**
 * POST /api/os/my-season/observations/[id]/withdraw
 *
 * The author (still a current team coach) withdraws their own note via
 * my_season_withdraw_observation. Already withdrawn is a no-op success.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await guardMySeasonRequest(request);
  if (!guard.ok) return guard.response;

  if (!isUuid(params?.id)) return mySeasonJsonError(MY_SEASON_ERRORS.invalid_input);

  const { error } = await guard.supabase.rpc('my_season_withdraw_observation', { p_observation_id: params.id });
  if (error) return mySeasonRpcError(error);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
