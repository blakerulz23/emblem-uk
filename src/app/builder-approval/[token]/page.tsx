'use client';

import { useState } from 'react';

type Outcome = 'idle' | 'sending' | 'approved' | 'declined' | 'invalid';

/**
 * The guardian's own click-through page from the emailed approval link
 * (migration 0071 / send-builder-guardian-approval-email.ts). No CSRF
 * cookie applies here — the guardian has never visited /builder, so there
 * is nothing to check; the token itself (from the URL, never logged) is
 * the only credential, exactly like every other email-link-authorised
 * action in this codebase. Deliberately reuses the same uk-wizard-* classes
 * as the rest of the builder so this reads as the same product, not a
 * separate admin tool.
 */
export default function BuilderApprovalPage({ params }: { params: { token: string } }) {
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [error, setError] = useState('');

  const respond = async (decision: 'approved' | 'declined') => {
    setOutcome('sending');
    setError('');
    try {
      const response = await fetch('/api/builder-authority/guardian-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, decision }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setOutcome('invalid');
        setError(result?.error || 'This link is no longer valid.');
        return;
      }
      setOutcome(decision);
    } catch {
      setOutcome('invalid');
      setError('This link is no longer valid.');
    }
  };

  return (
    <div className="uk-builder-shell uk-wizard-shell">
      <div className="uk-wizard-phone">
        <main className="uk-wizard-screen">
          <section className="uk-wizard-panel">
            <p className="uk-wizard-kicker">Guardian approval</p>

            {outcome === 'idle' || outcome === 'sending' ? (
              <>
                <h1>Approve this card?</h1>
                <p className="uk-wizard-copy">
                  An adult has started creating a personalised Emblem card and named you as the player&apos;s parent
                  or legal guardian. Nothing is produced until you respond.
                </p>
                <div className="uk-adult-permission-card">
                  <button
                    type="button"
                    className="uk-wizard-primary"
                    onClick={() => respond('approved')}
                    disabled={outcome === 'sending'}
                  >
                    {outcome === 'sending' ? 'Saving…' : 'Approve this card'}
                  </button>
                  <button
                    type="button"
                    className="uk-adult-permission-back"
                    onClick={() => respond('declined')}
                    disabled={outcome === 'sending'}
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : outcome === 'approved' ? (
              <>
                <h1>Thank you.</h1>
                <p className="uk-wizard-copy">This card is now approved and will move into production.</p>
              </>
            ) : outcome === 'declined' ? (
              <>
                <h1>Thanks for letting us know.</h1>
                <p className="uk-wizard-copy">This card will not be produced.</p>
              </>
            ) : (
              <>
                <h1>This link is no longer valid.</h1>
                <p className="uk-wizard-copy">{error || 'It may have expired or already been used.'}</p>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
