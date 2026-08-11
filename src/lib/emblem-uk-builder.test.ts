import { describe, expect, it } from 'vitest';
import { createPlayer, defaultOrder, productionPayload, summarizeOrder, type OrderDraft, type PlayerDraft } from './emblem-uk-builder';
import type { PricingQuoteResponse } from './pricing-quote';

/**
 * These tests cover exactly the two values Stage 4 sends to POST
 * /api/pricing/quote (paidPlayerCount, totalPrintQuantity), derived here
 * as summary.approvedPlayers.length / summary.approvedPrints. No pricing
 * tier, unit price, or subtotal is computed in this module — see
 * src/lib/pricing-quote.ts / useOrderPricingQuote for that, sourced
 * exclusively from the server.
 */

function approvedPlayer(overrides: Partial<PlayerDraft> = {}): PlayerDraft {
  const approvedAt = '2026-01-01T00:00:00.000Z';
  return createPlayer({
    name: 'Player',
    position: 'ST',
    kitNo: '9',
    photo: { srcUrl: 'blob:photo', crop: { x: 0, y: 0, scale: 1 }, bgRemoved: false },
    approvedAt,
    updatedAt: approvedAt,
    prints: 1,
    ...overrides,
  });
}

function orderWith(players: PlayerDraft[]): OrderDraft {
  return { ...defaultOrder(), players };
}

describe('summarizeOrder — paidPlayerCount / totalPrintQuantity derivation', () => {
  it('one player with one print', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 1 })]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(1);
    expect(summary.approvedPrints).toBe(1);
  });

  it('one player with multiple copies', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 5 })]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(1);
    expect(summary.approvedPrints).toBe(5);
  });

  it('multiple distinct players, one print each', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', prints: 1 }),
      approvedPlayer({ id: 'p2', prints: 1 }),
      approvedPlayer({ id: 'p3', prints: 1 }),
    ]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(3);
    expect(summary.approvedPrints).toBe(3);
  });

  it('multiple distinct players with additional copies sums correctly', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', prints: 2 }),
      approvedPlayer({ id: 'p2', prints: 3 }),
      approvedPlayer({ id: 'p3', prints: 4 }),
    ]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(3);
    expect(summary.approvedPrints).toBe(9);
  });

  it('excludes players missing a photo (needs-photo) from both counts', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', prints: 3 }),
      createPlayer({ id: 'p2', name: 'No Photo', position: 'GK', kitNo: '1', prints: 7 }), // no photo
    ]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers.map((p) => p.id)).toEqual(['p1']);
    expect(summary.approvedPrints).toBe(3);
  });

  it('excludes incomplete players (needs-details) from both counts', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', prints: 2 }),
      createPlayer({
        id: 'p2',
        name: '',
        position: '',
        kitNo: '',
        photo: { srcUrl: 'blob:photo', crop: { x: 0, y: 0, scale: 1 }, bgRemoved: false },
        prints: 9,
      }), // has photo but missing name/position/kitNo
    ]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers.map((p) => p.id)).toEqual(['p1']);
    expect(summary.approvedPrints).toBe(2);
  });

  it('excludes complete-but-not-yet-approved players ("ready") from both counts', () => {
    const order = orderWith([
      approvedPlayer({ id: 'p1', prints: 1 }),
      createPlayer({
        id: 'p2',
        name: 'Ready Player',
        position: 'CM',
        kitNo: '8',
        photo: { srcUrl: 'blob:photo', crop: { x: 0, y: 0, scale: 1 }, bgRemoved: false },
        prints: 4,
        // complete, but no approvedAt — status derives to 'ready', not 'approved'
      }),
    ]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers.map((p) => p.id)).toEqual(['p1']);
    expect(summary.approvedPrints).toBe(1);
  });

  it('excludes a player edited after approval (dirty) until re-approved', () => {
    const dirty = approvedPlayer({ id: 'p1', prints: 6, approvedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' });
    const order = orderWith([dirty]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(0);
    expect(summary.approvedPrints).toBe(0);
  });

  it('removed players are simply absent from order.players and never counted', () => {
    const kept = approvedPlayer({ id: 'p1', prints: 2 });
    const order = orderWith([kept]); // p2 was "removed" by never being included
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(1);
    expect(summary.approvedPrints).toBe(2);
  });

  it('an order with zero players produces zero counts', () => {
    const order = orderWith([]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(0);
    expect(summary.approvedPrints).toBe(0);
    expect(summary.checkoutEligible).toBe(false);
  });

  it('never includes a synthetic coach-card entry — every counted entry is a real approved PlayerDraft', () => {
    // PlayerDraft has no coach/kind field at all (see emblem-uk-builder.ts) —
    // summarizeOrder only ever filters order.players, so there is no
    // mechanism by which a free coach card (a server-only, Stage-3 concept)
    // could be counted here. This is a structural guarantee, verified by
    // confirming the approved count never exceeds the number of players
    // actually marked approved.
    const order = orderWith([
      approvedPlayer({ id: 'p1', prints: 1 }),
      approvedPlayer({ id: 'p2', prints: 1 }),
    ]);
    const summary = summarizeOrder(order);
    expect(summary.approvedPlayers).toHaveLength(2);
    expect(summary.approvedPrints).toBe(2);
  });

  it('no longer exposes a client-calculated pricing tier or subtotal (Stage 4 removed the old model)', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 1 })]);
    const summary = summarizeOrder(order);
    expect(summary).not.toHaveProperty('pricing');
    expect(summary).not.toHaveProperty('subtotal');
  });
});

function quote(overrides: Partial<PricingQuoteResponse> = {}): PricingQuoteResponse {
  return {
    currency: 'GBP',
    pricingTier: 'multi',
    paidPlayerCount: 2,
    totalPrintQuantity: 2,
    unitPricePence: 2199,
    subtotalPence: 4398,
    pricingVersion: 1,
    coachCardIncluded: false,
    lineItems: [{ kind: 'player_card', quantity: 2, unitPricePence: 2199, subtotalPence: 4398 }],
    deliveryPence: null,
    taxPence: null,
    totalPence: null,
    ...overrides,
  };
}

describe('productionPayload — authoritative pricing amendment', () => {
  it('a ready, count-matching quote produces an order-level pricing block copied field-for-field', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 1 }), approvedPlayer({ id: 'p2', prints: 1 })]);
    const q = quote();
    const payload = productionPayload(order, q);

    expect(payload.pricing).toEqual({
      currency: q.currency,
      pricingTier: q.pricingTier,
      paidPlayerCount: q.paidPlayerCount,
      totalPrintQuantity: q.totalPrintQuantity,
      unitPricePence: q.unitPricePence,
      subtotalPence: q.subtotalPence,
      pricingVersion: q.pricingVersion,
      coachCardIncluded: q.coachCardIncluded,
      lineItems: q.lineItems,
      deliveryPence: q.deliveryPence,
      taxPence: q.taxPence,
      totalPence: q.totalPence,
    });
  });

  it('every monetary and eligibility value is copied exactly — no transformation, no pence-to-pounds conversion', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 10 })]);
    const q = quote({ pricingTier: 'squad', paidPlayerCount: 10, totalPrintQuantity: 10, unitPricePence: 1899, subtotalPence: 18990, coachCardIncluded: true });
    const payload = productionPayload(order, q);

    expect(payload.pricing?.unitPricePence).toBe(1899); // still integer pence, not 18.99
    expect(payload.pricing?.subtotalPence).toBe(18990); // still integer pence, not 189.90
    expect(payload.pricing?.coachCardIncluded).toBe(true);
    expect(payload.pricing?.pricingVersion).toBe(1);
  });

  it('omits the pricing block entirely when no quote is passed — never a stale/default price', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 1 })]);
    const payload = productionPayload(order, null);
    expect(payload).not.toHaveProperty('pricing');
  });

  it('never reconstructs the deleted £14.99-model fields', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 1 })]);
    const payload = productionPayload(order, quote());
    expect(payload.pricing).not.toHaveProperty('label');
    expect(payload.pricing).not.toHaveProperty('perCard');
    expect(payload.pricing).not.toHaveProperty('approvedPrints');
  });

  it('emits no per-player subtotal', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 3 }), approvedPlayer({ id: 'p2', prints: 2 })]);
    const payload = productionPayload(order, quote());
    for (const player of payload.players) {
      expect(player).not.toHaveProperty('subtotal');
    }
  });

  it('emits no per-club subtotal', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 3 }), approvedPlayer({ id: 'p2', prints: 2 })]);
    const payload = productionPayload(order, quote());
    for (const group of payload.clubGroups) {
      expect(group).not.toHaveProperty('subtotal');
    }
  });

  it('squad submission includes exactly one £0 coach-card line', () => {
    const players = Array.from({ length: 10 }, (_, i) => approvedPlayer({ id: `p${i + 1}`, prints: 1 }));
    const order = orderWith(players);
    const q = quote({
      pricingTier: 'squad',
      paidPlayerCount: 10,
      totalPrintQuantity: 10,
      unitPricePence: 1899,
      subtotalPence: 18990,
      coachCardIncluded: true,
      lineItems: [
        { kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 },
        { kind: 'coach_card', quantity: 1, unitPricePence: 0, subtotalPence: 0 },
      ],
    });
    const payload = productionPayload(order, q);
    const coachLines = payload.pricing?.lineItems.filter((line) => line.kind === 'coach_card') ?? [];
    expect(coachLines).toHaveLength(1);
    expect(coachLines[0]).toEqual({ kind: 'coach_card', quantity: 1, unitPricePence: 0, subtotalPence: 0 });
  });

  it('single/multi submission contains no coach-card line', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 1 }), approvedPlayer({ id: 'p2', prints: 1 })]);
    const q = quote({ coachCardIncluded: false });
    const payload = productionPayload(order, q);
    const coachLines = payload.pricing?.lineItems.filter((line) => line.kind === 'coach_card') ?? [];
    expect(coachLines).toHaveLength(0);
  });

  it('non-pricing payload fields (order/clubGroups/players identity data) are unchanged by the quote', () => {
    const order = orderWith([approvedPlayer({ id: 'p1', prints: 1, name: 'Alex' })]);
    const withQuote = productionPayload(order, quote());
    const withoutQuote = productionPayload(order, null);
    expect(withQuote.order).toEqual(withoutQuote.order);
    expect(withQuote.players).toEqual(withoutQuote.players);
    expect(withQuote.clubGroups).toEqual(withoutQuote.clubGroups);
  });
});
