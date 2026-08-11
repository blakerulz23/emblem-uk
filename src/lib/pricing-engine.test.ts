import { describe, expect, it } from 'vitest';
import {
  priceOrder,
  SINGLE_UNIT_PRICE_PENCE,
  MULTI_UNIT_PRICE_PENCE,
  SQUAD_UNIT_PRICE_PENCE,
  MULTI_MIN_PLAYERS,
  SQUAD_MIN_PLAYERS,
  COACH_CARD_UNIT_PRICE_PENCE,
  CURRENCY,
  PRICING_VERSION,
} from './pricing-engine';

describe('priceOrder', () => {
  it('1 player, 1 print — Single Player tier, no coach card', () => {
    const r = priceOrder({ paidPlayerCount: 1, totalPrintQuantity: 1 });
    expect(r.tier).toBe('single');
    expect(r.unitPricePence).toBe(2499);
    expect(r.subtotalPence).toBe(2499);
    expect(r.coachCardEligible).toBe(false);
    expect(r.coachCardQuantity).toBe(0);
  });

  it('2 players, 2 prints — Multi-Card Set tier, no coach card', () => {
    const r = priceOrder({ paidPlayerCount: 2, totalPrintQuantity: 2 });
    expect(r.tier).toBe('multi');
    expect(r.unitPricePence).toBe(2199);
    expect(r.subtotalPence).toBe(4398);
    expect(r.coachCardEligible).toBe(false);
    expect(r.coachCardQuantity).toBe(0);
  });

  it('9 players, 9 prints — still Multi-Card Set, just below the Full Squad threshold', () => {
    const r = priceOrder({ paidPlayerCount: 9, totalPrintQuantity: 9 });
    expect(r.tier).toBe('multi');
    expect(r.unitPricePence).toBe(2199);
    expect(r.subtotalPence).toBe(19791);
    expect(r.coachCardEligible).toBe(false);
    expect(r.coachCardQuantity).toBe(0);
  });

  it('10 players, 10 prints — Full Squad tier, one free coach card', () => {
    const r = priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 10 });
    expect(r.tier).toBe('squad');
    expect(r.unitPricePence).toBe(1899);
    expect(r.subtotalPence).toBe(18990);
    expect(r.coachCardEligible).toBe(true);
    expect(r.coachCardQuantity).toBe(1);
  });

  it('11 players, 11 prints — Full Squad tier, one free coach card', () => {
    const r = priceOrder({ paidPlayerCount: 11, totalPrintQuantity: 11 });
    expect(r.tier).toBe('squad');
    expect(r.unitPricePence).toBe(1899);
    expect(r.subtotalPence).toBe(20889);
    expect(r.coachCardEligible).toBe(true);
    expect(r.coachCardQuantity).toBe(1);
  });

  it('16 players, 16 prints — Full Squad tier, one free coach card', () => {
    const r = priceOrder({ paidPlayerCount: 16, totalPrintQuantity: 16 });
    expect(r.tier).toBe('squad');
    expect(r.unitPricePence).toBe(1899);
    expect(r.subtotalPence).toBe(30384);
    expect(r.coachCardEligible).toBe(true);
    expect(r.coachCardQuantity).toBe(1);
  });

  it('1 player, 10 prints — stays Single Player tier (tier follows distinct players, not copies)', () => {
    const r = priceOrder({ paidPlayerCount: 1, totalPrintQuantity: 10 });
    expect(r.tier).toBe('single');
    expect(r.unitPricePence).toBe(2499);
    expect(r.subtotalPence).toBe(24990);
    expect(r.coachCardEligible).toBe(false);
    expect(r.coachCardQuantity).toBe(0);
  });

  it('2 players, 5 prints — Multi-Card Set unit price applied to every copy', () => {
    const r = priceOrder({ paidPlayerCount: 2, totalPrintQuantity: 5 });
    expect(r.tier).toBe('multi');
    expect(r.unitPricePence).toBe(2199);
    expect(r.subtotalPence).toBe(10995);
    expect(r.coachCardEligible).toBe(false);
    expect(r.coachCardQuantity).toBe(0);
  });

  it('10 players, 12 prints — Full Squad unit price applied to every copy, one free coach card', () => {
    const r = priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 12 });
    expect(r.tier).toBe('squad');
    expect(r.unitPricePence).toBe(1899);
    expect(r.subtotalPence).toBe(22788);
    expect(r.coachCardEligible).toBe(true);
    expect(r.coachCardQuantity).toBe(1);
  });

  describe('every result carries currency, coach-card pricing and the delivery-excluded flag', () => {
    it('GBP currency, £0.00 coach-card unit price, delivery explicitly excluded', () => {
      const r = priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 10 });
      expect(r.currency).toBe('GBP');
      expect(r.currency).toBe(CURRENCY);
      expect(r.coachCardUnitPricePence).toBe(0);
      expect(r.coachCardUnitPricePence).toBe(COACH_CARD_UNIT_PRICE_PENCE);
      expect(r.deliveryExcluded).toBe(true);
    });
  });

  describe('the free coach card never affects the paid subtotal', () => {
    it('a squad-tier subtotal is exactly totalPrintQuantity x the squad unit price — no coach-card cost folded in', () => {
      const r = priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 10 });
      expect(r.subtotalPence).toBe(r.totalPrintQuantity * r.unitPricePence);
      expect(r.subtotalPence).toBe(10 * SQUAD_UNIT_PRICE_PENCE);
    });
  });

  describe('input validation', () => {
    it('rejects paidPlayerCount < 1', () => {
      expect(() => priceOrder({ paidPlayerCount: 0, totalPrintQuantity: 1 })).toThrow();
      expect(() => priceOrder({ paidPlayerCount: -1, totalPrintQuantity: 1 })).toThrow();
    });

    it('rejects totalPrintQuantity < 1', () => {
      expect(() => priceOrder({ paidPlayerCount: 1, totalPrintQuantity: 0 })).toThrow();
      expect(() => priceOrder({ paidPlayerCount: 1, totalPrintQuantity: -1 })).toThrow();
    });

    it('rejects non-integer quantities', () => {
      expect(() => priceOrder({ paidPlayerCount: 1.5, totalPrintQuantity: 1 })).toThrow();
      expect(() => priceOrder({ paidPlayerCount: 1, totalPrintQuantity: 2.2 })).toThrow();
    });

    it('rejects non-finite quantities', () => {
      expect(() => priceOrder({ paidPlayerCount: NaN, totalPrintQuantity: 1 })).toThrow();
      expect(() => priceOrder({ paidPlayerCount: Infinity, totalPrintQuantity: 1 })).toThrow();
      expect(() => priceOrder({ paidPlayerCount: 1, totalPrintQuantity: -Infinity })).toThrow();
    });

    it('rejects totalPrintQuantity < paidPlayerCount', () => {
      expect(() => priceOrder({ paidPlayerCount: 5, totalPrintQuantity: 3 })).toThrow();
      expect(() => priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 9 })).toThrow();
    });
  });

  // The 9->10-player total genuinely drops, and that's an approved,
  // intentional Full Squad incentive — not a rounding bug or a regression
  // to "fix" later. See the approved audit decisions: "Document this as
  // an intentional Full Squad incentive."
  it('the 9-to-10-player total reduction is intentional: 9 players costs more than 10 (even before the free coach card)', () => {
    const nine = priceOrder({ paidPlayerCount: 9, totalPrintQuantity: 9 });
    const ten = priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 10 });

    expect(nine.subtotalPence).toBe(19791); // £197.91
    expect(ten.subtotalPence).toBe(18990); // £189.90
    expect(ten.subtotalPence).toBeLessThan(nine.subtotalPence);
    expect(nine.subtotalPence - ten.subtotalPence).toBe(801); // £8.01 saved

    // ...and the 10-player order also receives a free coach card the
    // 9-player order does not.
    expect(nine.coachCardEligible).toBe(false);
    expect(ten.coachCardEligible).toBe(true);
  });

  it('exposes the approved public pricing constants for reuse by future trusted consumers', () => {
    expect(SINGLE_UNIT_PRICE_PENCE).toBe(2499);
    expect(MULTI_UNIT_PRICE_PENCE).toBe(2199);
    expect(SQUAD_UNIT_PRICE_PENCE).toBe(1899);
    expect(MULTI_MIN_PLAYERS).toBe(2);
    expect(SQUAD_MIN_PLAYERS).toBe(10);
  });

  describe('pricingVersion', () => {
    it('exports PRICING_VERSION as 1', () => {
      expect(PRICING_VERSION).toBe(1);
    });

    it('every result carries the engine-owned PRICING_VERSION, not a caller-supplied value', () => {
      const single = priceOrder({ paidPlayerCount: 1, totalPrintQuantity: 1 });
      const multi = priceOrder({ paidPlayerCount: 2, totalPrintQuantity: 2 });
      const squad = priceOrder({ paidPlayerCount: 10, totalPrintQuantity: 10 });
      expect(single.pricingVersion).toBe(PRICING_VERSION);
      expect(multi.pricingVersion).toBe(PRICING_VERSION);
      expect(squad.pricingVersion).toBe(PRICING_VERSION);
    });
  });
});
