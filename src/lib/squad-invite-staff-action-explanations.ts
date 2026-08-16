import type { SquadInviteStaffPermission } from './squad-invite-mvp';

export type SquadInviteReviewAction = 'start_review' | 'request_changes' | 'reject' | 'approve' | 'cancel' | 'resend';

// Mirrors the exact permission each route enforces server-side — see
// src/app/api/staff/squad-invites/[id]/review/route.ts,
// .../approve/route.ts, .../cancel-approval/route.ts and
// .../notifications/[outboxId]/resend/route.ts. This map is display-only:
// changing it changes nothing about what the server actually allows.
export const SQUAD_INVITE_ACTION_PERMISSION: Record<SquadInviteReviewAction, SquadInviteStaffPermission> = {
  start_review: 'squad_invite_reviewer',
  request_changes: 'squad_invite_reviewer',
  reject: 'squad_invite_reviewer',
  approve: 'squad_invite_approver',
  cancel: 'squad_invite_approver',
  resend: 'squad_invite_approver',
};

export const SQUAD_INVITE_ACTION_LABEL: Record<SquadInviteReviewAction, string> = {
  start_review: 'Start review',
  request_changes: 'Request changes',
  reject: 'Reject',
  approve: 'Approve',
  cancel: 'Cancel approval',
  resend: 'Prepare disabled/test resend',
};

const PERMISSION_LABEL: Record<SquadInviteStaffPermission, string> = {
  squad_invite_reviewer: 'Reviewer',
  squad_invite_approver: 'Approver',
};

// Which request_status values each action is valid for — matches the
// conditions the review actions UI has always gated on, now used to
// explain rather than just hide. 'cancel' has no reason-column entry
// below because it's gated structurally (only rendered once approved,
// see ReviewActions.tsx), same as 'resend' (gated by outbox existence).
const ACTION_VALID_STATUSES: Partial<Record<SquadInviteReviewAction, readonly string[]>> = {
  start_review: ['submitted', 'resubmitted'],
  request_changes: ['under_review'],
  reject: ['under_review'],
  approve: ['under_review'],
  cancel: ['approved'],
};

const ACTION_STATUS_EXPLANATION: Partial<Record<SquadInviteReviewAction, string>> = {
  start_review: 'This request must be submitted or resubmitted before review can start.',
  request_changes: 'This request must be under review before changes can be requested.',
  reject: 'This request must be under review before it can be rejected.',
  approve: 'This request must be under review before it can be approved.',
  cancel: 'This request must be approved before its approval can be cancelled.',
};

const ACTIONS_REQUIRING_REASON = new Set<SquadInviteReviewAction>(['request_changes', 'reject', 'cancel']);

/**
 * "Reviewer", "Approver", "Reviewer and Approver" or "No Squad Invite
 * permission" — the four states the identity panel and per-action
 * explanations both describe. Reviewer and Approver are two independent
 * grants; holding one never implies the other.
 */
export function squadInvitePermissionSummary(permissions: SquadInviteStaffPermission[]): string {
  const hasReviewer = permissions.includes('squad_invite_reviewer');
  const hasApprover = permissions.includes('squad_invite_approver');
  if (hasReviewer && hasApprover) return 'Reviewer and Approver';
  if (hasReviewer) return 'Reviewer';
  if (hasApprover) return 'Approver';
  return 'No Squad Invite permission';
}

/**
 * Returns null when `action` is currently available to this identity, or a
 * specific, accessible explanation of why it is not — checked in the same
 * order the server itself would reject the request (permission, then
 * request state, then a required reason), so the message always names the
 * actual blocking condition rather than a generic catch-all. This is
 * explanatory only: it never changes what an API route accepts, and a
 * button left enabled by this function can still be rejected server-side
 * (e.g. another staff member changed the request's state first).
 */
export function explainSquadInviteAction(
  action: SquadInviteReviewAction,
  context: { email: string; permissions: SquadInviteStaffPermission[]; status: string; hasReason: boolean },
): string | null {
  const requiredPermission = SQUAD_INVITE_ACTION_PERMISSION[action];
  if (!context.permissions.includes(requiredPermission)) {
    const held = squadInvitePermissionSummary(context.permissions);
    const heldPhrase = held === 'No Squad Invite permission' ? 'no Squad Invite permission' : `${held} permission`;
    return `You are signed in as ${context.email}. This account has ${heldPhrase} but ${SQUAD_INVITE_ACTION_LABEL[action]} requires ${PERMISSION_LABEL[requiredPermission]} permission.`;
  }
  const validStatuses = ACTION_VALID_STATUSES[action];
  if (validStatuses && !validStatuses.includes(context.status)) {
    return ACTION_STATUS_EXPLANATION[action] ?? 'This action is not available for the request in its current state.';
  }
  if (ACTIONS_REQUIRING_REASON.has(action) && !context.hasReason) {
    return 'A required organiser-visible reason is missing.';
  }
  return null;
}
