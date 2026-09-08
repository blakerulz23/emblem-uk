'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  CARD_SHARE_CAPTURE_FAILURE,
  CARD_SHARE_CONFIRMATION_LABEL,
  CARD_SHARE_GENERIC_FAILURE,
  CARD_SHARE_LINK_FAILURE,
  CARD_SHARE_MESSAGE_TEXT,
  CARD_SHARE_RECALL_NOTICE,
  CARD_SHARE_WARNING,
  buildCardShareMessageText,
  cardShareBlockedMessage,
  cardSharePublicPageUrl,
  cardShareStageReducer,
  createCardSharePublicPage,
  fetchCardShareEligibility,
  recordCardShareConsent,
  shouldHideCardShareEntirely,
  type CardShareEligibility,
} from '@/lib/card-share';

/** True only when this browser can genuinely open a native share sheet for
 * a file payload — checked with the real file once it exists, never
 * assumed from `navigator.share`'s mere presence (some browsers implement
 * it for URLs/text only, and canShare({files}) is what actually tells them
 * apart). */
function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

/**
 * Guardian-controlled card-front sharing (Work Package B, draft/
 * unreleased). All decision logic lives in card-share.ts (testable, no
 * jsdom needed) — this component is deliberately thin wiring: fetch
 * eligibility once, render one of a small number of states, and delegate
 * every actual decision (is this eligible, what does a given reason mean,
 * what does each stage transition to) to that module.
 *
 * getShareImage is provided by ProductionBuilder — it renders the same
 * unmodified PlayerCard/CardFace the review screen and print pipeline
 * already use, off-screen, and returns a data URL via the same unmodified
 * captureElementToPng print-capture.ts already exports. This component
 * never touches print-capture.ts, card-definition.tsx, or any protected
 * rendering path directly — `preview` is a ready-made element ProductionBuilder
 * already owns (the same visible, on-screen PlayerCard the guardian's order
 * summary shows), handed in as a plain ReactNode so this component can put
 * the share affordance directly on top of the design without importing any
 * card-rendering code itself.
 *
 * The design preview is shown as soon as this component mounts (a
 * successfully-submitted single-child order), independent of eligibility —
 * only the share control itself is gated on the server-backed eligibility
 * check resolving `eligible: true`. Rotation is a purely cosmetic, on-
 * screen-only transform applied to this wrapper; it never touches
 * `preview` itself, `getShareImage`, or anything the capture path reads,
 * so the generated share image is always the upright front regardless of
 * whatever rotation the guardian left the on-screen preview in.
 */
export default function ShareCardSheet({
  orderId,
  getShareImage,
  preview,
  summary,
}: {
  orderId: string;
  getShareImage: () => Promise<string>;
  preview: ReactNode;
  summary: { collectionName: string; playerCount: number; printCount: number };
}) {
  const [eligibility, setEligibility] = useState<CardShareEligibility | null>(null);
  const [stage, dispatch] = useReducer(cardShareStageReducer, { type: 'closed' });
  // Cosmetic only — see this component's own top comment on why rotating
  // the on-screen preview can never affect what captureShareImage renders
  // or returns.
  const [rotation, setRotation] = useState(0);
  // The Web Share API gives calling code no feedback about what a target
  // app actually did with `text` — only whether the share invocation
  // itself succeeded or was cancelled. Manual testing confirmed WhatsApp
  // Desktop specifically drops the caption entirely for a shared file, and
  // there is no reliable way to detect that from here. Rather than
  // confidently claim "your message was sent" when it may genuinely not
  // have been, the same copy-to-clipboard safety net is offered after
  // BOTH a successful native share and the plain download fallback (which
  // has no caption field of its own at all) — see handleCopyMessage.
  const [messageCopied, setMessageCopied] = useState(false);
  // The actual per-share caption once a real public page exists (migration
  // 0085) — distinct from CARD_SHARE_MESSAGE_TEXT, which is the generic
  // preview only.
  const [shareMessageText, setShareMessageText] = useState('');
  // The bare per-share URL, for the "Copy share link" manual option — kept
  // separate from shareMessageText (the full composed caption) since the
  // two are copied by two different, separately-labelled buttons.
  const [shareUrl, setShareUrl] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  // Set once image + link preparation succeeds, whenever native sharing
  // isn't going to complete the job (unsupported, or attempted and
  // rejected for a reason other than the guardian cancelling) — holds
  // everything the manual-options buttons need to act on without
  // re-running any of that preparation.
  const [preparedShare, setPreparedShare] = useState<{ blob: Blob; fileName: string } | null>(null);
  // Guards against a slow eligibility response from an earlier order
  // landing after the component has already unmounted or moved to a
  // different order — same stale-attempt discipline as AdultPermissionStep.
  const requestIdRef = useRef(0);
  // Synchronous double-click guard — same reasoning as AdultPermissionStep's
  // busyRef: a check against `stage` (React state) alone is a stale-closure
  // race (two rapid clicks can both read 'confirming' before the first
  // click's dispatch({type:'start-preparing'}) has re-rendered). A ref
  // mutates synchronously and is shared across both invocations, so the
  // second click always sees the first's write.
  const sharingRef = useRef(false);
  // Focused-overlay keyboard support: Escape cancels the same safe way the
  // Cancel button/backdrop click already do, and Tab is kept cycling
  // between this dialog's own three interactive elements only, since
  // nothing outside it (the preview, any page content behind the backdrop)
  // should be reachable by keyboard while it's open.
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (stage.type !== 'confirming') return;
    const dialogEl = dialogRef.current;
    dialogEl?.querySelector<HTMLElement>('input, button:not(:disabled)')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogEl) return;
      const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>('input, button:not(:disabled)'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // handleCancel is redefined every render (it closes over orderId, which
    // is stable for this component's lifetime) — depending on stage.type
    // alone is intentional so this effect only re-runs on open/close, not
    // on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.type]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    fetchCardShareEligibility(orderId).then((result) => {
      if (cancelled || requestIdRef.current !== requestId) return;
      setEligibility(result);
    });
    return () => { cancelled = true; };
  }, [orderId]);

  // Unlike the eligibility gate this replaced, the preview itself is never
  // hidden — only the share control and any blocked-reason message are.
  // "Hidden entirely" reasons (not_authenticated, not_authorized,
  // multi_child_order) must never surface a message at all, matching the
  // existing rule that ineligibility must never disclose why a record
  // failed a check the caller has no business knowing the details of.
  const showShareIcon = Boolean(eligibility?.eligible) && stage.type === 'closed';
  const showBlockedMessage =
    Boolean(eligibility) && !eligibility!.eligible && !shouldHideCardShareEntirely(eligibility!.reason) && stage.type === 'closed';

  const handleCancel = () => {
    dispatch({ type: 'cancel' });
    void recordCardShareConsent(orderId, 'cancelled');
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(shareMessageText || CARD_SHARE_MESSAGE_TEXT);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — the exact same message is
      // already visibly printed above this button, so the guardian can
      // still select and copy it by hand.
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Same fallback reasoning as handleCopyMessage — the link is also
      // visible as part of the printed message text above these buttons.
    }
  };

  // Only ever runs from an explicit guardian click on "Download card
  // image" in the manual-options UI — never automatically, so a browser
  // that can't (or wouldn't) open the native share sheet never looks like
  // it silently saved a file under a control labelled Share.
  const handleDownloadNow = () => {
    if (!preparedShare) return;
    const objectUrl = URL.createObjectURL(preparedShare.blob);
    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = preparedShare.fileName;
      link.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    dispatch({ type: 'downloaded' });
  };

  const handleContinue = async () => {
    if (sharingRef.current) return;
    if (stage.type !== 'confirming' || !stage.checked) return;
    sharingRef.current = true;
    dispatch({ type: 'start-preparing' });

    try {
      // Consent is recorded and re-verified server-side BEFORE any image is
      // generated — a card that became ineligible between the eligibility
      // check and this click (suspended, revoked, a deletion request filed)
      // is rejected here, and nothing is ever rendered or shared.
      const consent = await recordCardShareConsent(orderId, 'confirmed');
      if (!consent.ok) {
        dispatch({ type: 'fail', message: consent.error || CARD_SHARE_GENERIC_FAILURE });
        return;
      }

      let dataUrl: string;
      try {
        dataUrl = await getShareImage();
      } catch {
        // Distinct wording from the two failure branches below — see
        // card-share.ts's own comment: a live-reported failure kept
        // showing the same generic message regardless of which of these
        // three genuinely different steps had failed, making it
        // impossible to diagnose from a screenshot alone.
        dispatch({ type: 'fail', message: CARD_SHARE_CAPTURE_FAILURE });
        return;
      }

      // Founder-approved public share page (migration 0085) — creates the
      // real per-share link BEFORE the message is composed. Re-verifies
      // eligibility itself server-side; a card that became ineligible
      // between the consent step above and this call is rejected here.
      const publicPage = await createCardSharePublicPage(orderId, dataUrl);
      if (!publicPage.ok || !publicPage.token) {
        dispatch({ type: 'fail', message: publicPage.error || CARD_SHARE_LINK_FAILURE });
        return;
      }
      const realShareUrl = cardSharePublicPageUrl(publicPage.token);
      const messageText = buildCardShareMessageText(realShareUrl);
      setShareUrl(realShareUrl);
      setShareMessageText(messageText);

      try {
        const blob = await (await fetch(dataUrl)).blob();
        const fileName = `emblem-card-${orderId.slice(0, 8)}.jpg`;
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });

        // FOUNDER-REPORTED BUG (fixed): this used to fall straight through
        // to an automatic download whenever native sharing wasn't
        // supported OR failed for any non-cancel reason — including,
        // almost certainly, the exact case flagged live: the async work
        // above (recording consent, generating the image, creating the
        // public page) can run long enough to lose the "user activation"
        // window some browsers require navigator.share to be called
        // within, which then rejects looking identical to "unsupported".
        // Either way, a guardian who tapped a button labelled "Continue to
        // share" got a silently-saved file with no explanation. Both cases
        // now stop here instead and hand the guardian explicit,
        // separately-labelled choices (setPreparedShare below) — nothing
        // is ever downloaded without a distinct action for it.
        if (canShareFile(file)) {
          try {
            // `text` alone, never also `url`: messageText already contains
            // the exact, single link as ordinary readable text. Passing
            // `url` as well caused real recipients (confirmed via manual
            // WhatsApp Desktop testing) to see the link twice and the "Look
            // what I made..." line dropped entirely — several share targets
            // compose their own caption from `url` when both fields are
            // present, ignoring or duplicating `text` rather than appending
            // them predictably. Sending one opaque text block is the only
            // way to guarantee exactly the required message reaches the
            // recipient, on every platform, every time.
            await navigator.share({
              files: [file],
              title: 'My Emblem card',
              text: messageText,
            });
            // Best-effort only: navigator.share() already resolved, so the
            // share itself genuinely succeeded regardless of whether this
            // also succeeds — a clipboard failure here must never be
            // reported as a failed share. And resolving is all this API
            // ever promises: it says the share sheet accepted the
            // hand-off, never that any specific recipient received or
            // opened it, so the 'shared' state below is worded to match.
            try {
              await navigator.clipboard.writeText(messageText);
            } catch {
              // Clipboard unavailable/denied — the 'shared' status below
              // still displays the same message text for manual copying.
            }
            dispatch({ type: 'shared' });
            return;
          } catch (shareErr) {
            // A guardian cancelling the native share sheet lands here
            // (most browsers reject navigator.share's promise with an
            // AbortError) — treated as a quiet cancellation, not a
            // failure: nothing was created, nothing is offered, the
            // consent event already stands.
            if (shareErr instanceof Error && shareErr.name === 'AbortError') {
              dispatch({ type: 'reset' });
              return;
            }
            // Any other rejection — including a lost user-activation
            // window — surfaces explicit manual options, never a silent
            // download.
            setPreparedShare({ blob, fileName });
            dispatch({ type: 'manual-options', reason: 'share-failed' });
            return;
          }
        }

        setPreparedShare({ blob, fileName });
        dispatch({ type: 'manual-options', reason: 'unsupported' });
      } catch {
        // Only a genuine failure preparing the blob/file itself lands
        // here — every navigator.share() outcome (cancel, success, or a
        // fallback worth surfacing) is handled above.
        dispatch({ type: 'fail', message: CARD_SHARE_GENERIC_FAILURE });
      }
    } finally {
      sharingRef.current = false;
    }
  };

  const blockedMessage = eligibility && !eligibility.eligible ? cardShareBlockedMessage(eligibility.reason) : null;
  const { collectionName, playerCount, printCount } = summary;

  return (
    <div className="uk-card-share">
      <div className="uk-card-share-preview">
        <div className="uk-card-share-preview-card" style={{ transform: `rotate(${rotation}deg)` }}>
          {preview}
        </div>
        <button
          type="button"
          className="uk-card-share-icon-btn rotate"
          aria-label="Rotate card preview"
          onClick={() => setRotation((current) => (current + 90) % 360)}
        >
          <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v5h-5" />
          </svg>
        </button>
        {showShareIcon && (
          <button
            type="button"
            className="uk-card-share-icon-btn share"
            aria-label="Share your card design"
            onClick={() => dispatch({ type: 'open' })}
          >
            <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7.5 7.5L12 3l4.5 4.5" />
              <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
            </svg>
          </button>
        )}
      </div>

      <p className="uk-card-share-summary">
        {collectionName} &middot; {playerCount} player{playerCount === 1 ? '' : 's'} &middot; {printCount} print{printCount === 1 ? '' : 's'}
      </p>

      {showBlockedMessage && <p className="uk-card-share-blocked">{blockedMessage}</p>}

      {stage.type === 'confirming' && (
        <div className="uk-card-share-modal-backdrop" role="presentation" onClick={handleCancel}>
          <div
            ref={dialogRef}
            className="uk-card-share-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="uk-card-share-eyebrow">Share your card</span>
            <h3>Ready to share?</h3>
            <p className="uk-card-share-warning" role="alert">{CARD_SHARE_WARNING}</p>
            <p className="uk-card-share-recall">{CARD_SHARE_RECALL_NOTICE}</p>
            <label className="uk-card-share-confirm">
              <input type="checkbox" checked={stage.checked} onChange={() => dispatch({ type: 'toggle-checked' })} />
              <span>{CARD_SHARE_CONFIRMATION_LABEL}</span>
            </label>
            <div className="uk-card-share-actions">
              <button type="button" className="uk-wizard-primary compact" disabled={!stage.checked} onClick={handleContinue}>
                Continue to share
              </button>
              <button type="button" onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {stage.type === 'preparing' && <p aria-live="polite">Preparing your image…</p>}
      {stage.type === 'manual-options' && (
        <div role="status">
          <p>
            {stage.reason === 'unsupported'
              ? "Your image and link are ready. This device doesn't support sharing directly, so pick how you'd like to send it:"
              : "Your image and link are ready, but we couldn't open the share sheet on this device. Pick how you'd like to send it instead:"}
          </p>
          <p className="uk-card-share-download-message">{shareMessageText}</p>
          <div className="uk-card-share-manual-actions">
            <button type="button" onClick={handleCopyLink}>{linkCopied ? 'Copied' : 'Copy share link'}</button>
            <button type="button" onClick={handleCopyMessage}>{messageCopied ? 'Copied' : 'Copy message'}</button>
            <button type="button" onClick={handleDownloadNow}>Download card image</button>
          </div>
          <p className="uk-card-share-recall">{CARD_SHARE_RECALL_NOTICE}</p>
        </div>
      )}
      {stage.type === 'shared' && (
        <div role="status">
          {/* Some apps (confirmed: WhatsApp Desktop) attach the image but
              drop the accompanying message entirely, and the Web Share API
              gives no way to detect that after the fact — so this never
              claims the message was definitely included. */}
          <p>Shared. If the message below didn&apos;t appear with it, we&apos;ve also copied it to your clipboard to paste in. {CARD_SHARE_RECALL_NOTICE}</p>
          <p className="uk-card-share-download-message">{shareMessageText}</p>
          <button type="button" onClick={handleCopyMessage}>{messageCopied ? 'Copied' : 'Copy message'}</button>
        </div>
      )}
      {stage.type === 'downloaded' && (
        <div role="status">
          <p>Downloaded. {CARD_SHARE_RECALL_NOTICE}</p>
          <p className="uk-card-share-download-message">{shareMessageText}</p>
          <button type="button" onClick={handleCopyMessage}>{messageCopied ? 'Copied' : 'Copy message'}</button>
        </div>
      )}
      {stage.type === 'cancelled' && <p role="status">Cancelled — no image was created.</p>}
      {stage.type === 'failed' && (
        <div>
          <p className="uk-enquiry-error" role="alert">{stage.message}</p>
          <button type="button" onClick={() => dispatch({ type: 'reset' })}>Try again</button>
        </div>
      )}
    </div>
  );
}
