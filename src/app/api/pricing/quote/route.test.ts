import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { PRICING_VERSION } from '@/lib/pricing-engine';

function postQuote(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/pricing/quote', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function postRawBody(rawBody: string) {
  return POST(
    new NextRequest('http://localhost/api/pricing/quote', {
      method: 'POST',
      body: rawBody,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('POST /api/pricing/quote', () => {
  describe('accepted', () => {
    it('1 player / 1 print — single, £24.99, no coach card', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pricingTier).toBe('single');
      expect(body.currency).toBe('GBP');
      expect(body.unitPricePence).toBe(2499);
      expect(body.subtotalPence).toBe(2499);
      expect(body.coachCardIncluded).toBe(false);
      expect(body.lineItems).toEqual([
        { kind: 'player_card', quantity: 1, unitPricePence: 2499, subtotalPence: 2499 },
      ]);
      expect(body.pricingVersion).toBe(PRICING_VERSION);
      expect(body.deliveryPence).toBeNull();
      expect(body.taxPence).toBeNull();
      expect(body.totalPence).toBeNull();
    });

    it('1 player / 10 prints — single, £249.90, no coach card', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 10 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pricingTier).toBe('single');
      expect(body.subtotalPence).toBe(24990);
      expect(body.coachCardIncluded).toBe(false);
    });

    it('2 players / 2 prints — multi, £43.98, no coach card', async () => {
      const res = await postQuote({ paidPlayerCount: 2, totalPrintQuantity: 2 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pricingTier).toBe('multi');
      expect(body.unitPricePence).toBe(2199);
      expect(body.subtotalPence).toBe(4398);
      expect(body.coachCardIncluded).toBe(false);
    });

    it('9 players / 9 prints — multi, £197.91, no coach card', async () => {
      const res = await postQuote({ paidPlayerCount: 9, totalPrintQuantity: 9 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pricingTier).toBe('multi');
      expect(body.subtotalPence).toBe(19791);
      expect(body.coachCardIncluded).toBe(false);
    });

    it('10 players / 10 prints — squad, £189.90, one free coach card', async () => {
      const res = await postQuote({ paidPlayerCount: 10, totalPrintQuantity: 10 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pricingTier).toBe('squad');
      expect(body.unitPricePence).toBe(1899);
      expect(body.subtotalPence).toBe(18990);
      expect(body.coachCardIncluded).toBe(true);
      expect(body.lineItems).toEqual([
        { kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 },
        { kind: 'coach_card', quantity: 1, unitPricePence: 0, subtotalPence: 0 },
      ]);
      expect(body.pricingVersion).toBe(PRICING_VERSION);
    });

    it('returns the pricing engine\'s own PRICING_VERSION, not a value defined by the route', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1 });
      const body = await res.json();
      expect(body.pricingVersion).toBe(PRICING_VERSION);
    });

    it('12 players / 15 prints (additional copies) — correct squad arithmetic, exactly one free coach card', async () => {
      const res = await postQuote({ paidPlayerCount: 12, totalPrintQuantity: 15 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pricingTier).toBe('squad');
      expect(body.unitPricePence).toBe(1899);
      expect(body.subtotalPence).toBe(15 * 1899);
      expect(body.coachCardIncluded).toBe(true);
      const coachLines = body.lineItems.filter((l: { kind: string }) => l.kind === 'coach_card');
      expect(coachLines).toHaveLength(1);
      expect(coachLines[0]).toEqual({ kind: 'coach_card', quantity: 1, unitPricePence: 0, subtotalPence: 0 });
    });
  });

  describe('rejected', () => {
    it('rejects a missing request body', async () => {
      const res = await postRawBody('');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeDefined();
    });

    it('rejects malformed JSON', async () => {
      const res = await postRawBody('{not valid json');
      expect(res.status).toBe(400);
    });

    it('rejects an array body', async () => {
      const res = await postQuote([1, 2]);
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body (string)', async () => {
      const res = await postRawBody('"just a string"');
      expect(res.status).toBe(400);
    });

    it('rejects a missing field', async () => {
      const res = await postQuote({ paidPlayerCount: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects an empty object', async () => {
      const res = await postQuote({});
      expect(res.status).toBe(400);
    });

    it('rejects invalid types (string instead of number)', async () => {
      const res = await postQuote({ paidPlayerCount: '1', totalPrintQuantity: '1' });
      expect(res.status).toBe(400);
    });

    it('rejects booleans', async () => {
      const res = await postQuote({ paidPlayerCount: true, totalPrintQuantity: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects null', async () => {
      const res = await postQuote({ paidPlayerCount: null, totalPrintQuantity: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects decimals', async () => {
      const res = await postQuote({ paidPlayerCount: 1.5, totalPrintQuantity: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects NaN-like / non-finite values', async () => {
      const res1 = await postRawBody(JSON.stringify({ paidPlayerCount: 'NaN', totalPrintQuantity: 1 }));
      expect(res1.status).toBe(400);
    });

    it('rejects zero values', async () => {
      const res = await postQuote({ paidPlayerCount: 0, totalPrintQuantity: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects negative values', async () => {
      const res = await postQuote({ paidPlayerCount: -1, totalPrintQuantity: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects prints fewer than paid players', async () => {
      const res = await postQuote({ paidPlayerCount: 10, totalPrintQuantity: 5 });
      expect(res.status).toBe(400);
    });

    it('rejects unsafe/excessive integer values', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 100_000_000 });
      expect(res.status).toBe(400);
    });

    it('rejects a client-supplied pricingTier', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1, pricingTier: 'squad' });
      expect(res.status).toBe(400);
    });

    it('rejects a client-supplied unitPricePence/subtotalPence', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1, unitPricePence: 1, subtotalPence: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects a client-supplied pricingVersion', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1, pricingVersion: 99 });
      expect(res.status).toBe(400);
    });

    it('rejects a client-supplied coachCardIncluded', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1, coachCardIncluded: true });
      expect(res.status).toBe(400);
    });

    it('rejects a client-supplied currency', async () => {
      const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1, currency: 'USD' });
      expect(res.status).toBe(400);
    });
  });

  it('sets Cache-Control: no-store on a successful response', async () => {
    const res = await postQuote({ paidPlayerCount: 1, totalPrintQuantity: 1 });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('error responses never include a stack trace', async () => {
    const res = await postQuote({ paidPlayerCount: -5, totalPrintQuantity: 1 });
    const text = await res.text();
    expect(text).not.toMatch(/at \S+ \(.*:\d+:\d+\)/);
    expect(text.toLowerCase()).not.toContain('node_modules');
  });
});
