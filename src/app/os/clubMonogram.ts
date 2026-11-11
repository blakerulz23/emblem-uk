/**
 * Initials for a club that has no badge of its own (every real club today:
 * nothing in the app writes clubs.badge_url). Never fall back to another
 * club's crest: a coach must only ever see their own club's identity.
 *
 * Takes the first letter or digit of the first two words, ignoring
 * punctuation, e.g. "Ashton United FC" -> "AU", "1st Denton" -> "1D".
 * A name with no letters or digits gives "?".
 */
export function clubMonogram(name: string | null | undefined): string {
  // A letter is any character with distinct upper and lower case (covers
  // accented letters without needing the regex Unicode flag).
  const isLetterOrDigit = (c: string) => /[0-9]/.test(c) || c.toLowerCase() !== c.toUpperCase();
  const words = (name ?? '')
    .split(/\s+/)
    .map((w) => Array.from(w).filter(isLetterOrDigit).join(''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0].toLocaleUpperCase('en-GB'))
    .join('');
}
