import { NextRequest, NextResponse } from 'next/server';
import { MY_SEASON_ERRORS, validateFocusInput } from '@/lib/my-season';
import { guardMySeasonRequest, mySeasonJsonError, mySeasonRpcError, readJsonBody } from '@/lib/my-season-api';

export const runtime = 'nodejs';

/**
 * POST /api/os/my-season/focus
 * { playerId, title, whyItMatters, whatItLooksLike, startedOn, requestId }
 *
 * Sets (or replaces) the player's My Focus via my_season_set_focus, which
 * ends the current focus, enforces guardian-or-current-team-coach, the
 * flag and the input rules, and is idempotent on requestId.
 */
export async function POST(request: NextRequest) {
  const guard = await guardMySeasonRequest(request);
  if (!guard.ok) return guard.response;

  const parsed = validateFocusInput(await readJsonBody(request));
  if (!parsed.ok) return mySeasonJsonError(MY_SEASON_ERRORS.invalid_input);
  const input = parsed.value;

  const { data, error } = await guard.supabase.rpc('my_season_set_focus', {
    p_player_id: input.playerId,
    p_title: input.title,
    p_why: input.whyItMatters,
    p_looks_like: input.whatItLooksLike,
    p_started_on: input.startedOn,
    p_request_id: input.requestId,
  });
  if (error) return mySeasonRpcError(error);
  return NextResponse.json({ ok: true, focusId: typeof data === 'string' ? data : null }, { headers: { 'Cache-Control': 'no-store' } });
}
