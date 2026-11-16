/**
 * User-facing wording for account deletion (migrations 0097/0098).
 *
 * While a deletion request is under staff review nothing is permanently
 * deleted: parent links, children's cards and records, uploads and invites
 * stay in place; only coaching access is paused (and only for accounts that
 * had it). Never say data has been removed, and never promise an email:
 * nothing sends one for this case.
 */
export const DELETION_REVIEW_RESPONSE =
  'Your account deletion request is being reviewed by Emblem staff. Nothing has been permanently deleted yet.';
export const DELETION_REVIEW_COACHING_PAUSED = 'Your coaching access is paused while the request is reviewed.';

/** The response to a deletion request that went to staff review. */
export function deletionReviewResponse(coachingPaused: boolean): string {
  return coachingPaused ? `${DELETION_REVIEW_RESPONSE} ${DELETION_REVIEW_COACHING_PAUSED}` : DELETION_REVIEW_RESPONSE;
}

/** Account Settings status while the request is under review. */
export const SETTINGS_REVIEW_TITLE = 'Deletion request under review';
export const SETTINGS_REVIEW_BODY = 'Your account and family data remain in place while Emblem staff review your request.';
export const SETTINGS_REVIEW_COACHING_PAUSED = 'Your coaching access is currently paused.';

/** Migration 0098 refuses staff accounts; staff access is removed by the two-person manual procedure first. */
export const STAFF_ACCOUNT_DELETE_REFUSED =
  "Staff accounts can't be deleted here. Ask another authorised member of Emblem staff to remove your staff access first; you can then delete your account in the usual way.";

/** A session whose account has been erased (migration 0097 erased_accounts). */
export const ACCOUNT_ERASED_MESSAGE = 'This account has been deleted.';
export const ACCOUNT_ERASED_CODE = 'ACCOUNT_ERASED';
/** An API call made while the erased-account check could not be answered (it fails closed for APIs). */
export const ACCOUNT_CHECK_UNAVAILABLE_MESSAGE = 'Emblem is briefly unavailable. Please try again in a moment.';

/** Query flag the middleware adds when it sends an erased account back to the signed-out OS. */
export const ACCOUNT_ERASED_QUERY = 'account_deleted';
export const ACCOUNT_ERASED_SIGN_IN = "This account has been deleted, so it can't be used to sign in.";

/**
 * Sign-in error text. A deleted account's login is banned until its removal
 * finishes (the app bans no one else), so a ban reads as "deleted"; any
 * other error keeps its own message.
 */
export function signInErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === 'account_erased' || error.code === 'user_banned' || /banned/i.test(error.message ?? '')) return ACCOUNT_ERASED_SIGN_IN;
  return error.message ?? 'Something went wrong. Please try again.';
}
