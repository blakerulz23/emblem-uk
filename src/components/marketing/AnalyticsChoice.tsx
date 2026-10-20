'use client';

import { useEffect, useState } from 'react';
import { ANALYTICS_CHOICE_EVENT, analyticsObjected, readAnalyticsOptOut, setAnalyticsOptOut } from '@/lib/analytics';

/**
 * The visitor's simple, free way to object to analytics (PECR statistical-
 * purposes exception). Remembered on this device only; it stores nothing
 * else and is never sent anywhere.
 */
export default function AnalyticsChoice() {
  const [state, setState] = useState<'loading' | 'on' | 'off' | 'gpc'>('loading');

  useEffect(() => {
    const update = () => {
      if (readAnalyticsOptOut()) setState('off');
      else if (analyticsObjected()) setState('gpc');
      else setState('on');
    };
    update();
    window.addEventListener(ANALYTICS_CHOICE_EVENT, update);
    return () => window.removeEventListener(ANALYTICS_CHOICE_EVENT, update);
  }, []);

  if (state === 'loading') return null;
  return (
    <div className="emh-analytics-choice" role="group" aria-label="Analytics on this device">
      <p style={{ margin: 0 }}>
        <strong>Analytics on this device: {state === 'on' ? 'on' : 'off'}.</strong>{' '}
        {state === 'gpc'
          ? 'Your browser sends a Global Privacy Control signal, so we already treat analytics as off.'
          : state === 'off'
            ? 'We won’t collect any analytics from this browser.'
            : 'You can turn it off at any time; it changes nothing else on the site.'}
      </p>
      {state !== 'gpc' && (
        <button type="button" onClick={() => setAnalyticsOptOut(state === 'on')}>
          {state === 'on' ? 'Turn off analytics' : 'Turn analytics back on'}
        </button>
      )}
    </div>
  );
}
