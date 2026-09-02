import type { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveStaffNotificationRecipients, type StaffNotificationRecipientScope } from '@/lib/staff-notification-recipients';
import { sendStaffNotificationEmail } from '@/lib/send-staff-notification-email';

/**
 * The one function every trigger point (12 of them, see migration 0082's
 * own header comment) calls — wraps "enqueue via the RPC, then immediately
 * dispatch" into a single call, matching the existing organiser-outbox
 * split (submit_squad_invite_request writes the outbox row atomically;
 * the calling route dispatches right after) except here the enqueue RPC
 * itself does the insert, since these events don't already have a SQL
 * state-change function of their own to piggyback the insert onto — most
 * of these routes have no RPC at all, or call an existing one this
 * migration must not modify.
 *
 * Never throws — a failed enqueue or a failed send must never fail the
 * caller's own request; the underlying action (a filed deletion request,
 * a flagged concern, an approved order) is already committed regardless
 * of whether staff get emailed about it. Callers fire-and-forget this;
 * none of them branch on the return value today, but it's returned for
 * tests and any future caller that wants to know.
 */
export async function enqueueAndDispatchStaffNotification(
  service: ReturnType<typeof createServiceRoleClient>,
  params: {
    eventType: string;
    eventKey: string;
    subjectId?: string | null;
    recipientScope: StaffNotificationRecipientScope;
    summary: Record<string, unknown>;
    linkPath: string;
  },
): Promise<{ enqueued: boolean; sent: boolean }> {
  try {
    const { data: outboxId, error: enqueueError } = await service.rpc('enqueue_staff_notification', {
      p_event_type: params.eventType,
      p_event_key: params.eventKey,
      p_subject_id: params.subjectId ?? null,
      p_recipient_scope: params.recipientScope,
      p_summary: params.summary,
      p_link_path: params.linkPath,
    });

    if (enqueueError) {
      console.warn('enqueueAndDispatchStaffNotification: enqueue failed', params.eventType, enqueueError.message);
      return { enqueued: false, sent: false };
    }
    if (!outboxId) {
      // Idempotent conflict — this exact event was already enqueued (and
      // therefore already dispatched, or is being dispatched by whichever
      // call won the race). Never a second send for the same event_key.
      return { enqueued: false, sent: false };
    }

    const recipients = await resolveStaffNotificationRecipients(service, params.recipientScope);
    const { ok } = await sendStaffNotificationEmail({
      toEmails: recipients,
      eventType: params.eventType,
      summary: params.summary,
      linkPath: params.linkPath,
    });

    await service
      .from('staff_notification_outbox')
      .update(
        ok
          ? { status: 'sent', sent_at: new Date().toISOString(), attempt_count: 1 }
          : { status: 'failed', attempt_count: 1, last_error: 'send_failed' },
      )
      .eq('id', outboxId);

    return { enqueued: true, sent: ok };
  } catch (err) {
    console.warn('enqueueAndDispatchStaffNotification threw', params.eventType, err);
    return { enqueued: false, sent: false };
  }
}
