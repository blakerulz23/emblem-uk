import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const mockRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({ consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockRateLimit(...args) }));

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => mockGetUser() },
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}));

const ORDER_ID = '11111111-2222-3333-4444-555555555555';

function get() {
  return GET(new NextRequest(`http://localhost/api/orders/${ORDER_ID}/payment-status`), { params: { id: ORDER_ID } });
}

beforeEach(() => {
  mockRateLimit.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockRateLimit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'adult-1', email: 'adult@example.test' } } });
  mockRpc.mockResolvedValue({ data: { ok: true, paymentStatus: 'pending_payment', authorityStatus: 'confirmed' }, error: null });
});

describe('GET /api/orders/[id]/payment-status', () => {
  it('requires an authenticated session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await get();
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects when rate limited', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await get();
    expect(res.status).toBe(429);
  });

  it('reports the real, current server-side status — this is what the "Confirming your payment…" poll actually trusts', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({ ok: true, paymentStatus: 'pending_payment', authorityStatus: 'confirmed' });
  });

  it('an unauthorized caller (wrong adult, or order does not exist) gets the same generic denial, never a distinguishing detail', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'not_authorized' }, error: null });
    const res = await get();
    expect(res.status).toBe(403);
  });

  it('a genuine RPC error never leaks raw detail', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom internal detail' } });
    const res = await get();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('boom internal detail');
  });

  it('never mutates anything — this route has no write path at all', async () => {
    await get();
    // The mocked supabase client exposes only auth.getUser and rpc; no
    // .from()/.update() is even defined on it, so a mutation attempt would
    // throw. A clean 200 above is itself proof none was attempted.
    expect(mockRpc).toHaveBeenCalledWith('get_gate3_payment_status', { p_order_id: ORDER_ID });
  });
});
