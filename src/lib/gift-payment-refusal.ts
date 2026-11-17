import type { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';

type Service = ReturnType<typeof createServiceRoleClient>;

/**
 * R5 (migration 0101): a Shopify payment for a gift order with no genuine
 * parent or guardian approval is never marked paid. apply_gate3_payment_event
 * records it append-only in payment_state_events (reason
 * 'paid_refused_gift_approval_invalid[:shopify_order_id=<id>]', with the
 * webhook delivery id) and reports gift_approval_invalid.
 *
 * Money may have been taken, so staff must hear about every such payment:
 *   - one alert per Shopify payment (the key carries the Shopify order id),
 *     so two payments for the same blocked order are two alerts;
 *   - the alert is confirmed in the outbox, and the route answers 500 if it
 *     isn't, so Shopify retries. The retry arrives as duplicate_event (the
 *     webhook dedup row was committed with the refusal), and
 *     wasRefusedGiftPayment lets the route raise the alert again from the
 *     recorded refusal. The outbox's unique event key makes that idempotent.
 */
export const GIFT_PAYMENT_REFUSED_REASON_PREFIX = 'paid_refused_gift_approval_invalid';

export async function wasRefusedGiftPayment(service: Service, orderId: string, webhookId: string): Promise<boolean | 'failed'> {
  const { data, error } = await service
    .from('payment_state_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('shopify_event_id', webhookId)
    .like('reason', `${GIFT_PAYMENT_REFUSED_REASON_PREFIX}%`)
    .limit(1);
  if (error) return 'failed';
  return Boolean(data && data.length > 0);
}

/** True when the alert is in the outbox: sent now, or by an earlier delivery. */
export async function alertRefusedGiftPayment(
  service: Service,
  input: { orderRef: string; shopifyOrderId: string | null },
): Promise<boolean> {
  const payment = input.shopifyOrderId ? `Shopify order id ${input.shopifyOrderId}` : 'a Shopify order whose id was not reported';
  const eventKey = `payment_paid_without_guardian_approval:${input.orderRef}:${input.shopifyOrderId ?? 'unknown'}`;
  const { enqueued } = await enqueueAndDispatchStaffNotification(service, {
    eventType: 'payment_verification_failed',
    eventKey,
    subjectId: null,
    recipientScope: 'all_staff',
    summary: {
      orderRef: input.orderRef,
      reason:
        `Shopify reports a payment (${payment}) for this gift order, but the order has no valid parent or guardian approval ` +
        '(not approved, declined, missing, or approved from the buyer\'s own email address), so Emblem did not mark it paid. ' +
        'Hold the order: do not produce it, override the refusal or change the approval. Escalate to Blake today to decide the refund in Shopify.',
    },
    linkPath: '/staff/queue',
  });
  if (enqueued) return true;
  const { data } = await service.from('staff_notification_outbox').select('id').eq('event_key', eventKey).limit(1);
  return Boolean(data && data.length > 0);
}
