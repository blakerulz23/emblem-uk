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

  const respond = async (decision: 'approved' | 'declined') => {
    setOutcome('sending');
    try {
      const response = await fetch('/api/builder-authority/guardian-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, decision }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setOutcome('invalid');
        return;
      }
      setOutcome(decision);
    } catch {
      setOutcome('invalid');
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
                  or legal guardian. Nothing is produced until you respond. If you approve, you&apos;ll be the one who
                  sets up and controls the player&apos;s Emblem profile.
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
                <p className="uk-wizard-copy">
                  You&apos;ve approved this card. We&apos;ll let the person who made it know, so they can pay for their
                  order. Once the card is made, we&apos;ll email you an invite to set up the player&apos;s Emblem
                  profile. You&apos;ll control it, not them.
                </p>
              </>
            ) : outcome === 'declined' ? (
              <>
                <h1>Thanks for letting us know.</h1>
                <p className="uk-wizard-copy">
                  This card won&apos;t be made. We&apos;ll let the person who made it know, without giving a reason.
                  Nobody has been charged.
                </p>
              </>
            ) : (
              <>
                <h1>This link is no longer valid.</h1>
                <p className="uk-wizard-copy">
                  It may have expired or already been used. Approval links work for 14 days and can only be used once.
                </p>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
