import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

let user: { id: string; last_sign_in_at?: string | null } | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  createServiceRoleClient: () => ({}),
}));

const mockRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...a: unknown[]) => mockRateLimit(...a),
}));

const mockList = vi.fn();
vi.mock('@/lib/unpaid-order-recovery', async (orig) => {
  const actual = await orig<typeof import('@/lib/unpaid-order-recovery')>();
  return { ...actual, listRecoverableOrders: (...a: unknown[]) => mockList(...a) };
});

import { POST } from './route';

const CSRF = randomBytes(32).toString('base64url');
const call = (csrf = true) => POST(new NextRequest('http://localhost/api/orders/unpaid', {
  method: 'POST',
  headers: { origin: 'http://localhost', ...(csrf ? { 'x-emblem-builder-csrf': CSRF, Cookie: `emblem_builder_csrf=${CSRF}` } : {}) },
}));
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

beforeEach(() => {
  user = { id: 'user-me', last_sign_in_at: minutesAgo(2) };
  mockRateLimit.mockReset().mockResolvedValue(true);
  mockList.mockReset().mockResolvedValue([{ orderId: 'o1', orderRef: 'EMB-1' }]);
});

describe('POST /api/orders/unpaid', () => {
  it('rejects requests without builder CSRF before reading the session', async () => {
    expect((await call(false)).status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('no session → 401 verify, nothing listed', async () => {
    user = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: 'verify' });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('a session older than 30 minutes (e.g. left on a shared device) → 401 verify, nothing listed', async () => {
    user = { id: 'user-me', last_sign_in_at: minutesAgo(31) };
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: 'verify' });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('a fresh code lists that adult’s own orders only (the session user id, never a request value)', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, orders: [{ orderId: 'o1', orderRef: 'EMB-1' }] });
    expect(mockList).toHaveBeenCalledWith(expect.anything(), 'user-me');
  });

  it('is rate limited per adult', async () => {
    mockRateLimit.mockResolvedValue(false);
    expect((await call()).status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'unpaid-order-recovery', 'user-me');
  });

  it('a lookup failure answers 503 without detail', async () => {
    mockList.mockRejectedValue(new Error('relation does not exist'));
    const res = await call();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});
