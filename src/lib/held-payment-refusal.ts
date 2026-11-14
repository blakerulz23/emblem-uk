import type { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';

type Service = ReturnType<typeof createServiceRoleClient>;

/**
 * Migration 0102: a Shopify payment for an order that is held (the guardian
 * it depends on had their account erased, migration 0097) is never marked
 * paid. apply_gate3_payment_event records it append-only in
 * payment_state_events (reason 'paid_refused_order_held[:shopify_order_id=<id>]',
 * with the webhook delivery id) and reports order_held.
 *
 * Same delivery guarantees as gift-payment-refusal.ts: one alert per Shopify
 * payment, confirmed in the outbox, 500 (Shopify retries) when it isn't, and
 * a retried delivery (duplicate_event) raises the alert again from the
 * recorded refusal, idempotently.
 */
export const HELD_PAYMENT_REFUSED_REASON_PREFIX = 'paid_refused_order_held';

export async function wasRefusedHeldPayment(service: Service, orderId: string, webhookId: string): Promise<boolean | 'failed'> {
  const { data, error } = await service
    .from('payment_state_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('shopify_event_id', webhookId)
    .like('reason', `${HELD_PAYMENT_REFUSED_REASON_PREFIX}%`)
    .limit(1);
  if (error) return 'failed';
  return Boolean(data && data.length > 0);
}

/** True when the alert is in the outbox: sent now, or by an earlier delivery. */
export async function alertRefusedHeldPayment(
  service: Service,
  input: { orderRef: string; shopifyOrderId: string | null },
): Promise<boolean> {
  const payment = input.shopifyOrderId ? `Shopify order id ${input.shopifyOrderId}` : 'a Shopify order whose id was not reported';
  const eventKey = `payment_paid_for_held_order:${input.orderRef}:${input.shopifyOrderId ?? 'unknown'}`;
  const { enqueued } = await enqueueAndDispatchStaffNotification(service, {
    eventType: 'payment_verification_failed',
    eventKey,
    subjectId: null,
    recipientScope: 'all_staff',
    summary: {
      orderRef: input.orderRef,
      reason:
        `Shopify reports a payment (${payment}) for an order that is on hold because the parent or guardian it depends on deleted their Emblem account, ` +
        'so Emblem did not mark it paid. Refund it in Shopify. Do not produce the order or change its approval: it can only restart after a refund ' +
        'or cancellation, with a fresh approval from the child\'s parent or guardian.',
    },
    linkPath: '/staff/queue',
  });
  if (enqueued) return true;
  const { data } = await service.from('staff_notification_outbox').select('id').eq('event_key', eventKey).limit(1);
  return Boolean(data && data.length > 0);
}
