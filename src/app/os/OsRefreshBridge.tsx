'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useOsRefresh } from './useOsRefresh';
import type { UseOsRefreshResult } from './useOsRefresh';
import { useOsData } from './OsDataContext';
import type { StoryUpdate } from './osData';

/**
 * useOsRefresh() calls useRefreshOsData() — a React Context consumer — so it
 * must run in a component that's a genuine DESCENDANT of <OsDataProvider>
 * in the tree, not in OsApp.tsx's own function body: OsApp is the
 * component that renders the Provider, so a hook called directly there
 * only ever sees OsDataRefreshContext's default no-op fallback, never the
 * Provider's real refresh() (confirmed empirically — every refresh
 * silently no-op'd instead of ever reaching the network, caught during
 * this feature's own Playwright verification, not assumed away).
 *
 * This bridge is rendered as an actual child of OsDataProvider specifically
 * so useOsRefresh resolves the real context value, then reports its live
 * state back up to OsApp (which owns the scroll ref, the header button,
 * and the #os-scroll pull transform) via a plain callback — far smaller in
 * blast radius than moving OsApp's entire render tree into a new child
 * component just to fix one hook's context scope.
 *
 * Also reports the live storyUpdates/unreadStoryUpdateCount for the exact
 * same reason: OsApp seeds useStoryUpdates() from `osData.storyUpdates`,
 * where `osData` is OsApp's own `initialData ?? DEMO_OS_DATA` — a plain
 * prop, frozen at whatever it was on mount/last real navigation. A
 * refresh() call updates OsDataContext's *internal* state, which every
 * genuine descendant (PlayerHome, CoachHome, etc. via useOsData()) sees
 * correctly — but OsApp itself never re-reads that internal state, so the
 * "What's New" / Coach Assessment card kept showing pre-refresh content
 * even after a successful pull-to-refresh (confirmed empirically, the same
 * way as the refresh()-context bug above — this is a pre-existing gap in
 * every one of the six other refreshOsData() call sites too, not something
 * pull-to-refresh introduced, but pull-to-refresh's own explicit spec
 * requires "What's New"/Coach Assessments to actually update, so it's
 * fixed here rather than left in place).
 */
export default function OsRefreshBridge({
  scrollRef,
  disabled,
  onChange,
  onStoryUpdatesChange,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onChange: (result: UseOsRefreshResult) => void;
  onStoryUpdatesChange: (storyUpdates: StoryUpdate[], unreadStoryUpdateCount: number) => void;
}) {
  const result = useOsRefresh({ scrollRef, disabled });
  const osData = useOsData();

  useEffect(() => {
    onChange(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status, result.pullDistance, result.progress, result.announcement, result.triggerManualRefresh, onChange]);

  useEffect(() => {
    onStoryUpdatesChange(osData.storyUpdates, osData.unreadStoryUpdateCount);
    // osData.storyUpdates is a fresh array reference on every OsDataContext
    // update (refresh() always does setData(fresh) with a brand-new
    // object), so depending on the array/count themselves (not the whole
    // osData object) still correctly re-fires exactly when they actually
    // change, without over-firing on unrelated OsData field changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osData.storyUpdates, osData.unreadStoryUpdateCount, onStoryUpdatesChange]);

  return null;
}
