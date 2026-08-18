import { describe, expect, it } from 'vitest';
import { explainSquadInviteAction, squadInvitePermissionSummary } from './squad-invite-staff-action-explanations';

describe('squadInvitePermissionSummary', () => {
  it('reports Reviewer for a reviewer-only identity', () => {
    expect(squadInvitePermissionSummary(['squad_invite_reviewer'])).toBe('Reviewer');
  });
  it('reports Approver for an approver-only identity', () => {
    expect(squadInvitePermissionSummary(['squad_invite_approver'])).toBe('Approver');
  });
  it('reports both permissions together, not one implying the other', () => {
    expect(squadInvitePermissionSummary(['squad_invite_reviewer', 'squad_invite_approver'])).toBe('Reviewer and Approver');
  });
  it('reports "No Squad Invite permission" for an identity holding neither', () => {
    expect(squadInvitePermissionSummary([])).toBe('No Squad Invite permission');
  });
});

describe('explainSquadInviteAction', () => {
  const EMAIL = 'coach.reviewer@example.invalid';

  it('matches the specified wording exactly for an Approver-only identity attempting Start review', () => {
    const message = explainSquadInviteAction('start_review', { email: EMAIL, permissions: ['squad_invite_approver'], status: 'submitted', hasReason: false });
    expect(message).toBe(`You are signed in as ${EMAIL}. This account has Approver permission but Start review requires Reviewer permission.`);
  });

  it('contains the specified wording for a Reviewer-only identity attempting Approve', () => {
    const message = explainSquadInviteAction('approve', { email: EMAIL, permissions: ['squad_invite_reviewer'], status: 'under_review', hasReason: false });
    expect(message).toContain('This account has Reviewer permission but Approve requires Approver permission.');
  });

  it('explains a zero-permission identity as "no Squad Invite permission", never as "Reviewer and Approver"', () => {
    const message = explainSquadInviteAction('reject', { email: EMAIL, permissions: [], status: 'under_review', hasReason: true });
    expect(message).toContain('This account has no Squad Invite permission but Reject requires Reviewer permission.');
    expect(message).not.toContain('Reviewer and Approver');
  });

  it('matches the specified wording exactly for Approve blocked purely by request state', () => {
    const message = explainSquadInviteAction('approve', { email: EMAIL, permissions: ['squad_invite_approver'], status: 'submitted', hasReason: false });
    expect(message).toBe('This request must be under review before it can be approved.');
  });

  it('matches the specified wording exactly for a missing organiser-visible reason', () => {
    const message = explainSquadInviteAction('request_changes', { email: EMAIL, permissions: ['squad_invite_reviewer'], status: 'under_review', hasReason: false });
    expect(message).toBe('A required organiser-visible reason is missing.');
  });

  it('returns null (available) once permission, status and any required reason all line up', () => {
    expect(explainSquadInviteAction('request_changes', { email: EMAIL, permissions: ['squad_invite_reviewer'], status: 'under_review', hasReason: true })).toBeNull();
    expect(explainSquadInviteAction('approve', { email: EMAIL, permissions: ['squad_invite_approver'], status: 'under_review', hasReason: false })).toBeNull();
    expect(explainSquadInviteAction('start_review', { email: EMAIL, permissions: ['squad_invite_reviewer'], status: 'resubmitted', hasReason: false })).toBeNull();
  });

  it('checks permission ahead of request state — a permission mismatch is reported even when the status is also wrong', () => {
    const message = explainSquadInviteAction('approve', { email: EMAIL, permissions: ['squad_invite_reviewer'], status: 'submitted', hasReason: false });
    expect(message).toContain('requires Approver permission');
    expect(message).not.toContain('under review');
  });

  it('reviewer permission never satisfies an approver-only action, and vice versa, across the whole action set', () => {
    expect(explainSquadInviteAction('cancel', { email: EMAIL, permissions: ['squad_invite_reviewer'], status: 'approved', hasReason: true })).toContain('requires Approver permission');
    expect(explainSquadInviteAction('resend', { email: EMAIL, permissions: ['squad_invite_reviewer'], status: 'under_review', hasReason: true })).toContain('requires Approver permission');
    expect(explainSquadInviteAction('start_review', { email: EMAIL, permissions: ['squad_invite_approver'], status: 'submitted', hasReason: false })).toContain('requires Reviewer permission');
  });

  it('an identity holding both permissions is never blocked by a permission mismatch on any action', () => {
    const both: Array<'squad_invite_reviewer' | 'squad_invite_approver'> = ['squad_invite_reviewer', 'squad_invite_approver'];
    for (const action of ['start_review', 'request_changes', 'reject', 'approve', 'cancel', 'resend'] as const) {
      const message = explainSquadInviteAction(action, { email: EMAIL, permissions: both, status: 'under_review', hasReason: true });
      expect(message === null || !message.includes('requires')).toBe(true);
    }
  });
});
