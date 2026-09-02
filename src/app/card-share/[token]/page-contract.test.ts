import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/app/card-share/[token]/page.tsx', 'utf8');

describe('CardSharePublicPage (migration 0085) — noindex, safe degraded state, no new data reads', () => {
  it('is marked noindex/nofollow — technically public, never search-indexed, same convention as the public player profile', () => {
    expect(page).toContain('export const metadata = {');
    expect(page).toContain('robots: { index: false, follow: false }');
  });

  it('rate-limits (IP-only, anonymous) before ever resolving the token', () => {
    const fnIdx = page.indexOf('export default async function CardSharePublicPage');
    const limitIdx = page.indexOf('consumeAnonymousRequestRateLimit', fnIdx);
    const resolveIdx = page.indexOf('resolveCardSharePublicPage', fnIdx);
    expect(limitIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeGreaterThan(limitIdx);
    expect(page).toContain("'card-share-public-page-view'");
  });

  it('unavailable (expired, revoked, or unknown token) renders the same generic degraded state — never distinguishing which case applies', () => {
    expect(page).toContain('result.available ?');
    expect(page).toContain('This shared card is no longer available');
    // No branching on WHY it's unavailable anywhere in the render.
    expect(page).not.toMatch(/expired\?|revoked\?|reason ===/i);
  });

  it('always offers the Make your own card CTA into the generic /builder route — never a card-specific or per-order URL', () => {
    expect(page).toContain('href="/builder"');
    expect(page).toContain('Make your own card');
  });

  it('reads only what resolveCardSharePublicPage already returns (available, imageUrl) — no direct database/order/card field access of its own', () => {
    expect(page).not.toMatch(/createServiceRoleClient|\.from\(['"]orders['"]\)|\.from\(['"]cards['"]\)|\.from\(['"]card_definitions['"]\)/);
  });

  it('never reads or renders a child\'s full name, email, or any field beyond the already-rendered card image', () => {
    expect(page).not.toMatch(/guardianEmail|childName|fullName|display_first_name|display_surname_initial/);
  });
});
