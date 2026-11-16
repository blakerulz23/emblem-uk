import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountDeletionPanel, { type AccountDeletionPanelProps } from './AccountDeletionPanel';
import DeletionReviewStatus from '@/app/os/overlays/DeletionReviewStatus';
import {
  COMPLETE_TYPED_WORD,
  completionAvailability,
  describeCompletion,
  describeRejection,
  validateStaffReason,
  RESULT_UNKNOWN_TEXT,
  type DeletionPreview,
} from '@/lib/staff-account-deletion';
import { deletionReviewResponse, signInErrorMessage, STAFF_ACCOUNT_DELETE_REFUSED } from '@/lib/account-deletion-copy';

/**
 * The staff page's irreversible-action UX, rendered as HTML (no browser in
 * this test environment): what is shown and what is enabled in each state.
 */
export const PREVIEW: DeletionPreview = {
  status: 'pending',
  blockingReason: null,
  accountExists: true,
  isStaffAccount: false,
  blockers: { coachAuthoredRecords: 0, squadInviteOrganiser: 0, squadInviteAudit: 0 },
  removes: { parentLinksShared: 1, childrenToDeletionReview: 1, cardsToLock: 1 },
  clears: { momentsUploaded: 3, invites: 2, ordersApproved: 0 },
  marks: { verifiedMoments: 4, cancelledRequests: 1 },
  coaching: { suspendedForReview: 1, activeAssignments: 0, directLinks: 0 },
};
const noop = () => {};
const render = (p: Partial<AccountDeletionPanelProps>) =>
  renderToStaticMarkup(
    <AccountDeletionPanel idPrefix="t" mode="review" preview={PREVIEW} reason="" stage="choose" typed="" busy={false} result={null}
      onReason={noop} onStage={noop} onTyped={noop} onReject={noop} onComplete={noop} {...p} />
  );
const buttons = (html: string) =>
  Array.from(html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)).map((m) => ({ label: m[2].replace(/&amp;/g, '&'), disabled: /disabled=""/.test(m[1]) }));
const button = (html: string, label: string) => buttons(html).find((b) => b.label === label);

describe('staff panel: choosing', () => {
  it('shows counts only, and the two actions are distinct', () => {
    const html = render({ reason: 'Records reassigned' });
    expect(html).toContain('child(ren) with no other parent: deletion request filed for staff');
    expect(html).toContain('nothing above has changed');
    expect(buttons(html).map((b) => b.label)).toEqual(['Reject & restore access', 'Complete deletion permanently…']);
  });
  it('both actions need a non-blank reason', () => {
    const html = render({ reason: '   ' });
    expect(button(html, 'Reject & restore access')?.disabled).toBe(true);
    expect(button(html, 'Complete deletion permanently…')?.disabled).toBe(true);
  });
  it('completion is unavailable while blocking records exist, and says why', () => {
    const html = render({ reason: 'ok', preview: { ...PREVIEW, blockers: { ...PREVIEW.blockers, coachAuthoredRecords: 2 } } });
    expect(button(html, 'Complete deletion permanently…')?.disabled).toBe(true);
    expect(button(html, 'Reject & restore access')?.disabled).toBe(false);
    expect(html).toContain('2 records that must be kept still block this deletion');
  });
  it('completion is unavailable for a staff account or when counts failed to load', () => {
    expect(button(render({ reason: 'ok', preview: { ...PREVIEW, isStaffAccount: true } }), 'Complete deletion permanently…')?.disabled).toBe(true);
    const failed = render({ reason: 'ok', preview: null });
    expect(failed).toContain('The counts could not be loaded');
    expect(button(failed, 'Complete deletion permanently…')?.disabled).toBe(true);
  });
});

describe('staff panel: the second confirmation for permanent completion', () => {
  it('warns it cannot be undone and stays disabled until the word is typed', () => {
    const html = render({ reason: 'ok', stage: 'confirm-complete' });
    expect(html).toContain('This cannot be undone.');
    expect(button(html, 'Permanently delete account')?.disabled).toBe(true);
    expect(button(render({ reason: 'ok', stage: 'confirm-complete', typed: 'delet' }), 'Permanently delete account')?.disabled).toBe(true);
    expect(button(render({ reason: 'ok', stage: 'confirm-complete', typed: COMPLETE_TYPED_WORD }), 'Permanently delete account')?.disabled).toBe(false);
  });
  it('the reject confirmation says nothing is deleted and coaching is restored', () => {
    const html = render({ reason: 'ok', stage: 'confirm-reject' });
    expect(html).toContain('Nothing is deleted');
    // Focus lands on Cancel (the safe choice), not on the action.
    expect(html).toMatch(/<button type="button" autofocus=""[^>]*>Cancel<\/button>/i);
    expect(button(html, 'Reject and restore access')?.disabled).toBe(false);
  });
  it('after a decision the actions are hidden; a refusal keeps them', () => {
    const done = render({ reason: 'ok', result: { tone: 'success', text: 'Deletion completed.' } });
    expect(buttons(done).map((b) => b.label)).not.toContain('Complete deletion permanently…');
    const refused = render({ reason: 'ok', result: { tone: 'error', text: 'Refused' } });
    expect(buttons(refused).map((b) => b.label)).toContain('Complete deletion permanently…');
  });
  it('retry modes offer only their own retry, never a completion or rejection, and say what the reason is for', () => {
    const signIn = render({ mode: 'retry-sign-in', preview: null, reason: 'retry' });
    expect(buttons(signIn).map((b) => b.label)).toEqual(['Retry sign-in removal']);
    expect(signIn).toContain('Reason for retrying the sign-in removal (recorded with your name)');
    const restore = render({ mode: 'retry-restore', preview: null, reason: 'retry' });
    expect(buttons(restore).map((b) => b.label)).toEqual(['Retry restoring coaching access']);
  });
  it('an empty reason says why the actions are disabled; the confirmation does not over-promise', () => {
    expect(render({ reason: '' })).toContain('Enter a reason to continue.');
    const confirm = render({ reason: 'ok', stage: 'confirm-complete' });
    expect(confirm).not.toContain('signed out everywhere');
    expect(confirm).toContain('you will be told if that step fails');
    expect(confirm).not.toContain('can no longer sign in');
    expect(confirm).toContain('aria-labelledby="t-confirm-complete-title"');
    expect(confirm).toContain('id="t-confirm-complete-title"');
  });
});

describe('honest results', () => {
  it('success, repeat, partial failure and refusal read differently', () => {
    expect(describeCompletion(200, { ok: true, state: 'completed', signIn: 'removed', childDeletionRequests: 1, childrenUnlinked: 1 })).toEqual({
      tone: 'success',
      text: 'Deletion completed. 1 child deletion request(s) filed, 1 shared child link(s) removed. The sign-in has been removed.',
    });
    expect(describeCompletion(200, { ok: true, state: 'already_completed', signIn: 'removed' }).text).toContain('nothing was erased again');
    const partial = describeCompletion(200, { ok: true, state: 'completed', signIn: 'removal_pending', signInBlocked: true });
    expect(partial.tone).toBe('warning');
    expect(partial.text).toContain('Its sign-in could not be removed yet, but it is blocked from signing in.');
    const unblocked = describeCompletion(200, { ok: true, state: 'completed', signIn: 'removal_pending', signInBlocked: false });
    expect(unblocked.text).toContain('could not be removed or blocked yet');
    expect(unblocked.text).toContain('it could still sign in and obtain new tokens');
    expect(unblocked.text).not.toContain('stops working when it expires');
    expect(describeCompletion(409, { error: 'Records that must be kept still block this deletion.' })).toEqual({ tone: 'error', text: 'Records that must be kept still block this deletion.' });
    expect(describeCompletion(0, null)).toEqual({ tone: 'error', text: RESULT_UNKNOWN_TEXT });
    expect(describeCompletion(504, null)).toEqual({ tone: 'error', text: RESULT_UNKNOWN_TEXT });
    expect(describeRejection(500, { ok: false, rejected: true, error: 'The request was rejected, but coaching access could not be restored. Try again to restore it.' }).tone).toBe('warning');
    expect(describeRejection(200, { ok: true, state: 'rejected', coachingRestored: 2, coachingNotRestorable: 0 }).text).toBe('Request rejected. Nothing was deleted. Coaching access restored: 2.');
    expect(describeRejection(200, { ok: true, state: 'rejected', coachingRestored: 1, coachingNotRestorable: 1 }).tone).toBe('warning');
  });
  it('reason rules match the database (non-blank, at most 500)', () => {
    expect(validateStaffReason(' ')).not.toBeNull();
    expect(validateStaffReason('x'.repeat(500))).toBeNull();
    expect(validateStaffReason('x'.repeat(501))).not.toBeNull();
    expect(completionAvailability({ ...PREVIEW, status: 'rejected' })).toEqual({ ok: false, why: 'This request is no longer pending.' });
  });
});

describe('user-facing copy', () => {
  it('the review response, with and without paused coaching, never says data was removed or promises an email', () => {
    expect(deletionReviewResponse(false)).toBe('Your account deletion request is being reviewed by Emblem staff. Nothing has been permanently deleted yet.');
    expect(deletionReviewResponse(true)).toBe(
      'Your account deletion request is being reviewed by Emblem staff. Nothing has been permanently deleted yet. Your coaching access is paused while the request is reviewed.'
    );
    for (const t of [deletionReviewResponse(true), STAFF_ACCOUNT_DELETE_REFUSED]) expect(t).not.toMatch(/removed|email|in touch/i);
  });
  it('the Account Settings status', () => {
    const plain = renderToStaticMarkup(<DeletionReviewStatus coachAccessPaused={false} />);
    expect(plain).toContain('Deletion request under review');
    expect(plain).toContain('Your account and family data remain in place while Emblem staff review your request.');
    expect(plain).not.toContain('coaching');
    expect(renderToStaticMarkup(<DeletionReviewStatus coachAccessPaused />)).toContain('Your coaching access is currently paused.');
  });
  it('an erased account trying to sign in is told plainly (no raw "User is banned")', () => {
    expect(signInErrorMessage({ code: 'user_banned', message: 'User is banned' })).toBe("This account has been deleted, so it can't be used to sign in.");
    expect(signInErrorMessage({ code: 'account_erased' })).toBe("This account has been deleted, so it can't be used to sign in.");
    expect(signInErrorMessage({ message: 'Token has expired or is invalid' })).toBe('Token has expired or is invalid');
  });
  it('the staff refusal tells them to contact another authorised member of staff', () => {
    expect(STAFF_ACCOUNT_DELETE_REFUSED).toContain('Ask another authorised member of Emblem staff to remove your staff access first');
  });
});
