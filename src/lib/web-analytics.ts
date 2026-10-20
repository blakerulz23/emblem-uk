import { isAnalyticsBlockedPath } from './analytics-paths';

/**
 * Vercel Web Analytics privacy filter (pure, so it is unit-tested).
 *
 * Vercel Web Analytics sets no cookies and stores nothing on the device, but
 * it does receive the page URL. Card codes, claim/approval tokens and player
 * ids can appear in URLs, so:
 *  - private surfaces (player app, card taps, card-share, player profiles,
 *    staff, approval links, every Squad Invite page except the public
 *    /squad-invite/start landing page) are never reported;
 *  - every other URL is reduced to its path plus an allow-list of harmless
 *    query parameters (campaign tags and the builder mode).
 */
export const WEB_ANALYTICS_ALLOWED_QUERY = ['utm_source', 'utm_medium', 'utm_campaign', 'mode'] as const;


/**
 * The literal `process.env.NEXT_PUBLIC_VERCEL_WEB_ANALYTICS` default must stay
 * spelled out: Next.js only inlines NEXT_PUBLIC_* values into browser bundles
 * when written literally (reading them off a passed-around process.env object
 * is always undefined in the browser, which silently disabled analytics).
 */
export function webAnalyticsEnabled(value: string | undefined = process.env.NEXT_PUBLIC_VERCEL_WEB_ANALYTICS): boolean {
  return value === 'true';
}

/** Returns the URL to report, or null to drop the event entirely. */
export function sanitizeAnalyticsUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const path = url.pathname;
  // The public demo holds only sample data: count visits, never its query string.
  if (path === '/os/demo') return `${url.origin}${path}`;
  if (isAnalyticsBlockedPath(path)) return null;
  const kept = new URLSearchParams();
  for (const key of WEB_ANALYTICS_ALLOWED_QUERY) {
    const value = url.searchParams.get(key);
    if (value && /^[a-z0-9._-]{1,50}$/i.test(value)) kept.set(key, value);
  }
  const query = kept.toString();
  return `${url.origin}${path}${query ? `?${query}` : ''}`;
}
