import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * updateSession refuses an erased account's session on the OS and API paths
 * (migration 0097 erased_accounts): an issued access token outlives Auth
 * user deletion, so the check is made on every such request.
 */
const state = {
  user: null as { id: string } | null,
  userError: null as { status: number; code: string; message: string } | null,
  erased: false as boolean,
  rpcError: null as { message: string; code?: string } | null,
  rpcCalls: [] as string[],
  signOut: vi.fn(),
  setAll: null as null | ((c: Array<{ name: string; value: string; options?: object }>) => void),
};
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (c: Array<{ name: string; value: string; options?: object }>) => void } }) => {
    state.setAll = opts.cookies.setAll;
    return {
      auth: {
        getUser: async () => ({ data: { user: state.user }, error: state.user ? null : state.userError }),
        signOut: async (o: unknown) => {
          state.signOut(o);
          state.setAll?.([{ name: 'sb-test-auth-token', value: '', options: { maxAge: 0 } }]);
          return { error: null };
        },
      },
      rpc: async (fn: string) => {
        state.rpcCalls.push(fn);
        return { data: state.rpcError ? null : state.erased, error: state.rpcError };
      },
    };
  },
}));

import { updateSession } from './middleware';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  state.user = { id: 'u1' };
  state.userError = null;
  state.erased = false;
  state.rpcError = null;
  state.rpcCalls = [];
  state.signOut.mockReset();
});
const req = (path: string, cookie?: string) => new NextRequest(new URL(path, 'http://localhost'), cookie ? { headers: { cookie } } : undefined);
const AUTH_COOKIE = 'sb-rqgrpaprfxxhcvqtwhgj-auth-token=base64-eyJ4IjoxfQ';

describe('erased accounts are refused', () => {
  it('every signed-in page outside the OS is refused too (e.g. the partner dashboard)', async () => {
    state.erased = true;
    const res = await updateSession(req('/partners'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/os?account_deleted=1');
  });

  it('an erased account calling an API gets 401 ACCOUNT_ERASED, its cookies cleared (local sign-out)', async () => {
    state.erased = true;
    const res = await updateSession(req('/api/os/moments'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'This account has been deleted.', code: 'ACCOUNT_ERASED' });
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(res.headers.get('set-cookie')).toContain('sb-test-auth-token=');
  });

  it('an erased account opening the OS is redirected to the signed-out OS with its cookies cleared', async () => {
    state.erased = true;
    const res = await updateSession(req('/os'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/os?account_deleted=1');
    expect(res.headers.get('set-cookie')).toContain('sb-test-auth-token=');
  });

  it('already on the notice page: answered signed out, never redirected again (no loop if a cookie cannot be cleared)', async () => {
    state.erased = true;
    const res = await updateSession(req('/os?account_deleted=1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(res.headers.get('set-cookie')).toContain('sb-test-auth-token=');
  });

  it('a live account passes; the check is made once', async () => {
    const res = await updateSession(req('/api/os/moments'));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toEqual(['account_is_erased']);
    expect(state.signOut).not.toHaveBeenCalled();
  });

  it('after the Auth user is deleted (getUser fails) the still-valid token gets the same deleted-account answer and is signed out', async () => {
    state.user = null;
    state.userError = { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' };
    state.erased = true;
    const api = await updateSession(req('/api/os/moments', AUTH_COOKIE));
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: 'This account has been deleted.', code: 'ACCOUNT_ERASED' });
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(api.headers.get('set-cookie')).toContain('sb-test-auth-token=');
    const page = await updateSession(req('/os', AUTH_COOKIE));
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe('http://localhost/os?account_deleted=1');
  });

  it('a stale cookie the database also refuses (expired) is just signed out: no 503, nothing logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.user = null;
    state.userError = { status: 403, code: 'bad_jwt', message: 'expired' };
    state.rpcError = { message: 'permission denied', code: '42501' };
    expect((await updateSession(req('/api/os/moments', AUTH_COOKIE))).status).toBe(200);
    expect(state.signOut).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('a failed getUser without any auth cookie makes no extra call', async () => {
    state.user = null;
    state.userError = { status: 400, code: 'session_missing', message: 'Auth session missing!' };
    await updateSession(req('/api/os/moments'));
    expect(state.rpcCalls).toEqual([]);
  });

  it('no session: no check', async () => {
    state.user = null;
    await updateSession(req('/api/os/moments'));
    await updateSession(req('/clubs'));
    expect(state.rpcCalls).toEqual([]);
  });

  it('if the check itself fails, an API call fails closed (503, try again), nobody is signed out, and only the code is logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.erased = true;
    state.rpcError = { message: 'connection reset for p-1234@example.test', code: '08006' };
    const res = await updateSession(req('/api/os/moments'));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(await res.json()).toEqual({ error: 'Emblem is briefly unavailable. Please try again in a moment.' });
    expect(state.signOut).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('middleware: erased-account check failed', { code: '08006' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('@');
    log.mockRestore();
  });

  it('if the check itself fails, a page fails open (continues, nobody signed out); the database still refuses recreating the profile', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.erased = true;
    state.rpcError = { message: 'unavailable', code: '57014' };
    const res = await updateSession(req('/os'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(state.signOut).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('before migration 0097 (function not deployed) every request continues, API included, and nothing is logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const code of ['PGRST202', '42883']) {
      state.rpcError = { message: 'Could not find the function public.account_is_erased', code };
      expect((await updateSession(req('/api/os/moments'))).status).toBe(200);
      expect((await updateSession(req('/os'))).status).toBe(200);
    }
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('timing: off by default (no Server-Timing header)', async () => {
    delete process.env.EMBLEM_SERVER_TIMING;
    expect((await updateSession(req('/api/os/moments'))).headers.get('server-timing')).toBeNull();
  });

  it('timing: with EMBLEM_SERVER_TIMING=1, every outcome carries the session lookup and the erased check', async () => {
    process.env.EMBLEM_SERVER_TIMING = '1';
    try {
      const live = (await updateSession(req('/api/os/moments'))).headers.get('server-timing') ?? '';
      expect(live).toMatch(/^auth;dur=\d+\.\d, erased-check;dur=\d+\.\d;desc="live"$/);
      state.erased = true;
      expect((await updateSession(req('/api/os/moments'))).headers.get('server-timing')).toContain('desc="erased"');
      state.erased = false;
      state.rpcError = { message: 'x', code: '08006' };
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect((await updateSession(req('/api/os/moments'))).headers.get('server-timing')).toContain('desc="failed-closed"');
      expect((await updateSession(req('/os'))).headers.get('server-timing')).toContain('desc="failed-open"');
      log.mockRestore();
      state.rpcError = null;
      state.user = null;
      expect((await updateSession(req('/os'))).headers.get('server-timing')).toMatch(/^auth;dur=\d+\.\d$/);
    } finally {
      delete process.env.EMBLEM_SERVER_TIMING;
    }
  });
});
