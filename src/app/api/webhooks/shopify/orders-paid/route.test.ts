import { createHmac } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockRpc = vi.fn();
const mockOrdersSelect = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      if (table === 'orders') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => mockOrdersSelect() }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const SECRET = 'test-webhook-secret';
const VARIANT_ID = '123456789';
const WEBHOOK_ID = 'whid_abc123';

function sign(body: string) {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');
}

function post(payload: unknown, opts: { skipSignature?: boolean; skipWebhookId?: boolean; badSignature?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {};
  if (!opts.skipSignature) headers['x-shopify-hmac-sha256'] = opts.badSignature ? 'not-a-real-signature' : sign(body);
  if (!opts.skipWebhookId) headers['x-shopify-webhook-id'] = WEBHOOK_ID;
  return POST(new NextRequest('http://localhost/api/webhooks/shopify/orders-paid', { method: 'POST', body, headers }));
}

const ORDER_ROW = {
  id: 'order-1',
  payment_status: 'pending_payment',
  source: 'team_order',
  unit_price_pence: 2499,
  total_print_quantity: 2,
  currency: 'GBP',
};

const VALID_PAYLOAD = {
  id: 987654321,
  currency: 'GBP',
  note_attributes: [{ name: 'Order Ref', value: 'EMB-ABC123' }],
  line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99' }],
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT = VARIANT_ID;
  process.env.SHOPIFY_WEBHOOK_SECRET = SECRET;
  mockRpc.mockReset();
  mockOrdersSelect.mockReset();
  mockOrdersSelect.mockResolvedValue({ data: ORDER_ROW, error: null });
  mockRpc.mockResolvedValue({ data: { applied: true, orderId: ORDER_ROW.id }, error: null });
});

describe('POST /api/webhooks/shopify/orders-paid — signature and delivery-id verification', () => {
  it('rejects a missing signature', async () => {
    const res = await post(VALID_PAYLOAD, { skipSignature: true });
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature', async () => {
    const res = await post(VALID_PAYLOAD, { badSignature: true });
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a request with no webhook delivery id, even with a valid signature', async () => {
    const res = await post(VALID_PAYLOAD, { skipWebhookId: true });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/shopify/orders-paid — order lookup', () => {
  it('200s harmlessly when the payload has no Order Ref (not an Emblem order)', async () => {
    const res = await post({ id: 1, note_attributes: [] });
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('200s harmlessly when no matching order exists', async () => {
    mockOrdersSelect.mockResolvedValue({ data: null, error: null });
    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/shopify/orders-paid — amount/quantity/currency verification', () => {
  it('never applies the payment when no line item matches our configured variant', async () => {
    const res = await post({ ...VALID_PAYLOAD, line_items: [{ variant_id: 999, quantity: 2, price: '24.99' }] });
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never applies the payment on a quantity mismatch', async () => {
    const res = await post({ ...VALID_PAYLOAD, line_items: [{ variant_id: 123456789, quantity: 99, price: '24.99' }] });
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never applies the payment on a price mismatch', async () => {
    const res = await post({ ...VALID_PAYLOAD, line_items: [{ variant_id: 123456789, quantity: 2, price: '1.00' }] });
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never applies the payment on a currency mismatch against the order\'s own snapshot', async () => {
    const res = await post({ ...VALID_PAYLOAD, currency: 'USD' });
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('skips verification (and applies unconditionally via the RPC) for Squad Invite orders, which use their own variants', async () => {
    mockOrdersSelect.mockResolvedValue({ data: { ...ORDER_ROW, source: 'squad_invite', unit_price_pence: null, total_print_quantity: null }, error: null });
    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({ p_order_id: ORDER_ROW.id, p_to_status: 'paid' }));
  });
});

describe('POST /api/webhooks/shopify/orders-paid — exactly-once application via apply_gate3_payment_event', () => {
  it('passes the webhook delivery id through as the idempotency key', async () => {
    await post(VALID_PAYLOAD);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({ p_shopify_event_id: WEBHOOK_ID, p_topic: 'orders/paid', p_to_status: 'paid' }));
  });

  it('passes the verified amount (unit price x quantity), never total_price, and the real Shopify order id', async () => {
    await post(VALID_PAYLOAD);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({
      p_amount_pence: 2499 * 2,
      p_currency: 'GBP',
      p_shopify_order_id: '987654321',
    }));
  });

  it('a duplicate-event response from the RPC is reported ok — a replay is a safe no-op, not an error', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'duplicate_event' }, error: null });
    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, applied: false, reason: 'duplicate_event' });
  });
});

describe('POST /api/webhooks/shopify/orders-paid — Squad Invite bookkeeping', () => {
  it('calls mark_squad_invite_participation_paid only when the payment event actually applied', async () => {
    mockOrdersSelect.mockResolvedValue({ data: { ...ORDER_ROW, source: 'squad_invite' }, error: null });
    mockRpc.mockImplementation((name: string) => {
      if (name === 'apply_gate3_payment_event') return Promise.resolve({ data: { applied: true, orderId: ORDER_ROW.id }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    await post(VALID_PAYLOAD);
    expect(mockRpc).toHaveBeenCalledWith('mark_squad_invite_participation_paid', { p_order_id: ORDER_ROW.id });
  });

  it('never calls the coach-card bookkeeping when the payment event did not apply (e.g. a duplicate)', async () => {
    mockOrdersSelect.mockResolvedValue({ data: { ...ORDER_ROW, source: 'squad_invite' }, error: null });
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'duplicate_event' }, error: null });
    await post(VALID_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalledWith('mark_squad_invite_participation_paid', expect.anything());
  });

  it('never calls it for an ordinary (non-Squad-Invite) order', async () => {
    await post(VALID_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalledWith('mark_squad_invite_participation_paid', expect.anything());
  });
});
