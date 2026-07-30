'use client';

import { useEffect } from 'react';

const HEARTBEAT_MS = 10_000;

/**
 * While `scope` is non-null and the tab is visible, upserts this profile's
 * presence for that scope every ~10s (POST /api/os/presence) — the signal
 * src/lib/story-updates.ts reads to decide whether a recipient was already
 * watching an event happen live (see the roadmap's Locked Decision 2).
 * TTL-only by design: there is no explicit "leaving" call on unmount, since
 * beforeunload/visibilitychange firing reliably can't be guaranteed
 * (especially on mobile Safari/PWA backgrounding) — the row simply goes
 * stale and stops counting as present once heartbeats stop.
 */
export function usePresenceHeartbeat(scope: string | null) {
  useEffect(() => {
    if (!scope) return;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/os/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      }).catch(() => {});
    };

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVisibility = () => beat();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scope]);
}
