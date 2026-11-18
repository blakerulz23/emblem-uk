import { parseMySeasonView, type FocusDraft, type MySeasonCategoryKey, type MySeasonView } from '@/lib/my-season';

/**
 * Client-side calls for My Season. Plain async functions (fetch injected)
 * so the flows are unit-testable without a DOM. Every failure resolves to
 * a fixed message; nothing from the server is shown unless it came from the
 * route's own fixed error copy.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MY_SEASON_LOAD_ERROR = "Couldn't load My Season. Check your connection and try again.";
const GENERIC_SAVE_ERROR = "Couldn't save that. Check your connection and try again.";

export type LoadResult = { ok: true; view: MySeasonView } | { ok: false };
export type WriteResult = { ok: true } | { ok: false; error: string };

export async function loadMySeasonView(playerId: string, fetchImpl: FetchLike = fetch): Promise<LoadResult> {
  try {
    const res = await fetchImpl(`/api/os/my-season?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false };
    const view = parseMySeasonView(await res.json());
    return view ? { ok: true, view } : { ok: false };
  } catch {
    return { ok: false };
  }
}

async function postJson(url: string, body: unknown, fetchImpl: FetchLike): Promise<WriteResult> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, error: typeof data?.error === 'string' && data.error ? data.error : GENERIC_SAVE_ERROR };
  } catch {
    return { ok: false, error: GENERIC_SAVE_ERROR };
  }
}

export function saveMySeasonFocus(playerId: string, draft: FocusDraft, requestId: string, fetchImpl: FetchLike = fetch) {
  return postJson(
    '/api/os/my-season/focus',
    {
      playerId,
      title: draft.title.trim(),
      whyItMatters: draft.whyItMatters.trim(),
      whatItLooksLike: draft.whatItLooksLike.trim(),
      startedOn: draft.startedOn,
      requestId,
    },
    fetchImpl
  );
}

export function addMySeasonObservation(
  playerId: string,
  category: MySeasonCategoryKey,
  body: string,
  requestId: string,
  fetchImpl: FetchLike = fetch
) {
  return postJson('/api/os/my-season/observations', { playerId, category, body: body.trim(), requestId }, fetchImpl);
}

export function withdrawMySeasonObservation(observationId: string, fetchImpl: FetchLike = fetch) {
  return postJson(`/api/os/my-season/observations/${encodeURIComponent(observationId)}/withdraw`, undefined, fetchImpl);
}

/** A fresh idempotency key. Kept across retries of the same submission; replaced after success. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Coach detail: whether to ask the server at all. Never in demo mode,
 * never when os-data said the deploy kill switch is on (lookup false or
 * absent), and never for a player with no team (the feature is per team,
 * so the answer would always be "not enabled").
 */
export function shouldLookUpCoachMySeason({ isReal, lookup, teamId }: { isReal: boolean; lookup: boolean | undefined; teamId: string | null | undefined }): boolean {
  return isReal && lookup === true && !!teamId;
}

/** Local YYYY-MM-DD (the date picker's value format). */
export function todayLocalIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
