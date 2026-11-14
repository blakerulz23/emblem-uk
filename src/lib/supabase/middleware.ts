import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_ERASED_CODE, ACCOUNT_ERASED_MESSAGE } from '@/lib/account-deletion-copy';

/** Paths where an erased account's session is refused (the OS and every API route). */
export function guardsErasedAccounts(pathname: string): boolean {
  return pathname === '/os' || pathname.startsWith('/os/') || pathname.startsWith('/api/');
}

/**
 * Refreshes the Supabase auth session cookie on every request. Required by
 * @supabase/ssr so that server-rendered pages (src/app/os/page.tsx) always
 * see an up-to-date session instead of a stale/expired one.
 *
 * Erased accounts (migration 0097, erased_accounts): deleting or banning a
 * Supabase Auth user does not invalidate an access token already issued
 * (it stays valid until it expires), and a reviewed deletion may finish
 * before its Auth user is removed. So on the OS and API paths a signed-in
 * request asks the database whether its own account was erased
 * (account_is_erased, own uid only); if so the session cookies are cleared
 * and the request refused. The database also refuses to recreate the
 * profile, whatever path a still-valid token takes. If the check itself
 * fails the request continues (the database refusal still holds).
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

  if (user && guardsErasedAccounts(request.nextUrl.pathname)) {
    const { data: erased, error } = await supabase.rpc('account_is_erased');
    if (!error && erased === true) {
      // Local sign-out only: clears this browser's cookies (via setAll above)
      // without asking Auth to revoke a session that may no longer exist.
      await supabase.auth.signOut({ scope: 'local' });
      const refused = request.nextUrl.pathname.startsWith('/api/')
        ? NextResponse.json({ error: ACCOUNT_ERASED_MESSAGE, code: ACCOUNT_ERASED_CODE }, { status: 401 })
        : NextResponse.redirect(new URL('/os', request.url));
      supabaseResponse.cookies.getAll().forEach((cookie) => refused.cookies.set(cookie));
      return refused;
    }
  }

  return supabaseResponse;
}
