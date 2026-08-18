'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Lock freezes a submitted coach card for production — review_squad_invite_coach_card
 * (migration 0059) refuses to run again once configuration_status is
 * 'locked', so this is the genuinely irreversible action here and gets the
 * confirm() prompt, not "Request changes" (which just reopens it for the
 * organiser to resubmit — the safe, reversible one).
 */
export default function CoachCardReviewActions({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<'lock' | 'request_changes' | null>(null);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const act = async (action: 'lock' | 'request_changes') => {
    if (pending) return;
    if (action === 'lock' && !window.confirm('Lock this coach card for production? This cannot be undone from here.')) return;
    if (action === 'request_changes' && reason.trim().length === 0) {
      setMessage('A reason is required to request changes.');
      setMessageIsError(true);
      return;
    }
    setPending(action);
    setMessage('');
    setMessageIsError(false);
    try {
      const response = await fetch(`/api/staff/squad-invites/${encodeURIComponent(campaignId)}/coach-card/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'request_changes' ? reason.trim() : undefined }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error || 'The coach card could not be updated.');
        setMessageIsError(true);
        return;
      }
      setMessage(action === 'lock' ? 'Locked for production.' : 'Sent back to the organiser.');
      setMessageIsError(false);
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-3 grid gap-3" aria-busy={pending !== null}>
      <label htmlFor="coach-card-reason" className="block text-sm">
        <span className="font-semibold">Reason (required to request changes)</span>
        <textarea
          id="coach-card-reason"
          className="mt-1 block w-full rounded-xl border border-neutral-300 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => act('lock')}
          disabled={pending !== null}
          className="min-h-[44px] rounded-xl border-2 border-emerald-700 bg-emerald-700 px-4 py-2 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending === 'lock' ? 'Locking…' : 'Lock for production'}
        </button>
        <button
          type="button"
          onClick={() => act('request_changes')}
          disabled={pending !== null}
          className="min-h-[44px] rounded-xl border-2 border-amber-600 bg-white px-4 py-2 font-bold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60"
        >
          {pending === 'request_changes' ? 'Sending…' : 'Request changes'}
        </button>
      </div>
      {message && (
        <p role={messageIsError ? 'alert' : 'status'} className={messageIsError ? 'text-sm font-semibold text-red-700' : 'text-sm font-semibold text-emerald-700'}>
          {message}
        </p>
      )}
    </div>
  );
}
