'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  campaignId: string;
  totalParticipants: number;
  eligibleCommitments: number;
  totalPrintQuantity: number;
  paidCount: number;
  deadlineAt: string | null;
  graceEndsAt: string | null;
  campaignStatus: string | null;
  alreadyFinalised: boolean;
  finalTier: string | null;
  finalUnitPricePence: number | null;
};

function formatPrice(pence: number | null) {
  return typeof pence === 'number' ? `£${(pence / 100).toFixed(2)}` : 'unknown';
}

/**
 * The manual trigger for finalise-pricing (see the route's own comment).
 * Locks in a campaign's real tier/unit price from final headcount — and,
 * only once the payment wall is genuinely on, issues each parent a
 * payment request. While the wall is off (as it is today), this still
 * finalises pricing but issues nothing; the response message says so
 * either way rather than implying payment went out.
 *
 * The availability preview below (grace period, campaign status, eligible
 * commitments) mirrors finalise_squad_invite_pricing()'s own gating
 * (0050_squad_invite_foundation.sql) purely for display — it is never the
 * authority. The click still always calls the real endpoint, and a stale
 * preview (e.g. another staff member acted first) is caught by that
 * endpoint's own response, not hidden by this estimate.
 */
export default function FinalisePricingButton({
  campaignId, totalParticipants, eligibleCommitments, totalPrintQuantity, paidCount,
  deadlineAt, graceEndsAt, campaignStatus, alreadyFinalised, finalTier, finalUnitPricePence,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const graceOver = graceEndsAt ? new Date(graceEndsAt) <= new Date() : false;
  const campaignBlocked = campaignStatus === 'cancelled' || campaignStatus === 'expired';
  const unavailableReason = alreadyFinalised
    ? null
    : campaignBlocked
      ? 'This campaign was cancelled or expired and cannot be priced.'
      : !graceOver
        ? `Available once the completion grace period ends${graceEndsAt ? ` (${new Date(graceEndsAt).toLocaleString('en-GB')})` : ''}.`
        : eligibleCommitments < 1
          ? 'No completed commitments yet — nothing eligible to price.'
          : null;
  const available = !alreadyFinalised && unavailableReason === null;

  const finalise = async () => {
    if (pending) return;
    setPending(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const response = await fetch(`/api/staff/squad-invites/${encodeURIComponent(campaignId)}/finalise-pricing`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pricing?: { tier?: string; unitPricePence?: number }; paymentRequestsEnabled?: boolean; issued?: number; failed?: number }
        | null;
      if (!response.ok) {
        setMessage(body?.error ?? 'Pricing could not be finalised.');
        setMessageIsError(true);
        return;
      }
      const tier = body?.pricing?.tier ?? 'unknown';
      const price = formatPrice(body?.pricing?.unitPricePence ?? null);
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
    <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4" aria-busy={pending}>
      <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Finalise pricing</p>
      <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-orange-900/70">Completed commitments</dt><dd className="font-semibold text-orange-950">{eligibleCommitments}</dd></div>
        <div><dt className="text-orange-900/70">Total participants</dt><dd className="font-semibold text-orange-950">{totalParticipants}</dd></div>
        <div><dt className="text-orange-900/70">Paid</dt><dd className="font-semibold text-orange-950">{paidCount}</dd></div>
        <div><dt className="text-orange-900/70">Print quantity</dt><dd className="font-semibold text-orange-950">{totalPrintQuantity}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-orange-900">
        Deadline {deadlineAt ? new Date(deadlineAt).toLocaleDateString('en-GB') : 'not set'} · Grace period {graceOver ? 'has ended' : 'still open'}
        {graceEndsAt ? ` (${new Date(graceEndsAt).toLocaleString('en-GB')})` : ''}.
      </p>

      {alreadyFinalised ? (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-800">Already finalised — {finalTier ?? 'unknown'} tier at {formatPrice(finalUnitPricePence)} per card.</p>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={finalise}
            disabled={pending || !available}
            aria-describedby={available ? undefined : 'finalise-pricing-reason'}
            className={
              available
                ? 'min-h-[44px] rounded-xl border-2 border-orange-600 bg-orange-600 px-4 py-2 font-bold text-white transition hover:bg-orange-700 disabled:opacity-60'
                : 'min-h-[44px] cursor-not-allowed rounded-xl border-2 border-neutral-300 bg-neutral-100 px-4 py-2 font-bold text-neutral-400'
            }
          >
            {pending ? 'Finalising…' : 'Finalise pricing'}
          </button>
          <p className="mt-1 text-xs text-orange-800">Requires Approver.</p>
          {!available && <p id="finalise-pricing-reason" className="mt-1 text-xs font-semibold text-red-700">{unavailableReason}</p>}
        </div>
      )}
      {message && (
        <p role={messageIsError ? 'alert' : 'status'} aria-live="polite" className={`mt-2 text-sm ${messageIsError ? 'font-semibold text-red-700' : 'font-semibold text-emerald-700'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
