'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DEMO_OS_DATA } from './osData';
import type { OsData } from './osData';

export type { OsData } from './osData';
export { DEMO_OS_DATA } from './osData';

const OsDataContext = createContext<OsData>(DEMO_OS_DATA);
const OsDataRefreshContext = createContext<() => Promise<boolean>>(() => Promise.resolve(false));

/**
 * Holds the SSR snapshot in state (not a bare static value) so a currently-
 * viewed screen's own realtime subscription (src/app/os/useLiveContent.ts)
 * can call refresh() and have the whole tree see fresh data immediately —
 * this is what makes "you're already looking at it, it just updates" work
 * with zero router.refresh(). mode/demo-only sessions never call refresh
 * (no realtime subscriptions are mounted in demo mode), so this is a no-op
 * cost there.
 */
export function OsDataProvider({ value, children }: { value: OsData; children: ReactNode }) {
  const [data, setData] = useState(value);

  // Adopts a fresh server-provided snapshot (a real navigation, or one of
  // the handful of remaining router.refresh() call sites) — one render
  // behind is invisible here since it only ever *replaces* already-fresh
  // data with equally-fresh data.
  useEffect(() => {
    setData(value);
  }, [value]);

  // Returns whether the refresh actually succeeded. Every pre-existing
  // caller (useLiveContent-driven live updates in PlayerHome/RealCollection/
  // Card/CoachPlayerDetail/CoachVerify, Profile's revoke flow) already
  // discards the return value — this is a strictly additive change, not a
  // behaviour change for any of them, still silent/best-effort exactly as
  // before. Pull-to-refresh (useOsRefresh.ts) is the first caller that
  // actually needs to know, so it can show a real error state and let the
  // user retry, per this feature's own explicit "don't silently fail" spec.
  // cache: 'no-store' is explicit, not assumed — /lib/supabase/server.ts's
  // ordinary session client (unlike its service-role client, which has its
  // own explicit no-store override after a real prior staleness incident)
  // has no such override of its own, so this is the one place in the whole
  // pull-to-refresh chain that guarantees the request itself is never
  // served from the browser's HTTP cache.
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/os/refresh${data.playerId ? `?player=${data.playerId}` : ''}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const fresh = (await res.json()) as OsData;
      setData(fresh);
      return true;
    } catch {
      // Best-effort — a failed live refresh just means this screen doesn't
      // update until the next event or a real navigation; never surfaced
      // as a user-facing error by the existing fire-and-forget callers.
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.playerId]);

  return (
    <OsDataContext.Provider value={data}>
      <OsDataRefreshContext.Provider value={refresh}>{children}</OsDataRefreshContext.Provider>
    </OsDataContext.Provider>
  );
}

export function useOsData(): OsData {
  return useContext(OsDataContext);
}

/** Calls GET /api/os/refresh and replaces the entire OsData snapshot in place — see useLiveContent.ts. Resolves true on success, false on any failure (network error or non-OK response) — existing fire-and-forget callers simply don't await/inspect it. */
export function useRefreshOsData(): () => Promise<boolean> {
  return useContext(OsDataRefreshContext);
}
