/**
 * Reads the access token out of this project's Supabase auth cookie, as
 * @supabase/ssr writes it: `sb-<project ref>-auth-token`, possibly split into
 * chunks (`.0`, `.1`, …), each value either `base64-<base64url JSON>` or raw
 * (URL-encoded) JSON of the session.
 *
 * The middleware reads it BEFORE auth.getUser(): when Auth refuses the
 * session (its user deleted, or its session row gone after a sign-out),
 * auth-js removes the session from the client, and a database call would
 * then go out with the anon key. The token is only used to ask
 * account_is_erased() about itself; PostgREST still verifies its signature
 * and expiry, so nothing here is trusted on its own. Edge-runtime safe.
 */
export type AuthCookieToken = { token: string; expiresAt: number | null; cookieNames: string[] };

export function authCookieName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function readAuthCookieToken(cookies: Array<{ name: string; value: string }>, supabaseUrl: string): AuthCookieToken | null {
  const base = authCookieName(supabaseUrl);
  const byName = new Map(cookies.filter((c) => c.value).map((c) => [c.name, c.value]));
  let raw = byName.get(base);
  const cookieNames = raw ? [base] : [];
  if (!raw) {
    const parts: string[] = [];
    for (let i = 0; byName.has(`${base}.${i}`); i++) {
      parts.push(byName.get(`${base}.${i}`)!);
      cookieNames.push(`${base}.${i}`);
    }
    raw = parts.length ? parts.join('') : undefined;
  }
  if (!raw) return null;
  try {
    const json = raw.startsWith('base64-') ? decodeBase64Url(raw.slice('base64-'.length)) : decodeURIComponent(raw);
    const session = JSON.parse(json) as { access_token?: unknown; expires_at?: unknown };
    if (typeof session.access_token !== 'string' || !session.access_token) return null;
    return { token: session.access_token, expiresAt: typeof session.expires_at === 'number' ? session.expires_at : null, cookieNames };
  } catch {
    return null;
  }
}
