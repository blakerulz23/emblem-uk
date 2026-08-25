import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => mockGetUser() },
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}));

const ORDER_ID = 'order-1';
const USER = { id: 'user-1', email: 'guardian@example.test' };

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/card-share/consent', { method: 'POST', body: JSON.stringify(body) }));
}

const VALID_BODY = {
  orderId: ORDER_ID,
  confirmedAuthority: true,
  confirmedRecallUnderstanding: true,
  consentWordingVersion: 'v1',
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: USER } });
});

describe('POST /api/card-share/consent — authentication and input shape', () => {
  it('rejects an unauthenticated caller before touching the RPC at all', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a request missing orderId', async () => {
    const res = await post({ ...VALID_BODY, orderId: undefined });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a request missing consentWordingVersion', async () => {
    const res = await post({ ...VALID_BODY, consentWordingVersion: undefined });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a request with either confirmation false or missing, before calling the RPC', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
    const res1 = await post({ ...VALID_BODY, confirmedAuthority: false });
    expect(res1.status).toBe(400);
    const res2 = await post({ ...VALID_BODY, confirmedRecallUnderstanding: false });
    expect(res2.status).toBe(400);
    const res3 = await post({ ...VALID_BODY, confirmedAuthority: undefined });
    expect(res3.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a non-boolean-true confirmation value is coerced to false, never truthy-accepted', async () => {
    const res = await post({ ...VALID_BODY, confirmedAuthority: 'true' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/consent — RPC call shape', () => {
  it('calls record_card_share_consent with exactly order_id and the two booleans and version — the caller cannot inject any other field', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, consentId: 'consent-1' }, error: null });
    await post({
      ...VALID_BODY,
      guardianUserId: 'someone-elses-id',
      cardVersionHash: 'forged-hash',
      authorityStatus: 'confirmed',
    } as Record<string, unknown>);
    expect(mockRpc).toHaveBeenCalledWith('record_card_share_consent', {
      p_order_id: ORDER_ID,
      p_confirmed_authority: true,
      p_confirmed_recall_understanding: true,
      p_consent_wording_version: 'v1',
    });
  });

  it('returns ok:true only when the RPC itself reports ok:true', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, consentId: 'consent-1' }, error: null });
    const res = await post(VALID_BODY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe('POST /api/card-share/consent — generic failure responses (no oracle)', () => {
  it('an RPC error (not authorized) returns a generic ok:false, never the underlying message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Not authorized to share this card' } });
    const res = await post(VALID_BODY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain('authorized');
  });

  it('an RPC error (artwork not cleared) also returns the same generic ok:false shape', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "This card's artwork is not cleared for social sharing" } });
    const res = await post(VALID_BODY);
    const body = await res.json();
    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain('artwork');
  });

  it('an RPC error (card not found) is indistinguishable from every other rejection reason', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Card not found for this order' } });
    const res = await post(VALID_BODY);
    const body = await res.json();
    expect(body).toEqual({ ok: false });
  });
});
