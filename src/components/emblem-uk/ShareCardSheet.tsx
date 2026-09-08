'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  CARD_SHARE_CAPTURE_FAILURE,
  CARD_SHARE_CONFIRMATION_LABEL,
  CARD_SHARE_GENERIC_FAILURE,
  CARD_SHARE_LINK_FAILURE,
  CARD_SHARE_RECALL_NOTICE,
  CARD_SHARE_WARNING,
  buildCardShareMessageText,
  cardShareBlockedMessage,
  cardSharePublicPageUrl,
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
 * This panel's own local, minimal stage machine — deliberately NOT
 * card-share.ts's exported CardShareStage/cardShareStageReducer, which
 * SquadInviteShareSheet.tsx also uses unchanged for its own (differently-
 * shaped, multi-terminal-state) flow. Redesigning this panel to show every
 * action on one persistent surface — rather than replacing the whole panel
 * with a distinct terminal screen per outcome — needs a genuinely
 * different shape, so it lives here instead of forcing one shared type to
 * fit two different UIs. 'open' covers both "not yet prepared" and
 * "prepared, actions available" — see the separate `prepared` state below
 * for which of those it actually is; keeping that out of the stage type
 * itself is what lets every action stay repeatable after any other one
 * succeeds, satisfying "keep actions available after downloading".
 */
type SharePanelStage = { type: 'closed' } | { type: 'open' } | { type: 'preparing' };
type SharePanelAction = { type: 'open' } | { type: 'close' } | { type: 'start-preparing' } | { type: 'ready' };

function sharePanelStageReducer(state: SharePanelStage, action: SharePanelAction): SharePanelStage {
  switch (action.type) {
    case 'open':
      return { type: 'open' };
    case 'close':
      return { type: 'closed' };
    case 'start-preparing':
      return { type: 'preparing' };
    case 'ready':
      return { type: 'open' };
  }
}

type PreparedShare = { shareUrl: string; messageText: string; blob: Blob; fileName: string };

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V5a1 1 0 0 1 1-1h11" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * Guardian-controlled card-front sharing (Work Package B). All decision
 * logic lives in card-share.ts (testable, no jsdom needed) — this
 * component is deliberately thin wiring: fetch eligibility once, render
 * one panel, and delegate every actual decision (is this eligible, what
 * does a given reason mean) to that module.
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
 * card-rendering code itself. The same node is rendered a second time,
 * scaled down, as the panel's thumbnail — never a separate rendering path,
 * so the thumbnail always matches the current design exactly.
 *
 * The design preview is shown as soon as this component mounts (a
 * successfully-submitted single-child order), independent of eligibility —
 * only the share control itself is gated on the server-backed eligibility
 * check resolving `eligible: true`. Rotation is a purely cosmetic, on-
 * screen-only transform applied to this wrapper; it never touches
 * `preview` itself or getShareImage, so the generated share image is
 * always the upright front regardless of whatever rotation the guardian
 * left the on-screen preview in.
 *
 * Every one of Share now / Copy link / Copy message / Download image
 * shares one `ensurePrepared()` step (consent -> image -> public link),
 * run at most once per panel-open and reused by whichever action is
 * clicked first or next — none of them ever downloads, copies, or shares
 * anything as a side effect of another; each is a distinct, explicit
 * click. Downloading in particular writes nothing to the clipboard.
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
  const [stage, dispatch] = useReducer(sharePanelStageReducer, { type: 'closed' });
  // Cosmetic only — rotating the on-screen preview can never affect what
  // getShareImage renders or returns (see this component's own top comment).
  const [rotation, setRotation] = useState(0);
  const [checked, setChecked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedShare | null>(null);
  // Per-action transient feedback — mirrors "Link copied" / "Message
  // copied" / "Download started" directly, rather than one shared generic
  // "Copied" the guardian has to map back to which button they pressed.
  const [linkCopied, setLinkCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [shared, setShared] = useState(false);
  // Once true, Copy link becomes the visually primary action instead of
  // Share now — set immediately if this browser was never going to support
  // navigator.share with a file, and again if a genuine (non-cancel)
  // attempt fails. Cancelling the native share sheet does NOT set this —
  // the guardian chose not to complete that specific attempt, which says
  // nothing about whether it would have worked.
  const [shareUnavailable, setShareUnavailable] = useState(
    () => !(typeof navigator !== 'undefined' && typeof navigator.share === 'function'),
  );
  const requestIdRef = useRef(0);
  // Concurrency guard: whichever action is clicked first runs the one real
  // prepare sequence; every other action clicked before it resolves awaits
  // that SAME in-flight promise instead of starting a second one — the
  // literal mechanism behind "prevent duplicate operations".
  const preparePromiseRef = useRef<Promise<PreparedShare | null> | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const shareIconRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (stage.type === 'closed') return;
    const dialogEl = dialogRef.current;
    dialogEl?.querySelector<HTMLElement>('input, button:not(:disabled)')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
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
    // handleClose is redefined every render (it closes over orderId, which
    // is stable for this component's lifetime) — depending on stage.type
    // alone is intentional so this effect only re-runs on open/close, not
    // on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.type]);

  // Returns keyboard focus to the control that opened the panel once it
  // closes — otherwise focus silently falls back to <body>, stranding a
  // keyboard/screen-reader guardian with no sense of where they landed.
  useEffect(() => {
    if (stage.type === 'closed') shareIconRef.current?.focus();
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

  const resetPanelState = () => {
    setChecked(false);
    setErrorMessage(null);
    setPrepared(null);
    setLinkCopied(false);
    setMessageCopied(false);
    setDownloadStarted(false);
    setShared(false);
    preparePromiseRef.current = null;
  };

  const handleOpen = () => {
    resetPanelState();
    dispatch({ type: 'open' });
  };

  // Closing (the X button, Escape, or the backdrop) always records a fresh
  // "cancelled" consent event and clears any prepared state — reopening
  // starts a genuinely new attempt, never silently reusing an image or
  // link prepared under an earlier, separately-recorded consent.
  const handleClose = () => {
    dispatch({ type: 'close' });
    void recordCardShareConsent(orderId, 'cancelled');
  };

  /**
   * Consent -> image -> public link, run at most once per panel-open.
   * Every action below calls this first; the guard above makes concurrent
   * callers share the one real attempt instead of each starting their own.
   */
  const ensurePrepared = (): Promise<PreparedShare | null> => {
    if (prepared) return Promise.resolve(prepared);
    if (preparePromiseRef.current) return preparePromiseRef.current;
    if (!checked) return Promise.resolve(null);

    const attempt = (async (): Promise<PreparedShare | null> => {
      dispatch({ type: 'start-preparing' });
      setErrorMessage(null);
      try {
        // Consent is recorded and re-verified server-side BEFORE any image
        // is generated — a card that became ineligible between the
        // eligibility check and this click (suspended, revoked, a deletion
        // request filed) is rejected here, and nothing is ever rendered or
        // shared.
        const consent = await recordCardShareConsent(orderId, 'confirmed');
        if (!consent.ok) {
          setErrorMessage(consent.error || CARD_SHARE_GENERIC_FAILURE);
          return null;
        }

        let dataUrl: string;
        try {
          dataUrl = await getShareImage();
        } catch {
          // Distinct wording from the failure below — a live-reported
          // failure kept showing the same generic message regardless of
          // which of these genuinely different steps had failed, making it
          // impossible to diagnose from a screenshot alone.
          setErrorMessage(CARD_SHARE_CAPTURE_FAILURE);
          return null;
        }

        // Founder-approved public share page (migration 0085) — creates
        // the real per-share link. Re-verifies eligibility itself
        // server-side; a card that became ineligible between the consent
        // step above and this call is rejected here.
        const publicPage = await createCardSharePublicPage(orderId, dataUrl);
        if (!publicPage.ok || !publicPage.token) {
          setErrorMessage(publicPage.error || CARD_SHARE_LINK_FAILURE);
          return null;
        }
        const shareUrl = cardSharePublicPageUrl(publicPage.token);
        const messageText = buildCardShareMessageText(shareUrl);

        try {
          const blob = await (await fetch(dataUrl)).blob();
          const fileName = `emblem-card-${orderId.slice(0, 8)}.jpg`;
          const result: PreparedShare = { shareUrl, messageText, blob, fileName };
          setPrepared(result);
          return result;
        } catch {
          setErrorMessage(CARD_SHARE_GENERIC_FAILURE);
          return null;
        }
      } finally {
        dispatch({ type: 'ready' });
      }
    })();

    preparePromiseRef.current = attempt;
    void attempt.finally(() => {
      if (preparePromiseRef.current === attempt) preparePromiseRef.current = null;
    });
    return attempt;
  };

  const handleShareNow = async () => {
    const share = await ensurePrepared();
    if (!share) return;

    const file = new File([share.blob], share.fileName, { type: share.blob.type || 'image/jpeg' });
    if (!canShareFile(file)) {
      setShareUnavailable(true);
      return;
    }
    try {
      // `text` alone, never also `url`: messageText already contains the
      // exact, single link as ordinary readable text. Passing `url` as
      // well caused real recipients (confirmed via manual WhatsApp Desktop
      // testing) to see the link twice and the "Look what I made..." line
      // dropped entirely — several share targets compose their own
      // caption from `url` when both fields are present, ignoring or
      // duplicating `text` rather than appending them predictably.
      await navigator.share({ files: [file], title: 'My Emblem card', text: share.messageText });
      // Best-effort only: navigator.share() already resolved, so the share
      // itself genuinely succeeded regardless of whether this also
      // succeeds. The Web Share API gives no way to learn whether the
      // target app actually displayed `text` (confirmed live: WhatsApp
      // Desktop specifically drops the caption while still accepting the
      // file), so this defensive copy runs after every successful share,
      // not only the manual fallback.
      try {
        await navigator.clipboard.writeText(share.messageText);
      } catch {
        // Clipboard unavailable/denied — Copy message is still right there
        // for the guardian to use by hand.
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (shareErr) {
      // A guardian cancelling the native share sheet (most browsers reject
      // navigator.share's promise with an AbortError) is a quiet
      // cancellation, never a failure and never a reason to demote Copy
      // link — nothing else about this attempt changes.
      if (shareErr instanceof Error && shareErr.name === 'AbortError') return;
      // Any other rejection — including a lost user-activation window from
      // the async prep above — surfaces Copy link as the primary fallback,
      // never a silent download.
      setShareUnavailable(true);
    }
  };

  const handleCopyLink = async () => {
    const share = await ensurePrepared();
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — nothing else to do here; the
      // guardian can retry, clipboard permission is outside this panel's
      // control.
    }
  };

  const handleCopyMessage = async () => {
    const share = await ensurePrepared();
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.messageText);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    } catch {
      // Same fallback reasoning as handleCopyLink.
    }
  };

  // Only ever runs from an explicit guardian click on "Download image" —
  // never automatically, and never as a side effect of any other action.
  // Writes nothing to the clipboard: only Copy link/Copy message do that,
  // each from its own explicit click.
  const handleDownloadNow = async () => {
    const share = await ensurePrepared();
    if (!share) return;
    const objectUrl = URL.createObjectURL(share.blob);
    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = share.fileName;
      link.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    setDownloadStarted(true);
    setTimeout(() => setDownloadStarted(false), 2000);
  };

  const blockedMessage = eligibility && !eligibility.eligible ? cardShareBlockedMessage(eligibility.reason) : null;
  const { collectionName, playerCount, printCount } = summary;
  const panelOpen = stage.type !== 'closed';
  const preparing = stage.type === 'preparing';

  const shareButton = (
    <button type="button" className="uk-card-share-cta" disabled={!checked || preparing} onClick={handleShareNow}>
      <span>{shared ? 'Shared' : 'Share now'}</span>
      <span className="uk-card-share-cta-icon" aria-hidden="true"><ShareIcon /></span>
    </button>
  );
  const copyLinkButton = (
    <button type="button" className="uk-card-share-cta" disabled={!checked || preparing} onClick={handleCopyLink}>
      {linkCopied ? 'Link copied' : 'Copy link'}
    </button>
  );

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
            ref={shareIconRef}
            type="button"
            className="uk-card-share-icon-btn share"
            aria-label="Share your card design"
            onClick={handleOpen}
          >
            <ShareIcon />
          </button>
        )}
      </div>

      <p className="uk-card-share-summary">
        {collectionName} &middot; {playerCount} player{playerCount === 1 ? '' : 's'} &middot; {printCount} print{printCount === 1 ? '' : 's'}
      </p>

      {showBlockedMessage && <p className="uk-card-share-blocked">{blockedMessage}</p>}

      {panelOpen && (
        <div className="uk-card-share-modal-backdrop" role="presentation" onClick={handleClose}>
          <div
            ref={dialogRef}
            className="uk-card-share-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Share your card"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="uk-card-share-close" aria-label="Close" onClick={handleClose}>
              <CloseIcon />
            </button>

            <h3>Share your card</h3>
            <p className="uk-card-share-subtext">Send your card link or save the image.</p>

            <p className="uk-card-share-warning" role="alert">{CARD_SHARE_WARNING}</p>
            <label className="uk-card-share-confirm">
              <input type="checkbox" checked={checked} onChange={() => setChecked((current) => !current)} />
              <span>{CARD_SHARE_CONFIRMATION_LABEL}</span>
            </label>

            <div className="uk-card-share-thumb-row">
              <div className="uk-card-share-thumb" aria-hidden="true">{preview}</div>
              <p className="uk-card-share-thumb-caption">Look what I made with Emblem.</p>
            </div>

            {errorMessage && <p className="uk-enquiry-error" role="alert">{errorMessage}</p>}
            {preparing && <p className="uk-card-share-preparing" aria-live="polite">Preparing your image…</p>}

            <div className="uk-card-share-actions-primary">
              {shareUnavailable ? (
                <>
                  {copyLinkButton}
                  <button type="button" className="uk-card-share-cta-secondary" disabled={!checked || preparing} onClick={handleShareNow}>
                    <span>{shared ? 'Shared' : 'Share now'}</span>
                    <span className="uk-card-share-cta-icon" aria-hidden="true"><ShareIcon /></span>
                  </button>
                </>
              ) : (
                <>
                  {shareButton}
                  <button type="button" className="uk-card-share-cta-secondary" disabled={!checked || preparing} onClick={handleCopyLink}>
                    {linkCopied ? 'Link copied' : 'Copy link'}
                  </button>
                </>
              )}
            </div>

            <div className="uk-card-share-actions-more">
              <button type="button" className="uk-card-share-cta-tertiary" disabled={!checked || preparing} onClick={handleCopyMessage}>
                <CopyIcon />
                {messageCopied ? 'Message copied' : 'Copy message'}
              </button>
              <button type="button" className="uk-card-share-cta-tertiary" disabled={!checked || preparing} onClick={handleDownloadNow}>
                {downloadStarted ? 'Download started' : 'Download image'}
              </button>
            </div>

            <p className="uk-card-share-recall">{CARD_SHARE_RECALL_NOTICE}</p>
          </div>
        </div>
      )}
    </div>
  );
}
