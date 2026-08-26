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
const VALID_BODY = { orderId: VALID_ORDER_ID, consentVersion: 'card_share_consent_v1', result: 'confirmed' };

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/card-share/consent', { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  mockHasValidBuilderCsrf.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockHasValidBuilderCsrf.mockReturnValue(true);
  mockRateLimit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'adult-1', email: 'adult@example.test' } } });
  mockRpc.mockResolvedValue({ data: { result: 'confirmed' }, error: null });
});

describe('POST /api/card-share/consent — validation and CSRF', () => {
  it('rejects when CSRF validation fails, before touching Supabase at all', async () => {
    mockHasValidBuilderCsrf.mockReturnValue(false);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed order id', async () => {
    const res = await post({ ...VALID_BODY, orderId: 'not-a-real-id' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a result value that is not confirmed or cancelled', async () => {
    const res = await post({ ...VALID_BODY, result: 'maybe' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a missing consent version', async () => {
    const res = await post({ ...VALID_BODY, consentVersion: undefined });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/consent — unverified session', () => {
  it('rejects when no authenticated session exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/consent — rate limiting', () => {
  it('rejects with a visible error when rate limited', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(429);
  });
});

describe('POST /api/card-share/consent — RPC result handling', () => {
  it('a confirmed result succeeds and passes through the RPC result', async () => {
    const res = await post(VALID_BODY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, result: 'confirmed' });
  });

  it('a cancelled result is a distinct, equally valid call', async () => {
    mockRpc.mockResolvedValue({ data: { result: 'cancelled' }, error: null });
    const res = await post({ ...VALID_BODY, result: 'cancelled' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, result: 'cancelled' });
  });

  it('an ineligibility raised by the RPC (e.g. suspended between check and click) surfaces as a real error, never a silent success', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Sharing is not available for this card' } });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  it('never leaks the raw RPC error message to the client', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'internal-detail-should-not-leak' } });
    const res = await post(VALID_BODY);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('internal-detail-should-not-leak');
  });
});
