import { afterEach, describe, expect, it } from 'vitest';
import { buildUkCardCartUrl, gate3CheckoutSupportsTier, gate3PaymentGateEnabled, isSafeShopifyCheckoutUrl } from './shopify';

const ORIGINAL_VARIANT = process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;

afterEach(() => {
  if (ORIGINAL_VARIANT === undefined) delete process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;
  else process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT = ORIGINAL_VARIANT;
});

describe('buildUkCardCartUrl', () => {
  it('returns null when the variant env var is unset — the pre-Gate-3 manual-flow fallback', () => {
    delete process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;
    expect(buildUkCardCartUrl(2, 'EMB-ABC123')).toBeNull();
  });

  it('builds a cart permalink carrying only the variant, quantity, and Order Ref attribute — never a price', () => {
    process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT = '123456789';
    const url = buildUkCardCartUrl(3, 'EMB-ABC123');
    expect(url).toBe('https://officialgudzzz.myshopify.com/cart/123456789:3?attributes%5BOrder+Ref%5D=EMB-ABC123');
    expect(url).not.toMatch(/price|amount/i);
  });

  it('never lets a non-positive quantity produce a zero/negative-quantity cart line', () => {
    process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT = '123456789';
    const url = buildUkCardCartUrl(0, 'EMB-ABC123');
    expect(url).toContain(':1?');
  });
});

describe('gate3PaymentGateEnabled', () => {
  it('mirrors the same launch switch buildUkCardCartUrl already uses', () => {
    process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT = '123456789';
    expect(gate3PaymentGateEnabled()).toBe(true);
    delete process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;
    expect(gate3PaymentGateEnabled()).toBe(false);
  });
});

describe('gate3CheckoutSupportsTier', () => {
  it('only the single-child tier has a verified variant/price mapping today', () => {
    expect(gate3CheckoutSupportsTier('single')).toBe(true);
  });

  it('refuses multi and squad tiers — no verified per-tier variant mapping exists for the ordinary builder', () => {
    expect(gate3CheckoutSupportsTier('multi')).toBe(false);
    expect(gate3CheckoutSupportsTier('squad')).toBe(false);
  });

  it('refuses a missing/unknown tier rather than defaulting to allowed', () => {
    expect(gate3CheckoutSupportsTier(null)).toBe(false);
    expect(gate3CheckoutSupportsTier(undefined)).toBe(false);
    expect(gate3CheckoutSupportsTier('unknown-tier')).toBe(false);
  });
});

describe('isSafeShopifyCheckoutUrl', () => {
  it('accepts a genuine Shopify cart URL on the configured shop', () => {
    expect(isSafeShopifyCheckoutUrl('https://officialgudzzz.myshopify.com/cart/123456:2')).toBe(true);
    expect(isSafeShopifyCheckoutUrl('https://officialgudzzz.myshopify.com/cart/123456:2?attributes%5BOrder+Ref%5D=EMB-1')).toBe(true);
  });

  it('rejects a different host entirely', () => {
    expect(isSafeShopifyCheckoutUrl('https://attacker.example/cart/123456:2')).toBe(false);
  });

  it('rejects a plain http URL even on the right host', () => {
    expect(isSafeShopifyCheckoutUrl('http://officialgudzzz.myshopify.com/cart/123456:2')).toBe(false);
  });

  it('rejects a path outside /cart/ on the right host', () => {
    expect(isSafeShopifyCheckoutUrl('https://officialgudzzz.myshopify.com/admin/orders/1')).toBe(false);
  });

  it('rejects a non-URL string without throwing', () => {
    expect(() => isSafeShopifyCheckoutUrl('not a url')).not.toThrow();
    expect(isSafeShopifyCheckoutUrl('not a url')).toBe(false);
  });
});
