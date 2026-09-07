'use client';

import { useEffect, useRef, useState } from 'react';
import { removeBackgroundSmart } from '@/components/builder/emblem/bgRemoval';
import type { PlayerDraft } from '@/lib/emblem-uk-builder';

async function blobUrlToFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'image/png' });
}

type Status = 'processing' | 'ready' | 'error';

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
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [method, setMethod] = useState<'gemini' | 'canvas' | null>(null);
  const [committing, setCommitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photoSrc = player.photo?.srcUrl;
  const alreadyRemoved = Boolean(player.photo?.bgRemoved);

  useEffect(() => {
    let cancelled = false;
    if (!photoSrc) {
      setStatus('error');
      setBeforeUrl(null);
      setAfterUrl(null);
      return;
    }
    setBeforeUrl(photoSrc);
    if (alreadyRemoved) {
      // Already committed on a previous visit to this step — the true
      // "before" no longer exists (it was overwritten on Continue), so we
      // show the current result rather than re-running removal on it.
      setStatus('ready');
      setAfterUrl(null);
      setMethod(null);
      return;
    }
    setStatus('processing');
    setAfterUrl(null);
    (async () => {
      try {
        const file = await blobUrlToFile(photoSrc, player.photo?.fileName || 'photo.jpg');
        const result = await removeBackgroundSmart(file);
        if (cancelled) return;
        setAfterUrl(result.dataUrl);
        setMethod(result.method === 'gemini' ? 'gemini' : 'canvas');
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
    if (status === 'processing' || committing) return;
    if (afterUrl) {
      setCommitting(true);
      try {
        const file = await dataUrlToFile(afterUrl, `${player.photo?.fileName || 'photo'}-cutout.png`);
        const url = URL.createObjectURL(file);
        onPatchPlayer(player.id, {
          photo: player.photo ? { ...player.photo, srcUrl: url, hiResUrl: url, bgRemoved: true } : undefined,
        });
      } finally {
        setCommitting(false);
      }
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

  return (
    <section className="uk-wizard-panel">
      <p className="uk-wizard-kicker">Remove background</p>
      <h1>Let&apos;s clean up that photo.</h1>
      <p className="uk-wizard-copy">Our AI lifts them off the background so the card art looks sharp. This takes a few seconds.</p>

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
          <small>Hang tight, this only takes a moment.</small>
        </div>
      )}

      {status === 'ready' && beforeUrl && (
        <div className="uk-bgremove-compare">
          <figure>
            <div className="uk-bgremove-frame original">
              <img src={beforeUrl} alt="Original photo" />
            </div>
            <figcaption>Original</figcaption>
          </figure>
          <figure>
            <div className="uk-bgremove-frame result">
              <img src={afterUrl || beforeUrl} alt="Background removed" />
            </div>
            <figcaption>Background removed</figcaption>
          </figure>
        </div>
      )}

      {status === 'ready' && method === 'canvas' && (
        <p className="uk-bgremove-note">We couldn&apos;t reach the AI just now, so the original photo carries through unchanged — you can still continue, or replace the photo to try again.</p>
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
