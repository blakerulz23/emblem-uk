import { describe, expect, it, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const db = { orders: [] as Row[], payment_state_events: [] as Row[], outbox: [] as Row[] };
const sent: Array<{ eventKey: string; summary: { orderRef: string; reason: string } }> = [];
let enqueueFails = false;
let insertFails = false;

vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: async (_s: unknown, p: { eventKey: string; summary: { orderRef: string; reason: string } }) => {
    if (enqueueFails) return { enqueued: false, sent: false };
    if (db.outbox.some((o) => o.event_key === p.eventKey)) return { enqueued: false, sent: false }; // unique event_key
    db.outbox.push({ id: `ob-${db.outbox.length}`, event_key: p.eventKey });
    sent.push(p);
    return { enqueued: true, sent: true };
  },
}));

import { flagSecondPaymentIfAny, recordDuplicateRefund, duplicatePaymentReason } from './duplicate-payment';

// Minimal in-memory stand-in for the service-role client.
function table(name: 'orders' | 'payment_state_events' | 'staff_notification_outbox') {
  const rows = () => (name === 'staff_notification_outbox' ? db.outbox : db[name]);
  const filters: Array<[string, unknown]> = [];
  const match = () => rows().filter((r) => filters.every(([c, v]) => r[c] === v));
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
    limit: async () => ({ data: match(), error: null }),
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    insert: async (row: Row) => {
      if (insertFails) return { error: { message: 'insert failed' } };
      rows().push({ ...row });
      return { error: null };
    },
  };
  return q;
}
const service = { from: table } as never;
const paid = (id: number | string, name = '#1042') => ({ id, name, total_price_set: { presentment_money: { amount: '27.98', currency_code: 'GBP' } } });
const flag = (payload: unknown, webhookId = 'wh') => flagSecondPaymentIfAny(service, { orderId: 'o1', orderRef: 'EMB-1', payload, webhookId });

beforeEach(() => {
  db.orders = [{ id: 'o1', order_ref: 'EMB-1', payment_status: 'paid', shopify_order_id: '111' }];
  db.payment_state_events = [];
  db.outbox = [];
  sent.length = 0;
  enqueueFails = false;
  insertFails = false;
});

describe('flagSecondPaymentIfAny', () => {
  it('a second Shopify payment for a paid order is recorded append-only and staff are told exactly what to refund', async () => {
    expect(await flag(paid(222), 'wh-2')).toBe('flagged');
    expect(db.payment_state_events).toEqual([expect.objectContaining({ order_id: 'o1', from_status: 'paid', to_status: 'paid', reason: duplicatePaymentReason('222'), shopify_event_id: 'wh-2' })]);
    expect(db.orders[0]).toMatchObject({ payment_status: 'paid', shopify_order_id: '111' });
    expect(sent).toHaveLength(1);
    expect(sent[0].summary.orderRef).toBe('EMB-1');
    expect(sent[0].summary.reason).toMatch(/DUPLICATE PAYMENT/);
    expect(sent[0].summary.reason).toMatch(/Shopify order id 111/);
    expect(sent[0].summary.reason).toMatch(/#1042 \(id 222\), £27\.98/);
    expect(sent[0].summary.reason).toMatch(/Refund the SECOND Shopify order/);
  });

  it('the payment already recorded, redelivered under a new webhook id, is not a duplicate', async () => {
    expect(await flag(paid(111), 'wh-9')).toBe('none');
    expect(db.payment_state_events).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('repeated webhooks for the same second payment record and alert once', async () => {
    for (const wh of ['wh-2', 'wh-2', 'wh-3']) expect(await flag(paid(222), wh)).toBe('flagged');
    expect(db.payment_state_events).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('a third payment is flagged separately', async () => {
    await flag(paid(222), 'a');
    await flag(paid(333, '#1043'), 'b');
    expect(sent).toHaveLength(2);
    expect(db.payment_state_events).toHaveLength(2);
  });

  it('a paid order whose Shopify id was never recorded still flags the payment (never assumed to be the same one)', async () => {
    db.orders[0].shopify_order_id = null;
    expect(await flag(paid(222))).toBe('flagged');
    expect(sent[0].summary.reason).toMatch(/whose id was not recorded/);
  });

  it('orders not currently paid are left to their own handling', async () => {
    for (const status of ['pending_payment', 'refunded', 'cancelled']) {
      db.orders[0].payment_status = status;
      expect(await flag(paid(222))).toBe('none');
    }
    expect(sent).toHaveLength(0);
  });

  it('a failed alert enqueue or audit insert reports failed, so the webhook answers 500 and Shopify retries', async () => {
    enqueueFails = true;
    expect(await flag(paid(222))).toBe('failed');
    enqueueFails = false;
    expect(await flag(paid(222))).toBe('flagged'); // the retry completes it
    insertFails = true;
    expect(await flag(paid(444), 'x')).toBe('failed');
  });
});

describe('recordDuplicateRefund', () => {
  it('records the refund of a flagged duplicate and leaves the original paid order alone', async () => {
    await flag(paid(222));
    expect(await recordDuplicateRefund(service, { shopifyOrderId: '222', webhookId: 'r1' })).toEqual({ orderId: 'o1' });
    expect(db.orders[0]).toMatchObject({ payment_status: 'paid', shopify_order_id: '111' });
    expect(db.payment_state_events.map((e) => e.reason)).toEqual([duplicatePaymentReason('222'), 'duplicate_payment_refunded:shopify_order_id=222']);
    expect(sent[1].summary.reason).toMatch(/Duplicate payment refunded[\s\S]*still paid/);
  });

  it('is idempotent across repeated refund webhooks', async () => {
    await flag(paid(222));
    await recordDuplicateRefund(service, { shopifyOrderId: '222', webhookId: 'r1' });
    await recordDuplicateRefund(service, { shopifyOrderId: '222', webhookId: 'r2' });
    expect(db.payment_state_events).toHaveLength(2);
    expect(sent).toHaveLength(2);
  });

  it('an unknown Shopify order is not a duplicate (the existing unmatched-refund alert handles it)', async () => {
    expect(await recordDuplicateRefund(service, { shopifyOrderId: '999', webhookId: 'r' })).toBeNull();
  });
});
