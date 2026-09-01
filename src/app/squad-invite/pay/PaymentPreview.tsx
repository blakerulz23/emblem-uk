'use client';

import { useEffect, useState } from 'react';
import { CardFace } from '@/lib/card-definition';
import type { CardFaceData } from '@/lib/card-definition';

type ResolvedPreview = {
  status: 'payment_requested' | 'paid';
  teamName: string;
  tier: 'single' | 'multi' | 'squad';
  unitPricePence: number;
  printQuantity: number;
  totalPence: number;
  deadlineAt: string | null;
  checkoutUrl: string;
  card: (CardFaceData & { photoUrl: string | null }) | null;
};

type Phase = 'loading' | 'unavailable' | 'ready';

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * The Squad Invite "Pay now" email link lands here first — same treatment
 * the ordinary builder's Gate 3 "Order received" screen already gives a
 * parent mid-session, but built for a cold, unauthenticated visitor days
 * later: no wizard state, no session, just a bearer token in the URL
 * fragment (never sent to the server — see InvitationAccess.tsx for the
 * same established pattern). "Continue to secure checkout" links to the
 * exact URL the resolve API already computed server-side; nothing here
 * constructs or modifies it.
 *
 * Deliberately does NOT rewrite the browser's address bar to remove the
 * token (unlike InvitationAccess.tsx, which does) — this page is meant to
 * be reloaded/revisited within the 72-hour window, and since the fragment
 * never reaches the server, leaving it in place adds no exposure.
 */
export default function PaymentPreview() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [preview, setPreview] = useState<ResolvedPreview | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('token') ?? '';
    void fetch('/api/squad-invite-payment-preview/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json() as ResolvedPreview;
      setPreview(data);
      setPhase('ready');
    }).catch(() => setPhase('unavailable'));
  }, []);

  if (phase === 'loading') {
    return (
      <main className="uk-wizard-panel">
        <h1>Opening your payment link…</h1>
      </main>
    );
  }

  if (phase === 'unavailable' || !preview) {
    return (
      <main className="uk-wizard-panel">
        <h1>This payment link is no longer available.</h1>
      </main>
    );
  }

  if (preview.status === 'paid') {
    return (
      <main className="uk-wizard-panel">
        <p className="uk-wizard-kicker">Squad Invite</p>
        <h1>Payment already received.</h1>
        <p className="uk-wizard-copy">Thanks — this card is already paid for and on its way into production.</p>
      </main>
    );
  }

  const priceLine = preview.printQuantity > 1
    ? `${formatPence(preview.unitPricePence)} per card × ${preview.printQuantity} = ${formatPence(preview.totalPence)}`
    : formatPence(preview.unitPricePence);

  return (
    <main className="uk-wizard-panel">
      <p className="uk-wizard-kicker">Squad Invite</p>
      <h1>Your card is ready.</h1>
      <p className="uk-wizard-copy">Continue to secure checkout to confirm payment.</p>

      {preview.card && (
        <div className="uk-order-club-list">
          <CardFace
            className="uk-real-card"
            data={preview.card}
            side="front"
            size={340}
            photoUrl={preview.card.photoUrl}
          />
        </div>
      )}

      <div className="uk-production-snapshot">
        <div>
          <span>Team</span>
          <strong>{preview.teamName}</strong>
        </div>
        <div>
          <span>Prints</span>
          <strong>{preview.printQuantity}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{priceLine}</strong>
        </div>
      </div>

      <div className="uk-gate3-checkout">
        <a className="uk-wizard-primary compact" href={preview.checkoutUrl}>
          Continue to secure checkout
        </a>
      </div>
    </main>
  );
}
