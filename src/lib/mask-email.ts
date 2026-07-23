/**
 * Masks an email for display before the recipient has authenticated —
 * reveals one leading character of the local part and the full domain
 * (e.g. "blake@hotmail.com" -> "b••••@hotmail.com"), never "most of the
 * local part." Returns null for anything that doesn't look like a real
 * address rather than guessing or throwing — callers should treat null
 * the same as "no email on file."
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@') || at === email.length - 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}••••@${domain}`;
}
