'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Organiser-facing "lost the link" recovery control. The heavy lifting
 * (ownership + CSRF + rate limit + campaign-eligibility checks, atomic
 * revoke-and-create, hashed-only persistence) all lives server-side in
 * POST /api/squad-invites/[id]/invitation-link — this component only
 * drives that endpoint and displays its one-time response. It never
 * persists the returned link anywhere itself: no localStorage/
 * sessionStorage, no console/analytics call, and nothing here re-renders
 * it after the user navigates away (there is nothing to re-render from —
 * the component holds the only copy, in React state, for this page load
 * only).
 *
 * True cross-tab/network-retry idempotency is a documented limitation,
 * not something this guard claims to solve — see the warning copy below
 * and the project readiness notes. submittingRef only prevents a second
 * click on THIS page before the first response lands; it cannot stop a
 * second rotation started from a different tab or device. The endpoint's
 * own atomic revoke-then-insert still guarantees at most one *usable*
 * link exists afterwards either way — a duplicate attempt only means an
 * earlier response (if not yet copied) silently stops working.
 */
type Phase = 'idle' | 'confirming' | 'submitting' | 'success' | 'error';

export default function ReplaceInvitationLink({ campaignId }: { campaignId: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [csrfToken, setCsrfToken] = useState('');
  const [newLink, setNewLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    void fetch('/api/squad-invite-organiser-auth/context', { cache: 'no-store' })
      .then((r) => r.json())
      .then((x) => setCsrfToken(x.csrfToken));
  }, []);

  const confirmReplace = async () => {
    // Same-page double-submit guard only — see the top-of-file note on why
    // this is not, and does not claim to be, server-side idempotency.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase('submitting');
    setErrorMessage('');
    let succeeded = false;
    try {
      const response = await fetch(`/api/squad-invites/${encodeURIComponent(campaignId)}/invitation-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': csrfToken },
        body: JSON.stringify({}),
      });
      if (response.status === 401) {
        setErrorMessage('Your session has expired. Sign in again to replace the link.');
        setPhase('error');
        return;
      }
      if (response.status === 429) {
        setErrorMessage('Too many attempts. Please wait a few minutes before trying again.');
        setPhase('error');
        return;
      }
      if (response.status === 409) {
        setErrorMessage('This campaign is not currently eligible for link replacement.');
        setPhase('error');
        return;
      }
      if (!response.ok) {
        setErrorMessage('The invitation link could not be replaced. Please try again shortly.');
        setPhase('error');
        return;
      }
      const body = (await response.json()) as { invitationPath: string };
      // Held only in component state — see the file-level note. Never
      // assigned to a variable that outlives this render, never written to
      // storage, never passed to a logger.
      setNewLink(`${window.location.origin}${body.invitationPath}`);
      setPhase('success');
      succeeded = true;
      // submittingRef intentionally stays true after success — this is a
      // one-shot reveal; a second click can never re-fetch the same link.
    } catch {
      setErrorMessage('A network problem stopped the request. Please try again.');
      setPhase('error');
    } finally {
      if (!succeeded) submittingRef.current = false;
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(newLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (phase === 'success') {
    return (
      <section className="mt-8 rounded-2xl border-2 border-orange-600 bg-white p-6">
        <h2 className="text-2xl font-bold">Your new invitation link</h2>
        <p className="mt-2 text-sm text-neutral-700">
          This is shown once. Copy it now — it cannot be recovered after you leave this page. The previous link has already stopped working.
        </p>
        <input
          className="mt-4 block w-full rounded-xl border p-3 font-mono text-sm"
          readOnly
          value={newLink}
          aria-label="New invitation link"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white" onClick={copyLink}>
            Copy link
          </button>
          <span role="status" aria-live="polite" className="text-sm text-neutral-600">
            {copied ? 'Copied.' : ''}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border bg-white p-6">
      <h2 className="text-2xl font-bold">Lost the invitation link?</h2>
      {phase === 'idle' && (
        <>
          <p className="mt-2 text-sm text-neutral-700">
            You can generate a replacement. Replacing it immediately stops the current link from working — anyone who still has the old link will no longer be able to use it.
          </p>
          <button type="button" className="mt-4 rounded-xl border-2 border-orange-600 px-4 py-2 font-bold text-orange-700" onClick={() => setPhase('confirming')}>
            Replace invitation link
          </button>
        </>
      )}
      {phase === 'confirming' && (
        <div className="mt-3 rounded-xl bg-amber-50 p-4">
          <p className="font-bold text-amber-900">This will immediately stop the current link from working.</p>
          <p className="mt-2 text-sm text-amber-900">
            Anyone still holding the old link — including a parent who hasn&apos;t opened it yet — will no longer be able to use it once you confirm.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white" onClick={confirmReplace}>
              Yes, replace it
            </button>
            <button type="button" className="rounded-xl border px-4 py-2 font-bold" onClick={() => setPhase('idle')}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {phase === 'submitting' && (
        <p className="mt-3" role="status" aria-live="polite" aria-busy="true">
          Replacing your invitation link…
        </p>
      )}
      {phase === 'error' && (
        <>
          <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">
            {errorMessage}
          </p>
          <button type="button" className="mt-3 rounded-xl border-2 border-orange-600 px-4 py-2 font-bold text-orange-700" onClick={() => { submittingRef.current = false; setPhase('confirming'); }}>
            Try again
          </button>
        </>
      )}
    </section>
  );
}
