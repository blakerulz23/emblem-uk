import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountDeletionsView, { accountLabel, requestRef, type ActionRow, type DecidedRow, type PendingRow } from './AccountDeletionsView';

/**
 * The staff page body: erased_accounts is the authoritative current state,
 * an erased account is never shown by its email (only "Erased account" and a
 * short, non-identifying request reference), and an account's own later
 * self-deletion is listed as its own event.
 */
const NoActions = () => null;
const pendingRow: PendingRow = { id: 'aaaa1111-2222-4333-8444-555566667777', auth_user_id: 'u-pending', email: 'pending@example.test', blocking_reason: 'coach_authored_player_records', first_detected_at: '2026-11-14T09:00:00Z' };
const decided = (over: Partial<DecidedRow>): DecidedRow => ({ ...pendingRow, id: 'bbbb1111-2222-4333-8444-555566667777', auth_user_id: 'u-x', email: 'kept@example.test', status: 'rejected', resolved_at: '2026-11-14T10:00:00Z', ...over });
const render = (props: { decided?: DecidedRow[]; erased?: string[]; erasedAt?: Record<string, string>; actions?: ActionRow[]; pending?: PendingRow[]; decidedUnavailable?: boolean }) =>
  renderToStaticMarkup(
    <AccountDeletionsView pending={props.pending ?? []} decided={props.decided ?? []} signInPending={[]} erased={props.erased ?? []} unrestored={{}} actions={props.actions ?? []} previews={{}} Actions={NoActions} decidedUnavailable={props.decidedUnavailable} erasedAt={props.erasedAt} />
  );

describe('staff account deletions page', () => {
  it('the reference is the request id, short and upper-case, never the account id', () => {
    expect(requestRef('bbbb1111-2222-4333-8444-555566667777')).toBe('BBBB1111');
    expect(accountLabel(decided({ auth_user_id: 'cccc9999-0000' }), true)).toBe('Erased account · ref BBBB1111');
  });

  it('a pending review is shown with its email (staff may need it)', () => {
    expect(render({ pending: [pendingRow] })).toContain('pending@example.test');
  });

  it('a rejected review whose account later deleted itself reads Deleted, not Rejected, and shows no email even if one was passed', () => {
    const html = render({ decided: [decided({ auth_user_id: 'u-gone', status: 'rejected' })], erased: ['u-gone'] });
    expect(html).toContain('Erased account · ref BBBB1111');
    expect(html).toContain('Deleted');
    expect(html).not.toContain('Rejected');
    expect(html).not.toContain('@');
  });

  it('if the erased-account lookup failed, decided requests are not shown at all (never mislabelled as Rejected)', () => {
    const html = render({ decided: [], decidedUnavailable: true });
    expect(html).toContain('Could not check which of these accounts were deleted');
    expect(html).not.toContain('Rejected');
  });

  it('a Deleted row shows when the account was erased, not when the review was rejected', () => {
    const html = render({ decided: [decided({ auth_user_id: 'u-gone', status: 'rejected', resolved_at: '2026-11-09T12:00:00Z' })], erased: ['u-gone'], erasedAt: { 'u-gone': '2026-11-13T18:02:00Z' } });
    expect(html).toContain('Deleted 13 Nov 2026');
    expect(html).not.toContain('9 Nov 2026');
  });

  it('a staff-completed review reads Deleted with no email', () => {
    const html = render({ decided: [decided({ auth_user_id: 'u-done', status: 'resolved', email: null })], erased: ['u-done'] });
    expect(html).toContain('Erased account · ref BBBB1111 — Deleted');
  });

  it('a rejected review whose account still exists reads Rejected and keeps its email', () => {
    const html = render({ decided: [decided({ status: 'rejected' })] });
    expect(html).toContain('kept@example.test — Rejected (account kept)');
  });

  it('the audit list names an account’s own self-deletion as its own event, by the account itself', () => {
    const html = render({
      actions: [
        { pending_deletion_id: 'bbbb1111-2222-4333-8444-555566667777', action: 'self_deleted', outcome: 'erased_after_rejection', actor_profile_id: 'u-gone', created_at: '2026-11-14T11:00:00Z' },
        { pending_deletion_id: 'bbbb1111-2222-4333-8444-555566667777', action: 'reject', outcome: 'rejected', actor_profile_id: 'eeee0000-staff', created_at: '2026-11-14T10:00:00Z' },
      ],
    });
    expect(html).toContain('Account deleted itself · erased_after_rejection · by the account itself · ref BBBB1111');
    expect(html).toContain('Deletion rejected · rejected · by staff eeee0000… · ref BBBB1111');
  });
});
