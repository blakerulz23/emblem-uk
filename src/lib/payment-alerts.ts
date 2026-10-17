import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';
import type { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Staff alert for a payment state that needs a person: a partial or failed
 * refund, a refund after production approval, a cancellation of a paid
 * order, or a refund for an order Emblem never marked paid.
 *
 * Reuses the existing `payment_verification_failed` event type (the only
 * payment reconciliation type staff_notification_outbox accepts) with the
 * situation in the summary reason. `kind` keeps each situation's
 * idempotency key separate, and the key is date-scoped like the orders/paid
 * alert, so Shopify's retries of the same delivery notify at most once a day.
 */
export async function notifyStaffOfPaymentIssue(
  service: ReturnType<typeof createServiceRoleClient>,
  input: { kind: string; reference: string; reason: string },
): Promise<void> {
  await enqueueAndDispatchStaffNotification(service, {
    eventType: 'payment_verification_failed',
    eventKey: `payment_${input.kind}:${input.reference}:${new Date().toISOString().slice(0, 10)}`,
    subjectId: null,
    recipientScope: 'all_staff',
    summary: { orderRef: input.reference, reason: input.reason },
    linkPath: '/staff/queue',
  });
}
