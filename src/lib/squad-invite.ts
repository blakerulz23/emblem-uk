import { createHash, randomBytes } from 'crypto';

export const COMPLETION_GRACE_HOURS = 24;
export const PAYMENT_WINDOW_HOURS = 72;

// Matches the live squad_invites_campaign_status_check constraint exactly
// (migration 0052, the latest redefinition) — 'inactive', 'approved_setup_
// required', 'paused' and 'closed' were added to the database enum there
// but never added here until 0066 needed 'closed' for early closure.
export type CampaignStatus =
  | 'draft' | 'awaiting_staff_approval' | 'inactive' | 'approved_setup_required'
  | 'active' | 'deadline_reached' | 'grace_period' | 'pricing_finalised'
  | 'paused' | 'closed' | 'cancelled' | 'expired' | 'exception';

export type OrganiserRole =
  | 'coach_or_club_representative' | 'team_manager'
  | 'parent_representative' | 'emblem_staff';

export function createBuilderToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashBuilderToken(token) };
}

export function hashBuilderToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function effectiveCampaignStatus(
  stored: CampaignStatus,
  deadlineAt: string,
  now = new Date(),
): CampaignStatus {
  if (stored !== 'active' && stored !== 'deadline_reached' && stored !== 'grace_period') return stored;
  const deadline = new Date(deadlineAt);
  if (!Number.isFinite(deadline.getTime())) throw new Error('Invalid campaign deadline');
  const graceEnd = new Date(deadline.getTime() + COMPLETION_GRACE_HOURS * 60 * 60 * 1000);
  if (now < deadline) return 'active';
  if (now < graceEnd) return 'grace_period';
  return 'deadline_reached';
}

export function mayStartBuilder(status: CampaignStatus): boolean {
  return status === 'active';
}

export function mayCompleteExistingBuilder(status: CampaignStatus): boolean {
  return status === 'active' || status === 'grace_period';
}

export function paymentDeadline(issuedAt: Date): Date {
  if (!Number.isFinite(issuedAt.getTime())) throw new Error('Invalid issued timestamp');
  return new Date(issuedAt.getTime() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
}

export function minimalDistributionLabel(input: {
  firstName: string;
  surnameInitial: string;
  squadNumber?: number | null;
  packageReference: string;
}): string {
  const firstName = input.firstName.trim();
  const initial = input.surnameInitial.trim().toUpperCase();
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,50}$/.test(firstName) || !/^[A-Z]$/.test(initial)) {
    throw new Error('A staff-reviewed packaging exception is required');
  }
  const number = input.squadNumber == null ? '' : ` — No. ${input.squadNumber}`;
  return `${firstName} ${initial}.${number} — Package ${input.packageReference}`;
}

export const SQUAD_INVITE_ANALYTICS_EVENTS = [
  'campaign_created','campaign_published','invitation_opened','builder_started',
  'commitment_completed','checkout_initiated','payment_confirmed','campaign_tier_changed',
  'campaign_closed','coach_card_unlocked','support_requested',
] as const;

export type SquadInviteAnalyticsEvent = typeof SQUAD_INVITE_ANALYTICS_EVENTS[number];

export interface SquadInviteAnalytics {
  track(event: SquadInviteAnalyticsEvent, attributes: { campaignId: string; participationId?: string }): Promise<void>;
}

export const internalSquadInviteAnalytics: SquadInviteAnalytics = {
  async track() {
    // Intentionally no external analytics supplier. Database audit events are
    // the approved internal boundary and must contain opaque references only.
  },
};
