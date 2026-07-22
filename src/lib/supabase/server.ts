import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for use in Server Components, Route Handlers, and Server
 * Actions. `setAll` is wrapped in a try/catch because Server Components
 * can't write cookies — the root middleware refreshes the session cookie
 * on every request, so a no-op here is safe.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — ignore, middleware handles refresh.
          }
        },
      },
    }
  );
}

/**
 * Server-only client authenticated with the service role key, which
 * bypasses Row Level Security. Never import this outside server code, and
 * never expose SUPABASE_SERVICE_ROLE_KEY to the client bundle.
 */
export function createServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
      global: {
        // Supabase-js issues its PostgREST calls through the global fetch.
        // In the App Router, Next's Data Cache captures those fetches even
        // on force-dynamic pages — which served /staff/queue a ~90-minute-
        // stale order list (new orders and their print_files invisible
        // while the DB had them all along). Service-role reads are always
        // operational truth (staff queue, webhook order lookups), never
        // cacheable content, so opt every one of them out.
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );
}
