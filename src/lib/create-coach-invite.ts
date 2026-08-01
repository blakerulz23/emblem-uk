import type { SupabaseClient } from '@supabase/supabase-js';
import { withUniqueCodeRetry } from '@/lib/claim-code';
import { sendCoachInviteEmail } from '@/lib/send-coach-invite-email';

/**
 * Distinguishes all four outcomes the guardian-facing UI must report,
 * per the milestone spec — never collapsed into a single "sent"/"not
 * sent" boolean: 'sent' (dispatched successfully), 'failed' (Resend
 * call failed or errored — the code/link are still fully valid),
 * 'skipped_no_email' (copy-link-only invite, no address was ever
 * supplied, so there was nothing to send). Never persisted to
 * coach_invites — this table deliberately doesn't carry the
 * email_status/email_sent_at columns player_invites has, since nothing
 * here needs to re-derive delivery history after the fact; the
 * immediate API response is the only place this is ever surfaced.
 */
type EmailStatus = 'sent' | 'failed' | 'skipped_no_email';

type CreateCoachInviteResult =
  | { ok: true; code: string; reused: boolean; emailStatus: EmailStatus }
  | { ok: false; status: number; error: string };

/**
 * Guardian-initiated only, first release (see architecture milestone plan)
 * — there is no second creator of a coach_invites row yet, so unlike
 * create-guardian-invite.ts there is no `origin` to branch on. `client`
 * must be the session-scoped Supabase client (never service-role): the
 * insert relies on "coach_invites: guardians can create for their player"
 * RLS to reject anyone who isn't a guardian of playerId, exactly the same
 * shape /api/os/invites/route.ts already uses for createGuardianInvite.
 *
 * Reuses an existing unused, unexpired invite for the same player + email
 * rather than minting a new one every call — same reasoning as
 * create-guardian-invite.ts (a second "Add Coach" submission for the same
 * address shouldn't invalidate/duplicate the first code). Scoped by
 * player_id + invited_email (or player_id + no email, for the copy-link-
 * only case), since a player can have more than one coach invite in
 * flight for different recipients.
 */
export async function createCoachInvite(
  client: SupabaseClient,
  playerId: string,
  createdByUserId: string,
  invitedEmail?: string
): Promise<CreateCoachInviteResult> {
  const normalizedEmail = invitedEmail?.trim().toLowerCase() || undefined;

  let existingQuery = client
    .from('coach_invites')
    .select('id, code')
    .eq('player_id', playerId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString());
  existingQuery = normalizedEmail ? existingQuery.eq('invited_email', normalizedEmail) : existingQuery.is('invited_email', null);

  const { data: existing } = await existingQuery.maybeSingle();
  if (existing?.code) {
    const emailStatus = await dispatchEmail(client, playerId, createdByUserId, normalizedEmail, existing.code);
    return { ok: true, code: existing.code, reused: true, emailStatus };
  }

  const result = await withUniqueCodeRetry((code) =>
    client
      .from('coach_invites')
      .insert({
        player_id: playerId,
        code,
        created_by: createdByUserId,
        invited_email: normalizedEmail ?? null,
      })
      .select()
      .single()
  );

  if (result.error || !result.code) {
    const status = result.error?.message?.includes('row-level security') ? 403 : 500;
    return { ok: false, status, error: result.error?.message ?? 'Could not create invite' };
  }

  const emailStatus = await dispatchEmail(client, playerId, createdByUserId, normalizedEmail, result.code);
  return { ok: true, code: result.code, reused: false, emailStatus };
}

/**
 * Always attempted when an email address was supplied — whether the
 * code is brand new or reused (a second "Add Coach" submission for the
 * same address is a legitimate resend, same reasoning
 * create-guardian-invite.ts already uses for its own reuse branch).
 * Fetches the player's safe-to-disclose name and the guardian's own
 * name fresh each call rather than threading them through every caller
 * — this function is the one place that needs them, so it's also the
 * one place that reads them.
 */
async function dispatchEmail(
  client: SupabaseClient,
  playerId: string,
  createdByUserId: string,
  normalizedEmail: string | undefined,
  code: string
): Promise<EmailStatus> {
  if (!normalizedEmail) return 'skipped_no_email';

  const [{ data: player }, { data: guardian }] = await Promise.all([
    client.from('players').select('name').eq('id', playerId).maybeSingle(),
    client.from('profiles').select('display_name').eq('id', createdByUserId).maybeSingle(),
  ]);
  const [firstName, ...rest] = (player?.name ?? '').trim().split(/\s+/);
  const lastInitial = rest.length ? rest[rest.length - 1][0] : '';

  const result = await sendCoachInviteEmail(normalizedEmail, code, { firstName, lastInitial }, guardian?.display_name ?? null);
  return result.ok ? 'sent' : 'failed';
}
