import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSeasonDeployKillSwitchOn } from '@/lib/season-feature';
import { MY_SEASON_ERRORS, mySeasonErrorFor, type MySeasonError } from '@/lib/my-season';

/**
 * Shared guard for the /api/os/my-season routes (server-only).
 *
 * Order matters and is tested:
 *   1. deploy kill switch on  -> 404, before any Supabase client exists
 *   2. cross-origin request   -> 403 (Origin present and its host differs)
 *   3. signed out             -> 401
 * Every route uses the user-scoped client only. The RPCs are the real
 * authorization boundary (guardian / current team coach / feature flag);
 * these routes never use the service role.
 */

export function mySeasonJsonError(err: MySeasonError) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: err.status, headers: { 'Cache-Control': 'no-store' } });
}

export function mySeasonRpcError(error: { code?: string | null } | null | undefined) {
  return mySeasonJsonError(mySeasonErrorFor(error));
}

/** False only when an Origin header is present and its host is not the request host. */
export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const requestHost = request.headers.get('host') ?? request.nextUrl.host;
  return !!originHost && originHost.toLowerCase() === requestHost.toLowerCase();
}

type Guarded =
  | { ok: true; supabase: ReturnType<typeof createClient>; userId: string }
  | { ok: false; response: NextResponse };

export async function guardMySeasonRequest(request: NextRequest): Promise<Guarded> {
  if (isSeasonDeployKillSwitchOn()) {
    return { ok: false, response: mySeasonJsonError(MY_SEASON_ERRORS.not_available) };
  }
  if (!isSameOriginRequest(request)) {
    return { ok: false, response: mySeasonJsonError(MY_SEASON_ERRORS.not_allowed) };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: mySeasonJsonError(MY_SEASON_ERRORS.sign_in_required) };
  }
  return { ok: true, supabase, userId: user.id };
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => null);
}
