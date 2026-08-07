/**
 * Pure pull-to-refresh geometry — deliberately its own file with zero
 * imports, so it (and its own test file) never transitively pull in any
 * JSX (useOsRefresh.ts imports OsDataContext.tsx, which this project's
 * JSX-free vitest config can't parse) just to test a resistance curve.
 */

/** Visual (resisted) pull distance, in px, at which releasing triggers a refresh. */
export const OS_REFRESH_THRESHOLD = 68;
/** Compact height for the persistent error banner — deliberately shorter
 * than the full pull reveal, since it isn't being actively dragged open. */
export const OS_REFRESH_ERROR_BANNER_HEIGHT = 44;
export const OS_REFRESH_MAX_PULL_DISTANCE = 112;
/** Raw drag distance, before resistance starts diminishing it. */
const RESISTANCE_FREE_ZONE = 24;
const RESISTANCE_FACTOR = 0.42;

export function applyResistance(rawDelta: number): number {
  if (rawDelta <= 0) return 0;
  if (rawDelta <= RESISTANCE_FREE_ZONE) return rawDelta;
  const resisted = RESISTANCE_FREE_ZONE + (rawDelta - RESISTANCE_FREE_ZONE) * RESISTANCE_FACTOR;
  return Math.min(resisted, OS_REFRESH_MAX_PULL_DISTANCE);
}
