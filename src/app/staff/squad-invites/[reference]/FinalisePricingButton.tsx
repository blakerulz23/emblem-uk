'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The manual trigger for finalise-pricing (see the route's own comment).
 * Locks in a campaign's real tier/unit price from final headcount — and,
 * only once the payment wall is genuinely on, issues each parent a
 * payment request. While the wall is off (as it is today), this still
 * finalises pricing but issues nothing; the response message says so
 * either way rather than implying payment went out.
 */
export default function FinalisePricingButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  const finalise = async () => {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(`/api/staff/squad-invites/${encodeURIComponent(campaignId)}/finalise-pricing`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pricing?: { tier?: string; unitPricePence?: number }; paymentRequestsEnabled?: boolean; issued?: number; failed?: number }
        | null;
      if (!response.ok) {
        setMessage(body?.error ?? 'Pricing could not be finalised.');
        return;
      }
      const tier = body?.pricing?.tier ?? 'unknown';
      const price = typeof body?.pricing?.unitPricePence === 'number' ? `£${(body.pricing.unitPricePence / 100).toFixed(2)}` : 'unknown';
      const paymentLine = body?.paymentRequestsEnabled
        ? `Payment requests issued: ${body.issued ?? 0}, failed: ${body.failed ?? 0}.`
        : 'Payment requests remain disabled — pricing finalised only.';
      setMessage(`Pricing finalised — ${tier} tier at ${price} per card. ${paymentLine}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={finalise}
        disabled={pending}
        aria-busy={pending}
        className="rounded-xl border-2 border-orange-600 px-4 py-2 font-bold text-orange-700 disabled:opacity-60"
      >
        {pending ? 'Finalising…' : 'Finalise pricing'}
      </button>
      <p className="mt-1 text-xs text-neutral-500">Requires Approver. Only available once the campaign&apos;s deadline and grace period have passed.</p>
      {message && (
        <p role="status" aria-live="polite" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
