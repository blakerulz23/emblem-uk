export const SQUAD_INVITE_REQUEST_STATUSES = ['draft','ready_to_submit','submitted','under_review','changes_requested','resubmitted','approved','rejected','cancelled','expired'] as const;
export const SQUAD_INVITE_CAMPAIGN_STATUSES = ['inactive','approved_setup_required','active','paused','closed','cancelled','expired'] as const;
export type SquadInviteStaffPermission = 'squad_invite_reviewer' | 'squad_invite_approver';

// Production previously always returned false here regardless of the env
// var, as a hard code-level kill switch while the DPIA was still an
// unapproved draft. The DPIA is now approved (Blake, 2026-08-18) — the
// flag is a real, single environment-variable-controlled switch in every
// environment now, same as preview/development, so it stays reversible
// via Vercel env config alone rather than requiring another code change.
export function isSquadInviteMvpEnabled() {
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
