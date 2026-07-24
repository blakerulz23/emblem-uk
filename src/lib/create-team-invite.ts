import type { SupabaseClient } from '@supabase/supabase-js';
import { withUniqueCodeRetry } from '@/lib/claim-code';
import { sendTeamInviteEmail } from '@/lib/send-team-invite-email';

type TeamInviteResult = { ok: true; code: string; reused: boolean } | { ok: false; status: number; error: string };

/**
 * Mirrors create-guardian-invite.ts's shape for a team instead of a
 * player — reuses an existing unused, unexpired invite for this
 * team_id + order_id rather than minting a new one every call (a second
 * Approve click shouldn't mint a second, independently-valid code).
 * Simpler than the guardian version: team_invites only ever serves one
 * origin (order approval), so no origin enum/dedup matrix is needed.
 */
export async function createTeamInvite(
  client: SupabaseClient,
  teamId: string,
  invitedEmail: string,
  orderId: string
): Promise<TeamInviteResult> {
  const { data: existing } = await client
    .from('team_invites')
    .select('id, code')
    .eq('team_id', teamId)
    .eq('order_id', orderId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing?.code) {
    await sendTeamInviteEmail(invitedEmail, existing.code);
    return { ok: true, code: existing.code, reused: true };
  }

  const result = await withUniqueCodeRetry((code) =>
    client
      .from('team_invites')
      .insert({ team_id: teamId, code, invited_email: invitedEmail, order_id: orderId })
      .select()
      .single()
  );

  if (result.error || !result.code) {
    return { ok: false, status: 500, error: result.error?.message ?? 'Could not create team invite' };
  }

  await sendTeamInviteEmail(invitedEmail, result.code);
  return { ok: true, code: result.code, reused: false };
}
