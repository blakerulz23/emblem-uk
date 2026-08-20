'use client';

import { useEffect, useState } from 'react';
import { computeCloseConsequence } from '@/lib/squad-invite-close-consequence';

type Phase = 'idle' | 'confirming' | 'submitting' | 'error';

/**
 * Organiser-facing, self-service close. Two-step confirm, same shape as
 * ReplaceInvitationLink.tsx — the actual authority (ownership,
 * campaign_status='active') lives server-side in close_squad_invite_campaign
 * (migration 0066); this component only drives that endpoint and shows
 * its confirmation copy. The copy itself is computed in
 * squad-invite-close-consequence.ts, kept separate from this component so
 * it can be unit-tested directly (a .tsx file's JSX can't be imported from
 * a plain .test.ts module in this project's vitest setup).
 *
 * onClosed re-fetches the dashboard rather than this component tracking
 * its own success state, since closing changes campaignStatus, which
 * CampaignDashboard already re-renders from.
 */
export default function CloseCampaignButton({
  campaignId, completedCommitments, onClosed,
}: {
  campaignId: string;
  completedCommitments: number;
  onClosed: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [csrfToken, setCsrfToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void fetch('/api/squad-invite-organiser-auth/context', { cache: 'no-store' })
      .then((r) => r.json())
      .then((x) => setCsrfToken(x.csrfToken));
  }, []);

  const consequence = computeCloseConsequence(completedCommitments);

  const confirmClose = async () => {
    if (phase === 'submitting') return;
    setPhase('submitting');
    setErrorMessage('');
    try {
      const response = await fetch(`/api/squad-invites/${encodeURIComponent(campaignId)}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': csrfToken },
        body: JSON.stringify({}),
      });
      if (response.status === 401) {
        setErrorMessage('Your session has expired. Sign in again to close this campaign.');
        setPhase('error');
        return;
      }
      if (response.status === 429) {
        setErrorMessage('Too many attempts. Please wait a few minutes before trying again.');
        setPhase('error');
        return;
      }
      if (!response.ok) {
        setErrorMessage('This campaign could not be closed right now. Please try again shortly.');
        setPhase('error');
        return;
      }
      onClosed();
    } catch {
      setErrorMessage('A network problem stopped the request. Please try again.');
      setPhase('error');
    }
  };

  if (phase === 'idle') {
    return (
      <section className="mt-8 rounded-2xl border bg-white p-6">
        <h2 className="text-2xl font-bold">Close this Squad Invite</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Stop new players from joining or finishing their card, once everyone you expect has joined. You can reopen it yourself later if you need to.
        </p>
        <button type="button" className="mt-4 rounded-xl border-2 border-red-600 px-4 py-2 font-bold text-red-700" onClick={() => setPhase('confirming')}>
          Close campaign
        </button>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border bg-white p-6">
      <h2 className="text-2xl font-bold">Close this Squad Invite</h2>
      <div className="mt-3 rounded-xl bg-amber-50 p-4">
        {consequence.leadLine && (
          <p className={consequence.leadBold ? 'font-bold text-amber-900' : 'text-sm text-amber-900'}>{consequence.leadLine}</p>
        )}
        <p className={consequence.leadLine ? 'mt-2 text-sm text-amber-900' : 'font-bold text-amber-900'}>{consequence.consequenceLine}</p>
        {(phase === 'confirming' || phase === 'submitting') && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={phase === 'submitting'} className="rounded-xl bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-60" onClick={confirmClose}>
              {phase === 'submitting' ? 'Closing…' : 'Yes, close it'}
            </button>
            <button type="button" disabled={phase === 'submitting'} className="rounded-xl border px-4 py-2 font-bold" onClick={() => setPhase('idle')}>
              Cancel
            </button>
          </div>
        )}
        {phase === 'error' && (
          <>
            <p role="alert" className="mt-3 text-red-800">{errorMessage}</p>
            <button type="button" className="mt-3 rounded-xl border-2 border-red-600 px-4 py-2 font-bold text-red-700" onClick={() => setPhase('confirming')}>
              Try again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
