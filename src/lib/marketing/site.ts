import { MULTI_UNIT_PRICE_PENCE, SINGLE_UNIT_PRICE_PENCE, SQUAD_UNIT_PRICE_PENCE } from '@/lib/pricing-engine';

/**
 * Marketing-site constants shared by metadata, structured data, the sitemap,
 * the Merchant Center feed and page copy. Prices come from the pricing engine
 * so a price change can never leave the homepage, schema and feed disagreeing.
 */

/** Canonical origin for the UK site. Never derived from the request host, so preview URLs never become canonical. */
export const SITE_URL = 'https://emblem.cards';

/**
 * Google Search Console verification for https://emblem.cards/ (URL-prefix
 * property, HTML-tag method). Public by design: Google reads it from the page
 * head. Keep it permanently: removing it un-verifies the property.
 */
export const GOOGLE_SITE_VERIFICATION_TOKEN = 'CmeevP7YmeXBt4oPV9Y18ILS4-FRoXtRmcWPdAwRsCE';

/**
 * Search Console verification token (the content="…" value only, never the
 * whole <meta> tag). GOOGLE_SITE_VERIFICATION can override the built-in
 * token; only Google's token alphabet is accepted, so a mistyped or pasted
 * HTML snippet can never be injected into the page head.
 */
export function googleSiteVerification(env: Record<string, string | undefined> = process.env): string | null {
  const isToken = (v: string | undefined): v is string => !!v && /^[A-Za-z0-9_-]{20,100}$/.test(v);
  const override = env.GOOGLE_SITE_VERIFICATION?.trim();
  if (isToken(override)) return override;
  return isToken(GOOGLE_SITE_VERIFICATION_TOKEN) ? GOOGLE_SITE_VERIFICATION_TOKEN : null;
}

export const SITE_NAME = 'Emblem';

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export const PRICES = {
  single: formatPence(SINGLE_UNIT_PRICE_PENCE),
  multi: formatPence(MULTI_UNIT_PRICE_PENCE),
  squad: formatPence(SQUAD_UNIT_PRICE_PENCE),
} as const;

/** Meta descriptions for the main marketing pages, kept under ~155 characters so search results show them in full. */
export const PAGE_DESCRIPTIONS = {
  home: `Personalised football cards made from your child’s photo, printed in the UK with an NFC chip that opens a private player profile. From ${PRICES.single}.`,
  gifts: `A personalised football card from their photo, with a chip that opens their own player profile. A Christmas football gift that keeps growing. ${PRICES.single}.`,
  howItWorks: 'Make a personalised football card: upload a photo, choose a design, and we print it in the UK with an NFC chip that opens a private player profile.',
  faq: 'Answers about Emblem personalised football cards: price, delivery, gifts, the NFC player profile, and how guardians keep children’s details private.',
} as const;

/** Share image for Open Graph / Twitter (1200×630). */
export const OG_IMAGE = { url: '/og/emblem-share.jpg', width: 1200, height: 630 } as const;

/**
 * Christmas order-by date shown on the gift page and announcement bar.
 * null until production confirms a real date — pages then say the date is
 * being confirmed rather than inventing one.
 */
export const CHRISTMAS_ORDER_BY: string | null = null;

/** Public marketing pages that belong in the sitemap. Private app surfaces never do. */
/**
 * `contentUpdated` is the date the page's visible content last changed
 * (sitemap <lastmod>). Update it when a page's copy or layout changes, not
 * on every deploy: Google ignores lastmod values that change without reason.
 */
export const PUBLIC_PAGES: ReadonlyArray<{ path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly'; contentUpdated: string }> = [
  { path: '/', priority: 1, changeFrequency: 'weekly', contentUpdated: '2026-10-17' },
  { path: '/football-gifts-for-kids', priority: 0.9, changeFrequency: 'weekly', contentUpdated: '2026-10-16' },
  { path: '/how-it-works', priority: 0.8, changeFrequency: 'monthly', contentUpdated: '2026-10-16' },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly', contentUpdated: '2026-10-16' },
  { path: '/trust-and-safeguarding', priority: 0.6, changeFrequency: 'monthly', contentUpdated: '2026-09-07' },
  { path: '/about', priority: 0.5, changeFrequency: 'yearly', contentUpdated: '2026-07-04' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly', contentUpdated: '2026-08-17' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly', contentUpdated: '2026-08-17' },
];

/** Path prefixes search engines must not crawl (private, per-child or internal). */
export const DISALLOWED_PREFIXES = [
  '/api/',
  '/staff',
  '/os/',
  '/card',
  '/player',
  '/squad-invite',
  '/builder-approval',
  '/dev',
  '/review',
  '/test-print',
  '/card-setup-preview',
  '/lastshot',
] as const;

/**
 * Page-level Open Graph block. Next.js replaces (does not merge) the root
 * layout's openGraph when a page sets its own, so every page must re-include
 * the share image, site name and locale.
 */
export function pageOpenGraph(og: { title: string; description?: string; url: string }) {
  return {
    ...og,
    type: 'website' as const,
    siteName: SITE_NAME,
    locale: 'en_GB',
    images: [{ url: OG_IMAGE.url, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: 'A personalised Emblem football card and its digital player profile' }],
  };
}
