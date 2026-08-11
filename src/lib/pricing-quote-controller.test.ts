import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isQuoteFreshForCounts, PricingQuoteController, type OrderPricingQuoteState } from './pricing-quote-controller';
import { fetchPricingQuote } from './pricing-quote';
import type { PricingQuoteResponse } from './pricing-quote';

function quote(overrides: Partial<PricingQuoteResponse> = {}): PricingQuoteResponse {
  return {
    currency: 'GBP',
    pricingTier: 'single',
    paidPlayerCount: 1,
    totalPrintQuantity: 1,
    unitPricePence: 2499,
    subtotalPence: 2499,
    pricingVersion: 1,
    coachCardIncluded: false,
    lineItems: [{ kind: 'player_card', quantity: 1, unitPricePence: 2499, subtotalPence: 2499 }],
    deliveryPence: null,
    taxPence: null,
    totalPence: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PricingQuoteController', () => {
  it('stays idle and makes no request for zero paid players', () => {
    const fetchQuote = vi.fn();
    const controller = new PricingQuoteController({ fetchQuote });
    controller.setCounts(0, 0);
    vi.advanceTimersByTime(1000);
    expect(controller.getState()).toEqual({ status: 'idle' });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it('stays idle if totalPrintQuantity is zero even when paidPlayerCount is positive', () => {
    const fetchQuote = vi.fn();
    const controller = new PricingQuoteController({ fetchQuote });
    controller.setCounts(1, 0);
    vi.advanceTimersByTime(1000);
    expect(controller.getState()).toEqual({ status: 'idle' });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it('transitions to loading immediately on valid counts, before the debounce fires', () => {
    const fetchQuote = vi.fn(() => new Promise<PricingQuoteResponse>(() => {}));
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(1, 1);
    expect(controller.getState()).toEqual({ status: 'loading' });
    expect(fetchQuote).not.toHaveBeenCalled(); // debounce hasn't fired yet
  });

  it('requests a quote with the given counts after the debounce elapses', async () => {
    const fetchQuote = vi.fn<typeof fetchPricingQuote>(async () => quote());
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(10, 12);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(fetchQuote.mock.calls[0][0]).toBe(10);
    expect(fetchQuote.mock.calls[0][1]).toBe(12);
  });

  it('reaches ready with the resolved quote', async () => {
    const fetchQuote = vi.fn(async () => quote({ subtotalPence: 4398, pricingTier: 'multi' }));
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(2, 2);
    await vi.advanceTimersByTimeAsync(300);
    const state = controller.getState();
    expect(state.status).toBe('ready');
    expect((state as { status: 'ready'; quote: PricingQuoteResponse }).quote.subtotalPence).toBe(4398);
  });

  it('debounces rapid count changes into a single request for the latest counts', async () => {
    const fetchQuote = vi.fn(async () => quote());
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(1, 1);
    vi.advanceTimersByTime(100);
    controller.setCounts(2, 2);
    vi.advanceTimersByTime(100);
    controller.setCounts(3, 3);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(fetchQuote.mock.calls[0]).toEqual([3, 3, expect.anything()]);
  });

  it('never lets a superseded, later-resolving response overwrite a newer state (race protection)', async () => {
    let resolveFirst!: (q: PricingQuoteResponse) => void;
    const firstPromise = new Promise<PricingQuoteResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchQuote = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(async () => quote({ paidPlayerCount: 5, totalPrintQuantity: 5, subtotalPence: 10995, pricingTier: 'multi' }));

    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });

    // First request starts and is in flight (slow, unresolved).
    controller.setCounts(1, 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchQuote).toHaveBeenCalledTimes(1);

    // Counts change before the first request resolves — a second request
    // starts and resolves quickly.
    controller.setCounts(5, 5);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchQuote).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({ status: 'ready', quote: expect.objectContaining({ paidPlayerCount: 5 }) });

    // The stale first request finally resolves — it must NOT overwrite the
    // already-newer ready state.
    resolveFirst(quote({ paidPlayerCount: 1, totalPrintQuantity: 1 }));
    await Promise.resolve();
    await Promise.resolve();
    const finalState = controller.getState() as { status: 'ready'; quote: PricingQuoteResponse };
    expect(finalState.status).toBe('ready');
    expect(finalState.quote.paidPlayerCount).toBe(5);
  });

  it('surfaces a generic recoverable error message on failure, never the raw error', async () => {
    const fetchQuote = vi.fn(async () => {
      throw new Error('ECONNRESET: something internal blew up at pricing-engine.ts:42');
    });
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(10, 10);
    await vi.advanceTimersByTimeAsync(300);
    const state = controller.getState();
    expect(state.status).toBe('error');
    const message = (state as { status: 'error'; message: string }).message;
    expect(message).toBe("We couldn't calculate your card subtotal. Please try again.");
    expect(message).not.toContain('ECONNRESET');
    expect(message).not.toContain('pricing-engine.ts');
  });

  it('retry() re-requests a quote for the last counts and can recover from an error', async () => {
    const fetchQuote = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('network down');
      })
      .mockImplementationOnce(async () => quote({ subtotalPence: 2499 }));

    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(1, 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(controller.getState().status).toBe('error');

    controller.retry();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchQuote).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe('ready');
  });

  it('retry() before any counts have ever been set is a no-op', () => {
    const fetchQuote = vi.fn();
    const controller = new PricingQuoteController({ fetchQuote });
    controller.retry();
    expect(fetchQuote).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('notifies subscribers on every state transition', async () => {
    const fetchQuote = vi.fn(async () => quote());
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    const seen: OrderPricingQuoteState[] = [];
    const unsubscribe = controller.subscribe((state) => seen.push(state));

    controller.setCounts(1, 1);
    await vi.advanceTimersByTimeAsync(300);

    expect(seen.map((s) => s.status)).toEqual(['loading', 'ready']);
    unsubscribe();
  });

  it('dispose() cancels a pending debounce/request and stops notifying', async () => {
    const fetchQuote = vi.fn(async () => quote());
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setCounts(1, 1);
    controller.dispose();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1); // only the synchronous 'loading' transition before dispose
  });

  it('returning to zero paid players after a ready quote clears it back to idle immediately', async () => {
    const fetchQuote = vi.fn(async () => quote({ pricingTier: 'squad', coachCardIncluded: true }));
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(10, 10);
    await vi.advanceTimersByTimeAsync(300);
    expect(controller.getState().status).toBe('ready');

    controller.setCounts(0, 0);
    expect(controller.getState()).toEqual({ status: 'idle' });
  });
});

describe('isQuoteFreshForCounts — enquiry submit-readiness rule', () => {
  it('is false while idle', () => {
    expect(isQuoteFreshForCounts({ status: 'idle' }, 1, 1)).toBe(false);
  });

  it('is false while loading (approved players exist but the quote has not resolved yet)', () => {
    expect(isQuoteFreshForCounts({ status: 'loading' }, 10, 10)).toBe(false);
  });

  it('is false when the quote failed', () => {
    expect(isQuoteFreshForCounts({ status: 'error', message: 'nope' }, 10, 10)).toBe(false);
  });

  it('is false when a ready quote is stale — its counts no longer match the current order', () => {
    const staleQuote: OrderPricingQuoteState = { status: 'ready', quote: quote({ paidPlayerCount: 9, totalPrintQuantity: 9 }) };
    expect(isQuoteFreshForCounts(staleQuote, 10, 10)).toBe(false); // a player was added since this quote resolved
  });

  it('is false when only one of the two counts matches', () => {
    const partiallyStale: OrderPricingQuoteState = { status: 'ready', quote: quote({ paidPlayerCount: 10, totalPrintQuantity: 10 }) };
    expect(isQuoteFreshForCounts(partiallyStale, 10, 12)).toBe(false); // print quantity changed since
  });

  it('is true when a ready quote exactly matches the current counts', () => {
    const freshQuote: OrderPricingQuoteState = { status: 'ready', quote: quote({ paidPlayerCount: 10, totalPrintQuantity: 10 }) };
    expect(isQuoteFreshForCounts(freshQuote, 10, 10)).toBe(true);
  });

  it('a newer ready quote for the current counts permits submission again after a prior stale/error state', () => {
    // Simulates: stale quote -> counts change -> new quote resolves matching the new counts.
    const stale: OrderPricingQuoteState = { status: 'ready', quote: quote({ paidPlayerCount: 9, totalPrintQuantity: 9 }) };
    expect(isQuoteFreshForCounts(stale, 10, 10)).toBe(false);
    const fresh: OrderPricingQuoteState = { status: 'ready', quote: quote({ paidPlayerCount: 10, totalPrintQuantity: 10 }) };
    expect(isQuoteFreshForCounts(fresh, 10, 10)).toBe(true);
  });
});

describe('retry() cannot touch anything outside the controller (builder-state preservation)', () => {
  it('retry() takes no arguments and returns void — it has no mechanism to read or mutate external (builder) state', () => {
    const fetchQuote = vi.fn(async () => quote());
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    expect(controller.retry.length).toBe(0);
    expect(controller.retry()).toBeUndefined();
  });

  it('retry() after an error re-fetches only the last known counts, never a different value', async () => {
    const fetchQuote = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('down');
      })
      .mockImplementationOnce(async () => quote({ paidPlayerCount: 7, totalPrintQuantity: 8 }));
    const controller = new PricingQuoteController({ fetchQuote, debounceMs: 300 });
    controller.setCounts(7, 8);
    await vi.advanceTimersByTimeAsync(300);
    expect(controller.getState().status).toBe('error');

    controller.retry();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchQuote).toHaveBeenNthCalledWith(2, 7, 8, expect.anything());
  });
});
