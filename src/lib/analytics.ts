import { track as vercelTrack } from '@vercel/analytics';
import { isAnalyticsBlockedPath } from './analytics-paths';
import { webAnalyticsEnabled } from './web-analytics';

/**
 * Privacy-first analytics helpers (browser only). One track() call reports
 * each event at most once to each enabled provider:
 *
 * - Vercel Web Analytics custom events: cookieless, so no consent needed
 *   (UK PECR). On when NEXT_PUBLIC_VERCEL_WEB_ANALYTICS=true. Pro plan
 *   allows 2 properties per event, so each event sends its own 2 at most.
 * - Google Analytics 4: only if NEXT_PUBLIC_GA_MEASUREMENT_ID is set AND the
 *   visitor accepted analytics cookies. Not configured in production.
 * - Never runs on child-profile, card, player or staff surfaces.
 * - Event parameters are allow-listed and length-limited, so a child's name,
 *   an email address or a photo reference can never be sent by mistake.
 *   `mode` and `source` only ever take values from a fixed vocabulary.
 * - Visitors can object (PECR statistical-purposes exception): the choice is
 *   remembered on this device and stops page views and events entirely.
 *   Global Privacy Control is honoured as an objection too, but is never the
 *   only way to object.
 */

export const ANALYTICS_CONSENT_KEY = 'emblem_analytics_consent';

export type ConsentState = 'granted' | 'denied' | null;

export type AnalyticsEvent =
  | 'cta_click'
  | 'builder_step'
  | 'builder_started'
  | 'card_completed'
  | 'checkout_handoff'
  | 'faq_open';

const ALLOWED_PARAMS = new Set(['cta', 'step', 'mode', 'page', 'tier', 'question_index', 'source']);

/** Closed vocabularies: anything else is dropped, never sent. */
export const ANALYTICS_MODES = ['single', 'set', 'squad', 'squad_invite'] as const;
export const ANALYTICS_SOURCES = ['direct', 'search', 'social', 'emblem', 'other'] as const;
const FIXED_VALUES: Record<string, readonly string[]> = { mode: ANALYTICS_MODES, source: ANALYTICS_SOURCES };

/** The (at most 2) properties each event sends to Vercel, in priority order. */
export const VERCEL_EVENT_PROPERTIES: Record<AnalyticsEvent, readonly string[]> = {
  cta_click: ['cta', 'page'],
  builder_step: ['step', 'mode'],
  builder_started: ['mode', 'source'],
  card_completed: ['mode'],
  checkout_handoff: ['mode'],
  faq_open: ['question_index', 'page'],
};

export { isAnalyticsBlockedPath };

export function analyticsMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return id && /^G-[A-Z0-9]{4,}$/.test(id) ? id : null;
}

/** Keep only allow-listed keys with short, plain values. */
export function sanitizeEventParams(params: Record<string, unknown> = {}): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_PARAMS.has(key)) continue;
    if (FIXED_VALUES[key] && !FIXED_VALUES[key].includes(value as string)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string' && /^[a-z0-9_\-/]{1,40}$/i.test(value)) out[key] = value;
  }
  return out;
}

export function readConsent(): ConsentState {
  try {
    const v = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(state: Exclude<ConsentState, null>): void {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, state);
  } catch {
    // Storage blocked (private mode): treat as session-only consent.
  }
}

/** The sanitized properties Vercel receives for an event (never more than 2). */
export function vercelEventProperties(event: AnalyticsEvent, params: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of VERCEL_EVENT_PROPERTIES[event].slice(0, 2)) {
    if (key in params) out[key] = params[key];
  }
  return out;
}

/**
 * Where the visitor came from, as a category only — never the referring URL
 * itself (which can carry search terms, names or tokens).
 */
export function referrerSource(referrer: string, ownHost: string): (typeof ANALYTICS_SOURCES)[number] {
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  const own = ownHost.toLowerCase().replace(/^www\./, '');
  if (host === own || host.endsWith(`.${own}`) || /(^|\.)emblem\.cards$/.test(host)) return 'emblem';
  if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org)$/.test(host)) return 'search';
  if (/(^|\.)(facebook\.com|instagram\.com|t\.co|x\.com|twitter\.com|tiktok\.com|pinterest\.com|linkedin\.com|whatsapp\.com|l\.facebook\.com|lm\.facebook\.com)$/.test(host)) return 'social';
  return 'other';
}

/** Visitor's objection to analytics on this device (strictly necessary to honour it). */
export const ANALYTICS_OPT_OUT_KEY = 'emblem_analytics_off';
export const ANALYTICS_CHOICE_EVENT = 'emblem-analytics-choice';

export function readAnalyticsOptOut(): boolean {
  try {
    return window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

// Mirrors the device choice for this page, so an objection still holds when
// storage is blocked (private browsing).
let sessionOptOut = false;

export function setAnalyticsOptOut(off: boolean): void {
  sessionOptOut = off;
  try {
    if (off) window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, '1');
    else window.localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
  } catch {
    // Storage blocked: sessionOptOut still applies for this page.
  }
  window.dispatchEvent(new Event(ANALYTICS_CHOICE_EVENT));
}

/** True when the visitor has objected (device choice) or their browser sends Global Privacy Control. */
export function analyticsObjected(): boolean {
  if (typeof window === 'undefined') return true;
  if (sessionOptOut || readAnalyticsOptOut()) return true;
  return Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
}

type Gtag = (...args: unknown[]) => void;

export function track(event: AnalyticsEvent, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (isAnalyticsBlockedPath(window.location.pathname)) return;
  if (analyticsObjected()) return;
  const clean = sanitizeEventParams(params);
  if (webAnalyticsEnabled()) vercelTrack(event, vercelEventProperties(event, clean));
  if (!analyticsMeasurementId() || readConsent() !== 'granted') return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== 'function') return;
  gtag('event', event, clean);
}
