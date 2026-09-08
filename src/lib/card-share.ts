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

/**
 * emblem.cards is a DIFFERENT, unrelated product (a separate live site
 * with its own real customers) — this constant previously pointed there
 * by mistake. Fixed to this app's own domain. This is the generic/preview
 * link only, shown in the confirm dialog before a real per-share link
 * exists (see cardSharePublicPageUrl/buildCardShareMessageText below for
 * what's actually sent once the guardian clicks Share now).
 */
export const CARD_SHARE_LINK_URL = 'https://emblem-uk.vercel.app/builder';

export const CARD_SHARE_MESSAGE_TEXT =
  `Look what I made with Emblem.\nCreate your own card: ${CARD_SHARE_LINK_URL}`;

/**
 * Founder-approved public share page (migration 0085) — see that
 * migration's own header comment for the explicit, informed decision this
 * represents. Every real share now links to a per-share page showing the
 * actual card (viewable by anyone with the link, for 7 days), not the
 * bare generic builder URL above — that URL is now only ever shown as an
 * approximate preview before the guardian has actually committed to
 * sharing (creating the public page requires a confirmed consent event,
 * so it can't exist yet at preview time).
 */
export function cardSharePublicPageUrl(token: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk.vercel.app';
  return `${siteUrl}/card-share/${token}`;
}

/**
 * FOUNDER-REPORTED BUG (fixed): this previously reused
 * CARD_SHARE_MESSAGE_TEXT's "Create your own card" wording for `shareUrl`
 * too — accurate for the generic /builder link that copy was written for,
 * but wrong here: `shareUrl` is the real per-card public page (migration
 * 0085), which shows THIS specific card, not a blank builder a recipient
 * could use to start their own. Now describes each link by what it
 * actually does — viewing this card vs. starting a new one — rather than
 * describing both the same way.
 */
export function buildCardShareMessageText(shareUrl: string): string {
  return `Look what I made with Emblem.\nView my card: ${shareUrl}\nCreate your own: ${CARD_SHARE_LINK_URL}`;
}

/**
 * Uploads the already-generated share image and creates the public page
 * (migration 0085) — re-verifies eligibility itself server-side, never
 * trusting this call's own prior eligibility check. Must be called AFTER
 * recordCardShareConsent('confirmed') has already succeeded for this
 * attempt, same ordering discipline as image generation itself.
 */
export async function createCardSharePublicPage(orderId: string, imageDataUrl: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const result = await postJson('/api/card-share/public-page', { orderId, imageDataUrl });
  if (result.ok && typeof result.token === 'string') {
    return { ok: true, token: result.token };
  }
  return { ok: false, error: typeof result.error === 'string' ? result.error : undefined };
}

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
  /**
   * The image and public link are ready, but the native share sheet either
   * isn't supported on this device/browser, or was attempted and rejected
   * for a reason other than the guardian cancelling it (most notably: the
   * async work before this point — recording consent, generating the
   * image, creating the public page — can run long enough to lose the
   * "user activation" window some browsers require navigator.share to be
   * called within, which otherwise silently looked identical to "not
   * supported"). Either way, this is never resolved by quietly downloading
   * a file under a button labelled Share — the guardian is shown explicit,
   * separately-labelled choices instead.
   */
  | { type: 'manual-options'; reason: 'unsupported' | 'share-failed' }
  | { type: 'cancelled' }
  | { type: 'failed'; message: string };

export type CardShareAction =
  | { type: 'open' }
  | { type: 'toggle-checked' }
  | { type: 'cancel' }
  | { type: 'start-preparing' }
  | { type: 'shared' }
  | { type: 'downloaded' }
  | { type: 'manual-options'; reason: 'unsupported' | 'share-failed' }
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
    case 'manual-options':
      return { type: 'manual-options', reason: action.reason };
    case 'fail':
      return { type: 'failed', message: action.message };
    case 'reset':
      return { type: 'closed' };
  }
}

export const CARD_SHARE_GENERIC_FAILURE = 'We could not prepare this image right now. Please try again.';

/**
 * Deliberately distinct wording per failure stage (capture vs. link
 * creation vs. finishing the share) — a live-reported failure kept
 * surfacing CARD_SHARE_GENERIC_FAILURE with no way to tell, from the
 * screenshot alone, which of three genuinely different steps had actually
 * failed. Whichever exact message a guardian reports next now identifies
 * the stage without needing server logs.
 */
export const CARD_SHARE_CAPTURE_FAILURE = 'We could not prepare your card image. Please try again.';
export const CARD_SHARE_LINK_FAILURE = 'We could not create your shareable link. Please try again.';

/**
 * FOUNDER-REQUESTED (live-reported crop/framing mismatch between the
 * on-screen preview and the downloaded/shared image, still open): a static
 * synthetic-photo test proved the capture mechanism itself reproduces a
 * given crop faithfully — but that only proves the tested case matches,
 * not that the live failing case is resolved, and manually expanding
 * collapsed console objects during a live repro is error-prone and easy to
 * get wrong. This replaces that manual process with one automatic,
 * correlated snapshot taken at the exact moment of an explicit Download
 * click, correlating four independently-gathered facts:
 *
 * 1. currentPlayer — the player id + crop the visible design is showing
 *    RIGHT NOW, read fresh at click time (never cached/memoized).
 * 2. onScreenPreview — the actual rendered <img>'s measured dimensions and
 *    live CSS transform, read directly from the DOM at click time.
 * 3. capture — what captureShareImageFor actually asked to be rendered and
 *    captured, and what it measured about the result, from whenever that
 *    capture ran (which may be earlier than the click, if the guardian
 *    reached the manual-options screen and then clicked Download).
 * 4. preparedShare — the actual blob about to be downloaded, hashed at
 *    click time.
 *
 * cropMatchesCurrentVsCapture answers "does the currently-visible design
 * match what was captured" — the crop-staleness question this whole
 * investigation has been chasing. downloadedAssetMatchesCapture answers a
 * DIFFERENT, independent question the founder specifically flagged:
 * "does the file about to be saved even correspond to that capture at
 * all", which identical rendering components/crop objects cannot prove by
 * themselves — a genuine plumbing bug (stale preparedShare state, a wrong
 * blob reference) would show matching crops here but a hash mismatch.
 *
 * Deliberately contains no photo, URL, signed asset, or personal detail —
 * only ids already visible elsewhere in the UI, crop numbers, pixel
 * dimensions, transform strings, and short content hashes (prove
 * byte-identity between two images without ever carrying the image
 * itself).
 */
export type CaptureDiagnostics = {
  capturedAt: number;
  capturePlayerId: string;
  captureCropRequested: { x: number; y: number; scale: number } | null;
  offscreenImageTransforms: string[];
  generatedImage: { width: number; height: number; contentHash: string };
};

export type CurrentPlayerSnapshot = { playerId: string; crop: { x: number; y: number; scale: number } | null } | null;

export type OnScreenPreviewMeasurement = {
  imgNaturalWidth: number;
  imgNaturalHeight: number;
  imgRenderedWidth: number;
  imgRenderedHeight: number;
  imgTransform: string;
} | null;

export type PreparedShareRecord = {
  preparedAt: number;
  blobSize: number;
  blobType: string;
  contentHash: string;
};

export type DownloadProvenanceSnapshot = {
  clickedAt: number;
  currentPlayer: CurrentPlayerSnapshot;
  onScreenPreview: OnScreenPreviewMeasurement;
  capture: CaptureDiagnostics | null;
  preparedShare: PreparedShareRecord | null;
  cropMatchesCurrentVsCapture: boolean | 'unknown';
  downloadedAssetMatchesCapture: boolean | 'unknown';
};

function cropsEqual(
  a: { x: number; y: number; scale: number } | null,
  b: { x: number; y: number; scale: number } | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.x === b.x && a.y === b.y && a.scale === b.scale;
}

/**
 * Pure correlation function — no DOM, no capture, no hashing performed
 * here, only comparison of already-gathered facts. Directly unit-testable
 * — see card-share.test.ts.
 */
export function buildDownloadProvenanceSnapshot(input: {
  clickedAt: number;
  currentPlayer: CurrentPlayerSnapshot;
  onScreenPreview: OnScreenPreviewMeasurement;
  capture: CaptureDiagnostics | null;
  preparedShare: PreparedShareRecord | null;
}): DownloadProvenanceSnapshot {
  const cropMatchesCurrentVsCapture: boolean | 'unknown' = input.capture
    ? cropsEqual(input.currentPlayer?.crop ?? null, input.capture.captureCropRequested)
    : 'unknown';
  const downloadedAssetMatchesCapture: boolean | 'unknown' =
    input.capture && input.preparedShare
      ? input.capture.generatedImage.contentHash === input.preparedShare.contentHash
      : 'unknown';
  return {
    clickedAt: input.clickedAt,
    currentPlayer: input.currentPlayer,
    onScreenPreview: input.onScreenPreview,
    capture: input.capture,
    preparedShare: input.preparedShare,
    cropMatchesCurrentVsCapture,
    downloadedAssetMatchesCapture,
  };
}
