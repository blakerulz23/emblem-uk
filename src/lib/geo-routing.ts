/**
 * Country routing between the three Emblem sites (UK, Canada, US).
 *
 * Each market is its own deployment on its own address (emblem.cards,
 * ca.emblem.cards, us.emblem.cards). A first-time visitor lands on the
 * site for the country Vercel says they are in (the `x-vercel-ip-country`
 * header); a visitor who picked a country in the footer switcher keeps
 * their pick (the `emblem_country` cookie, shared across *.emblem.cards).
 *
 * Off unless all three site addresses are configured
 * (NEXT_PUBLIC_EMBLEM_SITE_UK / _CA / _US) AND the request is for this
 * site's own configured host, so preview and *.vercel.app URLs never
 * bounce anyone anywhere. Search-engine crawlers are never redirected, so
 * each site stays indexable in its own country.
 */
/** The three Emblem sites. This UK repo has no market-config layer, so the type lives here. */
export type MarketId = 'uk' | 'ca' | 'us';

export const COUNTRY_COOKIE = 'emblem_country';

export type SiteUrls = Record<MarketId, string>;

// Literal process.env.NEXT_PUBLIC_* reads: Next.js only inlines those into
// browser / edge bundles when they are spelled out like this (passing
// process.env around as an object leaves them undefined in the browser).
const BUILD_ENV = {
  NEXT_PUBLIC_EMBLEM_SITE_UK: process.env.NEXT_PUBLIC_EMBLEM_SITE_UK,
  NEXT_PUBLIC_EMBLEM_SITE_CA: process.env.NEXT_PUBLIC_EMBLEM_SITE_CA,
  NEXT_PUBLIC_EMBLEM_SITE_US: process.env.NEXT_PUBLIC_EMBLEM_SITE_US,
};

export function configuredSiteUrls(env: Record<string, string | undefined> = BUILD_ENV): SiteUrls | null {
  const uk = env.NEXT_PUBLIC_EMBLEM_SITE_UK?.trim();
  const ca = env.NEXT_PUBLIC_EMBLEM_SITE_CA?.trim();
  const us = env.NEXT_PUBLIC_EMBLEM_SITE_US?.trim();
  if (!uk || !ca || !us) return null;
  return { uk: uk.replace(/\/$/, ''), ca: ca.replace(/\/$/, ''), us: us.replace(/\/$/, '') };
}

/** ISO country -> the market that serves it; everyone else stays where they landed. */
export function marketForCountry(country: string | null | undefined): MarketId | null {
  switch ((country ?? '').toUpperCase()) {
    case 'CA':
      return 'ca';
    case 'US':
    case 'PR':
      return 'us';
    case 'GB':
    case 'IE':
    case 'IM':
    case 'JE':
    case 'GG':
      return 'uk';
    default:
      return null;
  }
}

export function parseCountryChoice(value: string | null | undefined): MarketId | null {
  const v = value?.trim().toLowerCase();
  return v === 'uk' || v === 'ca' || v === 'us' ? v : null;
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

/** Paths that must never be redirected: app, APIs, auth, card taps, assets. */
function isRoutablePage(path: string): boolean {
  // Card taps and shared player pages (/card, /card-share, /player) always
  // open on the site that printed the card — a UK card tapped in Canada
  // must show its UK profile.
  if (/^\/(api|os|_next|auth|login|staff|c|p|card|card-share|player|builder-approval|squad-invite|review|dev|test-print|card-setup-preview)(\/|$)/.test(path)) return false;
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return false;
  return true;
}

export interface GeoRequest {
  method: string;
  host: string;
  path: string;
  search: string;
  country: string | null;
  userAgent: string | null;
  countryCookie: string | null;
}

/**
 * The absolute URL to send this request to, or null to serve it here.
 * `self` is the market this deployment serves.
 */
export function geoRedirectTarget(req: GeoRequest, self: MarketId, urls: SiteUrls | null = configuredSiteUrls()): string | null {
  if (!urls) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  let selfHost: string;
  try {
    selfHost = new URL(urls[self]).host;
  } catch {
    return null;
  }
  if (req.host.toLowerCase() !== selfHost.toLowerCase()) return null;
  if (!isRoutablePage(req.path)) return null;
  if (req.userAgent && BOT.test(req.userAgent)) return null;

  const chosen = parseCountryChoice(req.countryCookie);
  const target = chosen ?? marketForCountry(req.country);
  if (!target || target === self) return null;
  return `${urls[target]}${req.path}${req.search}`;
}

/** Cookie domain shared by all three sites (".emblem.cards"), when they share one. */
export function sharedCookieDomain(urls: SiteUrls | null = configuredSiteUrls()): string | undefined {
  if (!urls) return undefined;
  const hosts = Object.values(urls).map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return '';
    }
  });
  const root = hosts.find((h) => hosts.every((other) => other === h || other.endsWith(`.${h}`)));
  return root ? `.${root}` : undefined;
}
