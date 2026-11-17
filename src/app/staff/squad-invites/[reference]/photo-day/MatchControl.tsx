'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Child = { id: string; label: string };

type Props = {
  campaignId: string;
  photoId: string;
  matchedParticipationId: string | null;
  matchedLabel: string | null;
  options: Child[];
  canMatch: boolean;
};

/**
 * Match or unmatch one photo. The route and match_photo_day_photo re-check
 * consent and campaign membership; the dropdown only offers children whose
 * parent has Photo Day permission right now.
 */
export default function MatchControl({ campaignId, photoId, matchedParticipationId, matchedLabel, options, canMatch }: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function send(body: Record<string, string>) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(
        `/api/staff/squad-invites/${encodeURIComponent(campaignId)}/photo-day/photos/${encodeURIComponent(photoId)}/match`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) { setError(json?.error ?? 'That did not work.'); return; }
      router.refresh();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (matchedParticipationId) {
    return (
      <div className="mt-2 text-sm" aria-busy={pending}>
        <p className="font-semibold text-emerald-800">✓ {matchedLabel ?? 'Matched'}</p>
        <button type="button" disabled={pending} onClick={() => void send({ action: 'unmatch' })}
          className="mt-1 min-h-[40px] rounded-lg border border-neutral-300 px-3 py-1 font-semibold hover:bg-neutral-50 disabled:opacity-60">
          {pending ? 'Undoing…' : 'Unmatch'}
        </button>
        {error && <p role="alert" className="mt-1 font-semibold text-red-700">{error}</p>}
      </div>
    );
  }

  if (!canMatch) return null;
  return (
    <form className="mt-2 grid gap-1 text-sm" aria-busy={pending}
      onSubmit={(e) => { e.preventDefault(); if (choice) void send({ action: 'match', participationId: choice }); }}>
      <label className="sr-only" htmlFor={`child-${photoId}`}>Child in this photo</label>
      <select id={`child-${photoId}`} value={choice} onChange={(e) => setChoice(e.target.value)}
        className="min-h-[40px] rounded-lg border border-neutral-300 px-2">
        <option value="">Who is this?</option>
        {options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <button type="submit" disabled={pending || !choice}
        className="min-h-[40px] rounded-lg bg-orange-600 px-3 py-1 font-bold text-white hover:bg-orange-700 disabled:opacity-50">
        {pending ? 'Matching…' : 'Match'}
      </button>
      {error && <p role="alert" className="font-semibold text-red-700">{error}</p>}
    </form>
  );
}
