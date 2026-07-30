'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DEMO_OS_DATA } from './osData';
import type { OsData } from './osData';

export type { OsData } from './osData';
export { DEMO_OS_DATA } from './osData';

const OsDataContext = createContext<OsData>(DEMO_OS_DATA);
const OsDataRefreshContext = createContext<() => void>(() => {});

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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/os/refresh${data.playerId ? `?player=${data.playerId}` : ''}`);
      if (!res.ok) return;
      const fresh = (await res.json()) as OsData;
      setData(fresh);
    } catch {
      // Best-effort — a failed live refresh just means this screen doesn't
      // update until the next event or a real navigation; never surfaced
      // as a user-facing error.
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

/** Calls GET /api/os/refresh and replaces the entire OsData snapshot in place — see useLiveContent.ts. */
export function useRefreshOsData(): () => void {
  return useContext(OsDataRefreshContext);
}
