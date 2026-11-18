import { NextRequest, NextResponse } from 'next/server';
import { MY_SEASON_ERRORS, validateObservationInput } from '@/lib/my-season';
import { guardMySeasonRequest, mySeasonJsonError, mySeasonRpcError, readJsonBody } from '@/lib/my-season-api';

export const runtime = 'nodejs';

/**
 * POST /api/os/my-season/observations { playerId, category, body, requestId }
 *
 * A current team coach's note via my_season_add_observation (refuses
 * private/former coaches, a coach's own child, accounts under review, and
 * anything over two sentences or outside 20-160 characters). Idempotent on
 * requestId (required): a retry, even a simultaneous one, returns the
 * original note and never duplicates it.
 */
export async function POST(request: NextRequest) {
  const guard = await guardMySeasonRequest(request);
  if (!guard.ok) return guard.response;

  const parsed = validateObservationInput(await readJsonBody(request));
  if (!parsed.ok) return mySeasonJsonError(MY_SEASON_ERRORS.invalid_input);
  const input = parsed.value;

  const { data, error } = await guard.supabase.rpc('my_season_add_observation', {
    p_player_id: input.playerId,
    p_category: input.category,
    p_body: input.body,
    p_request_id: input.requestId,
  });
  if (error) return mySeasonRpcError(error);
  return NextResponse.json({ ok: true, observationId: typeof data === 'string' ? data : null }, { headers: { 'Cache-Control': 'no-store' } });
}
