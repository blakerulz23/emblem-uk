'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buildSocialShareImage, downloadBlob, shareOrDownloadSocialImage, type ShareOutcome } from '@/lib/card-share';

/**
 * Bumping this string is how "the guardian must consent again" is actually
 * enforced for the wording itself — record_card_share_consent (0078)
 * stores whatever version string it's called with, so a future copy change
 * only needs this constant updated, not a schema change.
 */
export const SHARE_CONSENT_WORDING_VERSION = 'v1';

const CANONICAL_BUILDER_DOMAIN = 'emblem.cards';

export interface ShareCardSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The order this consent and share are for — the only identifier this
   *  component sends to the server. Never a card definition id, guardian
   *  id, or hash — those are all derived server-side. */
  orderId: string;
  /** The exact, already-approved card-front element to capture — a real
   *  React element the caller controls (e.g. <PlayerCard .../>), never a
   *  raw HTML string or URL. */
  cardFront: ReactNode;
  /** Calls record_card_share_consent(orderId, ...) and returns { ok } or
   *  throws. Injected so this component never constructs its own Supabase
   *  client or knows about RPC wiring — kept a narrow, testable seam. */
  recordConsent: (args: { orderId: string; confirmedAuthority: boolean; confirmedRecallUnderstanding: boolean; consentWordingVersion: string }) => Promise<{ ok: boolean }>;
}

type Phase = 'consent' | 'preparing' | 'preview' | 'shared' | 'downloaded' | 'error';

export default function ShareCardSheet({ isOpen, onClose, orderId, cardFront, recordConsent }: ShareCardSheetProps) {
  const [confirmedAuthority, setConfirmedAuthority] = useState(false);
  const [confirmedRecall, setConfirmedRecall] = useState(false);
  const [phase, setPhase] = useState<Phase>('consent');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const canShare = confirmedAuthority && confirmedRecall;

  function releaseImage() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    blobRef.current = null;
  }

  // Belt-and-braces release on unmount, in addition to the explicit
  // release on close/finish below — a guardian navigating away mid-flow
  // (back button, route change) must not leak the object URL either.
  useEffect(() => () => releaseImage(), []);

  if (!isOpen) return null;

  function handleClose() {
    releaseImage();
    setPhase('consent');
    setErrorMessage(null);
    onClose();
  }

  /** Records consent (once) and builds the composed social image (once),
   *  reusing whatever was already produced by a prior click in this same
   *  open sheet. */
  async function ensureConsentAndImage(): Promise<Blob | null> {
    if (blobRef.current) return blobRef.current;
    if (!captureRef.current) return null;

    const consentResult = await recordConsent({
      orderId,
      confirmedAuthority,
      confirmedRecallUnderstanding: confirmedRecall,
      consentWordingVersion: SHARE_CONSENT_WORDING_VERSION,
    });
    if (!consentResult.ok) {
      setPhase('error');
      setErrorMessage('This card is not available to share right now.');
      return null;
    }

    const blob = await buildSocialShareImage(captureRef.current, { domain: CANONICAL_BUILDER_DOMAIN });
    blobRef.current = blob;
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setPhase('preview');
    return blob;
  }

  async function handleShareCard() {
    if (!canShare) return;
    setPhase('preparing');
    setErrorMessage(null);
    try {
      const blob = await ensureConsentAndImage();
      if (!blob) return;

      const outcome: ShareOutcome = await shareOrDownloadSocialImage(blob, 'My Emblem card');
      if (outcome.kind === 'cancelled') {
        // A cancelled native share is a normal, silent action — stay on
        // the composed-image preview, no error state.
        setPhase('preview');
        return;
      }
      setPhase(outcome.kind === 'downloaded' ? 'downloaded' : 'shared');
    } catch {
      // Never log the underlying error — it could echo image or consent
      // details. A single generic message covers every genuine failure.
      setPhase('error');
      setErrorMessage('Something went wrong creating your share image. Please try again.');
    }
  }

  async function handleDownloadFallback() {
    if (!canShare) return;
    setPhase('preparing');
    setErrorMessage(null);
    try {
      const blob = await ensureConsentAndImage();
      if (!blob) return;
      downloadBlob(blob);
      setPhase('downloaded');
    } catch {
      setPhase('error');
      setErrorMessage('Something went wrong creating your share image. Please try again.');
    }
  }

  const busy = phase === 'preparing';

  return (
    <div className="uk-share-sheet-overlay" role="presentation" onClick={handleClose}>
      <div
        className="uk-share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="uk-share-sheet-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="uk-share-sheet-close" onClick={handleClose} aria-label="Close">
          &times;
        </button>

        <p className="uk-share-sheet-eyebrow">SHARE TO SOCIALS</p>
        <h2 id="uk-share-sheet-heading">Share your card</h2>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Your Emblem card, ready to share" className="uk-share-sheet-social-preview" />
        ) : (
          <div className="uk-share-sheet-preview" ref={captureRef}>
            {cardFront}
          </div>
        )}

        <p className="uk-share-sheet-warning">
          This image may include your child&rsquo;s photograph, name and club. If you share it publicly, other people and social
          platforms may save or copy it. Emblem cannot remove copies shared outside Emblem.
        </p>

        <label className="uk-share-sheet-checkbox">
          <input type="checkbox" checked={confirmedAuthority} onChange={(e) => setConfirmedAuthority(e.target.checked)} disabled={busy} />
          I have parental responsibility or authority to share this child&rsquo;s card image.
        </label>
        <label className="uk-share-sheet-checkbox">
          <input type="checkbox" checked={confirmedRecall} onChange={(e) => setConfirmedRecall(e.target.checked)} disabled={busy} />
          I understand that publicly shared copies cannot be recalled.
        </label>

        {phase === 'error' && errorMessage && (
          <p className="uk-share-sheet-error" role="alert">
            {errorMessage}
          </p>
        )}
        {phase === 'shared' && <p className="uk-share-sheet-status">Shared.</p>}
        {phase === 'downloaded' && <p className="uk-share-sheet-status">Downloaded.</p>}

        <button type="button" className="uk-share-sheet-primary" disabled={!canShare || busy} onClick={handleShareCard}>
          {busy ? 'Preparing…' : 'Share card'}
        </button>
        <button type="button" className="uk-share-sheet-secondary" disabled={!canShare || busy} onClick={handleDownloadFallback}>
          Download image
        </button>
      </div>
    </div>
  );
}
