import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { extractOrderRef, extractShopifyOrderId, verifyPaidLineItem, verifyShopifyHmac, classifyRefund, refundTouchesVariants } from './shopify-webhook';

const SECRET = 'test-webhook-secret';

function sign(body: string, secret: string) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

describe('verifyShopifyHmac', () => {
  it('accepts a correctly-signed body', () => {
    const body = JSON.stringify({ id: 1 });
    expect(verifyShopifyHmac(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    const body = JSON.stringify({ id: 1 });
    expect(verifyShopifyHmac(body, sign(body, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('rejects a tampered body against a still-valid-looking signature', () => {
    const body = JSON.stringify({ id: 1 });
    const signature = sign(body, SECRET);
    expect(verifyShopifyHmac(JSON.stringify({ id: 2 }), signature, SECRET)).toBe(false);
  });

  it('rejects a missing header, a missing secret, or both, without throwing', () => {
    const body = JSON.stringify({ id: 1 });
    expect(verifyShopifyHmac(body, null, SECRET)).toBe(false);
    expect(verifyShopifyHmac(body, sign(body, SECRET), undefined)).toBe(false);
    expect(verifyShopifyHmac(body, null, undefined)).toBe(false);
  });

  it('never throws on a header of a wildly different length (would otherwise crash timingSafeEqual)', () => {
    expect(() => verifyShopifyHmac('{}', 'short', SECRET)).not.toThrow();
    expect(verifyShopifyHmac('{}', 'short', SECRET)).toBe(false);
  });
});

describe('extractOrderRef', () => {
  it('finds the Order Ref note attribute', () => {
    expect(extractOrderRef({ note_attributes: [{ name: 'Order Ref', value: 'EMB-ABC123' }] })).toBe('EMB-ABC123');
  });

  it('returns null when there is no Order Ref attribute (a Shopify order Emblem never created)', () => {
    expect(extractOrderRef({ note_attributes: [{ name: 'Something Else', value: 'x' }] })).toBeNull();
    expect(extractOrderRef({})).toBeNull();
    expect(extractOrderRef(null)).toBeNull();
  });

  it('returns null for a blank value rather than an empty-but-truthy order ref', () => {
    expect(extractOrderRef({ note_attributes: [{ name: 'Order Ref', value: '   ' }] })).toBeNull();
  });
});

describe('extractShopifyOrderId', () => {
  it('stringifies a numeric Shopify order id', () => {
    expect(extractShopifyOrderId({ id: 123456789 })).toBe('123456789');
  });

  it('returns null when absent', () => {
    expect(extractShopifyOrderId({})).toBeNull();
    expect(extractShopifyOrderId(null)).toBeNull();
  });
});

describe('verifyPaidLineItem — Gate 3 amount/quantity verification', () => {
  const VARIANT_ID = '123456789';
  // These cases model a GBP-based store (shop currency = what the customer
  // paid). Every real orders/paid payload carries `currency` and
  // `financial_status`, which the check now requires.
  const legacyGbp = (p: Record<string, unknown>) => ({ currency: 'GBP', financial_status: 'paid', ...p });

  it('passes when the line item matching our variant has the exact expected quantity and unit price', () => {
    const payload = {
      currency: 'GBP',
      line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99' }],
    };
    const result = verifyPaidLineItem(legacyGbp(payload), VARIANT_ID, 2, 2499);
    expect(result).toEqual({ ok: true, currency: 'GBP' });
  });

  it('fails when no line item matches our configured variant at all', () => {
    const payload = { line_items: [{ variant_id: 999, quantity: 2, price: '24.99' }] };
    const result = verifyPaidLineItem(legacyGbp(payload), VARIANT_ID, 2, 2499);
    expect(result).toEqual({ ok: false, reason: 'no_matching_line_item' });
  });

  it('fails on a quantity mismatch — never trusts a different quantity than what Emblem\'s own order says', () => {
    const payload = { line_items: [{ variant_id: 123456789, quantity: 5, price: '24.99' }] };
    const result = verifyPaidLineItem(legacyGbp(payload), VARIANT_ID, 2, 2499);
    expect(result).toEqual({ ok: false, reason: 'quantity_mismatch' });
  });

  it('fails on a price mismatch — never trusts a different unit price than what Emblem\'s own order says', () => {
    const payload = { line_items: [{ variant_id: 123456789, quantity: 2, price: '9.99' }] };
    const result = verifyPaidLineItem(legacyGbp(payload), VARIANT_ID, 2, 2499);
    expect(result).toEqual({ ok: false, reason: 'price_mismatch' });
  });

  it('fails closed when Shopify reports a discount allocation against the matching item', () => {
    const payload = {
      line_items: [{
        variant_id: 123456789,
        quantity: 2,
        price: '24.99',
        discount_allocations: [{ amount: '5.00' }],
      }],
    };
    expect(verifyPaidLineItem(legacyGbp(payload), VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });
  });

  it('fails closed on malformed discount or price strings', () => {
    const malformedDiscount = {
      line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99', discount_allocations: [{ amount: 'free' }] }],
    };
    expect(verifyPaidLineItem(legacyGbp(malformedDiscount), VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });

    const malformedPrice = { line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99GBP' }] };
    expect(verifyPaidLineItem(legacyGbp(malformedPrice), VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'price_mismatch' });
  });

  it('sums duplicate matching variant lines and verifies every line', () => {
    const payload = {
      currency: 'GBP',
      line_items: [
        { variant_id: 123456789, quantity: 1, price: '24.99' },
        { variant_id: '123456789', quantity: 1, price: '24.99', discount_allocations: [{ amount: '0.00' }] },
      ],
    };
    expect(verifyPaidLineItem(legacyGbp(payload), VARIANT_ID, 2, 2499)).toEqual({ ok: true, currency: 'GBP' });
  });

  it('never blindly trusts total_price — verification is against the matching line item only, ignoring shipping/tax additions', () => {
    const payload = {
      currency: 'GBP',
      total_price: '45.98', // subtotal (24.99*2=49.98... deliberately different) plus shipping/tax, never checked directly
      line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99' }],
    };
    const result = verifyPaidLineItem(legacyGbp(payload), VARIANT_ID, 2, 2499);
    expect(result.ok).toBe(true);
  });

  it('handles a malformed/empty payload without throwing', () => {
    expect(() => verifyPaidLineItem({}, VARIANT_ID, 2, 2499)).not.toThrow();
    expect(verifyPaidLineItem({}, VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'no_matching_line_item' });
    expect(() => verifyPaidLineItem(null, VARIANT_ID, 2, 2499)).not.toThrow();
  });
});

/**
 * Realistic Shopify Markets payloads for Emblem's store: shop (base)
 * currency USD, UK customer pays in GBP. Shape follows Shopify's Order
 * resource: `currency`/`price`/`discount_allocations[].amount` are shop
 * currency; `presentment_currency`, `price_set.presentment_money` and
 * `amount_set.presentment_money` are what the customer paid.
 */
describe('verifyPaidLineItem — USD store, GBP presentment (Shopify Markets)', () => {
  const UK_CARD = '46800821715116';
  const usd = (amount: string) => ({ amount, currency_code: 'USD' });
  const gbp = (amount: string) => ({ amount, currency_code: 'GBP' });
  const line = (over: Record<string, unknown> = {}) => ({
    id: 13579,
    variant_id: 46800821715116,
    quantity: 1,
    current_quantity: 1,
    price: '32.09',
    price_set: { shop_money: usd('32.09'), presentment_money: gbp('24.99') },
    discount_allocations: [],
    ...over,
  });
  const order = (over: Record<string, unknown> = {}) => ({
    id: 5678901234567,
    currency: 'USD',
    presentment_currency: 'GBP',
    financial_status: 'paid',
    test: false,
    cancelled_at: null,
    refunds: [],
    total_price: '37.21',
    total_price_set: { shop_money: usd('37.21'), presentment_money: gbp('28.98') },
    shipping_lines: [{ price: '5.12', price_set: { shop_money: usd('5.12'), presentment_money: gbp('3.99') }, discount_allocations: [] }],
    note_attributes: [{ name: 'Order Ref', value: 'emblem-test-0001' }],
    line_items: [line()],
    ...over,
  });

  it('accepts a genuine £24.99 GBP payment on a USD-based store (verified on presentment money, not the $32.09 shop price)', () => {
    expect(verifyPaidLineItem(order(), UK_CARD, 1, 2499)).toEqual({ ok: true, currency: 'GBP' });
    expect(verifyPaidLineItem(order(), UK_CARD, 1, 2499, 'gbp')).toEqual({ ok: true, currency: 'GBP' });
  });

  it('verifies multiple cards and ignores unrelated line items in the same order', () => {
    const payload = order({
      line_items: [
        line({ quantity: 2, current_quantity: 2 }),
        { variant_id: 111, quantity: 1, price: '9.00', price_set: { shop_money: usd('9.00'), presentment_money: gbp('7.00') } },
      ],
    });
    expect(verifyPaidLineItem(payload, UK_CARD, 2, 2499)).toEqual({ ok: true, currency: 'GBP' });
  });

  it('rejects the wrong GBP price (e.g. £19.99) even though a USD amount is present', () => {
    const payload = order({ line_items: [line({ price_set: { shop_money: usd('25.67'), presentment_money: gbp('19.99') } })] });
    expect(verifyPaidLineItem(payload, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'price_mismatch' });
  });

  it('never accepts a USD amount that happens to equal 24.99', () => {
    const payload = order({
      presentment_currency: 'USD',
      line_items: [line({ price: '24.99', price_set: { shop_money: usd('24.99'), presentment_money: usd('24.99') } })],
    });
    expect(verifyPaidLineItem(payload, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'currency_mismatch' });
  });

  it('rejects a line priced in another currency than the order presentment currency', () => {
    const payload = order({ line_items: [line({ price_set: { shop_money: usd('32.09'), presentment_money: { amount: '24.99', currency_code: 'EUR' } } })] });
    expect(verifyPaidLineItem(payload, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'currency_mismatch' });
  });

  it('fails closed when the GBP line amount is missing or malformed (no exchange-rate guessing)', () => {
    const noPriceSet = order({ line_items: [line({ price_set: undefined })] });
    expect(verifyPaidLineItem(noPriceSet, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'presentment_price_missing' });
    const noAmount = order({ line_items: [line({ price_set: { shop_money: usd('32.09'), presentment_money: { currency_code: 'GBP' } } })] });
    expect(verifyPaidLineItem(noAmount, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'price_mismatch' });
    const noCurrencyCode = order({ line_items: [line({ price_set: { shop_money: usd('32.09'), presentment_money: { amount: '24.99' } } })] });
    expect(verifyPaidLineItem(noCurrencyCode, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'currency_mismatch' });
    const malformed = order({ line_items: [line({ price_set: { shop_money: usd('32.09'), presentment_money: gbp('£24.99') } })] });
    expect(verifyPaidLineItem(malformed, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'price_mismatch' });
  });

  it('rejects any line-item discount, read in GBP', () => {
    const discounted = order({ line_items: [line({ discount_allocations: [{ amount: '6.42', amount_set: { shop_money: usd('6.42'), presentment_money: gbp('5.00') } }] })] });
    expect(verifyPaidLineItem(discounted, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });
    const shopOnlyDiscount = order({ line_items: [line({ discount_allocations: [{ amount: '6.42' }] })] });
    expect(verifyPaidLineItem(shopOnlyDiscount, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });
    const malformedDiscount = order({ line_items: [line({ discount_allocations: [{ amount_set: { presentment_money: gbp('free') } }] })] });
    expect(verifyPaidLineItem(malformedDiscount, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });
  });

  it('accepts a zero allocation and a shipping-only discount (no line-item discount)', () => {
    const zero = order({ line_items: [line({ discount_allocations: [{ amount: '0.00', amount_set: { shop_money: usd('0.00'), presentment_money: gbp('0.00') } }] })] });
    expect(verifyPaidLineItem(zero, UK_CARD, 1, 2499).ok).toBe(true);
    const freeShipping = order({
      shipping_lines: [{ price: '5.12', price_set: { presentment_money: gbp('3.99') }, discount_allocations: [{ amount: '5.12', amount_set: { presentment_money: gbp('3.99') } }] }],
    });
    expect(verifyPaidLineItem(freeShipping, UK_CARD, 1, 2499).ok).toBe(true);
  });

  it.each(['pending', 'authorized', 'partially_paid', 'partially_refunded', 'refunded', 'voided', undefined])(
    'rejects an order whose financial_status is %s',
    (status) => {
      expect(verifyPaidLineItem(order({ financial_status: status }), UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'order_not_paid' });
    },
  );

  it('rejects test, cancelled and already-refunded orders', () => {
    expect(verifyPaidLineItem(order({ test: true }), UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'test_order' });
    expect(verifyPaidLineItem(order({ cancelled_at: '2026-10-16T12:00:00+01:00' }), UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'order_cancelled' });
    expect(verifyPaidLineItem(order({ refunds: [{ id: 1 }] }), UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'order_refunded' });
  });

  it('rejects quantity problems, including items removed after purchase', () => {
    expect(verifyPaidLineItem(order(), UK_CARD, 2, 2499)).toEqual({ ok: false, reason: 'quantity_mismatch' });
    expect(verifyPaidLineItem(order({ line_items: [line({ current_quantity: 0 })] }), UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'quantity_mismatch' });
  });

  it('never matches a Squad Invite variant to the individual card', () => {
    const squad = order({ line_items: [line({ variant_id: 46948820156588 })] });
    expect(verifyPaidLineItem(squad, UK_CARD, 1, 2499)).toEqual({ ok: false, reason: 'no_matching_line_item' });
  });
});

describe('classifyRefund', () => {
  const tx = (amount: string, status = 'success', currency = 'GBP') => ({ kind: 'refund', status, amount, currency });
  const line = (variant: number, quantity: number) => ({ quantity, line_item: { variant_id: variant } });
  const opts = { cardVariantIds: ['111', '222'], paidQuantity: 2, paidAmountPence: 4998 };

  it('is full when every paid card is refunded with money returned (success or pending)', () => {
    expect(classifyRefund({ refund_line_items: [line(111, 2)], transactions: [tx('49.98')] }, opts)).toEqual({ kind: 'full', basis: 'quantity' });
    expect(classifyRefund({ refund_line_items: [line(111, 1), line(222, 1)], transactions: [tx('49.98', 'pending')] }, opts)).toEqual({ kind: 'full', basis: 'quantity' });
  });

  it('is full when the GBP amount refunded covers what was paid, even without line items', () => {
    expect(classifyRefund({ refund_line_items: [], transactions: [tx('30.00'), tx('19.98')] }, opts)).toEqual({ kind: 'full', basis: 'amount' });
  });

  it('is partial for fewer cards, smaller amounts, other variants, or items with no money returned', () => {
    expect(classifyRefund({ refund_line_items: [line(111, 1)], transactions: [tx('24.99')] }, opts)).toEqual({ kind: 'partial', refundedQuantity: 1, refundedAmountPence: 2499 });
    expect(classifyRefund({ refund_line_items: [line(999, 5)], transactions: [tx('4.00')] }, opts)).toEqual({ kind: 'partial', refundedQuantity: 0, refundedAmountPence: 400 });
    expect(classifyRefund({ refund_line_items: [line(111, 2)], transactions: [] }, opts)).toEqual({ kind: 'partial', refundedQuantity: 2, refundedAmountPence: 0 });
    expect(classifyRefund({}, opts)).toEqual({ kind: 'partial', refundedQuantity: 0, refundedAmountPence: 0 });
  });

  it('is failed only when every refund transaction failed or errored', () => {
    expect(classifyRefund({ refund_line_items: [line(111, 2)], transactions: [tx('49.98', 'failure')] }, opts)).toEqual({ kind: 'failed' });
    expect(classifyRefund({ refund_line_items: [line(111, 2)], transactions: [tx('49.98', 'error'), tx('49.98', 'failure')] }, opts)).toEqual({ kind: 'failed' });
    expect(classifyRefund({ refund_line_items: [line(111, 2)], transactions: [tx('49.98', 'failure'), tx('49.98', 'success')] }, opts)).toEqual({ kind: 'full', basis: 'quantity' });
  });

  it('never compares amounts in another currency (a currency surprise is partial, never full)', () => {
    expect(classifyRefund({ transactions: [tx('100.00', 'success', 'USD')] }, opts)).toEqual({ kind: 'partial', refundedQuantity: 0, refundedAmountPence: null });
  });

  it('ignores non-refund transaction kinds and malformed amounts', () => {
    expect(classifyRefund({ transactions: [{ kind: 'sale', status: 'success', amount: '49.98', currency: 'GBP' }] }, opts)).toEqual({ kind: 'partial', refundedQuantity: 0, refundedAmountPence: 0 });
    expect(classifyRefund({ transactions: [tx('£49.98')] }, opts)).toEqual({ kind: 'partial', refundedQuantity: 0, refundedAmountPence: null });
  });

  it('needs a known paid quantity or amount to call a refund full', () => {
    expect(classifyRefund({ refund_line_items: [line(111, 2)], transactions: [tx('49.98')] }, { cardVariantIds: ['111'], paidQuantity: null, paidAmountPence: null })).toEqual({ kind: 'partial', refundedQuantity: 2, refundedAmountPence: 4998 });
  });
});

describe('refundTouchesVariants', () => {
  it('spots refunds naming one of the given variants only', () => {
    expect(refundTouchesVariants({ refund_line_items: [{ quantity: 1, line_item: { variant_id: 222 } }] }, ['111', '222'])).toBe(true);
    expect(refundTouchesVariants({ refund_line_items: [{ quantity: 1, line_item: { variant_id: 333 } }] }, ['111', '222'])).toBe(false);
    expect(refundTouchesVariants({}, ['111'])).toBe(false);
  });
});
