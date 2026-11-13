import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnqueue = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockEnqueue(...args),
}));

import { alertRefusedGiftPayment, wasRefusedGiftPayment } from './gift-payment-refusal';

type Call = { table: string; filters: Array<[string, unknown, unknown?]> };
function client(results: Record<string, { data: unknown; error: unknown }>) {
  const calls: Call[] = [];
  const service = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), b),
        like: (c: string, v: unknown) => (call.filters.push(['like', c, v]), b),
        limit: () => Promise.resolve(results[table] ?? { data: [], error: null }),
      };
      return b;
    },
  };
  return { service: service as never, calls };
}

beforeEach(() => mockEnqueue.mockReset());

describe('wasRefusedGiftPayment', () => {
  it('looks for a refusal row for this order AND this webhook delivery', async () => {
    const { service, calls } = client({ payment_state_events: { data: [{ id: 'e1' }], error: null } });
    expect(await wasRefusedGiftPayment(service, 'order-1', 'wh-1')).toBe(true);
    expect(calls[0].filters).toEqual([
      ['eq', 'order_id', 'order-1'],
      ['eq', 'shopify_event_id', 'wh-1'],
      ['like', 'reason', 'paid_refused_gift_approval_invalid%'],
    ]);
  });
  it('false when there is none, failed on a read error', async () => {
    expect(await wasRefusedGiftPayment(client({ payment_state_events: { data: [], error: null } }).service, 'o', 'w')).toBe(false);
    expect(await wasRefusedGiftPayment(client({ payment_state_events: { data: null, error: { message: 'x' } } }).service, 'o', 'w')).toBe('failed');
  });
});

describe('alertRefusedGiftPayment', () => {
  it('one alert per Shopify payment: the key carries the Shopify order id', async () => {
    mockEnqueue.mockResolvedValue({ enqueued: true });
    const { service } = client({});
    expect(await alertRefusedGiftPayment(service, { orderRef: 'EMB-1', shopifyOrderId: '555' })).toBe(true);
    const arg = mockEnqueue.mock.calls[0][1];
    expect(arg.eventKey).toBe('payment_paid_without_guardian_approval:EMB-1:555');
    expect(arg.eventType).toBe('payment_verification_failed');
    expect(arg.summary.orderRef).toBe('EMB-1');
    expect(arg.summary.reason).toMatch(/Shopify order id 555/);
    expect(arg.summary.reason).toMatch(/did not mark it paid/);
    expect(arg.summary.reason).toMatch(/Hold the order/);
    await alertRefusedGiftPayment(service, { orderRef: 'EMB-1', shopifyOrderId: '556' });
    expect(mockEnqueue.mock.calls[1][1].eventKey).not.toBe(arg.eventKey);
  });
  it('not enqueued but already in the outbox (earlier delivery) counts as alerted', async () => {
    mockEnqueue.mockResolvedValue({ enqueued: false });
    const { service, calls } = client({ staff_notification_outbox: { data: [{ id: 'n1' }], error: null } });
    expect(await alertRefusedGiftPayment(service, { orderRef: 'EMB-1', shopifyOrderId: '555' })).toBe(true);
    expect(calls[0].filters).toEqual([['eq', 'event_key', 'payment_paid_without_guardian_approval:EMB-1:555']]);
  });
  it('not enqueued and not in the outbox: not alerted (the route then asks Shopify to retry)', async () => {
    mockEnqueue.mockResolvedValue({ enqueued: false });
    expect(await alertRefusedGiftPayment(client({ staff_notification_outbox: { data: [], error: null } }).service, { orderRef: 'EMB-1', shopifyOrderId: null })).toBe(false);
  });
});
