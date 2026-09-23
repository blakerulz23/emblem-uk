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

  it('maps countries and finds the shared cookie domain', () => {
    expect(marketForCountry('gb')).toBe('uk');
    expect(marketForCountry('PR')).toBe('us');
    expect(sharedCookieDomain(urls)).toBe('.emblem.cards');
  });
});
