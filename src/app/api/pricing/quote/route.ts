import { NextRequest, NextResponse } from 'next/server';
import { priceOrder } from '@/lib/pricing-engine';

export const runtime = 'nodejs';

/**
 * Pricing project — Stage 3: authoritative server-side quote endpoint.
 *
 * Pure calculation only — no order, player, card or line-item row is ever
 * read or written here, and no Shopify call is made. It exists so a future,
 * separately-approved stage can have the builder ask "what would this cost"
 * before checkout, without trusting a client-computed price. Every number
 * in the response comes from src/lib/pricing-engine.ts's priceOrder() —
 * this route validates the request shape and adapts the engine's result to
 * a stable response contract; it never recomputes a tier, threshold, or
 * amount itself.
 *
 * Public, unauthenticated — matches the two existing routes this is most
 * analogous to (src/app/api/orders/intent/route.ts and
 * src/app/api/order-enquiry/route.ts), both of which accept anonymous
 * checkout traffic with no session. There is no "buyer session" concept
 * anywhere in this codebase to gate behind; every authenticated route in
 * src/app/api is either Staff or Coach/Player OS, neither of which the
 * anonymous builder run by a purchaser has. Requiring one of those here
 * would make the endpoint unusable from the customer builder it exists for.
 *
 * Deliberately does NOT use src/lib/rate-limit.ts's isWithinRateLimit/
 * logClaimAttempt: that pattern exists to slow down brute-forcing a secret
 * (a claim code, an invite code) by logging attempts to claim_attempts.
 * This endpoint has no secret to guess and no state to protect — every
 * input is just two positive integers, and the response is a deterministic
 * function of them. Wiring it in would also mean this "pure calculation"
 * route silently starts reading and writing the database on every request,
 * which is exactly what this stage's brief rules out. If real abuse
 * protection is wanted here later (e.g. platform-level request throttling),
 * that is a separate, explicit decision — not a mechanical reuse of a
 * pattern built for a different threat model.
 */

const ALLOWED_KEYS = new Set(['paidPlayerCount', 'totalPrintQuantity']);

// Generous upper bound well above any real order — guards only against
// pathological/oversized request values (the engine itself has no ceiling,
// only a floor of 1 and the totalPrintQuantity >= paidPlayerCount rule).
const MAX_SAFE_QUANTITY = 100_000;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_SAFE_QUANTITY
  );
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (!isPlainObject(body)) {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Strict: this route's whole point is that pricing-authoritative fields
    // (tier, currency, unitPricePence, subtotalPence, pricingVersion,
    // coachCardIncluded, lineItems, delivery, tax) are server-controlled —
    // silently ignoring an unrecognised field would let a client send one
    // of those and have it look accepted. Reject instead.
    const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_KEYS.has(key));
    if (unknownKeys.length > 0) {
      return NextResponse.json(
        { error: `Unknown field(s): ${unknownKeys.join(', ')}` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { paidPlayerCount, totalPrintQuantity } = body;

    if (!isSafeCount(paidPlayerCount) || !isSafeCount(totalPrintQuantity)) {
      return NextResponse.json(
        {
          error: `paidPlayerCount and totalPrintQuantity are required and must be integers between 1 and ${MAX_SAFE_QUANTITY}`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let result;
    try {
      // Sole source of truth for tier thresholds, unit prices and subtotal
      // arithmetic — see the file header. priceOrder() also re-validates
      // both inputs itself (isPositiveInteger, totalPrintQuantity >=
      // paidPlayerCount) and throws a descriptive, already client-safe
      // Error if either rule is violated; this route just translates that
      // into a 400 rather than re-implementing the same checks.
      result = priceOrder({ paidPlayerCount, totalPrintQuantity });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid pricing request';
      return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });
    }

    // Presentational shaping only — every number below is copied straight
    // from `result`, nothing here recomputes a price or quantity. Mirrors
    // order_line_items' own `kind` vocabulary (player_card / coach_card)
    // for consistency with the schema a later stage will eventually write
    // to, without writing anything itself.
    const lineItems = [
      {
        kind: 'player_card' as const,
        quantity: result.totalPrintQuantity,
        unitPricePence: result.unitPricePence,
        subtotalPence: result.subtotalPence,
      },
      ...(result.coachCardEligible
        ? [
            {
              kind: 'coach_card' as const,
              quantity: result.coachCardQuantity,
              unitPricePence: result.coachCardUnitPricePence,
              subtotalPence: 0,
            },
          ]
        : []),
    ];

    return NextResponse.json(
      {
        currency: result.currency,
        pricingTier: result.tier,
        paidPlayerCount: result.paidPlayerCount,
        totalPrintQuantity: result.totalPrintQuantity,
        unitPricePence: result.unitPricePence,
        subtotalPence: result.subtotalPence,
        // Copied straight from the engine's own result, exactly like every
        // other authoritative field above — pricingVersion is owned by
        // src/lib/pricing-engine.ts (PRICING_VERSION), never defined here,
        // so the rules and the number identifying them can't drift apart.
        pricingVersion: result.pricingVersion,
        coachCardIncluded: result.coachCardEligible,
        lineItems,
        // Not yet authoritative (resolved later, via Shopify — see
        // 0045_order_pricing_schema.sql's own delivery_pence/tax_pence
        // columns, which stay NULL until then). Explicitly typed null
        // rather than omitted or guessed, so a consumer can't mistake
        // subtotalPence for a final payable total.
        deliveryPence: null,
        taxPence: null,
        totalPence: null,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    // Defensive catch-all: never let an unexpected failure leak a stack
    // trace, environment detail, or implementation internal to the client.
    console.error('Unexpected error in /api/pricing/quote', err);
    return NextResponse.json(
      { error: 'Could not calculate a quote' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
