// Pure helpers shared by the three independent /staff/queue sections
// (Orders Awaiting Approval, Recently Approved, Profile Setup Queue) — kept
// dependency-free so they're testable without mocking Supabase.

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

// Recently Approved has its own sort vocabulary (default is "most recently
// approved", not "newest queue entry" — a different timestamp entirely) —
// kept as a separate type/value-space rather than overloading QueueSort so
// the two are never accidentally interchangeable.
export type ApprovedSort = 'approved-desc' | 'approved-asc' | 'name-asc' | 'name-desc';

export const APPROVED_SORT_OPTIONS: { value: ApprovedSort; label: string }[] = [
  { value: 'approved-desc', label: 'Recently approved' },
  { value: 'approved-asc', label: 'Oldest approved' },
  { value: 'name-asc', label: 'Player name A–Z' },
  { value: 'name-desc', label: 'Player name Z–A' },
];

export function parseApprovedSort(raw: string | undefined | null): ApprovedSort {
  return APPROVED_SORT_OPTIONS.some((o) => o.value === raw) ? (raw as ApprovedSort) : 'approved-desc';
}

/** Trim, collapse repeated whitespace, lowercase — the shared normalisation
 * used on both the typed query and every candidate field so matching is
 * whitespace- and case-insensitive in both directions. */
export function normalizePlayerSearch(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Partial, case-insensitive, whitespace-normalised match against a single
 * field (player name, email, order ref, club/team...) — matches anywhere in
 * the field since it's a plain substring test on the normalised value. */
export function matchesPlayerSearch(name: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return normalizePlayerSearch(name).includes(normalizedQuery);
}

/** Same partial/case-insensitive/whitespace-normalised match, but true if
 * ANY of several fields matches — the Awaiting Approval / Recently Approved
 * sections search player name(s), email and order reference together, not
 * just one field. Null/undefined/empty fields are skipped, not matched. */
export function matchesAnyField(fields: Array<string | null | undefined>, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return fields.some((field) => field && normalizePlayerSearch(field).includes(normalizedQuery));
}

function compareByRecencyOrName<T extends { id: string }>(
  a: T,
  b: T,
  mode: 'time-desc' | 'time-asc' | 'name-asc' | 'name-desc',
  getTimestamp: (row: T) => string | null,
  getName: (row: T) => string
): number {
  let primary = 0;
  if (mode === 'time-desc' || mode === 'time-asc') {
    const at = getTimestamp(a) ? new Date(getTimestamp(a) as string).getTime() : 0;
    const bt = getTimestamp(b) ? new Date(getTimestamp(b) as string).getTime() : 0;
    primary = mode === 'time-desc' ? bt - at : at - bt;
  } else {
    const cmp = getName(a).localeCompare(getName(b));
    primary = mode === 'name-asc' ? cmp : -cmp;
  }
  if (primary !== 0) return primary;
  return a.id.localeCompare(b.id);
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
  const mode = sort === 'newest' ? 'time-desc' : sort === 'oldest' ? 'time-asc' : sort === 'name_asc' ? 'name-asc' : 'name-desc';
  return compareByRecencyOrName(a, b, mode, getTimestamp, getName);
}

/** Same shape as compareQueueRows, for Recently Approved's own sort vocabulary. */
export function compareApprovedRows<T extends { id: string }>(
  a: T,
  b: T,
  sort: ApprovedSort,
  getApprovedAt: (row: T) => string | null,
  getName: (row: T) => string
): number {
  const mode = sort === 'approved-desc' ? 'time-desc' : sort === 'approved-asc' ? 'time-asc' : sort === 'name-asc' ? 'name-asc' : 'name-desc';
  return compareByRecencyOrName(a, b, mode, getApprovedAt, getName);
}

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

/** Clamps the requested page into [1, totalPages] rather than returning an
 * empty slice for an out-of-range page (e.g. a stale bookmarked ?page=9
 * after the result set shrinks). */
export function paginate<T>(sorted: T[], requestedPage: number, pageSize: number): Paginated<T> {
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage || 1), totalPages);
  const items = sorted.slice((page - 1) * pageSize, page * pageSize);
  return { items, total, page, pageSize, totalPages };
}

/** Builds a /staff/queue URL from the CURRENT full param set plus a small
 * set of key updates (set, or delete via null) — every other section's
 * params pass through untouched, which is how the three sections stay
 * independent while sharing one URL/querystring. */
export function buildStaffQueueUrl(currentParams: URLSearchParams | string, updates: Record<string, string | null>): string {
  const params = new URLSearchParams(typeof currentParams === 'string' ? currentParams : currentParams.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/staff/queue?${qs}` : '/staff/queue';
}
