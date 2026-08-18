export const SQUAD_INVITE_REQUEST_STATUSES = ['draft','ready_to_submit','submitted','under_review','changes_requested','resubmitted','approved','rejected','cancelled','expired'] as const;
export const SQUAD_INVITE_CAMPAIGN_STATUSES = ['inactive','approved_setup_required','active','paused','closed','cancelled','expired'] as const;
export type SquadInviteStaffPermission = 'squad_invite_reviewer' | 'squad_invite_approver';

export function isSquadInviteMvpEnabled() {
  if (process.env.VERCEL_ENV === 'production') return false;
  return process.env.SQUAD_INVITE_MVP_ENABLED === 'true';
}

export const LOCKED_CHILD_BUILDER_CONTRACT = {
  oneChildOnly: true,
  paymentEnabled: false,
  publicProfileEnabled: false,
  rosterAccess: false,
  serverOwnershipRequired: true,
  participationCredentialRequired: true,
} as const;
