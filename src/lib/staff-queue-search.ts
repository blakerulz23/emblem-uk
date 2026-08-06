// Pure helpers for the Profile Setup Queue's player-name search + sort
// (src/app/staff/queue/page.tsx) — kept dependency-free so they're testable
// without mocking Supabase.

export type QueueSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

export const QUEUE_SORT_OPTIONS: { value: QueueSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Player name A–Z' },
  { value: 'name_desc', label: 'Player name Z–A' },
];

export function parseQueueSort(raw: string | undefined | null): QueueSort {
  return QUEUE_SORT_OPTIONS.some((o) => o.value === raw) ? (raw as QueueSort) : 'newest';
}

/** Trim, collapse repeated whitespace, lowercase — the shared normalisation
 * used on both the typed query and every candidate player name so matching
 * is whitespace- and case-insensitive in both directions. */
export function normalizePlayerSearch(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Partial, case-insensitive, whitespace-normalised match against a
 * player's full display name — matches first name, surname or full name
 * since it's a plain substring test on the normalised name. */
export function matchesPlayerSearch(name: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return normalizePlayerSearch(name).includes(normalizedQuery);
}

/** Newest/oldest compare by timestamp (nulls sort as epoch 0, i.e. oldest);
 * name_asc/name_desc compare by display name. Ties always break on `id` so
 * ordering is fully deterministic regardless of the input array's order. */
export function compareQueueRows<T extends { id: string }>(
  a: T,
  b: T,
  sort: QueueSort,
  getTimestamp: (row: T) => string | null,
  getName: (row: T) => string
): number {
  let primary = 0;
  if (sort === 'newest' || sort === 'oldest') {
    const at = getTimestamp(a) ? new Date(getTimestamp(a) as string).getTime() : 0;
    const bt = getTimestamp(b) ? new Date(getTimestamp(b) as string).getTime() : 0;
    primary = sort === 'newest' ? bt - at : at - bt;
  } else {
    const cmp = getName(a).localeCompare(getName(b));
    primary = sort === 'name_asc' ? cmp : -cmp;
  }
  if (primary !== 0) return primary;
  return a.id.localeCompare(b.id);
}
