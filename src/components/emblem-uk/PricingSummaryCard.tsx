import type { OrderPricingQuoteState } from '@/lib/pricing-quote-controller';
import { formatPence } from '@/lib/pricing-quote';

const TIER_LABEL: Record<'single' | 'multi' | 'squad', string> = {
  single: 'Single',
  multi: 'Multi',
  squad: 'Squad',
};

interface PricingSummaryCardProps {
  state: OrderPricingQuoteState;
  onRetry: () => void;
  /** `full` renders the whole breakdown (tier, counts, unit price, subtotal,
   *  delivery note, coach-card unlock) for the main order-summary spot.
   *  `compact` renders just the current subtotal line for the Approve step
   *  total and the final handoff-box recap, so the same loading/error
   *  handling isn't re-implemented per call site. */
  variant?: 'full' | 'compact';
}

/**
 * The one place quote loading/error/ready rendering lives — every call
 * site in ProductionBuilder.tsx passes the same `state` (from
 * useOrderPricingQuote) into this component rather than re-deriving its
 * own view of it, so there is exactly one source of truth for what the
 * customer sees, in whichever of the existing review/order-summary spots
 * it's placed. Renders nothing for 'idle' (zero valid paid players) — no
 * quote, no error, per the approved brief.
 */
export default function PricingSummaryCard({ state, onRetry, variant = 'full' }: PricingSummaryCardProps) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'loading') {
    return (
      <div className="uk-pricing-summary uk-pricing-loading" aria-live="polite">
        <span className="uk-pricing-spinner" aria-hidden="true" />
        <span>Calculating your price&hellip;</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="uk-pricing-summary uk-pricing-error" aria-live="polite">
        <p>{state.message}</p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const { quote } = state;
  const coachCardLine = quote.lineItems.find((line) => line.kind === 'coach_card');

  if (variant === 'compact') {
    return (
      <div className="uk-pricing-summary uk-pricing-compact" aria-live="polite">
        <span>Card subtotal</span>
        <b>{formatPence(quote.subtotalPence)}</b>
      </div>
    );
  }

  return (
    <div className="uk-pricing-summary uk-pricing-full" aria-live="polite">
      <div className="uk-pricing-rows">
        <div>
          <span>Pricing tier</span>
          <strong>{TIER_LABEL[quote.pricingTier]}</strong>
        </div>
        <div>
          <span>Paid players</span>
          <strong>{quote.paidPlayerCount}</strong>
        </div>
        <div>
          <span>Total prints</span>
          <strong>{quote.totalPrintQuantity}</strong>
        </div>
        <div>
          <span>Unit price</span>
          <strong>{formatPence(quote.unitPricePence)} / print</strong>
        </div>
        <div className="uk-pricing-subtotal-row">
          <span>Card subtotal</span>
          <strong>{formatPence(quote.subtotalPence)}</strong>
        </div>
      </div>
      <p className="uk-pricing-note">
        Delivery and your final payable total are calculated separately once your order is confirmed.
      </p>
      {quote.coachCardIncluded && coachCardLine ? (
        <div className="uk-coach-card-unlock">
          <strong>Free coach card unlocked</strong>
          <p>Your full-squad order includes one coach card at no extra cost.</p>
          <div className="uk-coach-card-line">
            <span>Free coach card</span>
            <span>Quantity {coachCardLine.quantity}</span>
            <span>{formatPence(coachCardLine.subtotalPence)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
