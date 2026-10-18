'use client';

import { useEffect, useRef, useState } from 'react';
import { removeBackgroundOnDevice } from '@/components/builder/emblem/bgRemovalOnDevice';
import { autoFitPatchForPhoto } from '@/lib/card-photo-auto-fit';
import type { PlayerDraft } from '@/lib/emblem-uk-builder';

async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

type Status = 'processing' | 'ready' | 'error';
type Choice = 'cutout' | 'original';

/**
 * Background removal, on this device (adapted from Emblem Canada). The photo
 * is cut out in the browser by bgRemovalOnDevice.ts — it is never sent to
 * Gemini or any other service for this step. The guardian sees the original
 * and the result side by side, chooses which to use, and can switch back to
 * the original later (the untouched upload is kept as photo.originalUrl).
 */
export default function BackgroundRemovalStep({
  player,
  isSquad,
  playerIndex,
  playerCount,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onPatchPlayer,
  onContinue,
}: {
  player: PlayerDraft;
  isSquad: boolean;
  playerIndex: number;
  playerCount: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPatchPlayer: (id: string, patch: Partial<PlayerDraft>) => void;
  onContinue: () => void;
}) {
  const [status, setStatus] = useState<Status>('processing');
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [engineFailed, setEngineFailed] = useState(false);
  const [choice, setChoice] = useState<Choice>('cutout');
  const [committing, setCommitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photo = player.photo;
  const photoSrc = photo?.srcUrl;
  // The untouched upload: originalUrl once a cut-out has been committed,
  // otherwise the current photo itself.
  const alreadyRemoved = Boolean(photo?.bgRemoved);
  // After a cut-out is committed, the original is only offered while its
  // bytes still exist (a restored draft can lose them).
  const originalSrc = alreadyRemoved ? photo?.originalUrl || undefined : photoSrc;

  useEffect(() => {
    let cancelled = false;
    setEngineFailed(false);
    if (!photoSrc) {
      setStatus('error');
      setCutoutUrl(null);
      return;
    }
    if (alreadyRemoved) {
      // Committed on an earlier visit: show it, and offer the original back.
      setCutoutUrl(photoSrc);
      setChoice('cutout');
      setStatus('ready');
      return;
    }
    setStatus('processing');
    setCutoutUrl(null);
    setChoice('cutout');
    (async () => {
      try {
        const result = await removeBackgroundOnDevice(await urlToBlob(photoSrc));
        if (cancelled) return;
        if (result.method === 'on-device') {
          const blob = await urlToBlob(result.dataUrl);
          if (cancelled) return;
          setCutoutUrl(URL.createObjectURL(blob));
        } else {
          setEngineFailed(true);
          setChoice('original');
        }
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, photoSrc, alreadyRemoved]);

  const handleContinue = async () => {
    if (status === 'processing' || committing || !photo || !photoSrc) {
      if (status !== 'processing' && !committing) onContinue();
      return;
    }
    setCommitting(true);
    try {
      if (choice === 'cutout' && cutoutUrl && !alreadyRemoved) {
        const untouched = photoSrc;
        // Auto-fit runs once here, right after the cut-out is chosen — the
        // guardian's later manual framing is never silently overwritten.
        const autoFit = await autoFitPatchForPhoto(cutoutUrl);
        onPatchPlayer(player.id, {
          photo: { ...photo, srcUrl: cutoutUrl, hiResUrl: cutoutUrl, bgRemoved: true, originalUrl: untouched, ...(autoFit ?? {}) },
        });
      } else if (choice === 'original' && alreadyRemoved && originalSrc) {
        // Back to the untouched upload, with framing worked out for it afresh.
        const autoFit = await autoFitPatchForPhoto(originalSrc);
        onPatchPlayer(player.id, {
          photo: { ...photo, srcUrl: originalSrc, hiResUrl: originalSrc, bgRemoved: false, originalUrl: undefined, crop: { x: 0, y: 0, scale: 1 }, suggestedCrop: undefined, subjectBounds: undefined, ...(autoFit ?? {}) },
        });
      }
    } finally {
      setCommitting(false);
    }
    onContinue();
  };

  const handleReplace = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    onPatchPlayer(player.id, {
      photo: { srcUrl: url, hiResUrl: url, crop: { x: 0, y: 0, scale: 1 }, bgRemoved: false, fileName: file.name },
    });
  };

  const showCompare = status === 'ready';

  return (
    <section className="uk-wizard-panel">
      <p className="uk-wizard-kicker">Remove background</p>
      <h1>Let&apos;s clean up that photo.</h1>
      <p className="uk-wizard-copy">
        We lift the player off the background right here on your device. The photo isn&apos;t sent anywhere for this step.
      </p>

      {isSquad && (
        <div className="uk-squad-edit-bar">
          <button type="button" onClick={onPrev} disabled={!canPrev}>Previous</button>
          <span>{playerIndex + 1} of {playerCount}</span>
          <button type="button" onClick={onNext} disabled={!canNext}>Next</button>
        </div>
      )}

      {status === 'error' && (
        <div className="uk-bgremove-error">
          <strong>We couldn&apos;t load that photo.</strong>
          <span>Replace it below, or go back and upload it again.</span>
        </div>
      )}

      {status === 'processing' && (
        <div className="uk-bgremove-processing">
          <span className="uk-bgremove-spinner" aria-hidden="true" />
          <strong>Removing the background&hellip;</strong>
          <small>This happens on your device. The first time can take a little longer.</small>
        </div>
      )}

      {showCompare && (
        <div className="uk-bgremove-compare" role="radiogroup" aria-label="Which photo should the card use?">
          {originalSrc && (
          <figure>
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'original'}
              className={`uk-bgremove-frame original${choice === 'original' ? ' is-chosen' : ''}`}
              onClick={() => setChoice('original')}
            >
              <img src={originalSrc} alt="Original photo" />
            </button>
            <figcaption>Original</figcaption>
          </figure>
          )}
          <figure>
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'cutout'}
              className={`uk-bgremove-frame result${choice === 'cutout' ? ' is-chosen' : ''}`}
              onClick={() => cutoutUrl && setChoice('cutout')}
              disabled={!cutoutUrl}
            >
              <img src={cutoutUrl || photoSrc} alt="Background removed" />
            </button>
            <figcaption>Background removed</figcaption>
          </figure>
        </div>
      )}

      {showCompare && cutoutUrl && originalSrc && (
        <p className="uk-bgremove-note">
          {choice === 'cutout'
            ? 'Using the background-removed photo. Tap the original to use that instead.'
            : 'Using the original photo. Tap the other one to remove the background.'}
        </p>
      )}

      {status === 'ready' && engineFailed && (
        <p className="uk-bgremove-note">We couldn&apos;t remove the background on this device just now, so the original photo carries through unchanged. You can still continue, or replace the photo to try again.</p>
      )}

      <div className="uk-bgremove-actions">
        <label className="uk-bgremove-replace">
          Replace photo
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => handleReplace(event.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          className="uk-wizard-primary compact"
          onClick={handleContinue}
          disabled={status === 'processing' || committing}
        >
          {committing ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </section>
  );
}
