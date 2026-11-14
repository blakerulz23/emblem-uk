import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * updateSession refuses an erased account's session on the OS and API paths
 * (migration 0097 erased_accounts): an issued access token outlives Auth
 * user deletion, so the check is made on every such request.
 */
const state = {
  user: null as { id: string } | null,
  erased: false as boolean,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as string[],
  signOut: vi.fn(),
  setAll: null as null | ((c: Array<{ name: string; value: string; options?: object }>) => void),
};
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (c: Array<{ name: string; value: string; options?: object }>) => void } }) => {
    state.setAll = opts.cookies.setAll;
    return {
      auth: {
        getUser: async () => ({ data: { user: state.user } }),
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

import { guardsErasedAccounts, updateSession } from './middleware';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  state.user = { id: 'u1' };
  state.erased = false;
  state.rpcError = null;
  state.rpcCalls = [];
  state.signOut.mockReset();
});
const req = (path: string) => new NextRequest(new URL(path, 'http://localhost'));

describe('erased accounts are refused', () => {
  it('guards the OS and every API path only', () => {
    expect(['/os', '/os/x', '/api/os/me', '/api/anything'].every(guardsErasedAccounts)).toBe(true);
    expect(['/', '/clubs', '/osx', '/staff/queue'].some(guardsErasedAccounts)).toBe(false);
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
    expect(res.headers.get('location')).toBe('http://localhost/os');
    expect(res.headers.get('set-cookie')).toContain('sb-test-auth-token=');
  });

  it('a live account passes; the check is made once', async () => {
    const res = await updateSession(req('/api/os/moments'));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toEqual(['account_is_erased']);
    expect(state.signOut).not.toHaveBeenCalled();
  });

  it('no session, or a path outside the OS and API: no check', async () => {
    state.user = null;
    await updateSession(req('/api/os/moments'));
    state.user = { id: 'u1' };
    await updateSession(req('/clubs'));
    expect(state.rpcCalls).toEqual([]);
  });

  it('if the check itself fails the request continues (the database still refuses recreating the profile)', async () => {
    state.erased = true;
    state.rpcError = { message: 'unavailable' };
    expect((await updateSession(req('/api/os/moments'))).status).toBe(200);
  });
});
