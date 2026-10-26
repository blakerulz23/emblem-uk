import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { SINGLE_UNIT_PRICE_PENCE } from '@/lib/pricing-engine';
import { isAnalyticsBlockedPath, sanitizeEventParams } from '@/lib/analytics';
import { buildUkCardCartUrl } from '@/lib/shopify';
import { cleanUtmValue, parseUtmCookie, serializeUtm, utmAttributionEnabled, utmFromSearchParams } from '@/lib/utm';
import { ALL_FAQ_ITEMS, CLUB_PAGE_FAQ_ITEMS, GIFT_PAGE_FAQ_ITEMS, HOMEPAGE_FAQ_ITEMS, faqPlainAnswer } from './faq';
import { merchantFeedXml, merchantItems } from './merchant-feed';
import { DISALLOWED_PREFIXES, GOOGLE_SITE_VERIFICATION_TOKEN, googleSiteVerification, PAGE_DESCRIPTIONS, PRICES, PUBLIC_PAGES } from './site';
import { faqPageJsonLd, personalisedCardProductJsonLd, serializeJsonLd } from './structured-data';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('robots.txt', () => {
  it('blocks everything on preview deployments', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(robots().rules).toEqual([{ userAgent: '*', disallow: '/' }]);
  });

  it('allows the marketing site in production but disallows private surfaces', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(['/staff', '/os/', '/card', '/player', '/squad-invite', '/builder-approval', '/api/']));
    expect(rule.allow).toEqual(['/', '/api/feeds/']);
    expect(r.sitemap).toBe('https://emblem.cards/sitemap.xml');
  });
});

describe('sitemap', () => {
  it('lists only public marketing pages on the canonical origin', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain('https://emblem.cards/');
    expect(urls).toContain('https://emblem.cards/football-gifts-for-kids');
    expect(urls).toContain('https://emblem.cards/faq');
    for (const url of urls) {
      expect(url.startsWith('https://emblem.cards/')).toBe(true);
      const path = new URL(url).pathname;
      expect(DISALLOWED_PREFIXES.some((p) => path.startsWith(p))).toBe(false);
    }
    expect(urls).toHaveLength(PUBLIC_PAGES.length);
  });

  it('uses each page’s real content date as lastmod, not the build time', () => {
    const today = new Date().toISOString().slice(0, 10);
    const entries = sitemap();
    entries.forEach((entry, i) => {
      const date = String(entry.lastModified);
      expect(date, entry.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(date)), entry.url).toBe(false);
      expect(date <= today, `${entry.url} lastmod is in the future`).toBe(true);
      expect(date).toBe(PUBLIC_PAGES[i].contentUpdated);
    });
    expect(sitemap()).toEqual(entries);
  });
});

describe('meta descriptions', () => {
  it('stay within ~155 characters so search results show them in full', () => {
    for (const [page, description] of Object.entries(PAGE_DESCRIPTIONS)) {
      expect(description.length, page).toBeGreaterThanOrEqual(110);
      expect(description.length, page).toBeLessThanOrEqual(155);
    }
    expect(PAGE_DESCRIPTIONS.home).toContain(PRICES.single);
  });
});

describe('structured data', () => {
  it('uses the pricing engine price in GBP', () => {
    const offer = personalisedCardProductJsonLd().offers;
    expect(offer.priceCurrency).toBe('GBP');
    expect(offer.price).toBe((SINGLE_UNIT_PRICE_PENCE / 100).toFixed(2));
    expect(PRICES.single).toBe(`£${offer.price}`);
  });

  it('FAQ schema mirrors the visible questions and answers', () => {
    const schema = faqPageJsonLd(HOMEPAGE_FAQ_ITEMS);
    expect(schema.mainEntity.map((q) => q.name)).toEqual(HOMEPAGE_FAQ_ITEMS.map((i) => i.question));
    expect(schema.mainEntity[0].acceptedAnswer.text).toBe(faqPlainAnswer(HOMEPAGE_FAQ_ITEMS[0]));
  });

  it('cannot break out of the script tag', () => {
    expect(serializeJsonLd({ text: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});

describe('FAQ content', () => {
  it('has unique questions and every subset comes from the master list', () => {
    const questions = ALL_FAQ_ITEMS.map((i) => i.question);
    expect(new Set(questions).size).toBe(questions.length);
    for (const item of [...HOMEPAGE_FAQ_ITEMS, ...GIFT_PAGE_FAQ_ITEMS]) expect(ALL_FAQ_ITEMS).toContain(item);
  });

  it('never invents a delivery time or Christmas date', () => {
    const text = ALL_FAQ_ITEMS.map(faqPlainAnswer).join(' ');
    expect(text).not.toMatch(/\b\d+\s*(-|–|to)\s*\d+\s*(working )?days\b/i);
    expect(text).not.toMatch(/\b(order by|last order)\b[^.]*\d/i);
  });

  it('avoids trademarked game-card terms', () => {
    const text = ALL_FAQ_ITEMS.map((i) => `${i.question} ${faqPlainAnswer(i)}`).join(' ');
    expect(text).not.toMatch(/\b(fifa|fut|ea fc|match attax)\b/i);
  });
});

describe('campaign attribution (UTM)', () => {
  it('keeps short plain tokens and drops personal data', () => {
    expect(cleanUtmValue('Google')).toBe('google');
    expect(cleanUtmValue('christmas-2026_search')).toBe('christmas-2026_search');
    expect(cleanUtmValue('parent@example.com')).toBeNull();
    expect(cleanUtmValue('Jack Smith')).toBeNull();
    expect(cleanUtmValue('a'.repeat(60))).toBeNull();
    expect(cleanUtmValue('')).toBeNull();
  });

  it('round-trips through the cookie format', () => {
    const utm = utmFromSearchParams(new URLSearchParams('utm_source=google&utm_medium=cpc&utm_campaign=xmas&utm_term=ignored&email=a@b.c'));
    expect(utm).toEqual({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'xmas' });
    expect(parseUtmCookie(serializeUtm(utm!))).toEqual(utm);
    expect(utmFromSearchParams(new URLSearchParams('ref=x'))).toBeNull();
  });

  it('re-cleans a tampered cookie', () => {
    expect(parseUtmCookie('utm_source=google|utm_medium=a@b.com|evil=1')).toEqual({ utm_source: 'google' });
  });

  it('adds UTM cart attributes next to the Order Ref', () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT', '123');
    vi.stubEnv('VERCEL_ENV', 'production');
    const url = buildUkCardCartUrl(1, 'EMB-1', { utm_source: 'google', utm_campaign: 'xmas' });
    expect(url).not.toBeNull();
    const params = new URL(url!).searchParams;
    expect(params.get('attributes[Order Ref]')).toBe('EMB-1');
    expect(params.get('attributes[UTM Source]')).toBe('google');
    expect(params.get('attributes[UTM Campaign]')).toBe('xmas');
    expect(params.get('attributes[UTM Medium]')).toBeNull();
  });

  it('is unchanged when there is no campaign', () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT', '123');
    vi.stubEnv('VERCEL_ENV', 'production');
    const withNone = buildUkCardCartUrl(2, 'EMB-2');
    expect(withNone).not.toBeNull();
    expect(withNone).toBe(buildUkCardCartUrl(2, 'EMB-2', null));
    expect(Array.from(new URL(withNone!).searchParams.keys())).toEqual(['attributes[Order Ref]']);
  });
});

describe('consent gating', () => {
  it('campaign attribution cookie is off unless explicitly enabled', () => {
    expect(utmAttributionEnabled({})).toBe(false);
    expect(utmAttributionEnabled({ UTM_ATTRIBUTION_ENABLED: '1' })).toBe(false);
    expect(utmAttributionEnabled({ UTM_ATTRIBUTION_ENABLED: 'true' })).toBe(true);
  });

  it('the noindex demo is not in the sitemap', () => {
    expect(sitemap().map((e) => e.url)).not.toContain('https://emblem.cards/os/demo');
  });
});

describe('analytics safety', () => {
  it('only sends allow-listed, short, plain parameters', () => {
    expect(
      sanitizeEventParams({ step: 'upload', mode: 'single', name: 'Jack Smith', email: 'a@b.com', cta: 'hero_build', question_index: 2, page: 'Jack Smith' }),
    ).toEqual({ step: 'upload', mode: 'single', cta: 'hero_build', question_index: 2 });
  });

  it('never runs on child-profile, card, staff or approval pages', () => {
    for (const p of ['/os', '/os/demo', '/card/abc', '/card-share/tok', '/player/123', '/staff/queue', '/builder-approval/tok']) {
      expect(isAnalyticsBlockedPath(p)).toBe(true);
    }
    for (const p of ['/', '/builder', '/faq', '/football-gifts-for-kids']) expect(isAnalyticsBlockedPath(p)).toBe(false);
  });
});

describe('Merchant Center feed', () => {
  it('lists the single card at the pricing-engine price in GBP', () => {
    const [item] = merchantItems();
    expect(item.price).toBe(`${(SINGLE_UNIT_PRICE_PENCE / 100).toFixed(2)} GBP`);
    expect(item.link).toBe('https://emblem.cards/');
  });

  it('produces escaped, well-formed XML', () => {
    const xml = merchantFeedXml([{ id: 'x&y', title: 'A <b>', description: 'Q "quote"', link: 'https://emblem.cards/?a=1&b=2', imageLink: 'https://emblem.cards/i.webp', price: '1.00 GBP' }]);
    expect(xml).toContain('<g:id>x&amp;y</g:id>');
    expect(xml).toContain('A &lt;b&gt;');
    expect(xml).toContain('?a=1&amp;b=2');
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });
});

describe('Search Console verification', () => {
  it('uses the built-in emblem.cards token', () => {
    expect(GOOGLE_SITE_VERIFICATION_TOKEN).toBe('CmeevP7YmeXBt4oPV9Y18ILS4-FRoXtRmcWPdAwRsCE');
    expect(googleSiteVerification({})).toBe(GOOGLE_SITE_VERIFICATION_TOKEN);
  });

  it('accepts a valid override and never an HTML snippet', () => {
    expect(googleSiteVerification({ GOOGLE_SITE_VERIFICATION: 'abcDEF123_-abcDEF123_-xyz' })).toBe('abcDEF123_-abcDEF123_-xyz');
    expect(googleSiteVerification({ GOOGLE_SITE_VERIFICATION: '<meta name="google-site-verification" content="abc" />' })).toBe(GOOGLE_SITE_VERIFICATION_TOKEN);
    expect(googleSiteVerification({ GOOGLE_SITE_VERIFICATION: 'short' })).toBe(GOOGLE_SITE_VERIFICATION_TOKEN);
  });

  it('is wired into the root layout metadata once', async () => {
    const { readFileSync } = await import('fs');
    const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
    expect(layout.match(/verification:/g)).toHaveLength(1);
    expect(layout).toContain('verification: { google: googleSiteVerification() }');
  });
});

describe('grassroots club landing page', () => {
  const read = async (rel: string) => (await import('fs')).readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('is in the sitemap with a real content date and is crawlable', () => {
    const entry = sitemap().find((e) => e.url === 'https://emblem.cards/football-cards-for-clubs');
    expect(entry?.lastModified).toBe('2026-10-17');
    expect(DISALLOWED_PREFIXES.some((p) => '/football-cards-for-clubs'.startsWith(p))).toBe(false);
  });

  it('states the live Squad Invite rules: tier at the deadline from family commitments, coach card after 10 paid families', () => {
    const text = CLUB_PAGE_FAQ_ITEMS.map(faqPlainAnswer).join(' ');
    for (const price of [PRICES.single, PRICES.multi, PRICES.squad]) expect(text).toContain(price);
    expect(text).toContain('ten families in the team have paid');
    expect(text).toContain('At your deadline');
    expect(text).not.toMatch(/10 or more player cards/i);
  });

  it('promises no delivery cost or delivery date, and sends the CTA into the existing Squad Invite flow', async () => {
    const page = await read('../../app/football-cards-for-clubs/page.tsx');
    expect(page).toContain("'/squad-invite/start'");
    expect(page).not.toMatch(/free (uk )?delivery|free shipping|delivered (with)?in \d|working days/i);
    expect(page).toContain("canonical: '/football-cards-for-clubs'");
    // The hero's "See the coach view" link (clubs_hero_coach_demo) was removed
    // in the two-column hero; the coach demo stays linked from the coach section.
    for (const id of ['clubs_hero_start', 'clubs_final_start', 'clubs_coach_demo', 'clubs_safeguarding', 'clubs_email']) {
      expect(page).toContain(`data-track="${id}"`);
    }
  });

  it('is linked from the footer club link and the homepage coach link', async () => {
    expect(await read('../../components/Footer.tsx')).toContain("{ href: '/football-cards-for-clubs', label: 'Clubs & coaches' }");
    expect(await read('../../app/page.tsx')).toContain("href: '/football-cards-for-clubs'");
  });
});
