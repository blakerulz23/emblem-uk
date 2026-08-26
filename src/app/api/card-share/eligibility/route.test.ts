import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockHasValidBuilderCsrf = vi.fn();
vi.mock('@/lib/builder-request-security', () => ({ hasValidBuilderCsrf: (...args: unknown[]) => mockHasValidBuilderCsrf(...args) }));

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

const VALID_ORDER_ID = '11111111-2222-3333-4444-555555555555';

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/card-share/eligibility', { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  mockHasValidBuilderCsrf.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockHasValidBuilderCsrf.mockReturnValue(true);
  mockRateLimit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'adult-1', email: 'adult@example.test' } } });
  mockRpc.mockResolvedValue({ data: { eligible: true, cardId: 'card-1', artworkCardDefinitionId: 'def-1' }, error: null });
});

describe('POST /api/card-share/eligibility — validation and CSRF', () => {
  it('rejects when CSRF validation fails, before touching Supabase at all', async () => {
    mockHasValidBuilderCsrf.mockReturnValue(false);
    const res = await post({ orderId: VALID_ORDER_ID });
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-UUID-shaped) order id', async () => {
    const res = await post({ orderId: 'not-a-real-id' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/eligibility — identity', () => {
  it('reports not_authenticated (never eligible) when no session exists, without calling the RPC at all', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ orderId: VALID_ORDER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.reason).toBe('not_authenticated');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/eligibility — rate limiting', () => {
  it('rejects with a visible error when rate limited', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post({ orderId: VALID_ORDER_ID });
    expect(res.status).toBe(429);
  });
});

describe('POST /api/card-share/eligibility — RPC result handling', () => {
  it('passes through an eligible result', async () => {
    const res = await post({ orderId: VALID_ORDER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ ok: true, eligible: true, cardId: 'card-1', artworkCardDefinitionId: 'def-1' }));
  });

  it('passes through an ineligible result with its reason', async () => {
    mockRpc.mockResolvedValue({ data: { eligible: false, reason: 'card_suspended' }, error: null });
    const res = await post({ orderId: VALID_ORDER_ID });
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ ok: true, eligible: false, reason: 'card_suspended' }));
  });

  it('fails closed to eligible:false on a genuine RPC error, never throws, never leaks the raw error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await post({ orderId: VALID_ORDER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(JSON.stringify(body)).not.toContain('boom');
  });
});
