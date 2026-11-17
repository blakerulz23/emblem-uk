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
/** expiresAt: seconds since the epoch, from the session's expires_at or else the token's own exp claim. */
export type AuthCookieToken = { token: string; expiresAt: number; cookieNames: string[] };

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
    const session = parseSession(raw);
    if (!session || typeof session.access_token !== 'string' || !session.access_token) return null;
    // No readable expiry: no call (a real @supabase/ssr cookie always has one).
    const expiresAt = typeof session.expires_at === 'number' ? session.expires_at : jwtExp(session.access_token);
    if (expiresAt === null) return null;
    return { token: session.access_token, expiresAt, cookieNames };
  } catch {
    return null;
  }
}

type StoredSession = { access_token?: unknown; expires_at?: unknown };

// Next has already URL-decoded cookie values, so raw JSON is tried as it is
// first; decoding again would break a value containing "%".
function parseSession(raw: string): StoredSession | null {
  if (raw.startsWith('base64-')) return JSON.parse(decodeBase64Url(raw.slice('base64-'.length))) as StoredSession;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return JSON.parse(decodeURIComponent(raw)) as StoredSession;
  }
}

function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1] ?? '')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}
