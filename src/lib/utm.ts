/**
 * Campaign attribution (utm_source / utm_medium / utm_campaign).
 *
 * Captured by middleware from a landing URL into a first-party cookie and
 * passed to Shopify as cart attributes at checkout, so paid orders can be
 * tied back to the search term, ad or post that brought the family in.
 *
 * Idea adapted from the Canadian repo's partner-program UTM handling,
 * rewritten for the UK without any partner/affiliate fields.
 *
 * Only short, plain tokens survive cleaning: an email address, a name or
 * free text pasted into a UTM is dropped, never stored.
 */

export const UTM_COOKIE = 'emblem_utm';

/**
 * Off by default. A marketing-attribution cookie is not "strictly necessary"
 * under UK PECR, so it may only be set with the visitor's consent. Turn this
 * on (UTM_ATTRIBUTION_ENABLED=true) only together with the analytics consent
 * banner, and make capture conditional on that consent.
 */
export function utmAttributionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.UTM_ATTRIBUTION_ENABLED === 'true';
}
export const UTM_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Partial<Record<UtmKey, string>>;

export const UTM_CART_ATTRIBUTES: Record<UtmKey, string> = {
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
};

/** Lower-cased token of letters, digits, '-', '_' or '.', max 50 chars; anything else → null. */
export function cleanUtmValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,49}$/.test(value)) return null;
  return value;
}

export function utmFromSearchParams(params: URLSearchParams): UtmParams | null {
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const v = cleanUtmValue(params.get(key));
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function serializeUtm(utm: UtmParams): string {
  return UTM_KEYS.filter((k) => utm[k]).map((k) => `${k}=${utm[k]}`).join('|');
}

export function parseUtmCookie(raw: string | null | undefined): UtmParams | null {
  if (!raw) return null;
  const out: UtmParams = {};
  for (const part of raw.split('|')) {
    const [k, v] = part.split('=');
    if ((UTM_KEYS as readonly string[]).includes(k)) {
      const clean = cleanUtmValue(v);
      if (clean) out[k as UtmKey] = clean;
    }
  }
  return Object.keys(out).length ? out : null;
}
