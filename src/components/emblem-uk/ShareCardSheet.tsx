'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  CARD_SHARE_CONFIRMATION_LABEL,
  CARD_SHARE_GENERIC_FAILURE,
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
 */
export default function ShareCardSheet({
  orderId,
  getShareImage,
  preview,
}: {
  orderId: string;
  getShareImage: () => Promise<string>;
  preview: ReactNode;
}) {
  const [eligibility, setEligibility] = useState<CardShareEligibility | null>(null);
  const [stage, dispatch] = useReducer(cardShareStageReducer, { type: 'closed' });
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

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    fetchCardShareEligibility(orderId).then((result) => {
      if (cancelled || requestIdRef.current !== requestId) return;
      setEligibility(result);
    });
    return () => { cancelled = true; };
  }, [orderId]);

  if (!eligibility) return null;
  if (!eligibility.eligible && shouldHideCardShareEntirely(eligibility.reason)) return null;

  const handleCancel = () => {
    dispatch({ type: 'cancel' });
    void recordCardShareConsent(orderId, 'cancelled');
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
        dispatch({ type: 'fail', message: CARD_SHARE_GENERIC_FAILURE });
        return;
      }

      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `emblem-card-${orderId.slice(0, 8)}.jpg`, { type: blob.type || 'image/jpeg' });

        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: 'My Emblem card' });
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
        // A user cancelling the native share sheet also lands here (most
        // browsers reject navigator.share's promise with an AbortError) —
        // treated as a quiet cancellation, not a failure, since nothing
        // went wrong and the guardian's own consent event already stands.
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

  const blockedMessage = !eligibility.eligible ? cardShareBlockedMessage(eligibility.reason) : null;

  return (
    <div className="uk-card-share">
      <div className="uk-card-share-preview">
        {preview}
        {eligibility.eligible && stage.type === 'closed' && (
          <button
            type="button"
            className="uk-card-share-icon-btn"
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

      {blockedMessage && stage.type === 'closed' && <p className="uk-card-share-blocked">{blockedMessage}</p>}

      {stage.type === 'confirming' && (
        <div className="uk-card-share-modal-backdrop" role="presentation" onClick={handleCancel}>
          <div
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
      {stage.type === 'shared' && <p role="status">Shared. {CARD_SHARE_RECALL_NOTICE}</p>}
      {stage.type === 'downloaded' && <p role="status">Downloaded. {CARD_SHARE_RECALL_NOTICE}</p>}
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
