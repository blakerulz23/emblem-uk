import type { SupabaseClient } from '@supabase/supabase-js';
import { withUniqueCodeRetry } from '@/lib/claim-code';
import { sendInviteEmail } from '@/lib/send-invite-email';

type InviteResult = { ok: true; code: string; reused: boolean } | { ok: false; status: number; error: string };

type InviteOrigin = 'order_approval' | 'second_guardian' | 'coach_added_player';

/**
 * The one operation behind generating a guardian invite — used when an
 * existing guardian/coach deliberately invites a second guardian, when a
 * purchaser hands a card off to the real parent, and when staff approves a
 * standalone order. Same underlying mechanism either way, not a second,
 * parallel one.
 *
 * `createdByUserId` is optional: an order-approval invite is
 * system-triggered, not created by a signed-in guardian/coach, so there is
 * no "creator" the way the other two origins have one.
 *
 * Reuses an existing unused, unexpired invite rather than minting a new one
 * every call — without this, a second Approve click or a "Resend" action
 * would mint a second, independently-valid code. The reuse lookup is
 * scoped narrowly, not just by player_id: a player can have more than one
 * invite in flight for different reasons (an order-approval invite to the
 * purchaser and a separate second-guardian invite an existing guardian
 * sent to someone else), and reusing the wrong one would hand one
 * recipient's code to a different recipient. Order-approval invites are
 * scoped to player_id + origin + order_id (+ recipient email, when known);
 * guardian/coach invites are scoped to player_id + origin + invited_email.
 */
export async function createGuardianInvite(
  client: SupabaseClient,
  playerId: string,
  createdByUserId: string | null,
  invitedEmail?: string,
  origin: InviteOrigin = 'second_guardian',
  orderId?: string
): Promise<InviteResult> {
  let existingQuery = client
    .from('player_invites')
    .select('id, code')
    .eq('player_id', playerId)
    .eq('origin', origin)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString());

  if (origin === 'order_approval') {
    existingQuery = existingQuery.eq('order_id', orderId ?? '');
  }
  existingQuery = invitedEmail ? existingQuery.eq('invited_email', invitedEmail) : existingQuery.is('invited_email', null);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing?.code) {
    if (invitedEmail) {
      const emailResult = await sendInviteEmail(invitedEmail, existing.code);
      await client
        .from('player_invites')
        .update({ email_status: emailResult.ok ? 'sent' : 'failed', email_sent_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return { ok: true, code: existing.code, reused: true };
  }

  const result = await withUniqueCodeRetry((code) =>
    client
      .from('player_invites')
      .insert({
        player_id: playerId,
        code,
        created_by: createdByUserId,
        invited_email: invitedEmail ?? null,
        origin,
        order_id: orderId ?? null,
      })
      .select()
      .single()
  );

  if (result.error || !result.code) {
    return { ok: false, status: 500, error: result.error?.message ?? 'Could not create invite' };
  }

  if (invitedEmail) {
    const emailResult = await sendInviteEmail(invitedEmail, result.code);
    await client
      .from('player_invites')
      .update({ email_status: emailResult.ok ? 'sent' : 'failed', email_sent_at: new Date().toISOString() })
      .eq('code', result.code);
  } else {
    await client.from('player_invites').update({ email_status: 'skipped_no_email' }).eq('code', result.code);
  }

  return { ok: true, code: result.code, reused: false };
}
