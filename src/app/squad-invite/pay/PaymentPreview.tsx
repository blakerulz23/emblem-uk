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
 * The Squad Invite "Pay now" email link lands here first — same
 * information the ordinary builder's Gate 3 "Order received" screen
 * already gives a parent mid-session (the real card, and a price
 * summary), built for a cold, unauthenticated visitor days later instead:
 * no wizard state, no session, just a bearer token in the URL fragment
 * (never sent to the server — see InvitationAccess.tsx for the same
 * established pattern). Styled to match this page's own siblings
 * (manage/[reference]/DeliverySetup/access) rather than the builder
 * wizard's own uk-wizard-* classes, which are scoped to render inside the
 * builder's phone-frame shell and look unbranded/unstyled anywhere else.
 * "Continue to secure checkout" links to the exact URL the resolve API
 * already computed server-side; nothing here constructs or modifies it.
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
      <div className="mx-auto min-h-screen max-w-2xl px-5 py-16">
        <p className="text-neutral-600">Opening your payment link…</p>
      </div>
    );
  }

  if (phase === 'unavailable' || !preview) {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-5 py-16">
        <h1 className="text-2xl font-bold">This payment link is no longer available.</h1>
      </div>
    );
  }

  if (preview.status === 'paid') {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Squad Invite</p>
        <h1 className="mt-3 text-4xl font-bold">Payment already received.</h1>
        <p className="mt-4 text-neutral-600">Thanks — this card is already paid for and on its way into production.</p>
      </div>
    );
  }

  const priceLine = preview.printQuantity > 1
    ? `${formatPence(preview.unitPricePence)} per card × ${preview.printQuantity} = ${formatPence(preview.totalPence)}`
    : formatPence(preview.unitPricePence);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-16 pb-28">
      <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Squad Invite</p>
      <h1 className="mt-3 text-4xl font-bold">Your card is ready.</h1>
      <p className="mt-4 text-neutral-600">Continue to secure checkout to confirm payment.</p>

      {preview.card && (
        <div className="mt-8 flex justify-center rounded-2xl border bg-white p-6">
          <CardFace data={preview.card} side="front" size={280} photoUrl={preview.card.photoUrl} />
        </div>
      )}

      <dl className="mt-8 grid grid-cols-3 gap-4 rounded-2xl border bg-white p-6">
        <div>
          <dt className="text-sm text-neutral-500">Team</dt>
          <dd className="mt-1 font-bold">{preview.teamName}</dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-500">Prints</dt>
          <dd className="mt-1 font-bold">{preview.printQuantity}</dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-500">Total</dt>
          <dd className="mt-1 font-bold">{priceLine}</dd>
        </div>
      </dl>

      <a
        href={preview.checkoutUrl}
        className="mt-8 block min-h-[48px] rounded-xl bg-orange-600 p-3 text-center font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
      >
        Continue to secure checkout
      </a>
    </div>
  );
}
