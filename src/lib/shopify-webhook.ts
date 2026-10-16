import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Helpers for validating incoming Shopify webhooks and extracting the
 * Emblem-side order reference from them. Split out from the route handler
 * so the pure logic here is easy to unit-test in isolation once we add
 * Vitest to the repo — the handler itself is thin on top of these.
 *
 * Docs: https://shopify.dev/docs/apps/build/webhooks/subscribe
 */

/**
 * Constant-time HMAC-SHA256 verification of a Shopify webhook body.
 *
 * Shopify signs each webhook with a shared secret configured on the
 * webhook subscription. The header `X-Shopify-Hmac-Sha256` carries the
 * base64-encoded signature — we recompute it from the raw body and the
 * secret and compare in constant time to avoid a timing side-channel.
 *
 * Returns `false` (never throws) on any input problem so the caller can
 * respond with a single 401 without leaking why it failed.
 */
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !hmacHeader) return false;

  const computed = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

  // Length mismatch would make timingSafeEqual throw — guard first.
  if (computed.length !== hmacHeader.length) return false;

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

/**
 * The `note_attributes` array Shopify carries through from cart attributes.
 * `buildCartUrl` in src/lib/shopify.ts sets `attributes[Order Ref]=EMB-...`;
 * Shopify preserves that as `{ name: 'Order Ref', value: 'EMB-...' }` on
 * the resulting order.
 */
type NoteAttribute = { name: string; value: string };

/**
 * Extracts our internal `order_ref` from a Shopify webhook payload. Returns
 * `null` if the order didn't originate from our builder (no Order Ref
 * attribute present) — the caller should still 200 in that case so
 * Shopify doesn't retry a webhook that will never succeed.
 */
export function extractOrderRef(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const noteAttributes = (payload as { note_attributes?: NoteAttribute[] }).note_attributes;
  if (!Array.isArray(noteAttributes)) return null;
  const found = noteAttributes.find((a) => a?.name === 'Order Ref');
  const value = found?.value?.trim();
  return value && value.length > 0 ? value : null;
}

type ShopifyMoney = { amount?: string; currency_code?: string };
type ShopifyMoneySet = { shop_money?: ShopifyMoney; presentment_money?: ShopifyMoney };
type ShopifyLineItem = {
  variant_id?: number | string;
  quantity?: number;
  current_quantity?: number;
  /** Unit price before discounts, in the SHOP currency (USD for this store). */
  price?: string;
  /** Unit price in shop and presentment (customer) currencies. */
  price_set?: ShopifyMoneySet;
  discount_allocations?: Array<{ amount?: string; amount_set?: ShopifyMoneySet }>;
};
type ShopifyOrderPayload = {
  id?: number | string;
  /** ISO 4217 code of the SHOP currency — not what the customer paid in. */
  currency?: string;
  /** ISO 4217 code of the currency the customer actually paid in. */
  presentment_currency?: string;
  financial_status?: string;
  test?: boolean;
  cancelled_at?: string | null;
  refunds?: unknown[];
  line_items?: ShopifyLineItem[];
};

/**
 * Gate 3 — verifies the webhook's own line items against what Emblem
 * actually expects to have been charged, rather than trusting
 * `total_price` wholesale (Shopify's own checkout adds shipping/tax on
 * top of the card subtotal, which Emblem doesn't set and can't predict —
 * see migration 0080's own header comment).
 *
 * Currency: the Shopify store's base (shop) currency is USD while UK
 * customers pay in GBP through Shopify Markets. Shopify reports
 * `currency`, `line_items[].price` and `discount_allocations[].amount` in
 * the SHOP currency; the amount the customer actually paid is in the
 * PRESENTMENT fields (`presentment_currency`, `price_set.presentment_money`,
 * `discount_allocations[].amount_set.presentment_money`). Verification is
 * done against the presentment amounts — never by converting USD with an
 * exchange rate. The legacy shop-currency fields are used only when the
 * shop currency itself is the expected currency (a GBP-based store), where
 * shop and presentment amounts are the same thing.
 *
 * Fails closed (the caller notifies staff and never marks the order paid)
 * when a field it needs is missing or malformed, because payload shapes
 * depend on the webhook API version.
 */
export function verifyPaidLineItem(
  payload: unknown,
  expectedVariantId: string,
  expectedQuantity: number,
  expectedUnitPricePence: number,
  expectedCurrency = 'GBP',
): { ok: true; currency: string } | { ok: false; reason: string } {
  const order = payload as ShopifyOrderPayload;
  const expected = expectedCurrency.trim().toUpperCase();
  const shopCurrency = typeof order?.currency === 'string' ? order.currency.toUpperCase() : null;
  const presentmentCurrency = typeof order?.presentment_currency === 'string' ? order.presentment_currency.toUpperCase() : null;

  // The order as a whole must have been presented to the customer in the
  // expected currency (when Shopify says so explicitly).
  if (presentmentCurrency !== null && presentmentCurrency !== expected) {
    return { ok: false, reason: 'currency_mismatch' };
  }
  // Shop-currency fields are only a valid stand-in for what the customer
  // paid when the shop currency IS the expected currency.
  const shopFieldsAreCustomerCurrency = shopCurrency === expected && (presentmentCurrency === null || presentmentCurrency === expected);

  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const matches = lineItems.filter((item) => String(item?.variant_id ?? '') === expectedVariantId);
  if (matches.length === 0) {
    return { ok: false, reason: 'no_matching_line_item' };
  }

  let totalQuantity = 0;
  for (const match of matches) {
    if (!Number.isSafeInteger(match.quantity) || (match.quantity ?? 0) <= 0) {
      return { ok: false, reason: 'quantity_mismatch' };
    }
    // Items removed after purchase (current_quantity < quantity) mean the
    // customer did not end up paying for the full quantity.
    if (match.current_quantity !== undefined && match.current_quantity !== match.quantity) {
      return { ok: false, reason: 'quantity_mismatch' };
    }
    totalQuantity += match.quantity!;
    if (!Number.isSafeInteger(totalQuantity)) {
      return { ok: false, reason: 'quantity_mismatch' };
    }

    // Gate 3 does not support discounts: reject any non-zero (or malformed)
    // allocation, read in the customer's currency where Shopify provides it.
    const allocations = Array.isArray(match.discount_allocations) ? match.discount_allocations : [];
    for (const allocation of allocations) {
      const presentmentDiscount = allocation?.amount_set?.presentment_money;
      const discountPence = presentmentDiscount !== undefined
        ? moneyStringToPence(presentmentDiscount?.amount)
        : moneyStringToPence(allocation?.amount);
      if (discountPence !== 0) {
        return { ok: false, reason: 'discount_mismatch' };
      }
    }

    // The unit price the customer actually paid.
    const presentmentPrice = match.price_set?.presentment_money;
    let unitPricePence: number | null;
    if (presentmentPrice !== undefined) {
      const lineCurrency = typeof presentmentPrice?.currency_code === 'string' ? presentmentPrice.currency_code.toUpperCase() : null;
      if (lineCurrency !== expected) {
        return { ok: false, reason: 'currency_mismatch' };
      }
      unitPricePence = moneyStringToPence(presentmentPrice.amount);
    } else if (shopFieldsAreCustomerCurrency) {
      unitPricePence = moneyStringToPence(match.price);
    } else {
      return { ok: false, reason: 'presentment_price_missing' };
    }
    if (unitPricePence === null || unitPricePence !== expectedUnitPricePence) {
      return { ok: false, reason: 'price_mismatch' };
    }
  }
  if (totalQuantity !== expectedQuantity) {
    return { ok: false, reason: 'quantity_mismatch' };
  }

  // Order-level state: only a genuinely paid, live, non-test order counts.
  if (order?.financial_status !== 'paid') {
    return { ok: false, reason: 'order_not_paid' };
  }
  if (order?.test === true) {
    return { ok: false, reason: 'test_order' };
  }
  if (order?.cancelled_at) {
    return { ok: false, reason: 'order_cancelled' };
  }
  if (Array.isArray(order?.refunds) && order.refunds.length > 0) {
    return { ok: false, reason: 'order_refunded' };
  }

  return { ok: true, currency: expected };
}

function moneyStringToPence(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [pounds, fraction = ''] = value.split('.');
  const pence = Number(pounds) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(pence) ? pence : null;
}

/** Shopify's own real order id, for reconciliation only — never trusted as
 *  proof of anything by itself; it only gets written once the line-item
 *  verification above has already passed. */
export function extractShopifyOrderId(payload: unknown): string | null {
  const id = (payload as ShopifyOrderPayload)?.id;
  return id === undefined || id === null ? null : String(id);
}
