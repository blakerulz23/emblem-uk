/**
 * The coach Celebrate categories: the single source of truth for both the
 * Celebrate sheet (src/app/os/data.tsx derives CELEBRATE_CATS from it) and
 * POST /api/os/celebrate (which accepts only an exact active label).
 *
 * Server-safe: no client or fixture imports, so the API route can use it.
 *
 * Only these four can be given as NEW recognitions. They describe what the
 * child did, not a ranking against teammates. The label is still the exact
 * string stored in moments.title, unchanged from before, so new rows match
 * historical ones. Keys are code-only and never stored.
 *
 * Retired labels are never relabelled, backfilled or hidden: moments that
 * already carry one keep displaying exactly as saved. Nothing that renders
 * a moment may filter by this list.
 */
export type CelebrateCategoryGroup = 'Match' | 'Character';

export type CelebrateCategory = {
  key: 'hat-trick' | 'clean-sheet' | 'great-teammate' | 'leadership';
  label: string;
  emoji: string;
  group: CelebrateCategoryGroup;
};

export const ACTIVE_CELEBRATE_CATEGORIES: readonly CelebrateCategory[] = [
  { key: 'hat-trick', label: 'Hat Trick', emoji: '🎩', group: 'Match' },
  { key: 'clean-sheet', label: 'Clean Sheet', emoji: '🧤', group: 'Match' },
  { key: 'great-teammate', label: 'Great Teammate', emoji: '❤️', group: 'Character' },
  { key: 'leadership', label: 'Leadership', emoji: '🧠', group: 'Character' },
];

/**
 * Labels coaches could pick before Phase 0. Saved moments with these titles
 * stay as they are; the route refuses them for new recognitions.
 */
export const RETIRED_CELEBRATE_LABELS: readonly string[] = [
  'Player of the Match',
  'First Goal',
  'Hardest Worker',
  'Most Improved',
  "Coach's Award",
];

/** The sheet's grouped layout, in display order. */
export const CELEBRATE_GROUPS: readonly { group: CelebrateCategoryGroup; items: readonly CelebrateCategory[] }[] = (
  ['Match', 'Character'] as const
).map((group) => ({ group, items: ACTIVE_CELEBRATE_CATEGORIES.filter((c) => c.group === group) }));

const ACTIVE_LABELS = new Set(ACTIVE_CELEBRATE_CATEGORIES.map((c) => c.label));

/** True only for an exact (case- and whitespace-sensitive) active label. */
export function isActiveCelebrateLabel(value: unknown): value is string {
  return typeof value === 'string' && ACTIVE_LABELS.has(value);
}
