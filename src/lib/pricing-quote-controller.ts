import { fetchPricingQuote, type PricingQuoteResponse } from './pricing-quote';

export type OrderPricingQuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: PricingQuoteResponse }
  | { status: 'error'; message: string };

/**
 * Submit-readiness rule, shared by anything that needs to gate a real
 * submission (currently ProductionBuilder.tsx's canSendEnquiry) on having
 * an authoritative, up-to-date price. A quote is fresh only when the
 * controller reached 'ready' AND that quote's own counts still match the
 * caller's current counts — 'idle'/'loading'/'error' are already "not
 * ready" simply by not being 'ready', and a 'ready' quote left over from
 * before the last player/print-quantity edit is stale, not authoritative,
 * even though its status is still 'ready'.
 */
export function isQuoteFreshForCounts(
  state: OrderPricingQuoteState,
  paidPlayerCount: number,
  totalPrintQuantity: number
): boolean {
  return (
    state.status === 'ready' &&
    state.quote.paidPlayerCount === paidPlayerCount &&
    state.quote.totalPrintQuantity === totalPrintQuantity
  );
}

const DEFAULT_DEBOUNCE_MS = 300;

const GENERIC_ERROR_MESSAGE = "We couldn't calculate your card subtotal. Please try again.";

export interface PricingQuoteControllerOptions {
  debounceMs?: number;
  /** Injected for tests — defaults to the real fetchPricingQuote. */
  fetchQuote?: typeof fetchPricingQuote;
}

/**
 * Framework-agnostic quote-request state machine — no React, no DOM. Owns
 * debouncing, request-generation-based race protection, and retry, so
 * src/components/emblem-uk/useOrderPricingQuote.ts (the React hook) can
 * stay thin wiring and this logic can be unit-tested directly in Node
 * (this repo's vitest environment is 'node', not jsdom — see
 * pricing-quote-controller.test.ts).
 *
 * Contract:
 *  - paidPlayerCount <= 0 (or totalPrintQuantity <= 0) never requests a
 *    quote and resets to 'idle' — no quote, no error, per the "zero valid
 *    paid players" requirement.
 *  - Every call to setCounts() immediately transitions to 'loading' before
 *    the (debounced) request even starts, so a stale 'ready' quote for the
 *    previous counts is never left on screen.
 *  - Each request is tagged with a generation number; only the response
 *    matching the current generation is ever applied — an in-flight
 *    request superseded by a newer setCounts() call can never overwrite a
 *    newer state, whether it resolves, rejects, or is aborted.
 */
export class PricingQuoteController {
  private state: OrderPricingQuoteState = { status: 'idle' };
  private readonly listeners = new Set<(state: OrderPricingQuoteState) => void>();
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private lastCounts: { paidPlayerCount: number; totalPrintQuantity: number } | null = null;
  private readonly debounceMs: number;
  private readonly fetchQuote: typeof fetchPricingQuote;

  constructor(options: PricingQuoteControllerOptions = {}) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.fetchQuote = options.fetchQuote ?? fetchPricingQuote;
  }

  getState(): OrderPricingQuoteState {
    return this.state;
  }

  subscribe(listener: (state: OrderPricingQuoteState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setCounts(paidPlayerCount: number, totalPrintQuantity: number): void {
    this.lastCounts = { paidPlayerCount, totalPrintQuantity };
    this.beginRequest(paidPlayerCount, totalPrintQuantity);
  }

  retry(): void {
    if (!this.lastCounts) return;
    this.beginRequest(this.lastCounts.paidPlayerCount, this.lastCounts.totalPrintQuantity);
  }

  dispose(): void {
    this.cancelPending();
    this.listeners.clear();
  }

  private cancelPending(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private setState(next: OrderPricingQuoteState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  private beginRequest(paidPlayerCount: number, totalPrintQuantity: number): void {
    this.cancelPending();
    this.generation += 1;
    const requestGeneration = this.generation;

    if (paidPlayerCount <= 0 || totalPrintQuantity <= 0) {
      this.setState({ status: 'idle' });
      return;
    }

    // Mark stale immediately — the previous 'ready' quote (if any) no
    // longer describes the current counts and must never be shown as if
    // it still did, even before the debounce timer or network round trip.
    this.setState({ status: 'loading' });

    this.timer = setTimeout(() => {
      const abortController = new AbortController();
      this.abortController = abortController;

      this.fetchQuote(paidPlayerCount, totalPrintQuantity, abortController.signal)
        .then((quote) => {
          if (requestGeneration !== this.generation) return; // superseded
          this.setState({ status: 'ready', quote });
        })
        .catch(() => {
          if (abortController.signal.aborted) return; // superseded/cancelled, not a real failure
          if (requestGeneration !== this.generation) return; // superseded
          this.setState({ status: 'error', message: GENERIC_ERROR_MESSAGE });
        });
    }, this.debounceMs);
  }
}
