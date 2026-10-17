import { describe, expect, it } from 'vitest';
import { configuredSiteUrls, geoRedirectTarget, marketForCountry, sharedCookieDomain, type GeoRequest } from './geo-routing';

const urls = configuredSiteUrls({
  NEXT_PUBLIC_EMBLEM_SITE_UK: 'https://emblem.cards',
  NEXT_PUBLIC_EMBLEM_SITE_CA: 'https://ca.emblem.cards/',
  NEXT_PUBLIC_EMBLEM_SITE_US: 'https://us.emblem.cards',
});

const req = (over: Partial<GeoRequest> = {}): GeoRequest => ({
  method: 'GET',
  host: 'ca.emblem.cards',
  path: '/pricing',
  search: '?a=1',
  country: 'US',
  userAgent: 'Mozilla/5.0 (iPhone)',
  countryCookie: null,
  ...over,
});

describe('geo routing', () => {
  it('is off until all three addresses are configured', () => {
    expect(configuredSiteUrls({ NEXT_PUBLIC_EMBLEM_SITE_UK: 'https://emblem.cards' })).toBeNull();
    expect(geoRedirectTarget(req(), 'ca', null)).toBeNull();
  });

  it('sends a US visitor on the Canadian site to the US site, keeping the path', () => {
    expect(geoRedirectTarget(req(), 'ca', urls)).toBe('https://us.emblem.cards/pricing?a=1');
  });

  it('leaves visitors already on their own site, and unknown countries, alone', () => {
    expect(geoRedirectTarget(req({ country: 'CA' }), 'ca', urls)).toBeNull();
    expect(geoRedirectTarget(req({ country: 'FR' }), 'ca', urls)).toBeNull();
    expect(geoRedirectTarget(req({ country: null }), 'ca', urls)).toBeNull();
  });

  it('a footer choice beats the IP country', () => {
    expect(geoRedirectTarget(req({ countryCookie: 'ca' }), 'ca', urls)).toBeNull();
    expect(geoRedirectTarget(req({ country: 'CA', countryCookie: 'uk', host: 'ca.emblem.cards' }), 'ca', urls)).toBe('https://emblem.cards/pricing?a=1');
  });

  it('never redirects previews, bots, non-GET, the app, APIs or files', () => {
    expect(geoRedirectTarget(req({ host: 'emblem-ca.vercel.app' }), 'ca', urls)).toBeNull();
    expect(geoRedirectTarget(req({ userAgent: 'Googlebot/2.1' }), 'ca', urls)).toBeNull();
    expect(geoRedirectTarget(req({ method: 'POST' }), 'ca', urls)).toBeNull();
    for (const path of ['/os', '/os/x', '/api/locale', '/robots.txt', '/c/ABC', '/card/abc', '/card-share/x', '/player/123']) {
      expect(geoRedirectTarget(req({ path }), 'ca', urls), path).toBeNull();
    }
  });

  it('never redirects Google fetchers without "bot" in their user agent (Search Console verification, URL inspection)', () => {
    for (const userAgent of ['Mozilla/5.0 (compatible; Google-Site-Verification/1.0)', 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)', 'GoogleOther']) {
      expect(geoRedirectTarget(req({ userAgent }), 'ca', urls), userAgent).toBeNull();
    }
  });

  it('still routes ordinary browsers, including Chrome and the Google app', () => {
    for (const userAgent of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.0 Mobile/15E148 Safari/604.1',
    ]) {
      expect(geoRedirectTarget(req({ userAgent }), 'ca', urls), userAgent).not.toBeNull();
    }
  });

  it('maps countries and finds the shared cookie domain', () => {
    expect(marketForCountry('gb')).toBe('uk');
    expect(marketForCountry('PR')).toBe('us');
    expect(sharedCookieDomain(urls)).toBe('.emblem.cards');
  });
});

describe('geo routing on the UK site — only pages every site has', () => {
  const uk = (over: Partial<GeoRequest> = {}) => req({ host: 'emblem.cards', country: 'GB', search: '', ...over });

  it('never redirects UK-only landing pages, even with a Canada cookie or a Canadian visitor', () => {
    for (const path of ['/football-gifts-for-kids', '/trust-and-safeguarding', '/football-gifts-for-kids/']) {
      expect(geoRedirectTarget(uk({ path, countryCookie: 'ca' }), 'uk', urls), path).toBeNull();
      expect(geoRedirectTarget(uk({ path, country: 'CA' }), 'uk', urls), path).toBeNull();
    }
  });

  it('still honours a deliberate country choice on pages that exist everywhere', () => {
    expect(geoRedirectTarget(uk({ path: '/', countryCookie: 'ca' }), 'uk', urls)).toBe('https://ca.emblem.cards/');
    expect(geoRedirectTarget(uk({ path: '/faq', countryCookie: 'us' }), 'uk', urls)).toBe('https://us.emblem.cards/faq');
    expect(geoRedirectTarget(uk({ path: '/builder', search: '?mode=single', countryCookie: 'ca' }), 'uk', urls)).toBe('https://ca.emblem.cards/builder?mode=single');
  });

  it('keeps new UK visitors (no cookie) on the UK site', () => {
    for (const path of ['/', '/faq', '/how-it-works', '/builder', '/football-gifts-for-kids']) {
      expect(geoRedirectTarget(uk({ path }), 'uk', urls), path).toBeNull();
    }
  });
});
