import type { SupabaseClient } from '@supabase/supabase-js';
import { withUniqueCodeRetry } from '@/lib/claim-code';
import { sendInviteEmail } from '@/lib/send-invite-email';

type InviteResult = { ok: true; code: string } | { ok: false; status: number; error: string };

/**
 * The one operation behind generating a guardian invite — used both when
 * an existing guardian/coach deliberately invites a second guardian from
 * inside the app, and when a purchaser (identified via the no-card
 * verified-email fallback) chooses to hand a card off to the real parent
 * instead of claiming it themselves. Same underlying mechanism either way,
 * not a second, parallel one.
 */
export async function createGuardianInvite(
  client: SupabaseClient,
  playerId: string,
  createdByUserId: string,
  invitedEmail?: string
): Promise<InviteResult> {
  const result = await withUniqueCodeRetry((code) =>
    client
      .from('player_invites')
      .insert({ player_id: playerId, code, created_by: createdByUserId, invited_email: invitedEmail ?? null })
      .select()
      .single()
  );

  if (result.error || !result.code) {
    return { ok: false, status: 500, error: result.error?.message ?? 'Could not create invite' };
  }

  if (invitedEmail) {
    await sendInviteEmail(invitedEmail, result.code);
  }

  return { ok: true, code: result.code };
}
