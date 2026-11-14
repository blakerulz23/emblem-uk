import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_ERASED_CODE, ACCOUNT_ERASED_MESSAGE, ACCOUNT_ERASED_QUERY } from '@/lib/account-deletion-copy';

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
 * this (static previews, /squad-invite/access) do not use a session. If the
 * check itself fails, the request continues rather than signing everyone
 * out; the database refusal still holds.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: erased, error } = await supabase.rpc('account_is_erased');
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
      return refused;
    }
  }

  return supabaseResponse;
}
