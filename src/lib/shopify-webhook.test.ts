import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { extractOrderRef, extractShopifyOrderId, verifyPaidLineItem, verifyShopifyHmac } from './shopify-webhook';

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

  it('passes when the line item matching our variant has the exact expected quantity and unit price', () => {
    const payload = {
      currency: 'GBP',
      line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99' }],
    };
    const result = verifyPaidLineItem(payload, VARIANT_ID, 2, 2499);
    expect(result).toEqual({ ok: true, currency: 'GBP' });
  });

  it('fails when no line item matches our configured variant at all', () => {
    const payload = { line_items: [{ variant_id: 999, quantity: 2, price: '24.99' }] };
    const result = verifyPaidLineItem(payload, VARIANT_ID, 2, 2499);
    expect(result).toEqual({ ok: false, reason: 'no_matching_line_item' });
  });

  it('fails on a quantity mismatch — never trusts a different quantity than what Emblem\'s own order says', () => {
    const payload = { line_items: [{ variant_id: 123456789, quantity: 5, price: '24.99' }] };
    const result = verifyPaidLineItem(payload, VARIANT_ID, 2, 2499);
    expect(result).toEqual({ ok: false, reason: 'quantity_mismatch' });
  });

  it('fails on a price mismatch — never trusts a different unit price than what Emblem\'s own order says', () => {
    const payload = { line_items: [{ variant_id: 123456789, quantity: 2, price: '9.99' }] };
    const result = verifyPaidLineItem(payload, VARIANT_ID, 2, 2499);
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
    expect(verifyPaidLineItem(payload, VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });
  });

  it('fails closed on malformed discount or price strings', () => {
    const malformedDiscount = {
      line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99', discount_allocations: [{ amount: 'free' }] }],
    };
    expect(verifyPaidLineItem(malformedDiscount, VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'discount_mismatch' });

    const malformedPrice = { line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99GBP' }] };
    expect(verifyPaidLineItem(malformedPrice, VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'price_mismatch' });
  });

  it('sums duplicate matching variant lines and verifies every line', () => {
    const payload = {
      currency: 'GBP',
      line_items: [
        { variant_id: 123456789, quantity: 1, price: '24.99' },
        { variant_id: '123456789', quantity: 1, price: '24.99', discount_allocations: [{ amount: '0.00' }] },
      ],
    };
    expect(verifyPaidLineItem(payload, VARIANT_ID, 2, 2499)).toEqual({ ok: true, currency: 'GBP' });
  });

  it('never blindly trusts total_price — verification is against the matching line item only, ignoring shipping/tax additions', () => {
    const payload = {
      currency: 'GBP',
      total_price: '45.98', // subtotal (24.99*2=49.98... deliberately different) plus shipping/tax, never checked directly
      line_items: [{ variant_id: 123456789, quantity: 2, price: '24.99' }],
    };
    const result = verifyPaidLineItem(payload, VARIANT_ID, 2, 2499);
    expect(result.ok).toBe(true);
  });

  it('handles a malformed/empty payload without throwing', () => {
    expect(() => verifyPaidLineItem({}, VARIANT_ID, 2, 2499)).not.toThrow();
    expect(verifyPaidLineItem({}, VARIANT_ID, 2, 2499)).toEqual({ ok: false, reason: 'no_matching_line_item' });
    expect(() => verifyPaidLineItem(null, VARIANT_ID, 2, 2499)).not.toThrow();
  });
});
