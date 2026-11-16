import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { readAuthCookieToken } from '@/lib/supabase/session-cookie';
import { ACCOUNT_ERASED_CODE, ACCOUNT_ERASED_MESSAGE, ACCOUNT_ERASED_QUERY, ACCOUNT_CHECK_UNAVAILABLE_MESSAGE } from '@/lib/account-deletion-copy';
import { logRouteFailure, safeErrorCode } from '@/lib/route-failure';

// The account_is_erased function is not deployed yet (the app may ship before
// migration 0097): PostgREST's "function not in the schema cache", or
// PostgreSQL's "function does not exist". Nothing can be erased then.
const CHECK_NOT_DEPLOYED = new Set(['PGRST202', '42883']);

// API routes that serve no account data (public lookups, webhooks, cron): a
// failing erased-account check never blocks them. Every other /api call fails
// closed while the check cannot be answered. Never add a route that reads a
// user session or account data under these prefixes: it would fail open.
const FAIL_OPEN_API_PREFIXES = ['/api/country', '/api/pricing', '/api/feeds', '/api/webhooks/', '/api/internal/'];

/**
 * Refreshes the Supabase auth session cookie on every request. Required by
 * @supabase/ssr so that server-rendered pages (src/app/os/page.tsx) always
 * see an up-to-date session instead of a stale/expired one.
 *
 * Erased accounts (migration 0097, erased_accounts): deleting or banning a
 * Supabase Auth user does not invalidate an access token already issued
 * (it stays valid until it expires), and a reviewed deletion may finish
 * before its Auth user is removed. So every signed-in request that reaches
 * this function asks the database whether its own account was erased
 * (account_is_erased, own uid only); if so the session is signed out and the
 * request refused: API calls get 401 ACCOUNT_ERASED, pages go to the
 * signed-out OS with a "deleted" notice.
 * Limits, stated plainly: an access token already issued can still be sent
 * straight to Supabase (PostgREST, Realtime) until it expires; there the
 * account has no profile and no family links, and the database refuses to
 * recreate its profile. Paths that src/middleware.ts answers before calling
 * this (static previews, /squad-invite/access) do not use a session.
 * If the check itself fails:
 *   - API calls fail closed: 503, try again (an API call needs the database
 *     anyway, so this costs nothing a healthy request would have had);
 *   - pages fail open (the request continues, no one is signed out); the
 *     failure is logged with its code only, and the database still refuses
 *     to recreate an erased account's profile or link it to anyone;
 *   - before migration 0097 is applied (function not deployed) every request
 *     continues as it does today.
 * Fail-closed applies to account APIs; public lookups, webhooks and cron
 * (FAIL_OPEN_API_PREFIXES) continue.
 * A token whose Auth user or session is already gone (getUser fails) is still
 * asked about, with that token itself (read from the cookie before getUser,
 * which drops it), so it gets the same deleted-account answer.
 * Timing: with EMBLEM_SERVER_TIMING=1 outside Vercel production (staging
 * measurement only), responses carry Server-Timing entries for the session
 * lookup and the erased check.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const timing = process.env.EMBLEM_SERVER_TIMING === '1' && process.env.VERCEL_ENV !== 'production';
  // Read before getUser(): if Auth refuses the session, auth-js drops it from the client.
  const cookieToken = readAuthCookieToken(request.cookies.getAll(), supabaseUrl);
  const t0 = timing ? performance.now() : 0;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  // A session Auth no longer accepts (its user deleted after a completed
  // deletion, or its session row gone) whose access token has not expired:
  // the database still honours that token until it expires, so it is asked
  // about too. No auth cookie, or an expired one: no extra call.
  const staleToken =
    !user && userError && cookieToken && cookieToken.expiresAt * 1000 > Date.now() ? cookieToken.token : null;
  const authMs = timing ? performance.now() - t0 : 0;
  const withTiming = <R extends NextResponse>(res: R, checkMs: number | null, outcome: string): R => {
    if (timing) {
      const entries = [`auth;dur=${authMs.toFixed(1)}`];
      if (checkMs !== null) entries.push(`erased-check;dur=${checkMs.toFixed(1)};desc="${outcome}"`);
      res.headers.set('Server-Timing', entries.join(', '));
    }
    return res;
  };

  if (user || staleToken) {
    const t1 = timing ? performance.now() : 0;
    const checker = user
      ? supabase
      : createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { headers: { Authorization: `Bearer ${staleToken}` } },
        });
    const { data: erased, error } = await checker.rpc('account_is_erased');
    const checkMs = timing ? performance.now() - t1 : 0;
    // A stale session the database also refuses (expired token): it is
    // simply signed out, as before; routes see no user.
    if (!user && error) return withTiming(supabaseResponse, checkMs, 'stale-session');
    if (error && !CHECK_NOT_DEPLOYED.has(safeErrorCode(error))) {
      logRouteFailure('middleware: erased-account check', error);
      const path = request.nextUrl.pathname;
      if (path.startsWith('/api/') && !FAIL_OPEN_API_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))) {
        const unavailable = NextResponse.json({ error: ACCOUNT_CHECK_UNAVAILABLE_MESSAGE }, { status: 503, headers: { 'Retry-After': '5' } });
        supabaseResponse.cookies.getAll().forEach((cookie) => unavailable.cookies.set(cookie));
        return withTiming(unavailable, checkMs, 'failed-closed');
      }
      return withTiming(supabaseResponse, checkMs, 'failed-open');
    }
    if (!error && erased === true) {
      // Signs this session out: Auth revokes its refresh token (scope local),
      // and setAll above clears the cookies.
      await supabase.auth.signOut({ scope: 'local' });
      const atNotice = request.nextUrl.pathname === '/os' && request.nextUrl.searchParams.get(ACCOUNT_ERASED_QUERY) === '1';
      // Already on the notice page: answer it (signed out) rather than redirect
      // again, so a cookie that cannot be cleared never causes a redirect loop.
      const refused = request.nextUrl.pathname.startsWith('/api/')
        ? NextResponse.json({ error: ACCOUNT_ERASED_MESSAGE, code: ACCOUNT_ERASED_CODE }, { status: 401 })
        : atNotice
          ? NextResponse.next({ request })
          : NextResponse.redirect(new URL(`/os?${ACCOUNT_ERASED_QUERY}=1`, request.url));
      supabaseResponse.cookies.getAll().forEach((cookie) => refused.cookies.set(cookie));
      // A stale session's cookies may already be gone from the client; clear them on the response explicitly.
      if (!user) cookieToken?.cookieNames.forEach((name) => refused.cookies.set(name, '', { maxAge: 0, path: '/' }));
      return withTiming(refused, checkMs, 'erased');
    }
    return withTiming(supabaseResponse, checkMs, error ? 'not-deployed' : user ? 'live' : 'stale-session');
  }

  return withTiming(supabaseResponse, null, 'signed-out');
}
