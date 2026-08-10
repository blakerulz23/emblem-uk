'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type PhotoUploadStatus = 'idle' | 'uploading' | 'success' | 'error';

/**
 * Shared upload logic for the one canonical player photo (players.photo_key,
 * set via POST /api/os/players/[id]/photo) — reused by both Card.tsx and
 * Profile.tsx, which write to the exact same column through the exact same
 * route (see Card.tsx's own comment on PLAYER_PROFILE.photoUrl). This hook
 * only handles the upload call and its own status/error state; it never
 * touches photoUrl itself — the existing photo stays visible throughout
 * (router.refresh() only re-fetches on success), so a failed replacement
 * never clears what was already there.
 */
export function useOsPhotoUpload(playerId: string | null) {
  const router = useRouter();
  const [status, setStatus] = useState<PhotoUploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // Separate status for remove — a failed upload must never be confused
  // with a failed removal (different action, different retry), and vice
  // versa; keeping the current photo visible on either failure relies on
  // neither ever clearing the other's error/idle state prematurely.
  const [removeStatus, setRemoveStatus] = useState<PhotoUploadStatus>('idle');
  const [removeError, setRemoveError] = useState<string | null>(null);

  const uploadPhoto = async (file: File) => {
    if (!playerId || status === 'uploading') return;
    setStatus('uploading');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/os/players/${playerId}/photo`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatus('error');
        setError((body && typeof body.error === 'string' && body.error) || 'Could not upload photo — try again.');
        return;
      }
      setStatus('success');
      router.refresh();
      setTimeout(() => setStatus((current) => (current === 'success' ? 'idle' : current)), 2500);
    } catch {
      setStatus('error');
      setError('Could not upload photo — check your connection and try again.');
    }
  };

  const removePhoto = async () => {
    if (!playerId || removeStatus === 'uploading') return;
    setRemoveStatus('uploading');
    setRemoveError(null);
    try {
      const res = await fetch(`/api/os/players/${playerId}/photo`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setRemoveStatus('error');
        setRemoveError((body && typeof body.error === 'string' && body.error) || 'Could not remove photo — try again.');
        return;
      }
      setRemoveStatus('success');
      router.refresh();
      setTimeout(() => setRemoveStatus((current) => (current === 'success' ? 'idle' : current)), 2500);
    } catch {
      setRemoveStatus('error');
      setRemoveError('Could not remove photo — check your connection and try again.');
    }
  };

  return { status, error, uploadPhoto, removeStatus, removeError, removePhoto };
}
