'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SafeSquadInviteProjection } from '@/lib/squad-invite-link';

/**
 * Every fetch call, endpoint, body shape, and the CSRF header below is
 * unchanged from before this UI correction — this file only changed how
 * the same three handlers (start/sendCode/verifyCode) are rendered, plus
 * added client-side loading/cooldown state (no server behaviour change).
 */
export default function JoinSquadInvite({ invitation, csrfToken }: { invitation: SafeSquadInviteProjection; csrfToken: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'ready' | 'email' | 'code'>('ready');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const id = setInterval(() => setCooldown((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const start = async () => {
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/squad-invite-links/participation', { method: 'POST', headers: { 'X-Emblem-CSRF': csrfToken } });
      if (response.status === 401) { setStep('email'); return; }
      if (!response.ok) { setError('This Squad Invite is unavailable.'); return; }
      const result = (await response.json()) as { participationId: string };
      router.push(`/builder?squadParticipation=${encodeURIComponent(result.participationId)}`);
    } finally {
      setSubmitting(false);
    }
  };
  const requestCode = async () => {
    setError('');
    setSubmitting(true);
    try {
      let response: Response;
      try {
        response = await fetch('/api/squad-invite-auth/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': csrfToken },
          body: JSON.stringify({ email: email.trim() }),
        });
      } catch {
        // Network failure — distinct from a server-side rejection. Stays
        // on the email step either way.
        setError('A network problem stopped the request. Check your connection and try again.');
        return;
      }
      // This app's own rate limit (distinct from any Supabase-side limit).
      if (response.status === 429) { setError('Please wait before requesting another code.'); return; }
      // A non-ok, non-429 response means Supabase itself rejected or
      // failed to accept the request (project rate limit, mailer
      // failure, etc). Never advance to code entry on this path — the
      // route only ever returns ok:true once Supabase has actually
      // accepted the request, never as a claim that an email arrived.
      if (!response.ok) { setError('We could not request a verification code right now. Please try again shortly.'); return; }
      setCooldown(60);
      setStep('code');
    } finally {
      setSubmitting(false);
    }
  };
  const sendCode = (event: React.FormEvent) => {
    event.preventDefault();
    void requestCode();
  };
  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/squad-invite-auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': csrfToken },
        body: JSON.stringify({ email: email.trim(), code: code.trim(), returnTo: '/squad-invite/join' }),
      });
      if (!response.ok) { setError('That verification code was not accepted.'); return; }
      await start();
    } finally {
      setSubmitting(false);
    }
  };

  const deadlineText = new Date(invitation.deadlineAt).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' });

  // The server (resolve_squad_invite_link in 0051_squad_invite_reusable_links.sql)
  // only returns the derived tier/unlocked flags, never the raw thresholds —
  // so a "X more joins unlocks Y" message needs its own copy of the same two
  // numbers pricing-engine.ts defines as MULTI_MIN_PLAYERS/SQUAD_MIN_PLAYERS.
  // Keep these in sync with both if either ever changes.
  const MULTI_MIN_DISPLAY = 2;
  const SQUAD_MIN_DISPLAY = 10;
  const progressPct = Math.min(100, (invitation.completedCommitments / SQUAD_MIN_DISPLAY) * 100);
  const multiMarkerPct = (MULTI_MIN_DISPLAY / SQUAD_MIN_DISPLAY) * 100;

  let incentiveHeadline: string;
  let incentiveDetail: string;
  if (invitation.currentIncentive === 'squad') {
    incentiveHeadline = 'Full Squad pricing unlocked';
    incentiveDetail = invitation.freeCoachCardConfirmed
      ? `${invitation.completedCommitments} joined — the lowest price per card, plus a free coach card.`
      : `${invitation.completedCommitments} joined — the lowest price per card.`;
  } else if (invitation.currentIncentive === 'multi') {
    const remaining = Math.max(1, SQUAD_MIN_DISPLAY - invitation.completedCommitments);
    incentiveHeadline = `${invitation.completedCommitments} of ${SQUAD_MIN_DISPLAY} joined`;
    incentiveDetail = `${remaining} more ${remaining === 1 ? 'join' : 'joins'} unlocks Full Squad pricing and a free coach card.`;
  } else {
    const remaining = Math.max(1, MULTI_MIN_DISPLAY - invitation.completedCommitments);
    incentiveHeadline = invitation.completedCommitments === 0 ? 'Be the first to join' : `${invitation.completedCommitments} joined so far`;
    incentiveDetail = `${remaining} more ${remaining === 1 ? 'join' : 'joins'} unlocks better pricing for the whole team.`;
  }

  return (
    // pb-28: the persistent disposable-MVP notice is a fixed bottom bar
    // rendered by shared chrome (ConditionalChrome/DisposableSquadInviteNotice),
    // not by this component — this padding keeps it from covering the
    // final control on short viewports rather than trying to alter it.
    <main className="min-h-screen bg-[#f5f0e8] px-4 py-8 pb-28 text-[#17251d] sm:px-6 sm:py-12">
      <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#36754a]">Emblem Squad Invite</p>

        <header className="mt-4 rounded-2xl bg-[#f5f0e8] p-5">
          <h1 className="text-2xl font-bold sm:text-3xl">{invitation.teamName}</h1>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-[#5b6b60]">Age group</dt>
              <dd className="font-semibold">{invitation.ageGroup}</dd>
            </div>
            <div>
              <dt className="text-[#5b6b60]">Deadline</dt>
              <dd className="font-semibold">{deadlineText}</dd>
            </div>
          </dl>
        </header>

        {/* Squad Invite's pricing incentive, made the headline it deserves to
         * be instead of a small dt/dd pair — completedCommitments and
         * currentIncentive already drove the old text version, this just
         * makes the same live data motivating and legible at a glance. */}
        <div className="mt-4 rounded-2xl border border-[#c9c2b3] bg-[#f5f0e8] p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-bold text-[#173f2a]">{incentiveHeadline}</p>
            <span className="rounded-full bg-[#173f2a] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              {invitation.currentIncentive === 'squad' ? 'Squad' : invitation.currentIncentive === 'multi' ? 'Multi' : 'Single'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#5b6b60]">{incentiveDetail}</p>
          <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#e4ded2]">
            <div className="h-full rounded-full bg-[#36754a] transition-[width]" style={{ width: `${progressPct}%` }} />
            <div className="absolute top-0 h-full w-px bg-[#173f2a]/40" style={{ left: `${multiMarkerPct}%` }} aria-hidden="true" />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-[#5b6b60]">
            <span>0 joined</span>
            <span>{SQUAD_MIN_DISPLAY} = Full Squad</span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[#173f2a] bg-[#eef6f0] p-4">
          <p className="font-bold text-[#173f2a]">Payment requests are not active during this test.</p>
          <p className="mt-1 text-sm text-[#173f2a]">No card details are collected and nothing will be charged while this controlled pilot is running.</p>
        </div>

        <section className="mt-5 grid gap-3 text-sm">
          <div className="rounded-xl border border-[#e4ded2] p-4">
            <h2 className="font-bold">What you&apos;ll create</h2>
            <p className="mt-1">{invitation.productSummary}</p>
          </div>
          <div className="rounded-xl border border-[#e4ded2] p-4">
            <h2 className="font-bold">Delivery</h2>
            <p className="mt-1">{invitation.deliverySummary}</p>
          </div>
          <div className="rounded-xl border border-[#e4ded2] p-4">
            <h2 className="font-bold">Privacy &amp; participation</h2>
            <p className="mt-1">One team link. Each parent or guardian builds and commits individually.</p>
            <p className="mt-2">Email verification confirms control of the address only. A separate authority declaration is required before submitting a child&apos;s information.</p>
          </div>
        </section>

        <div className="mt-6">
          {step === 'ready' && (
            <button
              type="button"
              onClick={start}
              disabled={submitting}
              aria-busy={submitting}
              className="w-full rounded-full bg-[#173f2a] p-4 font-bold text-white transition hover:bg-[#0f2c1d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f2a] disabled:opacity-60"
            >
              {submitting ? 'Please wait…' : "Create your child's card for this team order"}
            </button>
          )}

          {step === 'email' && (
            <form onSubmit={sendCode} className="grid gap-4" noValidate>
              <label htmlFor="join-email" className="block font-semibold">
                Email address
                <input
                  id="join-email"
                  className="mt-1 block w-full rounded-xl border border-[#c9c2b3] p-3 focus-visible:border-[#173f2a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f2a]"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'join-form-error' : undefined}
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="w-full rounded-xl bg-orange-600 p-3 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send verification code'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="grid gap-4" noValidate>
              <p className="text-sm text-[#5b6b60]">
                A verification code was requested for this address. If it doesn&apos;t arrive shortly, use Resend below, or Change email if you entered it
                incorrectly.
              </p>
              <label htmlFor="join-code" className="block font-semibold">
                Verification code
                <input
                  id="join-code"
                  className="mt-1 block w-full rounded-xl border border-[#c9c2b3] p-3 focus-visible:border-[#173f2a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f2a]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'join-form-error' : undefined}
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="w-full rounded-xl bg-orange-600 p-3 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
              >
                {submitting ? 'Verifying…' : 'Verify and continue'}
              </button>
              <div className="flex flex-wrap gap-4 text-sm">
                <button type="button" className="font-semibold text-[#173f2a] underline disabled:opacity-50" disabled={cooldown > 0 || submitting} onClick={() => void requestCode()}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
                <button
                  type="button"
                  className="font-semibold text-[#173f2a] underline"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setError('');
                  }}
                >
                  Change email
                </button>
              </div>
            </form>
          )}

          {error && (
            <p id="join-form-error" role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
