import type { createServiceRoleClient } from '@/lib/supabase/server';
import { sendSquadInviteNotificationEmail, type SquadInviteEmailTemplate } from '@/lib/send-squad-invite-notification-email';

/**
 * Sends the real email for a Squad Invite lifecycle event and records the
 * outcome on its squad_invite_notification_outbox row — the row itself is
 * always inserted atomically with the state change inside the RPC (submit/
 * review/approve), since SQL can't make an HTTP call; this is the
 * follow-up step the calling route runs afterward.
 *
 * Only ever sends for a row still in 'disabled_test' — the outbox table's
 * unique(request_id, event_key) constraint means a repeat of the same
 * lifecycle event on one request (e.g. a second "request changes" cycle)
 * silently reuses the first row via ON CONFLICT DO NOTHING rather than
 * inserting a new one, so a lookup that finds an already-'sent'/'failed'
 * row here means this exact event already had its one dispatch attempt —
 * skip rather than resend. A resend goes through the dedicated resend
 * route, which explicitly resets the row to 'disabled_test' first.
 */
export async function dispatchSquadInviteNotification(
  service: ReturnType<typeof createServiceRoleClient>,
  params: {
    requestId: string;
    eventKey: string;
    template: SquadInviteEmailTemplate;
    teamName: string;
    publicReference: string;
    toEmail: string;
    reason?: string;
  },
): Promise<void> {
  const { data: outbox } = await service
    .from('squad_invite_notification_outbox')
    .select('id,status,attempt_count')
    .eq('request_id', params.requestId)
    .eq('event_key', params.eventKey)
    .maybeSingle();
  if (!outbox || outbox.status !== 'disabled_test') return;

  const { ok } = await sendSquadInviteNotificationEmail({
    toEmail: params.toEmail,
    template: params.template,
    teamName: params.teamName,
    publicReference: params.publicReference,
    reason: params.reason,
  });

  await service
    .from('squad_invite_notification_outbox')
    .update(
      ok
        ? { status: 'sent', sent_at: new Date().toISOString(), attempt_count: outbox.attempt_count + 1 }
        : { status: 'failed', failed_at: new Date().toISOString(), attempt_count: outbox.attempt_count + 1, last_error_code: 'send_failed' },
    )
    .eq('id', outbox.id);
}
