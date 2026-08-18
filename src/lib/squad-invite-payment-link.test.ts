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
});
