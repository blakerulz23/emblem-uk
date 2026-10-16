'use client';

import { Analytics } from '@vercel/analytics/next';
import { sanitizeAnalyticsUrl, webAnalyticsEnabled } from '@/lib/web-analytics';

/**
 * Cookieless page-view analytics (Vercel Web Analytics). Renders nothing
 * unless NEXT_PUBLIC_VERCEL_WEB_ANALYTICS=true, and every event passes
 * through sanitizeAnalyticsUrl first (private pages dropped, query strings
 * reduced to campaign tags + builder mode).
 */
export default function VercelWebAnalytics() {
  if (!webAnalyticsEnabled()) return null;
  return (
    <Analytics
      beforeSend={(event) => {
        const url = sanitizeAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
