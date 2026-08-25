import { BUILDER_CSRF_HEADER, readBuilderCsrfCookie } from './print-capture';
import { RequestTimeoutError, fetchWithTimeout } from './fetch-with-timeout';
import type { BuilderAuthorityRelationship } from './builder-authority-shared';

/**
 * Pure client-side logic for the Adult Permission step (AdultPermissionStep.
 * tsx), kept in a plain .ts module — separate from the .tsx component —
 * specifically so it can be unit-tested directly (this repo's vitest setup
 * has no JSX transform configured, so a .tsx file cannot be imported from a
 * test at all; extracting the logic that actually needs proving out of the
 * component is the smallest fix for that, not a new test dependency).
 */

export const GENERIC_FAILURE = 'Something went wrong — please try again.';
export const TIMEOUT_FAILURE = 'This is taking longer than expected. Please try again.';

/**
 * Never throws, and never hangs indefinitely — fetchWithTimeout bounds
 * every call with an AbortController ceiling. A genuine network-level
 * failure (fetch() rejecting: offline, DNS, CORS, a dropped connection) or
 * a request that never got a response within the bound is caught here and
 * turned into the same shaped, retryable failure a server-returned error
 * would be, so every caller can handle every case with one
 * `if (!result.ok)` check. A try/catch alone (the earlier fix) only
 * catches a promise that actually settles — a genuinely hung request never
 * settles at all, which is what the live preview exposed: "Saving…"
 * persisting forever, with nothing to catch. This is the actual fix for
 * that; the earlier exception handling remains correct but was never
 * sufficient on its own.
 */
export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: err instanceof RequestTimeoutError ? TIMEOUT_FAILURE : GENERIC_FAILURE };
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    return { ok: false, error: result?.error || GENERIC_FAILURE };
  }
  return result;
}

/** A non-guardian relationship must go through a separate guardian's
 *  approval before the card can ever be produced or shared — the button
 *  label reflects that instead of implying the clicking adult's own
 *  approval is final. */
export function isNonGuardianRelationship(relationship: BuilderAuthorityRelationship | ''): boolean {
  return relationship === 'coach' || relationship === 'club_organiser' || relationship === 'other_adult';
}

export function confirmButtonLabel(relationship: BuilderAuthorityRelationship | '', busy: boolean): string {
  if (busy) return 'Saving…';
  return isNonGuardianRelationship(relationship) ? 'Continue to guardian approval' : 'Approve and continue';
}

/**
 * Live-preview re-verification of the timeout fix found a distinct
 * symptom: busy correctly released, but no inline error ever appeared.
 * Direct code review of the previous handleConfirm found no batching gap
 * — setConfirmError and setBusy(false) were always set together,
 * synchronously, on every failure path — but two separate useState calls
 * are still two separate state slots, and the diagnosis explicitly asked
 * to rule out a stale attempt clobbering a fresher one. confirmReducer
 * makes busy/error one atomic value (impossible for one to update
 * without the other), and createAttemptTracker lets a caller discard the
 * result of an attempt that is no longer the current one — belt-and-
 * braces against exactly the "stale closure" failure mode named in the
 * diagnosis checklist, on top of the pre-existing busyRef click guard.
 */
export type ConfirmSubmitState = { busy: boolean; error: string };

export const INITIAL_CONFIRM_SUBMIT_STATE: ConfirmSubmitState = { busy: false, error: '' };

export type ConfirmSubmitAction =
  | { type: 'start' }
  | { type: 'settle'; error: string }
  | { type: 'clear-error' };

export function confirmSubmitReducer(state: ConfirmSubmitState, action: ConfirmSubmitAction): ConfirmSubmitState {
  switch (action.type) {
    case 'start':
      return { busy: true, error: '' };
    case 'settle':
      return { busy: false, error: action.error };
    case 'clear-error':
      return state.error ? { ...state, error: '' } : state;
  }
}

/** A monotonically increasing id per attempt — start() returns the id for
 *  the attempt that just began; isCurrent(id) is false once a later
 *  attempt has started, so a late-resolving stale attempt can detect
 *  it's stale and skip applying its result. */
export function createAttemptTracker() {
  let current = 0;
  return {
    start(): number {
      current += 1;
      return current;
    },
    isCurrent(id: number): boolean {
      return id === current;
    },
  };
}
