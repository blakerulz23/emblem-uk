import { postJson } from './builder-authority-client';

/**
 * Pure client-side logic for guardian-controlled card-front sharing (Work
 * Package B, draft/unreleased — stacked on the Adult Permission fix). Kept
 * in a plain .ts module, same reason as builder-authority-client.ts: this
 * repo's vitest setup has no JSX transform, so a .tsx component can't be
 * imported by a test at all — logic worth proving lives here, the
 * component (ShareCardSheet.tsx) is a thin wiring layer around it.
 *
 * This module never renders or captures an image itself (that requires a
 * real DOM element and lives in the component) — it owns eligibility
 * lookup, consent recording, and the small state machine driving the
 * confirm/cancel sheet, all reusing postJson (fetch-with-timeout-backed,
 * same CSRF header, same generic-failure shape) from builder-authority-
 * client.ts rather than a second copy of that plumbing.
 */

export const CARD_SHARE_CONSENT_VERSION = 'card_share_consent_v1';

export const CARD_SHARE_WARNING =
  "This image contains the young player's photograph, card design and club/team branding. Anyone you send it to may save or share it again.";

export const CARD_SHARE_CONFIRMATION_LABEL =
  'I understand and choose to share this card image outside Emblem.';

export const CARD_SHARE_RECALL_NOTICE =
  'Emblem cannot recall copies already downloaded, sent, saved or reposted by other people or social platforms.';

/** Fixed, internal reason vocabulary from get_card_share_eligibility — never
 *  shown to a user verbatim; cardShareBlockedMessage below maps each to
 *  plain, truthful copy. 'multi_child_order' is not mapped to a message at
 *  all — the caller should hide the section entirely for that reason,
 *  exactly as it would for a guardian_approved/other-adult order that the
 *  eligibility check simply reports as 'not_authorized'. */
export type CardShareIneligibleReason =
  | 'not_authenticated'
  | 'not_authorized'
  | 'multi_child_order'
  | 'card_suspended'
  | 'card_revoked'
  | 'design_not_permitted';

export type CardShareEligibility =
  | { eligible: true; cardId: string; artworkCardDefinitionId: string }
  | { eligible: false; reason: CardShareIneligibleReason };

/** Reasons that mean "hide the section entirely" rather than "show it in a
 *  blocked state" — the guardian was never in a position to share in the
 *  first place (wrong builder mode, or not the verified guardian at all),
 *  as opposed to a specific, nameable reason worth surfacing about a card
 *  they otherwise could have shared. */
export function shouldHideCardShareEntirely(reason: CardShareIneligibleReason): boolean {
  return reason === 'not_authenticated' || reason === 'not_authorized' || reason === 'multi_child_order';
}

const BLOCKED_MESSAGES: Record<Exclude<CardShareIneligibleReason, 'not_authenticated' | 'not_authorized' | 'multi_child_order'>, string> = {
  card_suspended: 'This card is currently suspended. Sharing is unavailable until it is reinstated.',
  card_revoked: 'This card is no longer active. Sharing is not available.',
  design_not_permitted: 'Sharing is not available for this design.',
};

export function cardShareBlockedMessage(reason: CardShareIneligibleReason): string {
  if (reason === 'not_authenticated' || reason === 'not_authorized' || reason === 'multi_child_order') {
    // Defensive fallback only — callers are expected to check
    // shouldHideCardShareEntirely() first and never render a message for
    // these reasons at all.
    return 'Sharing is not available for this design.';
  }
  return BLOCKED_MESSAGES[reason];
}

export async function fetchCardShareEligibility(orderId: string): Promise<CardShareEligibility> {
  const result = await postJson('/api/card-share/eligibility', { orderId });
  if (result.ok && typeof result.eligible === 'boolean') {
    if (result.eligible && typeof result.cardId === 'string' && typeof result.artworkCardDefinitionId === 'string') {
      return { eligible: true, cardId: result.cardId, artworkCardDefinitionId: result.artworkCardDefinitionId };
    }
    if (!result.eligible && typeof result.reason === 'string') {
      return { eligible: false, reason: result.reason as CardShareIneligibleReason };
    }
  }
  // Fail closed: any malformed/unexpected response is treated as "not
  // authorized" (hidden), never as eligible.
  return { eligible: false, reason: 'not_authorized' };
}

export async function recordCardShareConsent(orderId: string, result: 'confirmed' | 'cancelled'): Promise<{ ok: boolean; error?: string }> {
  return postJson('/api/card-share/consent', { orderId, consentVersion: CARD_SHARE_CONSENT_VERSION, result });
}

/**
 * The share sheet's own state machine — separate from confirmSubmitReducer
 * (builder-authority-client.ts) because the shape genuinely differs (a
 * multi-stage flow: closed -> warning/confirm -> preparing -> one of
 * several distinct outcome states), but the same atomic-state principle
 * applies: every stage transition is one value, never two independent
 * flags that could theoretically desynchronise.
 */
export type CardShareStage =
  | { type: 'closed' }
  | { type: 'confirming'; checked: boolean }
  | { type: 'preparing' }
  | { type: 'shared' }
  | { type: 'downloaded' }
  | { type: 'cancelled' }
  | { type: 'failed'; message: string };

export type CardShareAction =
  | { type: 'open' }
  | { type: 'toggle-checked' }
  | { type: 'cancel' }
  | { type: 'start-preparing' }
  | { type: 'shared' }
  | { type: 'downloaded' }
  | { type: 'fail'; message: string }
  | { type: 'reset' };

export function cardShareStageReducer(state: CardShareStage, action: CardShareAction): CardShareStage {
  switch (action.type) {
    case 'open':
      return { type: 'confirming', checked: false };
    case 'toggle-checked':
      return state.type === 'confirming' ? { type: 'confirming', checked: !state.checked } : state;
    case 'cancel':
      return { type: 'cancelled' };
    case 'start-preparing':
      return { type: 'preparing' };
    case 'shared':
      return { type: 'shared' };
    case 'downloaded':
      return { type: 'downloaded' };
    case 'fail':
      return { type: 'failed', message: action.message };
    case 'reset':
      return { type: 'closed' };
  }
}

export const CARD_SHARE_GENERIC_FAILURE = 'We could not prepare this image right now. Please try again.';
