/**
 * Titles a parent can no longer use for a NEW moment via Add a moment
 * (POST /api/os/moments). Server-safe: no client or fixture imports.
 *
 * "Player of the Match" ranks a child against teammates, so it was removed
 * from the parent Add-a-moment list (ADD_ACH) in Phase 0, matching the coach
 * Celebrate restriction (src/lib/celebrate-categories.ts).
 *
 * The client sends the picked item's label as the moment title. The route
 * cannot tell a picked label from typed text, so it refuses only an exact
 * match of a retired label (ignoring case, surrounding spaces and repeated
 * inner spaces). Anything else, e.g. "Player of the Match nominee", is left
 * alone: this is a retired-label guard, not a content filter.
 *
 * Moments already saved with a retired title are never relabelled,
 * backfilled or hidden. Nothing that renders a moment may use this list.
 */
export const RETIRED_ADD_MOMENT_TITLES: readonly string[] = ['Player of the Match'];

const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const RETIRED = new Set(RETIRED_ADD_MOMENT_TITLES.map(normalise));

/** True when `value` is a retired Add-a-moment title (case/space-insensitive exact match). */
export function isRetiredAddMomentTitle(value: unknown): boolean {
  return typeof value === 'string' && RETIRED.has(normalise(value));
}
