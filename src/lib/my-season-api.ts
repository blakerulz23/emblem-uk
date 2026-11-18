import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { isSeasonDeployKillSwitchOn } from '@/lib/season-feature';
import { MY_SEASON_ERRORS, STAFF_MY_SEASON_ERRORS, mySeasonErrorFor, type MySeasonError, type StaffMySeasonError } from '@/lib/my-season';

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
    return { ok: false, response: mySeasonJsonError(MY_SEASON_ERRORS.deploy_off) };
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

export function staffMySeasonJsonError(err: StaffMySeasonError) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: err.status, headers: { 'Cache-Control': 'no-store' } });
}

type StaffGuarded = { ok: true; supabase: ReturnType<typeof createClient> } | { ok: false; response: NextResponse };

/**
 * The /api/staff/my-season gate: same origin, then requireStaff. The feature
 * flag and deploy kill switch are deliberately not consulted: staff must be
 * able to remove a note whatever state the feature is in. The RPCs repeat the
 * authority check from auth.uid() and are called with this user-scoped client.
 */
export async function guardStaffMySeasonRequest(request: NextRequest): Promise<StaffGuarded> {
  if (!isSameOriginRequest(request)) {
    return { ok: false, response: staffMySeasonJsonError(STAFF_MY_SEASON_ERRORS.staff_required) };
  }
  const supabase = createClient();
  const staff = await requireStaff(supabase);
  if (!staff.ok) {
    return { ok: false, response: staffMySeasonJsonError(staff.status === 401 ? STAFF_MY_SEASON_ERRORS.sign_in_required : STAFF_MY_SEASON_ERRORS.staff_required) };
  }
  return { ok: true, supabase };
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => null);
}
