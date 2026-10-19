import { createHmac } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockRecordDuplicateRefund = vi.fn();
vi.mock('@/lib/duplicate-payment', () => ({
  recordDuplicateRefund: (...args: unknown[]) => mockRecordDuplicateRefund(...args),
}));

const mockRpc = vi.fn();
const mockOrdersSelect = vi.fn();
const mockOrderStatus = vi.fn();
const mockParticipationSelect = vi.fn();
const mockParticipationUpdate = vi.fn();
const participationPatches: Array<{ patch: Record<string, unknown>; fromStatuses: unknown }> = [];
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => ({
              maybeSingle: () => (col === 'shopify_order_id' ? mockOrdersSelect(col, val) : mockOrderStatus(col, val)),
            }),
          }),
        };
      }
      if (table === 'squad_invite_participations') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => mockParticipationSelect() }) }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              in: (_col: string, fromStatuses: unknown) => ({
                select: () => {
                  participationPatches.push({ patch, fromStatuses });
                  return mockParticipationUpdate();
                },
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const mockNotify = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockNotify(...args),
}));

const SECRET = 'test-webhook-secret';
const WEBHOOK_ID = 'whid_refund_1';
const UK_VARIANT = '46800821715116';
const SQUAD_VARIANT = '9003';

function sign(body: string) {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');
}

function post(payload: unknown, opts: { skipSignature?: boolean; skipWebhookId?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {};
  if (!opts.skipSignature) headers['x-shopify-hmac-sha256'] = sign(body);
  if (!opts.skipWebhookId) headers['x-shopify-webhook-id'] = WEBHOOK_ID;
  return POST(new NextRequest('http://localhost/api/webhooks/shopify/refunds-create', { method: 'POST', body, headers }));
}

const tx = (amount: string, status = 'success', currency = 'GBP') => ({ kind: 'refund', status, amount, currency });
const line = (variant: string, quantity: number) => ({ quantity, line_item: { variant_id: Number(variant) } });
/** A full refund of a builder order: 2 cards at £24.99, refunded in GBP. */
const FULL_REFUND = { id: 42, order_id: 987654321, refund_line_items: [line(UK_VARIANT, 2)], transactions: [tx('49.98')] };

const BUILDER_ORDER = { id: 'order-9', order_ref: 'EMB-REF-1', payment_status: 'paid', source: 'team_order', total_print_quantity: 2, paid_amount_pence: 4998 };
const SQUAD_ORDER = { id: 'order-sq', order_ref: 'squad-ref-1', payment_status: 'paid', source: 'squad_invite', total_print_quantity: null, paid_amount_pence: 1899 };
const SQUAD_REFUND = { id: 43, order_id: 555, refund_line_items: [line(SQUAD_VARIANT, 1)], transactions: [tx('18.99')] };

const reasons = () => mockNotify.mock.calls.map((c) => (c[1] as { summary: { reason: string } }).summary.reason);
const keys = () => mockNotify.mock.calls.map((c) => (c[1] as { eventKey: string }).eventKey);

beforeEach(() => {
  mockRecordDuplicateRefund.mockReset().mockResolvedValue(null);
  process.env.SHOPIFY_WEBHOOK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT = UK_VARIANT;
  process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE = '9001';
  process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_MULTI = '9002';
  process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SQUAD = SQUAD_VARIANT;
  for (const m of [mockRpc, mockOrdersSelect, mockOrderStatus, mockParticipationSelect, mockParticipationUpdate, mockNotify]) m.mockReset();
  participationPatches.length = 0;
  mockOrdersSelect.mockResolvedValue({ data: BUILDER_ORDER, error: null });
  mockOrderStatus.mockResolvedValue({ data: { payment_status: 'refunded' }, error: null });
  mockParticipationSelect.mockResolvedValue({ data: { print_quantity: 1, campaign_id: 'camp-1' }, error: null });
  mockParticipationUpdate.mockResolvedValue({ data: [{ campaign_id: 'camp-1' }], error: null });
  mockRpc.mockResolvedValue({ data: { applied: true }, error: null });
  mockNotify.mockResolvedValue({ enqueued: true, sent: true });
});

describe('POST /api/webhooks/shopify/refunds-create — request checks', () => {
  it('rejects an invalid/missing signature before any lookup', async () => {
    const res = await post(FULL_REFUND, { skipSignature: true });
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a missing webhook delivery id', async () => {
    const res = await post(FULL_REFUND, { skipWebhookId: true });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('200s harmlessly with no order_id in the payload', async () => {
    const res = await post({ id: 1 });
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('looks the order up by shopify_order_id, never by order_ref — a Refund payload has no note_attributes at all', async () => {
    await post(FULL_REFUND);
    expect(mockOrdersSelect).toHaveBeenCalledWith('shopify_order_id', '987654321');
  });

  it('returns 500 so Shopify retries when the order lookup errors', async () => {
    mockOrdersSelect.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await post(FULL_REFUND);
    expect(res.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/shopify/refunds-create — full refunds', () => {
  it('applies a full refund (every paid card) via apply_gate3_payment_event with the webhook id as the idempotency key', async () => {
    const res = await post(FULL_REFUND);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', {
      p_order_id: 'order-9',
      p_shopify_event_id: WEBHOOK_ID,
      p_topic: 'refunds/create',
      p_to_status: 'refunded',
      p_shopify_order_id: '987654321',
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('treats a refund whose transaction is still pending as a full refund (stops the card being printed)', async () => {
    await post({ ...FULL_REFUND, transactions: [tx('49.98', 'pending')] });
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({ p_to_status: 'refunded' }));
  });

  it('treats an amount-only refund covering the GBP amount paid as full', async () => {
    await post({ id: 44, order_id: 987654321, refund_line_items: [], transactions: [tx('49.98')] });
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({ p_to_status: 'refunded' }));
  });

  it('alerts staff to stop production when an already-approved order is refunded in full', async () => {
    mockOrdersSelect.mockResolvedValue({ data: { ...BUILDER_ORDER, payment_status: 'fulfilled' }, error: null });
    await post(FULL_REFUND);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({ p_to_status: 'refunded' }));
    expect(reasons()[0]).toMatch(/after it was approved for production\. Stop printing/);
    expect(keys()[0]).toMatch(/^payment_refund_after_approval:EMB-REF-1:/);
  });

  it('treats a replayed delivery as a safe no-op: no second change and no alert', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'duplicate_event' }, error: null });
    const res = await post(FULL_REFUND);
    expect(await res.json()).toMatchObject({ ok: true, applied: false, reason: 'duplicate_event' });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('reports a refund for an order that was never paid without changing it (database guard)', async () => {
    mockOrdersSelect.mockResolvedValue({ data: { ...BUILDER_ORDER, payment_status: 'pending_payment' }, error: null });
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'not_currently_paid' }, error: null });
    const res = await post(FULL_REFUND);
    expect(await res.json()).toMatchObject({ applied: false, reason: 'not_currently_paid' });
  });
});

describe('POST /api/webhooks/shopify/refunds-create — partial and failed refunds leave the order paid', () => {
  it('a refund of 1 of 2 cards is partial: not applied, staff alerted', async () => {
    const res = await post({ ...FULL_REFUND, refund_line_items: [line(UK_VARIANT, 1)], transactions: [tx('24.99')] });
    expect(await res.json()).toMatchObject({ applied: false, reason: 'partial_refund' });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reasons()[0]).toMatch(/Partial refund \(1 card\(s\), £24\.99\)/);
    expect(keys()[0]).toMatch(/^payment_refund_partial:EMB-REF-1:/);
  });

  it('a goodwill or shipping-only amount is partial', async () => {
    await post({ id: 45, order_id: 987654321, refund_line_items: [], transactions: [tx('5.00')] });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reasons()[0]).toMatch(/Partial refund \(0 card\(s\), £5\.00\)/);
  });

  it('cards refunded with no money returned (restock only) are partial', async () => {
    await post({ ...FULL_REFUND, transactions: [] });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reasons()[0]).toMatch(/Partial refund \(2 card\(s\), £0\.00\)/);
  });

  it('a refund whose transactions all failed is not applied, and staff are told no money moved', async () => {
    const res = await post({ ...FULL_REFUND, transactions: [tx('49.98', 'failure')] });
    expect(await res.json()).toMatchObject({ applied: false, reason: 'refund_failed' });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reasons()[0]).toMatch(/refund failed, so no money was returned/);
  });

  it('never marks an amount-only refund in another currency as full', async () => {
    await post({ id: 46, order_id: 987654321, refund_line_items: [], transactions: [tx('63.00', 'success', 'USD')] });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reasons()[0]).toMatch(/amount in another currency/);
  });
});

describe('POST /api/webhooks/shopify/refunds-create — refunds for orders Emblem never marked paid', () => {
  it('alerts staff when the refund names an Emblem card variant (orders/paid missing or late)', async () => {
    mockOrdersSelect.mockResolvedValue({ data: null, error: null });
    const res = await post(FULL_REFUND);
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(reasons()[0]).toMatch(/Shopify order 987654321, which Emblem has not recorded as paid/);
    expect(keys()[0]).toMatch(/^payment_refund_unmatched:shopify-order-987654321:/);
  });

  it('stays silent for refunds on other products sold on the shared store', async () => {
    mockOrdersSelect.mockResolvedValue({ data: null, error: null });
    await post({ ...FULL_REFUND, refund_line_items: [line('111222333', 1)] });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('the refund of a flagged duplicate payment is recorded against its Emblem order, never marking that order refunded', async () => {
    mockOrdersSelect.mockResolvedValue({ data: null, error: null });
    mockRecordDuplicateRefund.mockResolvedValue({ orderId: 'order-1' });
    const res = await post(FULL_REFUND);
    expect(await res.json()).toMatchObject({ ok: true, applied: false, reason: 'duplicate_payment_refunded', orderId: 'order-1' });
    expect(mockRecordDuplicateRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ shopifyOrderId: '987654321' }));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled(); // no misleading "not recorded as paid" alert
  });

  it('asks Shopify to retry when the duplicate refund cannot be recorded yet', async () => {
    mockOrdersSelect.mockResolvedValue({ data: null, error: null });
    mockRecordDuplicateRefund.mockResolvedValue('failed');
    expect((await post(FULL_REFUND)).status).toBe(500);
  });
});

describe('POST /api/webhooks/shopify/refunds-create — Squad Invite families', () => {
  beforeEach(() => {
    mockOrdersSelect.mockResolvedValue({ data: SQUAD_ORDER, error: null });
  });

  it('moves the family from paid to refunded and recomputes the paid-family count and free coach card', async () => {
    const res = await post(SQUAD_REFUND);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', expect.objectContaining({ p_order_id: 'order-sq', p_to_status: 'refunded' }));
    expect(participationPatches).toHaveLength(1);
    expect(participationPatches[0].patch).toMatchObject({ status: 'refunded' });
    expect(participationPatches[0].fromStatuses).toEqual(['paid', 'production_accepted']);
    expect(mockRpc).toHaveBeenCalledWith('reconcile_squad_invite_coach_eligibility', { p_campaign_id: 'camp-1' });
  });

  it('judges a full refund against the family own print quantity', async () => {
    // Two cards paid (2 x £18.99 recorded); refunding one card is partial.
    mockOrdersSelect.mockResolvedValue({ data: { ...SQUAD_ORDER, paid_amount_pence: 3798 }, error: null });
    mockParticipationSelect.mockResolvedValue({ data: { print_quantity: 2, campaign_id: 'camp-1' }, error: null });
    await post(SQUAD_REFUND);
    expect(mockRpc).not.toHaveBeenCalledWith('apply_gate3_payment_event', expect.anything());
    expect(participationPatches).toHaveLength(0);
    expect(reasons()[0]).toMatch(/Partial refund/);
  });

  it('re-runs the family sync on a duplicate delivery, so a sync that failed earlier is completed by the retry', async () => {
    mockRpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'apply_gate3_payment_event' ? { data: { applied: false, reason: 'duplicate_event' }, error: null } : { data: false, error: null }));
    mockParticipationUpdate.mockResolvedValue({ data: [], error: null });
    await post(SQUAD_REFUND);
    expect(participationPatches).toHaveLength(1);
    expect(mockRpc).toHaveBeenCalledWith('reconcile_squad_invite_coach_eligibility', { p_campaign_id: 'camp-1' });
  });

  it('returns 500 (Shopify retries) when moving the family fails after the order was refunded', async () => {
    mockParticipationUpdate.mockResolvedValue({ data: null, error: { message: 'deadlock' } });
    const res = await post(SQUAD_REFUND);
    expect(res.status).toBe(500);
  });

  it('returns 500 (Shopify retries) when the coach card recount fails', async () => {
    mockRpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'reconcile_squad_invite_coach_eligibility' ? { data: null, error: { message: 'lock timeout' } } : { data: { applied: true }, error: null }));
    const res = await post(SQUAD_REFUND);
    expect(res.status).toBe(500);
  });

  it('never touches the family when the order is not refunded (e.g. the refund arrived before the payment)', async () => {
    mockRpc.mockResolvedValue({ data: { applied: false, reason: 'not_currently_paid' }, error: null });
    mockOrderStatus.mockResolvedValue({ data: { payment_status: 'pending_payment' }, error: null });
    await post(SQUAD_REFUND);
    expect(participationPatches).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalledWith('reconcile_squad_invite_coach_eligibility', expect.anything());
  });

  it('never touches the family on a partial or failed refund', async () => {
    await post({ ...SQUAD_REFUND, transactions: [tx('5.00')], refund_line_items: [] });
    await post({ ...SQUAD_REFUND, transactions: [tx('18.99', 'error')] });
    expect(participationPatches).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 500 when the family lookup errors, before anything is applied', async () => {
    mockParticipationSelect.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await post(SQUAD_REFUND);
    expect(res.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never runs the family sync for an ordinary builder order', async () => {
    mockOrdersSelect.mockResolvedValue({ data: BUILDER_ORDER, error: null });
    await post(FULL_REFUND);
    expect(participationPatches).toHaveLength(0);
  });
});
