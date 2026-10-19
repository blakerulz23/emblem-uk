import type { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';

type Service = ReturnType<typeof createServiceRoleClient>;

/**
 * Duplicate-payment reconciliation.
 *
 * A family can pay twice for one Emblem order: two Shopify checkouts opened
 * from the same order (an old Shopify tab plus a new one), both completed.
 * The first payment marks the order paid (apply_gate3_payment_event); the
 * second used to return 'already_paid' and was silently ignored, so the
 * family was charged twice and nobody knew.
 *
 * Now a paid event for an order Emblem already holds as paid under a
 * DIFFERENT Shopify order id:
 *   - is recorded in payment_state_events (append-only; the order itself is
 *     never changed, so the original payment's record stays intact), and
 *   - alerts staff with both Shopify order ids, the duplicate's amount and
 *     which one to refund.
 * A redelivery of the payment Emblem already recorded (same Shopify order
 * id, new or replayed webhook id) is not a second payment and stays silent.
 *
 * When staff refund the duplicate Shopify order, refunds/create can't match
 * it to an Emblem order (orders.shopify_order_id is the original payment),
 * so recordDuplicateRefund recognises it from the audit row here.
 */
export const duplicatePaymentReason = (shopifyOrderId: string) => `duplicate_payment_received:shopify_order_id=${shopifyOrderId}`;
export const duplicateRefundReason = (shopifyOrderId: string) => `duplicate_payment_refunded:shopify_order_id=${shopifyOrderId}`;

type PaidPayload = {
  id?: number | string;
  name?: string;
  total_price_set?: { presentment_money?: { amount?: string; currency_code?: string } };
};

/** Amount the customer paid for the whole Shopify order, as shown to them (e.g. "£27.98"). */
export function presentmentTotalLabel(payload: unknown): string {
  const money = (payload as PaidPayload)?.total_price_set?.presentment_money;
  if (!money?.amount) return 'amount not reported';
  return money.currency_code === 'GBP' ? `£${money.amount}` : `${money.amount} ${money.currency_code ?? ''}`.trim();
}

export function shopifyOrderLabel(payload: unknown): string {
  const p = payload as PaidPayload;
  const id = p?.id === undefined || p?.id === null ? 'unknown' : String(p.id);
  return p?.name ? `${p.name} (id ${id})` : `id ${id}`;
}

async function auditOnce(service: Service, orderId: string, status: string, reason: string, webhookId: string): Promise<boolean> {
  const { data: existing, error: readError } = await service
    .from('payment_state_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('reason', reason)
    .limit(1);
  if (readError) return false;
  if (existing && existing.length > 0) return true;
  const { error } = await service
    .from('payment_state_events')
    .insert({ order_id: orderId, from_status: status, to_status: status, reason, shopify_event_id: webhookId });
  return !error;
}

/** True when the alert is in the outbox — sent now, or already sent by an earlier delivery. */
async function alertOnce(service: Service, eventKey: string, orderRef: string, reason: string): Promise<boolean> {
  const { enqueued } = await enqueueAndDispatchStaffNotification(service, {
    eventType: 'payment_verification_failed',
    eventKey,
    subjectId: null,
    recipientScope: 'all_staff',
    summary: { orderRef, reason },
    linkPath: '/staff/queue',
  });
  if (enqueued) return true;
  // Not enqueued: either an earlier delivery already raised it (unique
  // event_key) or the enqueue genuinely failed. Only the second is a retry.
  const { data } = await service.from('staff_notification_outbox').select('id').eq('event_key', eventKey).limit(1);
  return Boolean(data && data.length > 0);
}

export type SecondPaymentOutcome = 'none' | 'flagged' | 'failed';

export async function flagSecondPaymentIfAny(
  service: Service,
  input: { orderId: string; orderRef: string; payload: unknown; webhookId: string },
): Promise<SecondPaymentOutcome> {
  const incoming = (input.payload as PaidPayload)?.id;
  if (incoming === undefined || incoming === null) return 'none';
  const incomingId = String(incoming);

  const { data: order, error } = await service
    .from('orders')
    .select('payment_status, shopify_order_id')
    .eq('id', input.orderId)
    .maybeSingle();
  if (error) return 'failed';
  const row = order as { payment_status?: string; shopify_order_id?: string | null } | null;
  // Only an order Emblem currently holds as paid. Cancelled/refunded orders
  // already have their own paid-after-close alert.
  if (!row || (row.payment_status !== 'paid' && row.payment_status !== 'fulfilled')) return 'none';
  if (row.shopify_order_id === incomingId) return 'none'; // the payment already recorded, redelivered

  const audited = await auditOnce(service, input.orderId, row.payment_status, duplicatePaymentReason(incomingId), input.webhookId);
  const original = row.shopify_order_id ? `Shopify order id ${row.shopify_order_id}` : 'a Shopify order whose id was not recorded';
  const alerted = await alertOnce(
    service,
    `payment_duplicate_payment:${input.orderRef}:${incomingId}`,
    input.orderRef,
    `DUPLICATE PAYMENT: this Emblem order is already paid (${original}), and Shopify has now reported a second payment for it: ` +
      `Shopify order ${shopifyOrderLabel(input.payload)}, ${presentmentTotalLabel(input.payload)}. Nothing in Emblem was changed. ` +
      `Refund the SECOND Shopify order (${shopifyOrderLabel(input.payload)}) in full in Shopify Admin and cancel it; do not refund the original. ` +
      `Emblem records that refund automatically and leaves the original payment in place.`,
  );
  return audited && alerted ? 'flagged' : 'failed';
}

/**
 * refunds/create for a Shopify order Emblem doesn't hold as any order's
 * payment: if it is a duplicate flagged above, record its refund against
 * the Emblem order (append-only) and tell staff it is reconciled. Returns
 * null when the Shopify order isn't a known duplicate.
 */
export async function recordDuplicateRefund(
  service: Service,
  input: { shopifyOrderId: string; webhookId: string },
): Promise<{ orderId: string } | null | 'failed'> {
  const { data, error } = await service
    .from('payment_state_events')
    .select('order_id, to_status')
    .eq('reason', duplicatePaymentReason(input.shopifyOrderId))
    .limit(1);
  if (error) return 'failed';
  const hit = (data as Array<{ order_id: string | null; to_status: string }> | null)?.[0];
  if (!hit?.order_id) return null;

  const { data: order } = await service.from('orders').select('order_ref, payment_status').eq('id', hit.order_id).maybeSingle();
  const ref = (order as { order_ref?: string } | null)?.order_ref ?? hit.order_id;
  const status = (order as { payment_status?: string } | null)?.payment_status ?? hit.to_status;

  const audited = await auditOnce(service, hit.order_id, status, duplicateRefundReason(input.shopifyOrderId), input.webhookId);
  const alerted = await alertOnce(
    service,
    `payment_duplicate_refunded:${ref}:${input.shopifyOrderId}`,
    ref,
    `Duplicate payment refunded: Shopify order id ${input.shopifyOrderId} (the second payment for this order) was refunded in Shopify. ` +
      `The original payment is unchanged and the Emblem order is still ${status}. Check the full amount was returned; no further action in Emblem.`,
  );
  return audited && alerted ? { orderId: hit.order_id } : 'failed';
}
