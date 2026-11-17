'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Releases matched photos to parents (migration 0106's publish_photo_day,
 * Approver). Until this runs, no parent can see any photo.
 */
export default function PublishPhotoDay({ campaignId, matched, childrenWithoutPhotos }: { campaignId: string; matched: number; childrenWithoutPhotos: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function publish() {
    const warning = childrenWithoutPhotos > 0
      ? `\n\n${childrenWithoutPhotos} child${childrenWithoutPhotos === 1 ? ' has' : 'ren have'} no matched photo yet. No new matches can be made after publishing.`
      : '\n\nNo new matches can be made after publishing.';
    if (!window.confirm(`Publish ${matched} matched photo${matched === 1 ? '' : 's'} to parents? Each parent will see only their own child's photos.${warning}`)) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/staff/squad-invites/${encodeURIComponent(campaignId)}/photo-day/publish`, { method: 'POST' });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) { setError(json?.error ?? 'That did not work.'); return; }
      router.refresh();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm" aria-busy={pending}>
      <p className="font-bold text-emerald-900">Ready for parents?</p>
      <p className="mt-1 text-emerald-900">Check every match first. Publishing shows each parent their own child&apos;s matched photos and closes the photographer link. You can still unmatch a photo afterwards to correct a mistake.</p>
      <button type="button" onClick={() => void publish()} disabled={pending || matched === 0}
        className="mt-2 min-h-[44px] rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? 'Publishing…' : 'Publish to parents'}
      </button>
      <p className="mt-1 text-xs text-emerald-900">Requires Approver.</p>
      {error && <p role="alert" className="mt-1 font-semibold text-red-700">{error}</p>}
    </div>
  );
}
