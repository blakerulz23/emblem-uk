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

type ShopifyLineItem = {
  variant_id?: number | string;
  quantity?: number;
  price?: string;
  discount_allocations?: Array<{ amount?: string }>;
};
type ShopifyOrderPayload = {
  id?: number | string;
  currency?: string;
  line_items?: ShopifyLineItem[];
};

/**
 * Gate 3 — verifies the webhook's own line items against what Emblem
 * actually expects to have been charged, rather than trusting
 * `total_price` wholesale (Shopify's own checkout adds shipping/tax on
 * top of the card subtotal, which Emblem doesn't set and can't predict —
 * see migration 0080's own header comment). Finds the line item matching
 * `expectedVariantId`, and returns null (verification failure) unless its
 * quantity and per-unit price match what this order's own authoritative
 * snapshot already recorded. Currency is checked separately by the caller
 * against the same snapshot.
 */
export function verifyPaidLineItem(
  payload: unknown,
  expectedVariantId: string,
  expectedQuantity: number,
  expectedUnitPricePence: number,
): { ok: true; currency: string | null } | { ok: false; reason: string } {
  const order = payload as ShopifyOrderPayload;
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
    totalQuantity += match.quantity!;
    if (!Number.isSafeInteger(totalQuantity)) {
      return { ok: false, reason: 'quantity_mismatch' };
    }

    // Shopify's `price` is the undiscounted unit price. A matching list price
    // alone therefore cannot prove that the authoritative amount was paid.
    // Gate 3 does not support discounts: reject any non-zero (or malformed)
    // allocation rather than marking a discounted order as fully paid.
    const allocations = Array.isArray(match.discount_allocations) ? match.discount_allocations : [];
    if (allocations.some((allocation) => moneyStringToPence(allocation?.amount) !== 0)) {
      return { ok: false, reason: 'discount_mismatch' };
    }

    const unitPricePence = moneyStringToPence(match.price);
    if (unitPricePence === null || unitPricePence !== expectedUnitPricePence) {
      return { ok: false, reason: 'price_mismatch' };
    }
  }
  if (totalQuantity !== expectedQuantity) {
    return { ok: false, reason: 'quantity_mismatch' };
  }
  return { ok: true, currency: typeof order?.currency === 'string' ? order.currency : null };
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
