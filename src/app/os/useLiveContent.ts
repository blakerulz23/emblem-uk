'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type LiveContentChange<T> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
};

/**
 * Subscribes to postgres_changes on `table` (must already be in the
 * supabase_realtime publication — see
 * supabase/migrations/0027_story_updates_realtime.sql) filtered by
 * `filter` (a PostgREST filter string, e.g. `player_id=eq.<uuid>`), calling
 * `onChange` for every INSERT/UPDATE/DELETE. This is the primary mechanism
 * behind "a screen you're already viewing updates itself live" — Story
 * Updates (src/app/os/useStoryUpdates.ts) only ever cover what you missed,
 * never how a currently-open screen stays current.
 *
 * `onChange` is intentionally excluded from the effect's dependency array
 * (re-subscribing on every render would churn the channel) — callers
 * should keep it referentially stable-ish (a plain closure recreated each
 * render is fine; the effect only re-runs on table/filter changes).
 */
export function useLiveContent<T = Record<string, unknown>>(
  table: string,
  filter: string | null,
  onChange: (change: LiveContentChange<T>) => void
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!filter) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`live:${table}:${filter}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (payload) => {
          onChangeRef.current({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: payload.new as T,
            old: payload.old as Partial<T>,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter]);
}

/**
 * A small transient "Updated just now" flag — set true when `trigger()` is
 * called (from a useLiveContent onChange), auto-clears after `durationMs`.
 * Never tied to story_updates/badges — purely a same-screen live-update
 * indicator.
 */
export function useJustUpdatedFlag(durationMs = 2500) {
  const [justUpdated, setJustUpdated] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const trigger = useCallback(() => {
    setJustUpdated(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setJustUpdated(false), durationMs);
  }, [durationMs]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return [justUpdated, trigger] as const;
}
