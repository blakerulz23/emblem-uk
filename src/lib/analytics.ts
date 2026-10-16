/**
 * Privacy-first analytics helpers (browser only).
 *
 * - Off unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set AND the visitor accepted
 *   analytics cookies (UK PECR). Until then track() is a silent no-op.
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

/** Paths where analytics must never load: per-child or internal surfaces. */
const NO_ANALYTICS_PREFIXES = ['/os', '/card', '/player', '/staff', '/builder-approval', '/squad-invite/manage', '/dev', '/review'];

export function analyticsMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return id && /^G-[A-Z0-9]{4,}$/.test(id) ? id : null;
}

export function isAnalyticsBlockedPath(path: string): boolean {
  return NO_ANALYTICS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || (p === '/card' && path.startsWith('/card-')));
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

type Gtag = (...args: unknown[]) => void;

export function track(event: AnalyticsEvent, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (!analyticsMeasurementId() || readConsent() !== 'granted') return;
  if (isAnalyticsBlockedPath(window.location.pathname)) return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== 'function') return;
  gtag('event', event, sanitizeEventParams(params));
}
