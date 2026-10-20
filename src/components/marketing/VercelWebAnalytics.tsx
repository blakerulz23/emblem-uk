'use client';

import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { ANALYTICS_CHOICE_EVENT, analyticsObjected } from '@/lib/analytics';
import { sanitizeAnalyticsUrl, webAnalyticsEnabled } from '@/lib/web-analytics';

/**
 * Cookieless page-view analytics (Vercel Web Analytics). Renders nothing
 * unless NEXT_PUBLIC_VERCEL_WEB_ANALYTICS=true, and every event passes
 * through sanitizeAnalyticsUrl first (private pages dropped, query strings
 * reduced to campaign tags + builder mode).
 *
 * Relies on the PECR statistical-purposes exception, which requires a simple
 * way to object: a visitor who has turned analytics off on this device (see
 * AnalyticsChoice on the privacy page), or whose browser sends Global
 * Privacy Control, never loads the script. The check runs again before every
 * send, so turning it off mid-visit stops reporting at once.
 */
export default function VercelWebAnalytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const update = () => setAllowed(!analyticsObjected());
    update();
    window.addEventListener(ANALYTICS_CHOICE_EVENT, update);
    return () => window.removeEventListener(ANALYTICS_CHOICE_EVENT, update);
  }, []);

  if (!webAnalyticsEnabled() || !allowed) return null;
  return (
    <Analytics
      beforeSend={(event) => {
        if (analyticsObjected()) return null;
        const url = sanitizeAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
