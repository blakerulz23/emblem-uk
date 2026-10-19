import { afterEach, describe, expect, it } from 'vitest';
import { buildSquadInvitePaymentUrl } from './squad-invite-payment-link';

const ORIGINAL_ENV = { ...process.env };

describe('buildSquadInvitePaymentUrl', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns null when the tier\'s variant is not configured', () => {
    delete process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SQUAD;
    expect(buildSquadInvitePaymentUrl('squad', 1, 'squad-abc-123')).toBeNull();
  });

  it('builds a cart permalink with the order ref as a cart attribute', () => {
    process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE = '999999';
    const url = buildSquadInvitePaymentUrl('single', 1, 'squad-abc-123');
    expect(url).toContain('/cart/999999:1?');
    expect(url).toContain('attributes%5BOrder+Ref%5D=squad-abc-123');
  });

  it('uses the participation\'s own print quantity, not a fixed 1', () => {
    process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_MULTI = '888888';
    const url = buildSquadInvitePaymentUrl('multi', 3, 'squad-xyz-456');
    expect(url).toContain('/cart/888888:3?');
  });

  it('clamps a zero or invalid quantity to at least 1', () => {
    process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SQUAD = '777777';
    expect(buildSquadInvitePaymentUrl('squad', 0, 'ref')).toContain(':1?');
    expect(buildSquadInvitePaymentUrl('squad', -5, 'ref')).toContain(':1?');
    expect(buildSquadInvitePaymentUrl('squad', NaN, 'ref')).toContain(':1?');
  });

  it('uses a distinct env var per tier', () => {
    process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE = '111';
    process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_MULTI = '222';
    process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SQUAD = '333';
    expect(buildSquadInvitePaymentUrl('single', 1, 'r')).toContain('/cart/111:');
    expect(buildSquadInvitePaymentUrl('multi', 1, 'r')).toContain('/cart/222:');
    expect(buildSquadInvitePaymentUrl('squad', 1, 'r')).toContain('/cart/333:');
  });

  describe('staging safety: never a production payment link outside production', () => {
    it('production builds the link on the production shop', () => {
      delete process.env.VERCEL_ENV;
      process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE = '46948820156588';
      expect(new URL(buildSquadInvitePaymentUrl('single', 1, 'r')!).hostname).toBe('officialgudzzz.myshopify.com');
      process.env.VERCEL_ENV = 'production';
      expect(new URL(buildSquadInvitePaymentUrl('single', 1, 'r')!).hostname).toBe('officialgudzzz.myshopify.com');
    });

    it('a Preview (staging) deployment with no development store gets no link at all', () => {
      process.env.VERCEL_ENV = 'preview';
      delete process.env.SHOPIFY_STORE_DOMAIN;
      process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE = '46948820156588';
      expect(buildSquadInvitePaymentUrl('single', 1, 'r')).toBeNull();
    });

    it('a Preview pointed at the production shop (or a malformed host) still gets no link', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE = '1';
      for (const domain of ['officialgudzzz.myshopify.com', 'OfficialGudzzz.myshopify.com', 'evil.example.com', 'https://dev.myshopify.com']) {
        process.env.SHOPIFY_STORE_DOMAIN = domain;
        expect(buildSquadInvitePaymentUrl('single', 1, 'r')).toBeNull();
      }
    });

    it('a Preview with an explicitly configured development store uses that store only', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.SHOPIFY_STORE_DOMAIN = 'emblem-dev.myshopify.com';
      process.env.NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_MULTI = '5';
      expect(new URL(buildSquadInvitePaymentUrl('multi', 2, 'r')!).hostname).toBe('emblem-dev.myshopify.com');
    });
  });
});
