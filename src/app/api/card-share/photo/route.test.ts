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

const mockGetObjectBytes = vi.fn();
const mockIsS3NotFoundError = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  getObjectBytes: (...args: unknown[]) => mockGetObjectBytes(...args),
  isS3NotFoundError: (...args: unknown[]) => mockIsS3NotFoundError(...args),
}));

const VALID_ORDER_ID = '11111111-2222-3333-4444-555555555555';

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/card-share/photo', { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  mockHasValidBuilderCsrf.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockGetObjectBytes.mockReset();
  mockIsS3NotFoundError.mockReset();
  mockHasValidBuilderCsrf.mockReturnValue(true);
  mockRateLimit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'adult-1', email: 'adult@example.test' } } });
  mockRpc.mockResolvedValue({ data: 'order-assets/sub-1/player-1:photo', error: null });
  mockGetObjectBytes.mockResolvedValue({ bytes: Buffer.from('fake-image-bytes'), contentType: 'image/jpeg' });
  mockIsS3NotFoundError.mockReturnValue(false);
});

describe('POST /api/card-share/photo — validation and CSRF', () => {
  it('rejects when CSRF validation fails, before touching Supabase or S3 at all', async () => {
    mockHasValidBuilderCsrf.mockReturnValue(false);
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'photo' });
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-UUID-shaped) order id', async () => {
    const res = await post({ orderId: 'not-a-real-id', kind: 'photo' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a kind other than photo or badge', async () => {
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'artwork' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/photo — identity and rate limiting', () => {
  it('requires an authenticated session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'photo' });
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects with a visible error when rate limited, before calling the RPC', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'photo' });
    expect(res.status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/photo — key resolution never trusted from the client', () => {
  it('passes only orderId and kind to the RPC — never a client-supplied key or URL', async () => {
    await post({ orderId: VALID_ORDER_ID, kind: 'badge', key: 'order-assets/attacker/anything', url: 'https://evil.example/x' });
    expect(mockRpc).toHaveBeenCalledWith('get_card_share_asset_key', { p_order_id: VALID_ORDER_ID, p_kind: 'badge' });
  });

  it('returns 404 without ever calling S3 when the RPC resolves no key (ineligible, or nothing to proxy for this kind)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'badge' });
    expect(res.status).toBe(404);
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it('fails closed (400) on a genuine RPC error, never leaking the raw error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'photo' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('boom');
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/photo — S3 read and response', () => {
  it('returns the object bytes with its content type, same-origin, never cached', async () => {
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'photo' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.toString()).toBe('fake-image-bytes');
  });

  it('returns 404, not 500, when S3 conclusively has no such object', async () => {
    mockGetObjectBytes.mockRejectedValue(new Error('NoSuchKey'));
    mockIsS3NotFoundError.mockReturnValue(true);
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'photo' });
    expect(res.status).toBe(404);
  });

  it('returns a 502 (not a silently-empty image) on any other S3 failure, and never leaks the raw error', async () => {
    mockGetObjectBytes.mockRejectedValue(new Error('AccessDenied: super secret detail'));
    mockIsS3NotFoundError.mockReturnValue(false);
    const res = await post({ orderId: VALID_ORDER_ID, kind: 'photo' });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('super secret detail');
  });
});
