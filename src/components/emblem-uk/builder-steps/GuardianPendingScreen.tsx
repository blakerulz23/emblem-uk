'use client';

import { useState } from 'react';
import { BUILDER_CSRF_HEADER, readBuilderCsrfCookie } from '@/lib/print-capture';

/**
 * Shown after an order is created by a non-guardian adult (coach/club
 * organiser/other) — order.authority_status is already
 * guardian_approval_pending server-side at this point (migration 0071).
 * Collects the real guardian email and, in one request, has the server
 * generate + hash a fresh approval token and email the guardian (see
 * /api/builder-authority/guardian-email). Deliberately reassuring, not
 * alarming: the card and order already exist and are saved — this screen
 * is only asking for one more piece of information.
 */
export default function GuardianPendingScreen({ orderId }: { orderId: string | null }) {
  const [guardianEmail, setGuardianEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!guardianEmail.trim() || !guardianEmail.includes('@')) {
      setError('Enter the guardian’s email address.');
      return;
    }
    if (!orderId) {
      setError('Something went wrong — please refresh and try again.');
      return;
    }
    setStatus('sending');
    try {
      const response = await fetch('/api/builder-authority/guardian-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
        body: JSON.stringify({ orderId, guardianEmail: guardianEmail.trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setStatus('error');
        setError(result?.error || 'Could not send that request — please try again.');
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('error');
      setError('Could not send that request — please try again.');
    }
  };

  return (
    <section className="uk-wizard-panel">
      <p className="uk-wizard-kicker">Almost there</p>
      <h1>Guardian approval required</h1>
      <p className="uk-wizard-copy">
        We&apos;ll send a secure approval request to the player&apos;s parent or legal guardian. Your card will be
        saved while we wait.
      </p>

      {status === 'sent' ? (
        <div className="uk-enquiry-success">
          <strong>Approval request sent.</strong>
          <span>We&apos;ll let you know as soon as the guardian responds. Nothing more is needed from you right now.</span>
        </div>
      ) : (
        <div className="uk-adult-permission-card">
          <label>
            Guardian&apos;s email
            <input
              type="email"
              autoComplete="email"
              value={guardianEmail}
              onChange={(event) => setGuardianEmail(event.target.value)}
              placeholder="guardian@example.com"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'uk-guardian-email-error' : undefined}
            />
          </label>
          {error && <p id="uk-guardian-email-error" className="uk-enquiry-error" role="alert">{error}</p>}
          <button type="button" className="uk-wizard-primary" onClick={handleSubmit} disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send approval request'}
          </button>
        </div>
      )}
    </section>
  );
}
