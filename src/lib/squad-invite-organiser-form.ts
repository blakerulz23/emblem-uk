export const ORGANISER_DECLARATIONS = [
  'authorityAccepted',
  'deliveryRecipientAccepted',
  'independentParticipationAccepted',
  'staffReviewAccepted',
] as const;

export type OrganiserForm = {
  organiserName: string;
  organiserRole: string;
  teamName: string;
  ageGroup: string;
  expectedSquadSize: string;
  deadlineAt: string;
  deliveryRecipientName: string;
  deliveryRecipientRole: string;
  ukDeliveryConfirmed: boolean;
  authorityAccepted: boolean;
  deliveryRecipientAccepted: boolean;
  independentParticipationAccepted: boolean;
  staffReviewAccepted: boolean;
  badgeAuthorityAccepted: boolean;
};

export type FormError = { field: keyof OrganiserForm; message: string };

export const initialOrganiserForm: OrganiserForm = {
  organiserName: '', organiserRole: 'coach_or_club_representative', teamName: '', ageGroup: '',
  expectedSquadSize: '', deadlineAt: '', deliveryRecipientName: '', deliveryRecipientRole: '',
  ukDeliveryConfirmed: false, authorityAccepted: false, deliveryRecipientAccepted: false,
  independentParticipationAccepted: false, staffReviewAccepted: false, badgeAuthorityAccepted: false,
};

const canonicalDate = /^\d{4}-\d{2}-\d{2}$/;

export function calendarDateInTimeZone(now: Date, timeZone = 'Europe/London') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isCanonicalCalendarDate(value: string) {
  if (!canonicalDate.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/** A deadline is valid when its native YYYY-MM-DD value is after today's calendar date in Europe/London. */
export function validateOrganiserForm(form: OrganiserForm, now = new Date()): FormError[] {
  const errors: FormError[] = [];
  const requiredText: Array<[keyof OrganiserForm, string]> = [
    ['organiserName', 'Enter the organiser full name.'],
    ['organiserRole', 'Select the organiser role.'],
    ['teamName', 'Enter the team or club display name.'],
    ['ageGroup', 'Enter the football age group.'],
    ['expectedSquadSize', 'Enter an estimated squad size of at least 1.'],
    ['deadlineAt', 'Choose a valid invitation deadline.'],
    ['deliveryRecipientName', 'Enter the delivery-recipient name.'],
    ['deliveryRecipientRole', 'Enter the delivery-recipient role.'],
  ];
  for (const [field, message] of requiredText) {
    if (!String(form[field]).trim()) errors.push({ field, message });
  }
  if (form.expectedSquadSize.trim() && (!Number.isInteger(Number(form.expectedSquadSize)) || Number(form.expectedSquadSize) < 1)) {
    errors.push({ field: 'expectedSquadSize', message: 'Estimated squad size must be a whole number of at least 1.' });
  }
  if (form.deadlineAt && (!isCanonicalCalendarDate(form.deadlineAt) || form.deadlineAt <= calendarDateInTimeZone(now))) {
    errors.push({ field: 'deadlineAt', message: 'Choose a deadline after today.' });
  }
  if (!form.ukDeliveryConfirmed) errors.push({ field: 'ukDeliveryConfirmed', message: 'Confirm that consolidated delivery will be to a UK recipient.' });
  const declarationMessages: Record<(typeof ORGANISER_DECLARATIONS)[number], string> = {
    authorityAccepted: 'Confirm your authority to create and share this Squad Invite.',
    deliveryRecipientAccepted: 'Confirm the delivery recipient has agreed.',
    independentParticipationAccepted: 'Confirm that each parent participates independently.',
    staffReviewAccepted: 'Confirm that staff approval is required.',
  };
  for (const field of ORGANISER_DECLARATIONS) if (!form[field]) errors.push({ field, message: declarationMessages[field] });
  return errors;
}

export function formatDeadline(value: string) {
  if (!isCanonicalCalendarDate(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

/** Mirrors pricing-engine.ts's MULTI_MIN_PLAYERS/SQUAD_MIN_PLAYERS and the
 * same two numbers hardcoded in resolve_squad_invite_link()
 * (0051_squad_invite_reusable_links.sql). Kept as a local copy rather than
 * an import — pricing-engine.ts is explicitly staged as "not yet imported
 * by any production code path" pending its own separate approval, and this
 * is a projection from the organiser's own estimate, not the same live
 * tier the join page computes from real commitments. Keep in sync if
 * either source ever changes. */
export const PROJECTED_MULTI_MIN = 2;
export const PROJECTED_SQUAD_MIN = 10;

export type SquadIncentiveProjection = { tier: 'single' | 'multi' | 'squad'; headline: string; detail: string };

/** A projection only — the organiser hasn't submitted anything yet, and no
 * parent has joined, so this must never be worded as a promise. Returns
 * null for an empty/invalid estimate so callers can skip rendering. */
export function projectedSquadIncentive(expectedSquadSize: string): SquadIncentiveProjection | null {
  const count = Number(expectedSquadSize);
  if (!expectedSquadSize.trim() || !Number.isInteger(count) || count < 1) return null;
  if (count >= PROJECTED_SQUAD_MIN) {
    return {
      tier: 'squad',
      headline: 'Projected: Full Squad pricing',
      detail: `An estimated ${count} players would qualify for the lowest price per card, plus a free coach card.`,
    };
  }
  if (count >= PROJECTED_MULTI_MIN) {
    const remaining = PROJECTED_SQUAD_MIN - count;
    return {
      tier: 'multi',
      headline: 'Projected: Multi-player pricing',
      detail: `${remaining} more ${remaining === 1 ? 'player' : 'players'} would unlock Full Squad pricing and a free coach card.`,
    };
  }
  const remaining = PROJECTED_MULTI_MIN - count;
  return {
    tier: 'single',
    headline: 'Projected: Single-player pricing',
    detail: `${remaining} more ${remaining === 1 ? 'player' : 'players'} would unlock Multi-player pricing.`,
  };
}
