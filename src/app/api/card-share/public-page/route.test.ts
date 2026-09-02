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

const mockUploadObject = vi.fn();
const mockDeleteObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}));

const VALID_ORDER_ID = '11111111-2222-3333-4444-555555555555';
const VALID_IMAGE = 'data:image/jpeg;base64,QUJD'; // "ABC"
const TOKEN = 'a'.repeat(64);

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/card-share/public-page', { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  mockHasValidBuilderCsrf.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockUploadObject.mockReset();
  mockDeleteObject.mockReset();
  mockHasValidBuilderCsrf.mockReturnValue(true);
  mockRateLimit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'adult-1', email: 'adult@example.test' } } });
  mockUploadObject.mockResolvedValue(undefined);
  mockDeleteObject.mockResolvedValue(undefined);
  mockRpc.mockResolvedValue({ data: { token: TOKEN, expiresAt: '2026-09-09T00:00:00.000Z' }, error: null });
});

describe('POST /api/card-share/public-page — validation and CSRF', () => {
  it('rejects when CSRF validation fails, before touching Supabase or S3 at all', async () => {
    mockHasValidBuilderCsrf.mockReturnValue(false);
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-UUID-shaped) order id', async () => {
    const res = await post({ orderId: 'not-a-real-id', imageDataUrl: VALID_IMAGE });
    expect(res.status).toBe(400);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects a missing/malformed image data URL', async () => {
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: 'not-a-data-url' });
    expect(res.status).toBe(400);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects an oversized image before ever uploading it', async () => {
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(12 * 1024 * 1024);
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: huge });
    expect(res.status).toBe(400);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });
});

describe('POST /api/card-share/public-page — identity and rate limiting', () => {
  it('requires an authenticated session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    expect(res.status).toBe(401);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects with a visible error when rate limited, before uploading anything', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    expect(res.status).toBe(429);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rate-limits under the card-share-public-page-create action, keyed by the authenticated email', async () => {
    await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'card-share-public-page-create', 'adult@example.test');
  });
});

describe('POST /api/card-share/public-page — eligibility is re-verified server-side, never trusted from the client', () => {
  it('uploads the image, then calls create_card_share_public_page with the order id and the resolved key — never a client-supplied key', async () => {
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    expect(res.status).toBe(200);
    expect(mockUploadObject).toHaveBeenCalledTimes(1);
    const [key] = mockUploadObject.mock.calls[0];
    expect(mockRpc).toHaveBeenCalledWith('create_card_share_public_page', { p_order_id: VALID_ORDER_ID, p_front_image_key: key });
  });

  it('uploads under the card-share-public/ namespace with a fresh, unpredictable key — never derived from orderId', async () => {
    await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    const [key] = mockUploadObject.mock.calls[0];
    expect(key).toMatch(/^card-share-public\//);
    expect(key).not.toContain(VALID_ORDER_ID);
  });

  it('when the RPC rejects (ineligible), deletes the just-uploaded object rather than leaving it orphaned, and never leaks the raw internal error detail', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation "orders" row-level security violation, internal detail xyz' } });
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    expect(res.status).toBe(400);
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('row-level security');
    expect(JSON.stringify(body)).not.toContain('internal detail xyz');
    expect(body).toEqual({ error: 'Sharing is not available for this card' });
  });

  it('a genuine upload failure never calls the RPC at all', async () => {
    mockUploadObject.mockRejectedValue(new Error('S3 unavailable'));
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    expect(res.status).toBe(502);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns the token and expiry on success, with a no-store cache header', async () => {
    const res = await post({ orderId: VALID_ORDER_ID, imageDataUrl: VALID_IMAGE });
    const body = await res.json();
    expect(body).toEqual({ ok: true, token: TOKEN, expiresAt: '2026-09-09T00:00:00.000Z' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
