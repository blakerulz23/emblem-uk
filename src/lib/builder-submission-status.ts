/**
 * Recovery after an interrupted submit (save and resume).
 *
 * When a parent's order submit is interrupted (lost connection, closed tab)
 * the builder cannot know whether the order reached the server. Its draft
 * keeps the submission id it was using, and on return asks this before
 * allowing another submit:
 *
 *   - 'placed'      an order exists for that submission (orders.submission_key
 *                   is unique) — nothing to resend; the draft is cleared.
 *   - 'not_placed'  no order, and the old submission can no longer create one
 *                   (an unused submission is revoked here first, then checked
 *                   once more) — the parent continues with their work intact
 *                   under a fresh submission.
 *   - 'in_progress' the old submission is mid-way (finalising) or in an
 *                   unexpected state — sending stays paused; ask again later.
 *
 * This never creates, changes or reveals an order: the only write is
 * revoking an unused submission capability, and the only answer is one of
 * the three words above.
 */
export type SubmissionStatus = 'placed' | 'not_placed' | 'in_progress';

export type SubmissionStatusDeps = {
  orderExists(submissionId: string): Promise<boolean>;
  capabilityState(submissionId: string): Promise<string | null>;
  revoke(submissionId: string): Promise<void>;
  wait(ms: number): Promise<void>;
};

/** Pause before the final re-check, so a request already on its way lands first. */
export const LATE_REQUEST_GRACE_MS = 1500;

export async function resolveSubmissionStatus(submissionId: string, deps: SubmissionStatusDeps): Promise<SubmissionStatus> {
  if (await deps.orderExists(submissionId)) return 'placed';
  const state = await deps.capabilityState(submissionId);
  if (state === 'finalising') return 'in_progress';
  if (state === 'active') {
    // Unused: revoke it, so a delayed request from the interrupted page can
    // no longer create an order, then look once more.
    await deps.revoke(submissionId);
    await deps.wait(LATE_REQUEST_GRACE_MS);
    if (await deps.orderExists(submissionId)) return 'placed';
    return (await deps.capabilityState(submissionId)) === 'finalising' ? 'in_progress' : 'not_placed';
  }
  // 'submitted' with no order should not happen; never guess — keep sending paused.
  if (state === 'submitted') return 'in_progress';
  // revoked, expired or unknown: it can never create an order now.
  return 'not_placed';
}
