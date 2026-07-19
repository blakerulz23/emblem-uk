'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number counting up (or down) to `target` whenever it changes,
 * as long as `active` is true. Jumps straight to the target under
 * prefers-reduced-motion, or while inactive.
 */
export function useCountUp(target: number, active: boolean, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number>();

  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!active || reducedMotion) {
      setValue(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const ease = (t: number) => 1 - (1 - t) * (1 - t);

    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(from + (target - from) * ease(k)));
      if (k < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, active, durationMs]);

  return value;
}
