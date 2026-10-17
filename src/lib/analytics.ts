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
 */

export const ANALYTICS_CONSENT_KEY = 'emblem_analytics_consent';

export type ConsentState = 'granted' | 'denied' | null;

export type AnalyticsEvent =
  | 'cta_click'
  | 'builder_step'
  | 'checkout_handoff'
  | 'faq_open';

const ALLOWED_PARAMS = new Set(['cta', 'step', 'mode', 'page', 'tier', 'question_index']);

/** The (at most 2) properties each event sends to Vercel, in priority order. */
export const VERCEL_EVENT_PROPERTIES: Record<AnalyticsEvent, readonly string[]> = {
  cta_click: ['cta', 'page'],
  builder_step: ['step', 'mode'],
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

type Gtag = (...args: unknown[]) => void;

export function track(event: AnalyticsEvent, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (isAnalyticsBlockedPath(window.location.pathname)) return;
  const clean = sanitizeEventParams(params);
  if (webAnalyticsEnabled()) vercelTrack(event, vercelEventProperties(event, clean));
  if (!analyticsMeasurementId() || readConsent() !== 'granted') return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== 'function') return;
  gtag('event', event, clean);
}
