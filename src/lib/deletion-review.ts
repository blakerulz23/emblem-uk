import { raised, type DbError } from '@/lib/route-failure';

/**
 * Migration 0098: while an account's deletion request is waiting for staff
 * review (pending_profile_deletions.status = 'pending'), the database grants
 * it no coach access. The two redeem functions return this status; the
 * staff approval, a new team request and the coach_team / coach_players
 * guards raise SQLSTATE EMDRP with this message. Nothing was changed in
 * either case, and an invite stays unused.
 */
export const DELETION_REVIEW_PENDING = 'account_deletion_review_pending';
export const DELETION_REVIEW_PENDING_SQLSTATE = 'EMDRP';

/** Shown to the account itself. */
export const COACH_ACCESS_PAUSED_MESSAGE =
  'Your coach access is paused while your account deletion request is reviewed by Emblem staff.';

/** Shown to staff approving that account's team request. */
export const STAFF_COACH_ACCESS_PAUSED_MESSAGE =
  "This coach's account deletion request is under review, so their access is paused. Reject the deletion request first if they should keep coaching.";

/** True when a database call was refused because the account's deletion is under review. */
export function isDeletionReviewPending(error: DbError): boolean {
  return error?.code === DELETION_REVIEW_PENDING_SQLSTATE || raised(error, DELETION_REVIEW_PENDING);
}
