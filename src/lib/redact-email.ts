/**
 * Removes anything that looks like an email address from free text before it
 * is stored or logged (migration 0097: an erased account's plaintext email
 * must not come back through a retry record, a log or an alert). Used on
 * error text from the Supabase Auth admin API, which is stored as
 * pending_auth_deletions.last_error for staff.
 *
 * Deliberately broad (a false positive only hides a little error text): any
 * run of non-separator characters, non-ASCII included, around "@" or its
 * encodings (%40, or the escape text backslash-u0040), with a dotted domain whose
 * labels may be IDN or punycode.
 */
const EMAIL_PATTERN = /[^\s@<>()[\]",;:]+(?:@|%40|\\u0040)[^\s@<>()[\]"',;:.]+(?:\.[^\s@<>()[\]"',;:.]+)+/gi;

export const EMAIL_REDACTED = '[email removed]';

export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, EMAIL_REDACTED);
}
