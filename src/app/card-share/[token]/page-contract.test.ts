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

  it('always offers a Build Your Card CTA into the generic /builder route — never a card-specific or per-order URL', () => {
    expect(page).toContain('href="/builder"');
    expect(page).toContain('Build Your Card');
  });

  it('the CTA reuses the site\'s real primary-button styling (emh-btn emh-btn-primary), not a hand-rolled one-off style', () => {
    expect(page).toContain('className="emh-btn emh-btn-primary"');
  });

  it('reads only what resolveCardSharePublicPage already returns (available, imageUrl) — no direct database/order/card field access of its own', () => {
    expect(page).not.toMatch(/createServiceRoleClient|\.from\(['"]orders['"]\)|\.from\(['"]cards['"]\)|\.from\(['"]card_definitions['"]\)/);
  });

  it('never reads or renders a child\'s full name, email, or any field beyond the already-rendered card image', () => {
    expect(page).not.toMatch(/guardianEmail|childName|fullName|display_first_name|display_surname_initial/);
  });
});

/**
 * Visual redesign (live-reported): the real site header (via
 * ConditionalChrome's ordinary Navbar+Footer branch, which already
 * rendered around this page) made this page's own small wordmark and
 * footer-slogan duplicates, and its hand-rolled 'Roboto'/'Barlow Condensed'
 * font-family declarations were never actually loaded anywhere in this
 * codebase, silently falling back to the browser's default serif font.
 */
describe('CardSharePublicPage — presentation, made consistent with the rest of the site (no behaviour change)', () => {
  it('no longer renders its own duplicate wordmark — the real site header already provides one', () => {
    expect(page).not.toContain('emblem-wordmark.png');
  });

  it('no longer renders a redundant footer slogan — the real Footer already has its own tagline', () => {
    expect(page).not.toContain('football cards, made by you');
  });

  it('the shared card image is centred with a proportional auto margin, never a fixed pixel offset that only holds at one viewport', () => {
    const idx = page.indexOf('alt="A football card made with Emblem"');
    const styleSection = page.slice(idx, page.indexOf('/>', idx));
    expect(styleSection).toContain("margin: '0 auto'");
  });

  it('the shared card image is never cropped, stretched, or re-derived — same imageUrl straight from resolveCardSharePublicPage, only the surrounding CSS box changed', () => {
    expect(page).toContain('src={result.imageUrl}');
    expect(page).not.toMatch(/objectFit|object-fit/);
  });

  it('no unloaded font-family is referenced anywhere on this page (the live-reported cause of the serif fallback)', () => {
    expect(page).not.toContain("fontFamily: 'Roboto'");
    expect(page).not.toContain("fontFamily: 'Barlow Condensed'");
  });

  it('the "Shared with Emblem" label reuses the site\'s real eyebrow-label style', () => {
    expect(page).toContain('className="emh-eyebrow"');
  });
});
