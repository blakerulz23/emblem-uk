/**
 * Removes anything that looks like an email address from free text before it
 * is stored or logged (migration 0097: an erased account's plaintext email
 * must not come back through a retry record, a log or an alert). Used on
 * error text from the Supabase Auth admin API, which is stored as
 * pending_auth_deletions.last_error for staff.
 */
const EMAIL_PATTERN = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

export const EMAIL_REDACTED = '[email removed]';

export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, EMAIL_REDACTED);
}
