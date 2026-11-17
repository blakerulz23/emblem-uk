import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { authCookieName, readAuthCookieToken } from './session-cookie';

/**
 * readAuthCookieToken must read exactly what the real @supabase/ssr writes
 * (the middleware depends on it after Auth has dropped the session). The
 * cookies here are produced by @supabase/ssr itself, with fetch stubbed
 * (no network).
 */
const URL_ = 'https://rqgrpaprfxxhcvqtwhgj.supabase.co';
const b64url = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (sub: string, pad = 0) =>
  `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, pad: 'x'.repeat(pad) }))}.sig`;

async function cookiesFromSsr(accessToken: string) {
  const jar = new Map<string, string>();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'x@example.test' }), { status: 200, headers: { 'content-type': 'application/json' } })));
  const client = createServerClient(URL_, 'anon', {
    cookies: {
      getAll: () => Array.from(jar).map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: 'refresh-1' });
  expect(error).toBeNull();
  return Array.from(jar).map(([name, value]) => ({ name, value }));
}
afterEach(() => vi.unstubAllGlobals());

describe('readAuthCookieToken', () => {
  it('names the cookie after the project ref', () => {
    expect(authCookieName(URL_)).toBe('sb-rqgrpaprfxxhcvqtwhgj-auth-token');
  });

  it('reads the access token @supabase/ssr stored (single cookie)', async () => {
    const token = jwt('u1');
    const cookies = await cookiesFromSsr(token);
    const r = readAuthCookieToken(cookies, URL_);
    expect(r?.token).toBe(token);
    expect(typeof r?.expiresAt).toBe('number');
  });

  it('reads a large session that @supabase/ssr split into chunks', async () => {
    const token = jwt('u1', 6000);
    const cookies = await cookiesFromSsr(token);
    expect(cookies.map((c) => c.name)).toContain('sb-rqgrpaprfxxhcvqtwhgj-auth-token.1');
    const r = readAuthCookieToken(cookies, URL_);
    expect(r?.token).toBe(token);
    expect(r?.cookieNames.length).toBeGreaterThan(1);
  });

  it('reads a raw-encoded cookie (as Next hands it over, already URL-decoded), even with "%" in the session', () => {
    const token = jwt('u1');
    const value = JSON.stringify({ access_token: token, expires_at: 2000000000, user: { user_metadata: { note: '100% sure' } } });
    expect(readAuthCookieToken([{ name: 'sb-rqgrpaprfxxhcvqtwhgj-auth-token', value }], URL_)?.token).toBe(token);
    expect(readAuthCookieToken([{ name: 'sb-rqgrpaprfxxhcvqtwhgj-auth-token', value: encodeURIComponent(value) }], URL_)?.token).toBe(token);
  });

  it('without expires_at the token\'s own exp is used; with no readable expiry it returns nothing (no call)', () => {
    const token = jwt('u1');
    const r = readAuthCookieToken([{ name: 'sb-rqgrpaprfxxhcvqtwhgj-auth-token', value: JSON.stringify({ access_token: token }) }], URL_);
    expect(r?.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(readAuthCookieToken([{ name: 'sb-rqgrpaprfxxhcvqtwhgj-auth-token', value: JSON.stringify({ access_token: 'not-a-jwt' }) }], URL_)).toBeNull();
  });

  it('ignores other projects, empty values and garbage', () => {
    expect(readAuthCookieToken([{ name: 'sb-other-auth-token', value: 'base64-e30' }], URL_)).toBeNull();
    expect(readAuthCookieToken([{ name: 'sb-rqgrpaprfxxhcvqtwhgj-auth-token', value: '' }], URL_)).toBeNull();
    expect(readAuthCookieToken([{ name: 'sb-rqgrpaprfxxhcvqtwhgj-auth-token', value: 'base64-!!' }], URL_)).toBeNull();
    expect(readAuthCookieToken([{ name: 'sb-rqgrpaprfxxhcvqtwhgj-auth-token', value: 'base64-e30' }], URL_)).toBeNull();
  });
});
