import { NextRequest, NextResponse } from 'next/server';
import { MY_SEASON_ERRORS, isUuid, parseMySeasonView } from '@/lib/my-season';
import { guardMySeasonRequest, mySeasonJsonError, mySeasonRpcError } from '@/lib/my-season-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/os/my-season?playerId=
 *
 * The one read My Season needs: my_season_for_player decides everything
 * (feature flag for the player's team, guardian / current team coach,
 * private or former coach, pending deletion review) and never reveals that
 * content exists to someone without a relationship ({ enabled: false }).
 * The response is passed through the strict contract parser, so nothing
 * outside the agreed JSON shape ever reaches the client.
 */
export async function GET(request: NextRequest) {
  const guard = await guardMySeasonRequest(request);
  if (!guard.ok) return guard.response;

  const playerId = request.nextUrl.searchParams.get('playerId');
  if (!isUuid(playerId)) return mySeasonJsonError(MY_SEASON_ERRORS.invalid_input);

  const { data, error } = await guard.supabase.rpc('my_season_for_player', { p_player_id: playerId });
  // Before migration 0108 is applied the function doesn't exist yet
  // (PostgREST PGRST202 / Postgres 42883). That is "My Season off", not a
  // server error: coaches open player screens all day and must not log 5xx.
  if (error && (error.code === 'PGRST202' || error.code === '42883')) {
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (error) return mySeasonRpcError(error);

  const view = parseMySeasonView(data);
  if (!view) return mySeasonJsonError(MY_SEASON_ERRORS.failed);
  return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
}
