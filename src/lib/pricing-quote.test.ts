import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPricingQuote, formatPence, isPricingQuoteResponse, PricingQuoteError } from './pricing-quote';

function validResponseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    currency: 'GBP',
    pricingTier: 'squad',
    paidPlayerCount: 10,
    totalPrintQuantity: 10,
    unitPricePence: 1899,
    subtotalPence: 18990,
    pricingVersion: 1,
    coachCardIncluded: true,
    lineItems: [
      { kind: 'player_card', quantity: 10, unitPricePence: 1899, subtotalPence: 18990 },
      { kind: 'coach_card', quantity: 1, unitPricePence: 0, subtotalPence: 0 },
    ],
    deliveryPence: null,
    taxPence: null,
    totalPence: null,
    ...overrides,
  };
}

describe('isPricingQuoteResponse', () => {
  it('accepts a well-formed response', () => {
    expect(isPricingQuoteResponse(validResponseBody())).toBe(true);
  });

  it('rejects null/undefined/non-object values', () => {
    expect(isPricingQuoteResponse(null)).toBe(false);
    expect(isPricingQuoteResponse(undefined)).toBe(false);
    expect(isPricingQuoteResponse('a string')).toBe(false);
    expect(isPricingQuoteResponse(42)).toBe(false);
    expect(isPricingQuoteResponse([])).toBe(false);
  });

  it('rejects a response missing a required field', () => {
    const withoutSubtotal: Record<string, unknown> = validResponseBody();
    delete withoutSubtotal.subtotalPence;
    expect(isPricingQuoteResponse(withoutSubtotal)).toBe(false);
  });

  it('rejects an invalid pricingTier', () => {
    expect(isPricingQuoteResponse(validResponseBody({ pricingTier: 'enterprise' }))).toBe(false);
  });

  it('rejects wrong types for numeric fields', () => {
    expect(isPricingQuoteResponse(validResponseBody({ subtotalPence: '18990' }))).toBe(false);
    expect(isPricingQuoteResponse(validResponseBody({ pricingVersion: '1' }))).toBe(false);
  });

  it('rejects a malformed line item', () => {
    expect(
      isPricingQuoteResponse(validResponseBody({ lineItems: [{ kind: 'player_card', quantity: 'ten' }] }))
    ).toBe(false);
  });

  it('rejects non-null non-number delivery/tax/total fields', () => {
    expect(isPricingQuoteResponse(validResponseBody({ deliveryPence: 'free' }))).toBe(false);
  });

  it('accepts null delivery/tax/total', () => {
    expect(isPricingQuoteResponse(validResponseBody({ deliveryPence: null, taxPence: null, totalPence: null }))).toBe(
      true
    );
  });
});

describe('fetchPricingQuote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only paidPlayerCount and totalPrintQuantity — no personal data', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(validResponseBody()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPricingQuote(10, 10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/pricing/quote');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string);
    expect(sentBody).toEqual({ paidPlayerCount: 10, totalPrintQuantity: 10 });
    expect(Object.keys(sentBody)).toHaveLength(2);
  });

  it('returns the parsed quote on a valid 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validResponseBody()), { status: 200 })));
    const quote = await fetchPricingQuote(10, 10);
    expect(quote.pricingTier).toBe('squad');
    expect(quote.subtotalPence).toBe(18990);
  });

  it('throws PricingQuoteError on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })));
    await expect(fetchPricingQuote(10, 5)).rejects.toBeInstanceOf(PricingQuoteError);
  });

  it('throws PricingQuoteError on a malformed/unexpected successful payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(fetchPricingQuote(10, 10)).rejects.toBeInstanceOf(PricingQuoteError);
  });

  it('throws PricingQuoteError if the response body is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(fetchPricingQuote(10, 10)).rejects.toBeInstanceOf(PricingQuoteError);
  });
});

describe('formatPence', () => {
  it('formats integer pence as GBP', () => {
    expect(formatPence(2499)).toBe('£24.99');
    expect(formatPence(0)).toBe('£0.00');
    expect(formatPence(18990)).toBe('£189.90');
  });
});
