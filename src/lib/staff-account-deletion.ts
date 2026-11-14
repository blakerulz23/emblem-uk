/**
 * Shared rules for the staff account-deletion page and its routes
 * (/staff/account-deletions). Pure functions, so the page, the routes and
 * the tests agree.
 */

/** The second confirmation the page sends for a permanent completion. */
export const COMPLETE_CONFIRMATION = 'COMPLETE_PERMANENTLY';
/** What the staff member types to arm the permanent completion. */
export const COMPLETE_TYPED_WORD = 'DELETE';

export function validateStaffReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return 'Enter a reason.';
  if (trimmed.length > 500) return 'Keep the reason to 500 characters or fewer.';
  return null;
}

/** Counts from account_deletion_preview (migration 0098). Counts only; never child data. */
export type DeletionPreview = {
  status: string;
  blockingReason: string | null;
  accountExists: boolean;
  isStaffAccount: boolean;
  blockers: { coachAuthoredRecords: number; squadInviteOrganiser: number; squadInviteAudit: number };
  removes: { parentLinksShared: number; childrenToDeletionReview: number; cardsToLock: number };
  clears: { momentsUploaded: number; invites: number; ordersApproved: number };
  marks: { verifiedMoments: number; cancelledRequests: number };
  coaching: { suspendedForReview: number; activeAssignments: number; directLinks: number };
};

export function blockerTotal(p: DeletionPreview): number {
  return p.blockers.coachAuthoredRecords + p.blockers.squadInviteOrganiser + p.blockers.squadInviteAudit;
}

/** Whether permanent completion may be offered, and why not. */
export function completionAvailability(p: DeletionPreview | null): { ok: true } | { ok: false; why: string } {
  if (!p) return { ok: false, why: 'The counts could not be loaded. Refresh the page.' };
  if (p.status !== 'pending') return { ok: false, why: 'This request is no longer pending.' };
  if (p.isStaffAccount) return { ok: false, why: 'This is a staff account. Staff access must be removed through the two-person manual procedure first.' };
  const blockers = blockerTotal(p);
  if (blockers > 0) {
    return { ok: false, why: `${blockers} record${blockers === 1 ? '' : 's'} that must be kept still block this deletion. Resolve them first.` };
  }
  return { ok: true };
}

export type ActionResult = { tone: 'success' | 'warning' | 'error'; text: string };

/** When a request failed in transit or the server's answer could not be read, the outcome is unknown. */
export const RESULT_UNKNOWN_TEXT = 'The result could not be confirmed. Refresh the page before doing anything else: if the request is still waiting, nothing was changed.';

function failure(status: number, body: Record<string, unknown> | null): ActionResult {
  if (status === 0 || !body || typeof body.error !== 'string') return { tone: 'error', text: RESULT_UNKNOWN_TEXT };
  return { tone: 'error', text: body.error };
}

const SIGN_IN_PENDING =
  'Its sign-in could not be removed yet. Emblem refuses its sessions and it cannot recreate the account; an access token it already holds stops working when it expires. Use "Retry sign-in removal" in Recently decided.';

/** Honest wording for a completion (or sign-in retry) response. */
export function describeCompletion(status: number, body: Record<string, unknown> | null): ActionResult {
  if (status !== 200 || !body?.ok) return failure(status, body);
  const already = body.state === 'already_completed';
  const gone = body.state === 'account_already_deleted';
  const head = already
    ? 'This deletion has already been completed; nothing was erased again.'
    : gone
      ? 'The account had already been deleted; the request is now closed.'
      : `Deletion completed. ${Number(body.childDeletionRequests ?? 0)} child deletion request(s) filed, ${Number(body.childrenUnlinked ?? 0)} shared child link(s) removed.`;
  if (body.signIn === 'removed') return { tone: 'success', text: `${head} The sign-in has been removed.` };
  return { tone: 'warning', text: `${head} ${SIGN_IN_PENDING}` };
}

/** Honest wording for a reject-and-restore (or restore retry) response. */
export function describeRejection(status: number, body: Record<string, unknown> | null): ActionResult {
  if (status !== 200 || !body?.ok) {
    if (body?.rejected === true && typeof body.error === 'string') return { tone: 'warning', text: body.error };
    return failure(status, body);
  }
  const restored = Number(body.coachingRestored ?? 0);
  const notRestorable = Number(body.coachingNotRestorable ?? 0);
  const head = body.state === 'already_rejected' ? 'This request is rejected; nothing was deleted.' : 'Request rejected. Nothing was deleted.';
  return {
    tone: notRestorable > 0 ? 'warning' : 'success',
    text: `${head} Coaching access restored: ${restored}${notRestorable > 0 ? `; ${notRestorable} could not be restored (changed since)` : ''}.`,
  };
}
