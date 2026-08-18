export type SquadInviteEmailTemplate = 'request_received'|'changes_requested'|'approved_link_ready'|'rejected'|'notification_failure_internal';

const subjects: Record<SquadInviteEmailTemplate, string> = {
  request_received: 'Your Squad Invite request has been received',
  changes_requested: 'Changes needed for your Emblem Squad Invite',
  approved_link_ready: 'Your Emblem Squad Invite link is ready',
  rejected: 'Update on your Emblem Squad Invite request',
  notification_failure_internal: 'Squad Invite notification needs attention',
};

export function renderSquadInviteEmailPreview(template: SquadInviteEmailTemplate, input: { teamName: string; publicReference: string; organiserVisibleReason?: string }) {
  const safeTeam = input.teamName.trim();
  const safeReference = input.publicReference.trim();
  const body = template === 'approved_link_ready'
    ? `Your Squad Invite for ${safeTeam} has been approved. Open your authenticated organiser page to finish delivery setup. The parent invitation is not included in this email.`
    : template === 'changes_requested'
      ? `Emblem has requested changes to ${safeTeam}. ${input.organiserVisibleReason ?? ''}`.trim()
      : template === 'rejected'
        ? `There is an update on ${safeTeam}. ${input.organiserVisibleReason ?? ''}`.trim()
        : template === 'notification_failure_internal'
          ? `A disabled/test notification for ${safeReference} requires staff attention.`
          : `We received the Squad Invite request for ${safeTeam}. Reference: ${safeReference}. We aim to review controlled-pilot requests within two business days.`;
  return { senderDisplayName: 'Emblem', deliveryMode: 'disabled_test' as const, subject: subjects[template], body };
}
