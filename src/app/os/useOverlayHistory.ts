'use client';

import { useEffect, useRef } from 'react';

/**
 * Give the OS's overlays a back button.
 *
 * Every overlay in Emblem OS is component state with no address: opening a
 * moment did not add a history entry, so the browser's Back - and a phone's
 * back-swipe, which is how most people close anything - skipped straight
 * past the open moment and left the screen underneath it. Measured in the
 * demo: open a moment from the Collection, press Back, and you land on
 * whatever page preceded the app (found in the Canadian demo, 1 Oct; adapted here).
 *
 * The rule is one history entry per open overlay. Depth goes up, push one;
 * depth goes down because something closed in the UI, pop one; a popstate
 * means the person pressed Back, so close one from the top instead.
 *
 * Deliberately not URLs. These overlays are transient views of a screen
 * rather than places - a half-finished "add a moment" flow is not something
 * to deep-link into or reload back onto - so they take a history entry
 * without taking an address. The screens themselves already have ?screen=.
 */
export function useOverlayHistory(depth: number, closeTopmost: () => void) {
  const closeRef = useRef(closeTopmost);
  closeRef.current = closeTopmost;

  /** How many entries this hook has pushed and not yet taken back. */
  const pushedRef = useRef(0);
  /** Set while a popstate is being handled, so the depth change it causes is
   *  not mistaken for a UI close and answered with a second history.back. */
  const poppingRef = useRef(false);

  useEffect(() => {
    const onPop = () => {
      if (pushedRef.current === 0) return; // not one of ours
      pushedRef.current -= 1;
      poppingRef.current = true;
      closeRef.current();
      // Cleared on a timeout rather than synchronously: the depth prop only
      // falls on the next render, which is after this handler returns.
      setTimeout(() => { poppingRef.current = false; }, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const safeDepth = Math.max(0, Math.floor(depth) || 0);
    if (safeDepth > pushedRef.current) {
      // One entry per level, in case several opened at once.
      for (let i = pushedRef.current; i < safeDepth; i += 1) {
        window.history.pushState({ osOverlay: i + 1 }, '');
      }
      pushedRef.current = safeDepth;
      return;
    }
    if (safeDepth < pushedRef.current) {
      const surplus = pushedRef.current - safeDepth;
      pushedRef.current = safeDepth;
      // Closed from the UI, so our entries are still on the stack and have
      // to come off - otherwise Back would replay the overlay that was just
      // dismissed. When the close came FROM Back, the entry is already gone.
      if (!poppingRef.current) window.history.go(-surplus);
    }
  }, [depth]);

  // Leaving the app with entries outstanding would leave Back pointing at
  // this screen; drop them on unmount.
  useEffect(() => () => {
    if (pushedRef.current > 0) {
      const surplus = pushedRef.current;
      pushedRef.current = 0;
      window.history.go(-surplus);
    }
  }, []);
}
