import { createHmac } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockFlagSecondPayment = vi.fn();
vi.mock('@/lib/duplicate-payment', () => ({
  flagSecondPaymentIfAny: (...args: unknown[]) => mockFlagSecondPayment(...args),
}));

const mockRpc = vi.fn();
const mockOrdersSelect = vi.fn();
const mockParticipationSelect = vi.fn();
const mockOrderStatus = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      if (table === 'orders') {
        // The re-read before Squad Invite bookkeeping selects payment_status only.
        return { select: (cols: string) => ({ eq: () => ({ maybeSingle: () => (cols === 'payment_status' ? mockOrderStatus() : mockOrdersSelect()) }) }) };
      }
      if (table === 'squad_invite_participations') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => mockParticipationSelect() }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const mockEnqueueStaffNotification = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockEnqueueStaffNotification(...args),
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
  financial_status: 'paid',
  note_attributes: [{ name: 'Order Ref', value: 'EMB-ABC123' }],
  line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99' }],
};

// Squad Invite: one Shopify variant per campaign tier (see squad-invite-payment-link.ts).
const SQUAD_VARIANTS = { single: '9001', multi: '9002', squad: '9003' };
const SQUAD_ORDER_ROW = { ...ORDER_ROW, source: 'squad_invite', unit_price_pence: null, total_print_quantity: null };
const SQUAD_PARTICIPATION = { print_quantity: 1, squad_invites: { final_tier: 'squad', final_unit_price_pence: 1899 } };
const squadLine = (over: Record<string, unknown> = {}) => ({
  variant_id: 9003,
  quantity: 1,
  current_quantity: 1,
  price: '24.38',
  price_set: { shop_money: { amount: '24.38', currency_code: 'USD' }, presentment_money: { amount: '18.99', currency_code: 'GBP' } },
  discount_allocations: [],
  ...over,
});
const SQUAD_PAYLOAD = {
  id: 1122334455,
  currency: 'USD',
  presentment_currency: 'GBP',
  financial_status: 'paid',
  test: false,
  cancelled_at: null,
  refunds: [],
  note_attributes: [{ name: 'Order Ref', value: 'EMB-SQUAD-1' }],
  line_items: [squadLine()],
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT = VARIANT_ID;
  process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE = SQUAD_VARIANTS.single;
  process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_MULTI = SQUAD_VARIANTS.multi;
  process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SQUAD = SQUAD_VARIANTS.squad;
  process.env.SHOPIFY_WEBHOOK_SECRET = SECRET;
  mockRpc.mockReset();
  mockOrdersSelect.mockReset();
  mockParticipationSelect.mockReset();
  mockOrderStatus.mockReset();
  mockEnqueueStaffNotification.mockReset();
  mockOrderStatus.mockResolvedValue({ data: { payment_status: 'paid' }, error: null });
  mockParticipationSelect.mockResolvedValue({ data: SQUAD_PARTICIPATION, error: null });
  mockOrdersSelect.mockResolvedValue({ data: ORDER_ROW, error: null });
  mockRpc.mockResolvedValue({ data: { applied: true, orderId: ORDER_ROW.id }, error: null });
  mockFlagSecondPayment.mockReset().mockResolvedValue('none');
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

  it('notifies staff — real money, previously console.error-only — on a verification failure (quantity mismatch)', async () => {
    await post({ ...VALID_PAYLOAD, line_items: [{ variant_id: 123456789, quantity: 99, price: '24.99' }] });
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { eventType: string; recipientScope: string; summary: Record<string, unknown> };
    expect(call.eventType).toBe('payment_verification_failed');
    expect(call.recipientScope).toBe('all_staff');
    expect(call.summary.orderRef).toBe('EMB-ABC123');
  });

  it('notifies staff on a currency mismatch, with the mismatch reason in the summary', async () => {
    // A customer charged in USD (US market) for a GBP order.
    await post({ ...VALID_PAYLOAD, currency: 'USD', presentment_currency: 'USD' });
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { summary: { reason: string } };
    expect(call.summary.reason).toMatch(/currency.mismatch/i);
  });

  it('notifies staff when the pricing snapshot or Shopify variant configuration is missing', async () => {
    delete process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;
    await post(VALID_PAYLOAD);
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { eventType: string };
    expect(call.eventType).toBe('payment_verification_failed');
  });

  it('never notifies staff on a genuinely successful, verified payment', async () => {
    await post(VALID_PAYLOAD);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
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
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER_ROW, error: null });
    mockRpc.mockImplementation((name: string) => {
      if (name === 'apply_gate3_payment_event') return Promise.resolve({ data: { applied: true, orderId: ORDER_ROW.id }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    await post(SQUAD_PAYLOAD);
    expect(mockRpc).toHaveBeenCalledWith('mark_squad_invite_participation_paid', { p_order_id: ORDER_ROW.id });
  });

  it('re-runs the (idempotent) bookkeeping on a duplicate delivery while the order is paid, so an earlier failure is completed', async () => {
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER_ROW, error: null });
    mockRpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'apply_gate3_payment_event' ? { data: { applied: false, reason: 'duplicate_event' }, error: null } : { data: { applied: false, reason: 'already paid' }, error: null }));
    const res = await post(SQUAD_PAYLOAD);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('mark_squad_invite_participation_paid', { p_order_id: ORDER_ROW.id });
  });

  it('never marks the family paid on a retry once the order has been refunded or cancelled', async () => {
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER_ROW, error: null });
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'duplicate_event' }, error: null });
    for (const status of ['refunded', 'cancelled', 'pending_payment']) {
      mockOrderStatus.mockResolvedValue({ data: { payment_status: status }, error: null });
      await post(SQUAD_PAYLOAD);
    }
    expect(mockRpc).not.toHaveBeenCalledWith('mark_squad_invite_participation_paid', expect.anything());
  });

  it('returns 500 so Shopify retries when the bookkeeping fails after the payment applied', async () => {
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER_ROW, error: null });
    mockRpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'apply_gate3_payment_event' ? { data: { applied: true }, error: null } : { data: null, error: { message: 'lock timeout' } }));
    const res = await post(SQUAD_PAYLOAD);
    expect(res.status).toBe(500);
  });

  it('returns 500 when the order re-read fails before bookkeeping', async () => {
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER_ROW, error: null });
    mockOrderStatus.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await post(SQUAD_PAYLOAD);
    expect(res.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalledWith('mark_squad_invite_participation_paid', expect.anything());
  });

  it('never calls it for an ordinary (non-Squad-Invite) order', async () => {
    await post(VALID_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalledWith('mark_squad_invite_participation_paid', expect.anything());
  });
});

/**
 * End-to-end route behaviour for Emblem's real store set-up: Shopify shop
 * currency USD, UK customer pays £24.99 GBP (Shopify Markets presentment).
 */
describe('POST /api/webhooks/shopify/orders-paid — USD store, GBP presentment', () => {
  const usd = (amount: string) => ({ amount, currency_code: 'USD' });
  const gbp = (amount: string) => ({ amount, currency_code: 'GBP' });
  const USD_STORE_PAYLOAD = {
    id: 5678901234567,
    currency: 'USD',
    presentment_currency: 'GBP',
    financial_status: 'paid',
    test: false,
    cancelled_at: null,
    refunds: [],
    total_price: '74.42',
    total_price_set: { shop_money: usd('74.42'), presentment_money: gbp('57.97') },
    note_attributes: [{ name: 'Order Ref', value: 'EMB-ABC123' }],
    line_items: [{
      variant_id: 123456789,
      quantity: 2,
      current_quantity: 2,
      price: '32.09',
      price_set: { shop_money: usd('32.09'), presentment_money: gbp('24.99') },
      discount_allocations: [],
    }],
  };

  it('applies a genuine GBP payment, recording the GBP amount and currency (not USD)', async () => {
    const res = await post(USD_STORE_PAYLOAD);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({
      p_order_id: ORDER_ROW.id,
      p_to_status: 'paid',
      p_amount_pence: 2499 * 2,
      p_currency: 'GBP',
      p_shopify_order_id: '5678901234567',
      p_shopify_event_id: WEBHOOK_ID,
    }));
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('treats a replayed delivery as a safe no-op (idempotency stays in apply_gate3_payment_event)', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'duplicate_event' }, error: null });
    const res = await post(USD_STORE_PAYLOAD);
    expect(await res.json()).toMatchObject({ ok: true, applied: false, reason: 'duplicate_event' });
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('never re-pays an order Emblem already holds as refunded (database guard reported back)', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'order_refunded' }, error: null });
    const res = await post(USD_STORE_PAYLOAD);
    expect(await res.json()).toMatchObject({ ok: true, applied: false, reason: 'order_refunded' });
  });

  it('never applies, and alerts staff, when the Shopify order itself already carries a refund', async () => {
    await post({ ...USD_STORE_PAYLOAD, financial_status: 'refunded', refunds: [{ id: 1 }] });
    expect(mockRpc).not.toHaveBeenCalled();
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { summary: { reason: string } };
    expect(call.summary.reason).toMatch(/order_not_paid|order_refunded/);
  });

  it('never applies, and alerts staff, on the wrong GBP price', async () => {
    const wrongPrice = { ...USD_STORE_PAYLOAD, line_items: [{ ...USD_STORE_PAYLOAD.line_items[0], price_set: { shop_money: usd('25.67'), presentment_money: gbp('19.99') } }] };
    await post(wrongPrice);
    expect(mockRpc).not.toHaveBeenCalled();
    expect((mockEnqueueStaffNotification.mock.calls[0][1] as { summary: { reason: string } }).summary.reason).toMatch(/price_mismatch/);
  });

  it('never applies, and alerts staff, on a line-item discount', async () => {
    const discounted = { ...USD_STORE_PAYLOAD, line_items: [{ ...USD_STORE_PAYLOAD.line_items[0], discount_allocations: [{ amount: '6.42', amount_set: { shop_money: usd('6.42'), presentment_money: gbp('5.00') } }] }] };
    await post(discounted);
    expect(mockRpc).not.toHaveBeenCalled();
    expect((mockEnqueueStaffNotification.mock.calls[0][1] as { summary: { reason: string } }).summary.reason).toMatch(/discount_mismatch/);
  });

  it('fails closed, and alerts staff, when the GBP line amount is missing (no exchange-rate conversion)', async () => {
    const noPresentment = { ...USD_STORE_PAYLOAD, line_items: [{ variant_id: 123456789, quantity: 2, price: '32.09' }] };
    await post(noPresentment);
    expect(mockRpc).not.toHaveBeenCalled();
    expect((mockEnqueueStaffNotification.mock.calls[0][1] as { summary: { reason: string } }).summary.reason).toMatch(/presentment_price_missing/);
  });

  it('still rejects a bad signature before any of this runs', async () => {
    const res = await post(USD_STORE_PAYLOAD, { badSignature: true });
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

});

describe('POST /api/webhooks/shopify/orders-paid — Squad Invite price validation', () => {
  const reason = () => (mockEnqueueStaffNotification.mock.calls[0][1] as { summary: { reason: string } }).summary.reason;
  const gbpLine = (shop: string, gbp: string) => ({ shop_money: { amount: shop, currency_code: 'USD' }, presentment_money: { amount: gbp, currency_code: 'GBP' } });
  beforeEach(() => {
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER_ROW, error: null });
  });

  it('applies a genuine payment at the campaign frozen squad price, recording the GBP amount', async () => {
    const res = await post(SQUAD_PAYLOAD);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({
      p_order_id: ORDER_ROW.id,
      p_to_status: 'paid',
      p_amount_pence: 1899,
      p_currency: 'GBP',
      p_shopify_order_id: '1122334455',
    }));
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('verifies against the family own print quantity and the campaign own tier (multi)', async () => {
    mockParticipationSelect.mockResolvedValue({ data: { print_quantity: 2, squad_invites: { final_tier: 'multi', final_unit_price_pence: 2199 } }, error: null });
    await post({ ...SQUAD_PAYLOAD, line_items: [squadLine({ variant_id: 9002, quantity: 2, current_quantity: 2, price_set: gbpLine('28.23', '21.99') })] });
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({ p_amount_pence: 2199 * 2, p_currency: 'GBP' }));
  });

  it('never applies a payment made on another tier variant (the cheaper squad variant for a multi campaign)', async () => {
    mockParticipationSelect.mockResolvedValue({ data: { print_quantity: 1, squad_invites: { final_tier: 'multi', final_unit_price_pence: 2199 } }, error: null });
    await post(SQUAD_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reason()).toMatch(/no_matching_line_item/);
  });

  it('never applies, and alerts staff, on the wrong GBP price for the right variant', async () => {
    await post({ ...SQUAD_PAYLOAD, line_items: [squadLine({ price_set: gbpLine('19.26', '15.00') })] });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reason()).toMatch(/price_mismatch/);
  });

  it('never applies, and alerts staff, on a line-item discount', async () => {
    await post({ ...SQUAD_PAYLOAD, line_items: [squadLine({ discount_allocations: [{ amount: '6.42', amount_set: gbpLine('6.42', '5.00') }] })] });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reason()).toMatch(/discount_mismatch/);
  });

  it('never applies when the paid quantity differs from the family print quantity', async () => {
    mockParticipationSelect.mockResolvedValue({ data: { ...SQUAD_PARTICIPATION, print_quantity: 2 }, error: null });
    await post(SQUAD_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reason()).toMatch(/quantity_mismatch/);
  });

  it('never applies a UK single-card variant payment to a Squad Invite order', async () => {
    await post({ ...SQUAD_PAYLOAD, line_items: [squadLine({ variant_id: Number(VARIANT_ID) })] });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reason()).toMatch(/no_matching_line_item/);
  });

  it('never applies a test, unpaid or refunded Shopify order', async () => {
    for (const over of [{ test: true }, { financial_status: 'pending' }, { refunds: [{ id: 1 }] }]) {
      await post({ ...SQUAD_PAYLOAD, ...over });
    }
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(3);
  });

  it('fails closed, and alerts staff, when the campaign price has not been finalised', async () => {
    mockParticipationSelect.mockResolvedValue({ data: { print_quantity: 1, squad_invites: { final_tier: null, final_unit_price_pence: null } }, error: null });
    await post(SQUAD_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reason()).toMatch(/final price, participation or tier variant missing/);
  });

  it('fails closed when the tier Shopify variant is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SQUAD;
    await post(SQUAD_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
  });

  it('fails closed when no participation is linked to the order', async () => {
    mockParticipationSelect.mockResolvedValue({ data: null, error: null });
    await post(SQUAD_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
  });

  it('returns 500 so Shopify retries when the participation lookup errors', async () => {
    mockParticipationSelect.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await post(SQUAD_PAYLOAD);
    expect(res.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('never looks up a participation for an ordinary builder order', async () => {
    mockOrdersSelect.mockResolvedValue({ data: ORDER_ROW, error: null });
    await post(VALID_PAYLOAD);
    expect(mockParticipationSelect).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/shopify/orders-paid — webhook ordering: payment after cancellation or refund', () => {
  const call = () => mockEnqueueStaffNotification.mock.calls[0][1] as { eventKey: string; summary: { reason: string } };

  it('never applies a payment for an order Emblem already holds as refunded, and alerts staff', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'order_refunded' }, error: null });
    const res = await post(VALID_PAYLOAD);
    expect(await res.json()).toMatchObject({ ok: true, applied: false, reason: 'order_refunded' });
    expect(call().summary.reason).toMatch(/already holds it as refunded, so it was not marked paid/);
    expect(call().eventKey).toMatch(/^payment_paid_after_close:EMB-ABC123:/);
  });

  it('never applies a payment for an order already cancelled (cancellation arrived first), and alerts staff', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'order_cancelled' }, error: null });
    await post(VALID_PAYLOAD);
    expect(call().summary.reason).toMatch(/already holds it as cancelled/);
  });

  it('stays silent for a replayed or already-paid delivery', async () => {
    mockRpc.mockResolvedValueOnce({ data: { applied: false, reason: 'duplicate_event' }, error: null });
    await post(VALID_PAYLOAD);
    mockRpc.mockResolvedValueOnce({ data: { applied: false, reason: 'already_paid' }, error: null });
    await post(VALID_PAYLOAD);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('never runs Squad Invite paid bookkeeping when the payment was not applied', async () => {
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER_ROW, error: null });
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'order_refunded' }, error: null });
    await post(SQUAD_PAYLOAD);
    expect(mockRpc).not.toHaveBeenCalledWith('mark_squad_invite_participation_paid', expect.anything());
  });
});

describe('POST /api/webhooks/shopify/orders-paid — second payment for an already-paid order', () => {
  it('a first, applied payment never runs the duplicate check', async () => {
    await post(VALID_PAYLOAD);
    expect(mockFlagSecondPayment).not.toHaveBeenCalled();
  });

  it('already_paid: checks for a second payment with the order, ref, payload and delivery id', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'already_paid' }, error: null });
    await post(VALID_PAYLOAD);
    expect(mockFlagSecondPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderId: 'order-1', orderRef: 'EMB-ABC123', webhookId: WEBHOOK_ID, payload: expect.objectContaining({ id: 987654321 }) }));
  });

  it('a flagged second payment is reported, never a silent ok, and nothing else mutates the order', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'already_paid' }, error: null });
    mockFlagSecondPayment.mockResolvedValue('flagged');
    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: false, reason: 'duplicate_payment_flagged' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('asks Shopify to retry (500) when the second payment could not be recorded or alerted', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'already_paid' }, error: null });
    mockFlagSecondPayment.mockResolvedValue('failed');
    expect((await post(VALID_PAYLOAD)).status).toBe(500);
  });

  it('a repeated delivery (duplicate_event) re-runs the check so a failed alert is retried; a redelivered first payment stays a quiet ok', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'duplicate_event' }, error: null });
    const res = await post(VALID_PAYLOAD);
    expect(mockFlagSecondPayment).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ ok: true, reason: 'duplicate_event' });
  });

  it('a payment for a refunded order keeps its own paid-after-close alert and skips the duplicate check', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'order_refunded' }, error: null });
    await post(VALID_PAYLOAD);
    expect(mockFlagSecondPayment).not.toHaveBeenCalled();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
  });
});
