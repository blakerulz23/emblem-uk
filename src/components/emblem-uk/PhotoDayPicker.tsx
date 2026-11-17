'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type PhotoDayBuilderState = {
  scheduledFor: string;
  venueLabel: string;
  canGrant: boolean;
  decision: 'granted' | 'declined' | 'withdrawn' | null;
  published: boolean;
  /** Only the photos matched to this parent's own child. */
  photoIds: string[];
  squadNumber: number | null;
};

function readSquadInviteCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )emblem_squad_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * File name given to a chosen Photo Day photo, so the builder can recognise
 * (and drop) it if the parent withdraws permission before sending the card.
 */
export const PHOTO_DAY_FILE_PREFIX = 'photo-day-';

const photoUrl = (participationId: string, photoId: string) =>
  `/api/squad-invite-participations/${encodeURIComponent(participationId)}/photo-day-photos/${encodeURIComponent(photoId)}`;

/**
 * Photo Day on the builder's photo step (phase 3). Shows ONLY this child's
 * matched photos, served by the ownership-checked same-origin proxy.
 * Choosing one hands it to the builder as if the parent had uploaded it,
 * so crop, background removal, the commit upload and printing are the
 * exact same path as any other card photo.
 */
export default function PhotoDayPicker({ participationId, photoDay, onChoose, onWithdrawn }: {
  participationId: string;
  photoDay: PhotoDayBuilderState;
  onChoose: (file: File) => void;
  /** Must drop any Photo Day photo already on the card (see PHOTO_DAY_FILE_PREFIX). */
  onWithdrawn: () => void;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  if (photoDay.decision !== 'granted') return null;
  const dateText = new Date(`${photoDay.scheduledFor}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  async function choose(photoId: string) {
    setError('');
    setLoadingId(photoId);
    try {
      const response = await fetch(photoUrl(participationId, photoId), { cache: 'no-store' });
      if (!response.ok) { setError('That photo could not be loaded. Try again.'); return; }
      const blob = await response.blob();
      onChoose(new File([blob], `${PHOTO_DAY_FILE_PREFIX}${photoId.slice(0, 8)}.jpg`, { type: 'image/jpeg' }));
    } catch {
      setError('A network problem stopped the photo loading. Try again.');
    } finally {
      setLoadingId(null);
    }
  }

  async function withdraw() {
    if (!window.confirm('Withdraw Photo Day permission? Your child’s Photo Day photos will no longer be offered, and a Photo Day photo already on the card will be removed.')) return;
    setError('');
    setWithdrawing(true);
    try {
      const response = await fetch(`/api/squad-invite-participations/${encodeURIComponent(participationId)}/photo-day-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': readSquadInviteCsrfCookie() },
        body: JSON.stringify({ granted: false }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) { setError(json?.error ?? 'Your choice could not be saved. Try again.'); return; }
      onWithdrawn();
      router.refresh();
    } catch {
      setError('A network problem stopped the request. Try again.');
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <section className="uk-photo-day-picker" aria-labelledby="photo-day-picker-heading"
      style={{ margin: '16px 0', padding: 16, borderRadius: 16, border: '2px solid #bae6fd', background: '#f0f9ff' }}>
      <h2 id="photo-day-picker-heading" style={{ fontWeight: 700, fontSize: 18 }}>Your Photo Day photos</h2>

      {!photoDay.published && (
        <p style={{ marginTop: 4 }}>
          Photos from {dateText} at {photoDay.venueLabel} will appear here once Emblem has matched them to your child.
          If you want one on the card, come back then before sending your card.
        </p>
      )}
      {photoDay.published && photoDay.photoIds.length === 0 && (
        <p style={{ marginTop: 4 }}>No Photo Day photos were matched to your child. Upload your own photo below.</p>
      )}
      {photoDay.published && photoDay.photoIds.length > 0 && (
        <>
          <p style={{ marginTop: 4 }}>Tap a photo to use it on the card. You can still upload your own instead.</p>
          <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginTop: 10, listStyle: 'none', padding: 0 }}>
            {photoDay.photoIds.map((id, index) => (
              <li key={id}>
                <button type="button" onClick={() => void choose(id)} disabled={loadingId !== null}
                  aria-label={`Use Photo Day photo ${index + 1}`}
                  style={{ display: 'block', width: '100%', padding: 0, border: '2px solid transparent', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', opacity: loadingId && loadingId !== id ? 0.5 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, same-origin, ownership-checked proxy; next/image would cache it */}
                  <img src={photoUrl(participationId, id)} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '3 / 4', objectFit: 'cover' }} />
                </button>
                {loadingId === id && <p style={{ fontSize: 12, marginTop: 4 }}>Loading…</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" onClick={() => void withdraw()} disabled={withdrawing}
        style={{ marginTop: 12, fontSize: 13, textDecoration: 'underline', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        {withdrawing ? 'Withdrawing…' : 'Withdraw Photo Day permission'}
      </button>
      {error && <p role="alert" style={{ marginTop: 8, color: '#b91c1c', fontWeight: 600 }}>{error}</p>}
    </section>
  );
}
