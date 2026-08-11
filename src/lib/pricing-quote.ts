/**
 * Client-side transport for POST /api/pricing/quote (Stage 3). Pure fetch +
 * shape validation — no React, no builder state, no pricing calculation.
 * The browser consumes this endpoint's response; it never imports or
 * executes src/lib/pricing-engine.ts's priceOrder() directly.
 *
 * Types here mirror the route's response contract (src/app/api/pricing/
 * quote/route.ts) by hand — deliberately not re-exported from the route
 * file, since that file is a server-only module (imports next/server) and
 * must never end up in a client bundle.
 */

export type PricingTier = 'single' | 'multi' | 'squad';

export type PricingLineItemKind = 'player_card' | 'coach_card';

export interface PricingLineItem {
  kind: PricingLineItemKind;
  quantity: number;
  unitPricePence: number;
  subtotalPence: number;
}

export interface PricingQuoteResponse {
  currency: string;
  pricingTier: PricingTier;
  paidPlayerCount: number;
  totalPrintQuantity: number;
  unitPricePence: number;
  subtotalPence: number;
  pricingVersion: number;
  coachCardIncluded: boolean;
  lineItems: PricingLineItem[];
  deliveryPence: number | null;
  taxPence: number | null;
  totalPence: number | null;
}

const QUOTE_ENDPOINT = '/api/pricing/quote';

function isPricingLineItem(value: unknown): value is PricingLineItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kind === 'player_card' || v.kind === 'coach_card') &&
    typeof v.quantity === 'number' &&
    typeof v.unitPricePence === 'number' &&
    typeof v.subtotalPence === 'number'
  );
}

/**
 * Runtime shape check on the parsed response body — a successful HTTP
 * status is not proof the payload matches this contract (a proxy, a future
 * server change, or a malformed response could still return 200 with an
 * unexpected shape), so nothing downstream trusts `unknown` JSON without
 * this passing first.
 */
export function isPricingQuoteResponse(value: unknown): value is PricingQuoteResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.currency === 'string' &&
    (v.pricingTier === 'single' || v.pricingTier === 'multi' || v.pricingTier === 'squad') &&
    typeof v.paidPlayerCount === 'number' &&
    typeof v.totalPrintQuantity === 'number' &&
    typeof v.unitPricePence === 'number' &&
    typeof v.subtotalPence === 'number' &&
    typeof v.pricingVersion === 'number' &&
    typeof v.coachCardIncluded === 'boolean' &&
    Array.isArray(v.lineItems) &&
    v.lineItems.every(isPricingLineItem) &&
    (v.deliveryPence === null || typeof v.deliveryPence === 'number') &&
    (v.taxPence === null || typeof v.taxPence === 'number') &&
    (v.totalPence === null || typeof v.totalPence === 'number')
  );
}

export class PricingQuoteError extends Error {}

/**
 * Requests an authoritative quote for the given counts. Sends exactly the
 * two fields the endpoint accepts — never player names, photos, or any
 * other personal data — matching the endpoint's own strict-unknown-field
 * rejection (src/app/api/pricing/quote/route.ts).
 */
export async function fetchPricingQuote(
  paidPlayerCount: number,
  totalPrintQuantity: number,
  signal?: AbortSignal
): Promise<PricingQuoteResponse> {
  const response = await fetch(QUOTE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paidPlayerCount, totalPrintQuantity }),
    signal,
  });

  if (!response.ok) {
    throw new PricingQuoteError(`Quote request failed with status ${response.status}`);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!isPricingQuoteResponse(data)) {
    throw new PricingQuoteError('Quote response did not match the expected shape');
  }

  return data;
}

/** Formats an integer-pence amount as GBP — the builder never divides by
 *  100 or formats currency itself outside this one helper. */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}
