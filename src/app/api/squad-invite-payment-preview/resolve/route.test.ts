import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { POST } from './route';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: (name: string, args: unknown) => mockRpc(name, args) }),
}));

const mockGetSignedDownloadUrl = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  getSignedDownloadUrl: (...args: unknown[]) => mockGetSignedDownloadUrl(...args),
}));

const mockResolveLogo = vi.fn();
vi.mock('@/lib/card-definition-logo', () => ({
  resolveCardDefinitionLogo: (...args: unknown[]) => mockResolveLogo(...args),
}));

const mockBuildPaymentUrl = vi.fn();
vi.mock('@/lib/squad-invite-payment-link', () => ({
  buildSquadInvitePaymentUrl: (...args: unknown[]) => mockBuildPaymentUrl(...args),
}));

const mockRateLimit = vi.fn();
vi.mock('@/lib/squad-invite-rate-limit', () => ({
  consumeSquadInviteRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const VALID_TOKEN = randomBytes(32).toString('base64url');

const VALID_RESOLVED = {
  status: 'payment_requested',
  teamName: 'Ashton Juniors U10',
  tier: 'multi',
  unitPricePence: 2199,
  printQuantity: 2,
  totalPence: 4398,
  deadlineAt: '2026-09-04T13:00:00Z',
  orderRef: 'EMB-1234',
  card: {
    templateId: 'custom-solar', sport: 'soccer', name: 'Joe B.', number: '7', team: 'Ashton Juniors U10',
    position: 'Midfielder', logo: null, photoStorageKey: 'order-assets/abc/child:photo', photoCrop: null, stats: null,
  },
};

function postToken(token: string | undefined, origin: string | null = 'http://localhost') {
  return POST(new NextRequest('http://localhost/api/squad-invite-payment-preview/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin !== null ? { origin } : {}) },
    body: JSON.stringify({ token }),
  }));
}

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: VALID_RESOLVED, error: null });
  mockGetSignedDownloadUrl.mockReset().mockResolvedValue('https://example.invalid/signed-photo');
  mockResolveLogo.mockReset().mockResolvedValue(null);
  mockBuildPaymentUrl.mockReset().mockReturnValue('https://officialgudzzz.myshopify.com/cart/123:2?attributes%5BOrder+Ref%5D=EMB-1234');
  mockRateLimit.mockReset().mockResolvedValue(true);
});

describe('POST /api/squad-invite-payment-preview/resolve', () => {
  it('rejects a cross-site-style request (mismatched/missing Origin)', async () => {
    const res = await postToken(VALID_TOKEN, null);
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects when rate-limited, before ever hashing or calling the RPC', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed token before it ever reaches the RPC', async () => {
    const res = await postToken('not-a-real-token');
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns the uniform unavailable response when the RPC resolves nothing (wrong/expired/ineligible token)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Payment preview unavailable' });
  });

  it('returns the uniform unavailable response on an RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db unavailable' } });
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(404);
  });

  it('never leaks an unexpected field even if the RPC response were ever widened', async () => {
    mockRpc.mockResolvedValue({ data: { ...VALID_RESOLVED, purchaserEmail: 'never@example.test' }, error: null });
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(404);
  });

  it('on success: signs the photo, resolves the logo, and rebuilds the checkout URL from the RPC\'s own trusted orderRef/tier/printQuantity', async () => {
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith('order-assets/abc/child:photo', 15 * 60);
    expect(mockBuildPaymentUrl).toHaveBeenCalledWith('multi', 2, 'EMB-1234');
    expect(body.checkoutUrl).toBe('https://officialgudzzz.myshopify.com/cart/123:2?attributes%5BOrder+Ref%5D=EMB-1234');
    expect(body.card.photoUrl).toBe('https://example.invalid/signed-photo');
    // orderRef itself is only ever used server-side to build checkoutUrl —
    // it is never returned to the client as its own field.
    expect(body).not.toHaveProperty('orderRef');
    expect(JSON.stringify(body)).not.toContain('purchaserEmail');
  });

  it('returns unavailable when the checkout URL cannot be built (e.g. missing tier variant env var)', async () => {
    mockBuildPaymentUrl.mockReturnValue(null);
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(404);
  });

  it('handles a null card (no card_definitions row yet) without signing anything', async () => {
    mockRpc.mockResolvedValue({ data: { ...VALID_RESOLVED, card: null }, error: null });
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card).toBeNull();
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('degrades gracefully (photoUrl null, not a 500) if signing the photo throws', async () => {
    mockGetSignedDownloadUrl.mockRejectedValue(new Error('AWS_S3_BUCKET is not set'));
    const res = await postToken(VALID_TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card.photoUrl).toBeNull();
  });

  it('sets no-store/noindex headers', async () => {
    const res = await postToken(VALID_TOKEN);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
