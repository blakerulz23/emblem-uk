/**
 * Interrupted-submit recovery for save and resume.
 *
 * The builder keeps its draft until the server confirms an order. Before any
 * upload it records the submission id in the draft; if the page is closed or
 * the network fails mid-submit, the restored draft asks this question before
 * sending is allowed again: did that submission place an order?
 *
 *   placed      — an order exists for the submission. Nothing is resent.
 *   not_placed  — no order, and the submission can no longer create one
 *                 (revoked, expired, or never issued). Safe to send again
 *                 under a fresh submission.
 *   in_progress — a request is mid-way through creating the order. Sending
 *                 stays paused; the parent can check again.
 *
 * Why this cannot produce a duplicate order: /api/order-enquiry only creates
 * an order after begin_builder_submission_finalising moves the capability
 * from 'active' to 'finalising'. revokeIfUnused is an atomic compare-and-set
 * of 'active' -> 'revoked', so once it succeeds no request — even one still
 * in flight from the old tab — can create an order under that id. It never
 * touches a capability that is already finalising.
 */
export type SubmissionStatus = 'placed' | 'not_placed' | 'in_progress';

export type SubmissionStatusDeps = {
  orderExists(submissionId: string): Promise<boolean>;
  capabilityState(submissionId: string): Promise<string | null>;
  /** Atomically 'active' -> 'revoked'. True only if this call revoked it. */
  revokeIfUnused(submissionId: string): Promise<boolean>;
};

export async function resolveSubmissionStatus(
  submissionId: string,
  deps: SubmissionStatusDeps,
): Promise<SubmissionStatus> {
  if (await deps.orderExists(submissionId)) return 'placed';
  // Two attempts: a finalising request that fails is put back to 'active',
  // so the state can move under us once.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (await deps.revokeIfUnused(submissionId)) return 'not_placed';
    const state = await deps.capabilityState(submissionId);
    if (state === 'finalising') return 'in_progress';
    if (state === 'submitted') return (await deps.orderExists(submissionId)) ? 'placed' : 'in_progress';
    if (state !== 'active') return 'not_placed'; // revoked, expired or never issued: can never create an order
  }
  // Still 'active' after two revoke attempts: never guess. The route answers
  // 503 and the builder keeps sending paused.
  throw new Error('submission could not be settled');
}
