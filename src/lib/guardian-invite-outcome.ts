/**
 * What happened to a guardian invite's email, as createGuardianInvite
 * reports it and player_invites.email_status records it:
 * 'sent' (the email provider accepted it), 'failed' (not configured,
 * rejected or unreachable), 'skipped_no_email' (a link-only invite).
 */
export type GuardianInviteEmailStatus = 'sent' | 'failed' | 'skipped_no_email';

export const INVITE_SENT_COPY = 'Invitation sent.';
export const INVITE_NOT_EMAILED_SHARE_COPY = 'Invitation created, but the email could not be sent. You can share the invitation link directly.';
export const INVITE_NOT_EMAILED_RETRY_COPY = 'Invitation created, but the email could not be sent. Please try again in a moment.';

/**
 * The message shown after a guardian invite is created. Says "sent" only
 * when the email was actually accepted. `canShareLink` is whether this
 * screen can offer the invitation link itself (a coach or guardian can; a
 * purchaser handing a card to another parent can't, so they retry).
 */
export function guardianInviteOutcome(
  emailStatus: GuardianInviteEmailStatus | undefined,
  { canShareLink }: { canShareLink: boolean }
): { emailed: boolean; message: string } {
  if (emailStatus === 'sent') return { emailed: true, message: INVITE_SENT_COPY };
  return { emailed: false, message: canShareLink ? INVITE_NOT_EMAILED_SHARE_COPY : INVITE_NOT_EMAILED_RETRY_COPY };
}
