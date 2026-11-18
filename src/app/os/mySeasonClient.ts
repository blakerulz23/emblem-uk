import {
  isUuid,
  parseMySeasonView,
  rawViewSaysEnabled,
  stripUnstorableText,
  type FocusDraft,
  type MySeasonCategoryKey,
  type MySeasonView,
} from '@/lib/my-season';

/**
 * Client-side calls for My Season. Plain async functions (fetch injected)
 * so the flows are unit-testable without a DOM. Every failure resolves to
 * a fixed message; nothing from the server is shown unless it came from the
 * route's own fixed error copy.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MY_SEASON_LOAD_ERROR = "Couldn't load My Season. Check your connection and try again.";
export const MY_SEASON_SESSION_ENDED = 'Your session has ended. Sign in again.';
export const GENERIC_SAVE_ERROR = "Couldn't save that. Check your connection and try again.";
/** Deliberately names no feature: it is shown to families who may not have My Season. */
export const SEASON_CHECK_FAILED = "Couldn't check this section. Try again.";

/**
 * `signedOut`: the server answered 401, so retrying will not help.
 * `enabledInvalid`: the feature is on for this player but the view was
 * unusable. Any other failure says nothing about whether it is on.
 */
export type LoadResult = { ok: true; view: MySeasonView } | { ok: false; signedOut: boolean; enabledInvalid?: true };
/**
 * `unknown`: no usable answer (network failure, lost response, 5xx), so the
 * write may or may not have happened. `code`: the route's fixed error code.
 */
export type WriteFailure = { ok: false; error: string; status?: number; code?: string; unknown?: true };
export type WriteResult = { ok: true } | WriteFailure;
export type AddNoteResult = { ok: true; observationId: string } | WriteFailure;

/** The fixed copy for a failed load. */
export function loadErrorMessage(signedOut: boolean): string {
  return signedOut ? MY_SEASON_SESSION_ENDED : MY_SEASON_LOAD_ERROR;
}

export async function loadMySeasonView(playerId: string, fetchImpl: FetchLike = fetch): Promise<LoadResult> {
  try {
    const res = await fetchImpl(`/api/os/my-season?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 401) return { ok: false, signedOut: true };
      const data = (await res.json().catch(() => null)) as { code?: unknown } | null;
      // The deploy kill switch's own 404 is a definite "off". Any other 404 is a failure.
      if (res.status === 404 && data?.code === 'deploy_off') return { ok: true, view: { enabled: false } };
      return data?.code === 'view_invalid' ? { ok: false, signedOut: false, enabledInvalid: true } : { ok: false, signedOut: false };
    }
    const raw: unknown = await res.json();
    const view = parseMySeasonView(raw);
    if (view) return { ok: true, view };
    return rawViewSaysEnabled(raw) ? { ok: false, signedOut: false, enabledInvalid: true } : { ok: false, signedOut: false };
  } catch {
    return { ok: false, signedOut: false };
  }
}

async function postJson(url: string, body: unknown, fetchImpl: FetchLike): Promise<{ ok: true; data: unknown } | WriteFailure> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { ok: true, data: await res.json().catch(() => null) };
    if (res.status === 401) return { ok: false, error: MY_SEASON_SESSION_ENDED, status: 401 };
    const data = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
    const failure: WriteFailure = { ok: false, error: typeof data?.error === 'string' && data.error ? data.error : GENERIC_SAVE_ERROR, status: res.status };
    if (typeof data?.code === 'string') failure.code = data.code;
    if (res.status >= 500) failure.unknown = true;
    return failure;
  } catch {
    return { ok: false, error: GENERIC_SAVE_ERROR, unknown: true };
  }
}

const plainResult = (r: { ok: true; data: unknown } | WriteFailure): WriteResult => (r.ok ? { ok: true } : r);

export async function saveMySeasonFocus(playerId: string, draft: FocusDraft, requestId: string, fetchImpl: FetchLike = fetch): Promise<WriteResult> {
  return plainResult(
    await postJson(
      '/api/os/my-season/focus',
      {
        playerId,
        title: stripUnstorableText(draft.title).trim(),
        whyItMatters: stripUnstorableText(draft.whyItMatters).trim(),
        whatItLooksLike: stripUnstorableText(draft.whatItLooksLike).trim(),
        startedOn: draft.startedOn,
        requestId,
      },
      fetchImpl
    )
  );
}

/** A success without a usable note id says nothing certain, so it counts as unknown. */
export async function addMySeasonObservation(
  playerId: string,
  category: MySeasonCategoryKey,
  body: string,
  requestId: string,
  fetchImpl: FetchLike = fetch
): Promise<AddNoteResult> {
  const r = await postJson('/api/os/my-season/observations', { playerId, category, body: stripUnstorableText(body).trim(), requestId }, fetchImpl);
  if (!r.ok) return r;
  const observationId = (r.data as { observationId?: unknown } | null)?.observationId;
  return isUuid(observationId) ? { ok: true, observationId } : { ok: false, error: GENERIC_SAVE_ERROR, unknown: true };
}

export async function withdrawMySeasonObservation(observationId: string, fetchImpl: FetchLike = fetch): Promise<WriteResult> {
  return plainResult(await postJson(`/api/os/my-season/observations/${encodeURIComponent(observationId)}/withdraw`, undefined, fetchImpl));
}

/** A fresh idempotency key. See createWriteController for when one is reused. */
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
