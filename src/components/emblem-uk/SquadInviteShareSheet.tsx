'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import {
  CARD_SHARE_CONFIRMATION_LABEL,
  CARD_SHARE_GENERIC_FAILURE,
  CARD_SHARE_MESSAGE_TEXT,
  CARD_SHARE_RECALL_NOTICE,
  CARD_SHARE_WARNING,
  cardShareBlockedMessage,
  cardShareStageReducer,
  fetchCardShareEligibility,
  recordCardShareConsent,
  shouldHideCardShareEntirely,
  type CardShareEligibility,
} from '@/lib/card-share';

/**
 * The Squad Invite completion screen's own presentation of guardian card
 * sharing — same underlying eligibility/consent/state-machine logic as
 * ShareCardSheet.tsx (imported unchanged from card-share.ts, never
 * reimplemented here), wrapped in the "Share your card" primary-action
 * shape this screen's redesign calls for, instead of ShareCardSheet's own
 * small icon-on-the-card presentation. ShareCardSheet.tsx itself is
 * untouched by this file — the ordinary single-builder success screen
 * keeps its existing look exactly as before.
 *
 * `eligibility` is computed fresh, server-side, by the same unmodified
 * get_card_share_eligibility RPC (migration 0078) called through the same
 * unmodified /api/card-share/eligibility route — this component adds no
 * new authorization path. Today, every Squad Invite order has
 * orders.authority_status left null (Squad Invite's own four commit-time
 * declarations are a separate, less specific schema — see this branch's
 * PR description) — get_card_share_eligibility's own existing check
 * `authority_status is distinct from 'confirmed'` therefore returns
 * `{eligible:false, reason:'not_authorized'}` for every Squad Invite
 * guardian today, safely and correctly, with nothing new added or relaxed
 * here to make that so. The primary action below simply stays hidden
 * (not_authorized is a "hide entirely" reason, same as the ordinary
 * builder) until separate, dedicated foundation work gives Squad Invite
 * its own real, persisted relationship evidence.
 */
export default function SquadInviteShareSheet({
  orderId,
  getShareImage,
}: {
  orderId: string;
  getShareImage: () => Promise<string>;
}) {
  const [eligibility, setEligibility] = useState<CardShareEligibility | null>(null);
  const [stage, dispatch] = useReducer(cardShareStageReducer, { type: 'closed' });
  const [messageCopied, setMessageCopied] = useState(false);
  const requestIdRef = useRef(0);
  const sharingRef = useRef(false);
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

  const loading = eligibility === null;
  const showShareButton = Boolean(eligibility?.eligible) && stage.type === 'closed';
  const showBlockedMessage =
    Boolean(eligibility) && !eligibility!.eligible && !shouldHideCardShareEntirely(eligibility!.reason) && stage.type === 'closed';

  const handleCancel = () => {
    dispatch({ type: 'cancel' });
    void recordCardShareConsent(orderId, 'cancelled');
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(CARD_SHARE_MESSAGE_TEXT);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — the same message text is
      // already visibly printed, so the guardian can select and copy it by
      // hand. A clipboard failure here is never reported as a share failure.
    }
  };

  const handleContinue = async () => {
    if (sharingRef.current) return;
    if (stage.type !== 'confirming' || !stage.checked) return;
    sharingRef.current = true;
    dispatch({ type: 'start-preparing' });

    try {
      // Consent is recorded and re-verified server-side BEFORE any image is
      // generated — a card that became ineligible between the eligibility
      // check and this click is rejected here, and nothing is ever
      // rendered or shared.
      const consent = await recordCardShareConsent(orderId, 'confirmed');
      if (!consent.ok) {
        dispatch({ type: 'fail', message: consent.error || CARD_SHARE_GENERIC_FAILURE });
        return;
      }

      let dataUrl: string;
      try {
        dataUrl = await getShareImage();
      } catch {
        dispatch({ type: 'fail', message: CARD_SHARE_GENERIC_FAILURE });
        return;
      }

      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `emblem-card-${orderId.slice(0, 8)}.jpg`, { type: blob.type || 'image/jpeg' });

        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          // `text` alone, never also `url` — see ShareCardSheet.tsx's own
          // comment on why passing both causes real share targets to
          // duplicate or drop the caption.
          await navigator.share({
            files: [file],
            title: 'My Emblem card',
            text: CARD_SHARE_MESSAGE_TEXT,
          });
          try {
            await navigator.clipboard.writeText(CARD_SHARE_MESSAGE_TEXT);
          } catch {
            // Best-effort only — the share itself already succeeded.
          }
          dispatch({ type: 'shared' });
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        try {
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = file.name;
          link.click();
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
        dispatch({ type: 'downloaded' });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          dispatch({ type: 'reset' });
          return;
        }
        dispatch({ type: 'fail', message: CARD_SHARE_GENERIC_FAILURE });
      }
    } finally {
      sharingRef.current = false;
    }
  };

  const blockedMessage = eligibility && !eligibility.eligible ? cardShareBlockedMessage(eligibility.reason) : null;

  return (
    <div className="uk-squad-share">
      {loading && (
        <div className="uk-wizard-primary uk-squad-share-loading" aria-busy="true" aria-live="polite">
          Checking sharing availability…
        </div>
      )}

      {showShareButton && (
        <button type="button" className="uk-wizard-primary" onClick={() => dispatch({ type: 'open' })}>
          Share your card
        </button>
      )}

      {showBlockedMessage && <p className="uk-squad-share-blocked">{blockedMessage}</p>}

      {stage.type === 'confirming' && (
        <div className="uk-card-share-modal-backdrop" role="presentation" onClick={handleCancel}>
          <div
            ref={dialogRef}
            className="uk-card-share-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Share your child's card"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="uk-card-share-eyebrow">Share your card</span>
            <h3>Share your child&apos;s card</h3>
            <p className="uk-card-share-warning" role="alert">{CARD_SHARE_WARNING}</p>
            <p className="uk-card-share-recall">{CARD_SHARE_RECALL_NOTICE}</p>
            <div className="uk-squad-share-caption-preview">
              <span className="uk-squad-share-caption-label">Caption preview</span>
              <p>{CARD_SHARE_MESSAGE_TEXT}</p>
            </div>
            <label className="uk-card-share-confirm">
              <input type="checkbox" checked={stage.checked} onChange={() => dispatch({ type: 'toggle-checked' })} />
              <span>{CARD_SHARE_CONFIRMATION_LABEL}</span>
            </label>
            <div className="uk-card-share-actions">
              <button type="button" className="uk-wizard-primary compact" disabled={!stage.checked} onClick={handleContinue}>
                Share now
              </button>
              <button type="button" onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {stage.type === 'preparing' && <p aria-live="polite">Preparing your image…</p>}
      {stage.type === 'shared' && (
        <div role="status">
          {/* Some apps attach the image but drop the accompanying message —
              the Web Share API gives no way to detect that after the fact,
              so this never claims the caption definitely appeared with it. */}
          <p>Shared. If the message below didn&apos;t appear with it, we&apos;ve also copied it to your clipboard to paste in. {CARD_SHARE_RECALL_NOTICE}</p>
          <p className="uk-card-share-download-message">{CARD_SHARE_MESSAGE_TEXT}</p>
          <button type="button" onClick={handleCopyMessage}>{messageCopied ? 'Copied' : 'Copy message'}</button>
        </div>
      )}
      {stage.type === 'downloaded' && (
        <div role="status">
          <p>Downloaded. {CARD_SHARE_RECALL_NOTICE}</p>
          <p className="uk-card-share-download-message">{CARD_SHARE_MESSAGE_TEXT}</p>
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
