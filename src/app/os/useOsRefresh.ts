'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useRefreshOsData } from './OsDataContext';
import { applyResistance, OS_REFRESH_THRESHOLD, OS_REFRESH_ERROR_BANNER_HEIGHT } from './refreshGeometry';

export type OsRefreshStatus = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'success' | 'error';
export { OS_REFRESH_THRESHOLD } from './refreshGeometry';

/** Where the indicator/content rest while a refresh is in flight — the same
 * as the activation threshold, matching how this reads on real touch
 * devices (the spinner settles right where the user released it). */
const REFRESHING_REVEAL = OS_REFRESH_THRESHOLD;
const ERROR_BANNER_HEIGHT = OS_REFRESH_ERROR_BANNER_HEIGHT;
const SUCCESS_DISPLAY_MS = 700;
/** How long a background (silent) revalidation's brief success state lingers before easing away — short, since nothing was visibly pulled open for it. */
const SILENT_SUCCESS_DISPLAY_MS = 150;
/** A tab/window must have been away for at least this long before regaining
 * focus/visibility triggers a background revalidation — never a poll, and
 * never on every tab switch regardless of how recent the last refresh was. */
const STALE_INTERVAL_MS = 45_000;
/** Below this raw movement, a touch hasn't revealed vertical-vs-horizontal
 * intent yet — avoids misreading a tiny wobble as a horizontal swipe (which
 * would wrongly cancel a genuine pull) or as a real pull (which would
 * wrongly steal a horizontal carousel swipe). */
const GESTURE_INTENT_DEADZONE = 6;

/** The real document's own scroll position — #os-scroll (scrollRef's
 * target) no longer scrolls itself (see .emblem-os-shell in os.css: the
 * page scrolls for real now, so mobile Safari can auto-collapse its own
 * toolbar), so "are we at the top of the content" has to be read from the
 * document, not from the element the gesture listeners happen to attach
 * to. document.documentElement.scrollTop is the fallback for the rare case
 * window.scrollY isn't available (SSR guards elsewhere already ensure this
 * only ever runs client-side, but this keeps the helper self-contained). */
function getPageScrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function isTextEntryFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable;
}

export type UseOsRefreshResult = {
  status: OsRefreshStatus;
  /** Resisted, visual px — drives both the indicator's reveal height and the scroll content's translateY. 0 when idle. */
  pullDistance: number;
  /** 0–1 progress toward the activation threshold, for the indicator's icon rotation while pulling. */
  progress: number;
  /** Text for an aria-live region — empty string when there's nothing new to announce. */
  announcement: string;
  /** Manual trigger (header button, or tapping the error banner to retry) — same status machine and refresh call as the pull gesture, no content-reveal animation of its own. */
  triggerManualRefresh: () => void;
};

/**
 * Player OS and Coach OS share this one gesture/state implementation —
 * which data actually comes back is entirely up to useRefreshOsData()
 * (OsDataContext.tsx → GET /api/os/refresh → getOsData(), the same
 * function the SSR page load already uses, scoped to whichever
 * player/coach session is asking). This hook never touches OS data
 * directly — it only decides *when* to call refresh() and how to reflect
 * that as gesture/indicator state.
 */
export function useOsRefresh({ scrollRef, disabled }: { scrollRef: RefObject<HTMLElement | null>; disabled: boolean }): UseOsRefreshResult {
  const refreshOsData = useRefreshOsData();
  const [status, setStatus] = useState<OsRefreshStatus>('idle');
  const [pullDistance, setPullDistance] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  const statusRef = useRef(status);
  statusRef.current = status;
  const lastRefreshedAtRef = useRef(Date.now());
  // resistedDistance is read by onTouchEnd to decide whether to trigger a
  // refresh — deliberately a plain field on this same synchronously-updated
  // ref, not derived from `status` state/statusRef. React state updates
  // (setStatus/setPullDistance) are asynchronous and batched; a touchend
  // that fires before React has had a chance to re-render since the last
  // touchmove would otherwise read a stale statusRef.current still showing
  // 'idle'/'pulling' even though the finger genuinely crossed the
  // threshold — confirmed happening for a fast synthetic drag-and-release
  // during this feature's own testing, and a real risk for a fast real
  // swipe-and-release too, not just a test artifact.
  const gestureRef = useRef<{ startY: number; startX: number; tracking: boolean; intent: 'unknown' | 'vertical' | 'horizontal'; resistedDistance: number } | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // The actual dedup guard — set synchronously the instant a refresh
  // starts, cleared synchronously the instant it ends. statusRef.current
  // alone isn't reliable for this: React defers processing a setState call
  // (even one made before any await, inside a native — not synthetic —
  // event listener) to its own batching cycle, so a *second* overlapping
  // trigger arriving synchronously right after the first (three fast
  // touch sequences fired back-to-back with no yield between them, for
  // example) can still see the pre-update status and slip past a
  // statusRef-only check. Confirmed happening in exactly that scenario
  // during this feature's own testing, not a theoretical concern.
  const isRefreshingRef = useRef(false);

  const runRefresh = useCallback(async (opts?: { silent?: boolean }) => {
    // Dedup — a second gesture, a manual tap, and a background revalidation
    // landing at the same moment must never fire two overlapping requests;
    // isRefreshingRef (synchronous) is the actual source of truth for
    // this, not `status` state, which only settles after React's next
    // render.
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    clearTimeout(successTimerRef.current);
    setStatus('refreshing');
    if (!opts?.silent) setPullDistance(REFRESHING_REVEAL);
    setAnnouncement('Refreshing updates');

    const ok = await refreshOsData();
    lastRefreshedAtRef.current = Date.now();
    // The network request itself has now genuinely completed (success or
    // failure) — a new refresh may start from here even if the success/
    // error UI state below is still being displayed for a moment longer.
    isRefreshingRef.current = false;

    if (ok) {
      setStatus('success');
      setAnnouncement('Updates refreshed');
      successTimerRef.current = setTimeout(() => {
        setStatus('idle');
        setPullDistance(0);
      }, opts?.silent ? SILENT_SUCCESS_DISPLAY_MS : SUCCESS_DISPLAY_MS);
    } else if (opts?.silent) {
      // A silent background revalidation failing is never surfaced —
      // matches the pre-existing refresh() philosophy for automatic
      // triggers (see OsDataContext.tsx); the explicit error banner is for
      // a refresh the user actually asked for.
      setStatus('idle');
      setPullDistance(0);
    } else {
      setStatus('error');
      setAnnouncement('Refresh failed');
      setPullDistance(ERROR_BANNER_HEIGHT);
    }
  }, [refreshOsData]);

  const triggerManualRefresh = useCallback(() => {
    if (disabled) return;
    void runRefresh();
  }, [disabled, runRefresh]);

  // The touch gesture itself — attached directly to the OS scroll
  // container's DOM node (not a synthetic React handler) so touchmove can
  // be registered non-passive and selectively preventDefault()'d only once
  // a real top-of-content downward pull is confirmed; every other touch
  // (mid-scroll, horizontal, on a focused input) is left completely alone
  // for native scrolling/carousels/inputs to handle exactly as before.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (disabled || statusRef.current === 'refreshing' || isTextEntryFocused() || getPageScrollTop() > 0) {
        gestureRef.current = null;
        return;
      }
      const t = e.touches[0];
      gestureRef.current = { startY: t.clientY, startX: t.clientX, tracking: true, intent: 'unknown', resistedDistance: 0 };
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (!g || !g.tracking) return;
      const t = e.touches[0];
      const dy = t.clientY - g.startY;
      const dx = t.clientX - g.startX;

      if (g.intent === 'unknown') {
        if (Math.abs(dy) < GESTURE_INTENT_DEADZONE && Math.abs(dx) < GESTURE_INTENT_DEADZONE) return;
        // Downward-and-more-vertical-than-horizontal is the only shape that
        // counts as a pull attempt — a horizontal (carousel) or upward
        // movement hands the touch straight back to the browser/whatever
        // else is listening, untouched.
        g.intent = dy > 0 && Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
        if (g.intent === 'horizontal') {
          g.tracking = false;
          return;
        }
      }
      if (g.intent !== 'vertical') return;

      if (getPageScrollTop() > 0 || dy <= 0) {
        // The page scrolled away from the top mid-gesture (e.g. the pull
        // itself caused a frame of native scroll before we started
        // resisting), or the finger reversed direction — abandon cleanly
        // rather than fight the browser for control of the touch.
        g.tracking = false;
        g.resistedDistance = 0;
        setPullDistance(0);
        setStatus((s) => (s === 'pulling' || s === 'ready' ? 'idle' : s));
        return;
      }

      // Confirmed real pull — take over from native scroll for this touch.
      e.preventDefault();
      const resisted = applyResistance(dy);
      g.resistedDistance = resisted;
      setPullDistance(resisted);
      setStatus(resisted >= OS_REFRESH_THRESHOLD ? 'ready' : 'pulling');
    };

    const onTouchEnd = () => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || !g.tracking || g.intent !== 'vertical') return;
      if (g.resistedDistance >= OS_REFRESH_THRESHOLD) {
        void runRefresh();
      } else if (g.resistedDistance > 0) {
        setPullDistance(0);
        setStatus('idle');
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollRef, disabled, runRefresh]);

  // Background revalidation — only on a genuine return to the app (tab/PWA
  // regains visibility, or the window regains focus) and only when the
  // last successful/attempted refresh is genuinely stale. Never a timer,
  // never runs while something disables the gesture (an overlay open, a
  // focused text field elsewhere on screen), never overlaps an in-flight
  // refresh (runRefresh's own status check).
  useEffect(() => {
    const maybeRevalidate = () => {
      if (document.hidden) return;
      if (disabled) return;
      if (isTextEntryFocused()) return;
      if (Date.now() - lastRefreshedAtRef.current < STALE_INTERVAL_MS) return;
      void runRefresh({ silent: true });
    };
    document.addEventListener('visibilitychange', maybeRevalidate);
    window.addEventListener('focus', maybeRevalidate);
    return () => {
      document.removeEventListener('visibilitychange', maybeRevalidate);
      window.removeEventListener('focus', maybeRevalidate);
    };
  }, [disabled, runRefresh]);

  useEffect(() => () => clearTimeout(successTimerRef.current), []);

  const progress = Math.min(1, pullDistance / OS_REFRESH_THRESHOLD);

  return { status, pullDistance, progress, announcement, triggerManualRefresh };
}
