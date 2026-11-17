import { deletionReviewResponse } from '@/lib/account-deletion-copy';

/**
 * Pure rules for the Account Settings "Delete account" flow (DeleteAccountPanel),
 * kept out of the component so each state can be tested directly.
 */

export type DeleteStep = 'idle' | 'explain' | 'reauth-code' | 'confirm' | 'done';
export type ReauthStatus = 'idle' | 'sending' | 'verifying' | 'error';

/**
 * What /api/os/account/delete reported after a successful call:
 * - review: migration 0097 filed a staff review instead (identityRetained);
 *   nothing has been deleted, and coach access may be paused (0098);
 * - partial: data erased, sign-in revocation still finishing;
 * - deleted: everything done.
 */
export type DeletionOutcome = { kind: 'review'; coachPaused: boolean } | { kind: 'partial' } | { kind: 'deleted' };

export function deletionOutcome(body: unknown): DeletionOutcome {
  const b = (body && typeof body === 'object' ? body : {}) as { identityRetained?: unknown; partial?: unknown; coachAccessSuspended?: unknown };
  if (b.identityRetained === true) return { kind: 'review', coachPaused: Number(b.coachAccessSuspended) > 0 };
  if (b.partial === true) return { kind: 'partial' };
  return { kind: 'deleted' };
}

/** The "done" message. A review never reads as "deleted" or "removed". */
export function deletionDoneMessage(outcome: DeletionOutcome): string {
  if (outcome.kind === 'review') return `${deletionReviewResponse(outcome.coachPaused)} Signing you out…`;
  if (outcome.kind === 'partial') {
    return "Your account data has been removed. We're still finishing the revocation of your sign-in — this happens automatically, no action needed. Signing you out…";
  }
  return 'Your account has been deleted. Signing you out…';
}

/** How long the done message stays before the hard navigation to /os (longer for the review explanation). */
export function deletionRedirectDelayMs(outcome: DeletionOutcome): number {
  return outcome.kind === 'review' ? 6000 : outcome.kind === 'partial' ? 3200 : 2200;
}

/**
 * The "Send code" button. It can't send until the signed-in email has loaded,
 * and says why; it can't be pressed twice while a code is being sent.
 */
export function sendCodeButton({ email, emailLoaded, reauthStatus }: { email: string | null; emailLoaded: boolean; reauthStatus: ReauthStatus }): {
  disabled: boolean;
  label: string;
  note: string | null;
} {
  if (!emailLoaded) return { disabled: true, label: 'Loading your email…', note: null };
  if (!email) return { disabled: true, label: 'Send code', note: "We couldn't load your email address. Close Account Settings and open it again." };
  if (reauthStatus === 'sending') return { disabled: true, label: 'Sending…', note: null };
  return { disabled: false, label: 'Send code', note: null };
}

/** A failed "Send code", shown on the step the person is on (Supabase's own reason, e.g. a rate limit). */
export function sendCodeFailureMessage(reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  return r ? `We couldn't send a code. ${r}` : "We couldn't send a code. Please try again.";
}

/** Cancel closes the flow and clears everything it showed, so reopening starts clean. */
export const CLEARED_DELETE_FLOW = {
  step: 'idle' as DeleteStep,
  reauthCode: '',
  reauthStatus: 'idle' as ReauthStatus,
  reauthError: null as string | null,
  deleteError: null as string | null,
};
