/**
 * Builds the exact URL that will be written to a physical Emblem NFC
 * chip for this card — the same /os?card=<claim_token> route physical
 * taps resolve through server-side (src/app/os/page.tsx -> resolveCardCode).
 * No second NFC URL scheme; this is the one and only place that URL
 * shape is composed for staff-facing display.
 */
export function buildNfcCardUrl(claimToken: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk-lauda-collectives-projects.vercel.app';
  return `${siteUrl}/os?card=${encodeURIComponent(claimToken)}`;
}
