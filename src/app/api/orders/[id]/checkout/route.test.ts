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

const mockBuildUkCardCartUrl = vi.fn();
vi.mock('@/lib/shopify', () => ({
  buildUkCardCartUrl: (...args: unknown[]) => mockBuildUkCardCartUrl(...args),
  gate3CheckoutSupportsTier: (tier: string) => tier === 'single',
  // Same real logic as src/lib/shopify.ts's own implementation — kept as
  // a small inline reimplementation (not a mock stub returning a fixed
  // value) so this test file still exercises the route's actual branch
  // on a genuinely malformed URL, not just a value it was told to return.
  isSafeShopifyCheckoutUrl: (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname === 'officialgudzzz.myshopify.com' && parsed.pathname.startsWith('/cart/');
    } catch {
      return false;
    }
  },
}));

const ORDER_ID = '11111111-2222-3333-4444-555555555555';

function post() {
  return POST(new NextRequest(`http://localhost/api/orders/${ORDER_ID}/checkout`, { method: 'POST' }), { params: { id: ORDER_ID } });
}

const SNAPSHOT = {
  ok: true,
  orderRef: 'EMB-ABC123',
  pricingTier: 'single',
  quantity: 2,
  unitPricePence: 2499,
  subtotalPence: 4998,
  currency: 'GBP',
};

beforeEach(() => {
  mockHasValidBuilderCsrf.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockBuildUkCardCartUrl.mockReset();
  mockHasValidBuilderCsrf.mockReturnValue(true);
  mockRateLimit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'adult-1', email: 'adult@example.test' } } });
  mockRpc.mockResolvedValue({ data: SNAPSHOT, error: null });
  mockBuildUkCardCartUrl.mockReturnValue('https://officialgudzzz.myshopify.com/cart/123:2?attributes%5BOrder+Ref%5D=EMB-ABC123');
});

describe('POST /api/orders/[id]/checkout — validation and CSRF', () => {
  it('rejects when CSRF validation fails, before touching Supabase at all', async () => {
    mockHasValidBuilderCsrf.mockReturnValue(false);
    const res = await post();
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires an authenticated session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post();
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects with a visible error when rate limited', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/orders/[id]/checkout — never accepts price/quantity/variant/owner from the request', () => {
  it('sends only the order id to the RPC — the request body is never parsed or forwarded', async () => {
    const req = new NextRequest(`http://localhost/api/orders/${ORDER_ID}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ unitPricePence: 1, quantity: 999, variantId: 'attacker-variant', orderId: 'someone-elses-order' }),
    });
    await POST(req, { params: { id: ORDER_ID } });
    expect(mockRpc).toHaveBeenCalledWith('begin_gate3_checkout', { p_order_id: ORDER_ID });
  });

  it('builds the cart URL only from the RPC-returned snapshot — never from anything the client supplied', async () => {
    await post();
    expect(mockBuildUkCardCartUrl).toHaveBeenCalledWith(SNAPSHOT.quantity, SNAPSHOT.orderRef);
  });
});

describe('POST /api/orders/[id]/checkout — authorization failures collapse to one generic response', () => {
  it('not_authenticated and not_authorized both return the same 403 with the same message', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'not_authenticated' }, error: null });
    const res1 = await post();
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'not_authorized' }, error: null });
    const res2 = await post();
    expect(res1.status).toBe(403);
    expect(res2.status).toBe(403);
    const [body1, body2] = await Promise.all([res1.json(), res2.json()]);
    expect(body1.error).toBe(body2.error);
  });

  it('an already-paid order is rejected with a clear, distinct message', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'already_paid' }, error: null });
    const res = await post();
    expect(res.status).toBe(409);
  });

  it('a genuine RPC error never leaks raw detail to the client', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation "orders" does not exist' } });
    const res = await post();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('relation');
  });
});

describe('POST /api/orders/[id]/checkout — unresolved pricing-tier mapping', () => {
  it('refuses a multi/squad-tier order rather than checking out through the wrong variant/price', async () => {
    mockRpc.mockResolvedValue({ data: { ...SNAPSHOT, pricingTier: 'multi' }, error: null });
    const res = await post();
    expect(res.status).toBe(503);
    expect(mockBuildUkCardCartUrl).not.toHaveBeenCalled();
  });
});

describe('POST /api/orders/[id]/checkout — success', () => {
  it('returns the checkout URL, never cached', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({ ok: true, checkoutUrl: mockBuildUkCardCartUrl.mock.results[0].value });
  });

  it('returns a clear, retryable error if the variant is not configured at all', async () => {
    mockBuildUkCardCartUrl.mockReturnValue(null);
    const res = await post();
    expect(res.status).toBe(503);
  });
});

describe('POST /api/orders/[id]/checkout — never forwards a malformed or non-Shopify URL', () => {
  it('refuses a URL on the wrong host, even if buildUkCardCartUrl were ever changed to produce one', async () => {
    mockBuildUkCardCartUrl.mockReturnValue('https://attacker.example/cart/123:2');
    const res = await post();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.checkoutUrl).toBeUndefined();
  });

  it('refuses a non-URL string outright', async () => {
    mockBuildUkCardCartUrl.mockReturnValue('not a url at all');
    const res = await post();
    expect(res.status).toBe(500);
  });

  it('refuses a URL on the right host but the wrong scheme', async () => {
    mockBuildUkCardCartUrl.mockReturnValue('http://officialgudzzz.myshopify.com/cart/123:2');
    const res = await post();
    expect(res.status).toBe(500);
  });
});
