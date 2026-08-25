import { BUILDER_CSRF_HEADER, readBuilderCsrfCookie } from './print-capture';
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

/**
 * Never throws — a genuine network-level failure (fetch() itself
 * rejecting: offline, DNS, CORS, a dropped connection) is caught here and
 * turned into the same shaped failure a server-returned error would be, so
 * every caller can handle both cases with one `if (!result.ok)` check.
 * Previously fetch() rejections propagated out of this function entirely;
 * since every call site only wrapped its own logic in try/finally (no
 * catch), that exception was swallowed with no UI feedback at all — the
 * proven root cause of "Approve and continue does nothing" for both the
 * parent/guardian and other-adult journeys.
 */
export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
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
