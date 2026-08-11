/**
 * Emblem UK — shared pricing engine (Stage 1 of the approved automated-
 * pricing project).
 *
 * This module is the single source of truth for the approved consumer-
 * facing product pricing. It is intentionally a pure, dependency-free
 * function: no Supabase, no Shopify, no Next.js request/response types.
 * Every future consumer (builder review, order API, Shopify Draft Order
 * creation, staff view, marketing constants) is expected to import from
 * here rather than redefine these numbers — see the three now-conflicting
 * pricing models this replaces (marketing page, the live builder's
 * `priceForApprovedCount`, and the dead `src/lib/pricing.ts`).
 *
 * Stage 1 only: this module is not yet imported by any production code
 * path. Wiring it into the builder/marketing/order API is a later,
 * separately-approved stage.
 *
 * All money is integer pence — never floating-point pounds — end to end.
 */

export const CURRENCY = 'GBP' as const;

export type PricingTier = 'single' | 'multi' | 'squad';

/** Approved fixed unit prices, in integer pence, before delivery. */
export const SINGLE_UNIT_PRICE_PENCE = 2499;
export const MULTI_UNIT_PRICE_PENCE = 2199;
export const SQUAD_UNIT_PRICE_PENCE = 1899;

/** Distinct-paid-player thresholds that select the tier. */
export const MULTI_MIN_PLAYERS = 2;
export const SQUAD_MIN_PLAYERS = 10;

/** The free coach card unlocked at Full Squad — always £0.00, never a
 *  silent discount off the paid subtotal (see coachCardUnitPricePence). */
export const COACH_CARD_UNIT_PRICE_PENCE = 0;

/**
 * Identifies which commercial-rule revision priced a given quote —
 * distinct from the app's package/deploy version. Owned here, not by any
 * caller: this is the single source of truth for both the pricing rules
 * above and the number that says which version of them produced a result,
 * so the two can never drift apart. Changing any commercial rule (a unit
 * price, a tier threshold, the coach-card entitlement) requires
 * incrementing this constant and coordinating the corresponding
 * database/application rollout — tier boundaries persisted to
 * `orders.pricing_tier` are pinned to this version today (see
 * supabase/migrations/0045_order_pricing_schema.sql's
 * orders_pricing_tier_matches_player_count constraint), so a new version
 * with different thresholds needs its own migration alongside it, not just
 * a bump here.
 */
export const PRICING_VERSION = 1 as const;

export interface PriceOrderInput {
  /** Number of distinct paid players in the order — determines the tier
   *  and free coach-card eligibility. Excludes the coach card itself. */
  paidPlayerCount: number;
  /** Total number of paid physical player-card copies being produced
   *  (players can order more than one copy each) — determines the
   *  subtotal. Excludes the coach card itself. Must be >= paidPlayerCount. */
  totalPrintQuantity: number;
}

export interface PricingResult {
  currency: typeof CURRENCY;
  pricingVersion: typeof PRICING_VERSION;
  tier: PricingTier;
  paidPlayerCount: number;
  totalPrintQuantity: number;
  unitPricePence: number;
  subtotalPence: number;
  coachCardEligible: boolean;
  coachCardQuantity: 0 | 1;
  coachCardUnitPricePence: typeof COACH_CARD_UNIT_PRICE_PENCE;
  /** Always true — this result is product-line pricing only. Delivery is
   *  calculated separately through Shopify (a later stage), never folded
   *  into subtotalPence. */
  deliveryExcluded: true;
}

function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}

function tierForPlayerCount(paidPlayerCount: number): PricingTier {
  if (paidPlayerCount >= SQUAD_MIN_PLAYERS) return 'squad';
  if (paidPlayerCount >= MULTI_MIN_PLAYERS) return 'multi';
  return 'single';
}

function unitPriceForTier(tier: PricingTier): number {
  switch (tier) {
    case 'squad':
      return SQUAD_UNIT_PRICE_PENCE;
    case 'multi':
      return MULTI_UNIT_PRICE_PENCE;
    case 'single':
      return SINGLE_UNIT_PRICE_PENCE;
  }
}

/**
 * Prices an order from server-trusted quantities. Never accept these
 * numbers from a client request unvalidated — a future order API must
 * recompute paidPlayerCount/totalPrintQuantity itself from the rows it
 * just persisted, exactly as documented in the pricing audit.
 *
 * The tier is chosen by paidPlayerCount alone (distinct players), not by
 * totalPrintQuantity — one player ordering ten copies of their own card
 * stays in the Single Player tier; ten distinct players ordering one
 * copy each qualify for Full Squad pricing. Every paid copy in the order
 * is then charged at that one tier's unit price.
 *
 * The 9-to-10-player total *dropping* (9 x £21.99 = £197.91 vs.
 * 10 x £18.99 + a free coach card = £189.90) is an approved, intentional
 * Full Squad incentive, not a pricing bug — see pricing-engine.test.ts's
 * dedicated boundary test.
 */
export function priceOrder(input: PriceOrderInput): PricingResult {
  const { paidPlayerCount, totalPrintQuantity } = input;

  if (!isPositiveInteger(paidPlayerCount)) {
    throw new Error(
      `priceOrder: paidPlayerCount must be a finite integer >= 1 (received ${paidPlayerCount})`
    );
  }
  if (!isPositiveInteger(totalPrintQuantity)) {
    throw new Error(
      `priceOrder: totalPrintQuantity must be a finite integer >= 1 (received ${totalPrintQuantity})`
    );
  }
  if (totalPrintQuantity < paidPlayerCount) {
    throw new Error(
      `priceOrder: totalPrintQuantity (${totalPrintQuantity}) cannot be less than paidPlayerCount (${paidPlayerCount}) — every distinct paid player needs at least one paid copy`
    );
  }

  const tier = tierForPlayerCount(paidPlayerCount);
  const unitPricePence = unitPriceForTier(tier);
  const subtotalPence = totalPrintQuantity * unitPricePence;
  const coachCardEligible = tier === 'squad';

  return {
    currency: CURRENCY,
    pricingVersion: PRICING_VERSION,
    tier,
    paidPlayerCount,
    totalPrintQuantity,
    unitPricePence,
    subtotalPence,
    coachCardEligible,
    coachCardQuantity: coachCardEligible ? 1 : 0,
    coachCardUnitPricePence: COACH_CARD_UNIT_PRICE_PENCE,
    deliveryExcluded: true,
  };
}
