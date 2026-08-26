import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

/**
 * ProductionBuilder.tsx cannot be rendered in this repo's test environment
 * (no jsdom — see fetch-with-timeout.test.ts for why) — this proves the
 * Gate 3 client wiring by reading the source, the same pattern every other
 * *-contract.test.ts in this codebase already uses for this component.
 */
describe('Gate 3 — the client never sends its own price/quantity/variant, and never trusts a browser return as payment proof', () => {
  it('order-enquiry submission no longer auto-redirects to Shopify — startGate3Checkout is a separate, explicit action', () => {
    expect(source).not.toContain('buildUkCardCartUrl');
    expect(source).not.toMatch(/window\.location\.href\s*=\s*cartUrl/);
  });

  it('startGate3Checkout sends only the order id in the URL — no request body carrying price, quantity, or variant', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    expect(fnBody).toContain('fetch(`/api/orders/${submittedOrderId}/checkout`');
    expect(fnBody).not.toContain('body:');
  });

  it('opens the checkout URL in a new tab rather than navigating the current one away', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    expect(fnBody).toContain("window.open(result.checkoutUrl, '_blank', 'noopener')");
  });

  it('a checkout-creation failure surfaces a visible, retryable error rather than a silent no-op', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    expect(fnBody).toContain("setCheckoutStage('error')");
    expect(fnBody).toContain('setCheckoutError(');
  });

  it('only advances to "confirmed" from the server-verified payment-status poll — never from the checkout call itself, a focus event, or any other browser signal', () => {
    const startFnIdx = source.indexOf('const startGate3Checkout');
    const startFnBody = source.slice(startFnIdx, source.indexOf('\n  };', startFnIdx));
    expect(startFnBody).not.toContain("setCheckoutStage('confirmed')");

    const pollEffectIdx = source.indexOf('checkoutStage !== \'awaiting-payment\'');
    expect(pollEffectIdx).toBeGreaterThan(-1);
    const pollEffectBody = source.slice(pollEffectIdx, source.indexOf('[checkoutStage, submittedOrderId]);', pollEffectIdx));
    expect(pollEffectBody).toContain('/payment-status');
    expect(pollEffectBody).toContain("result.paymentStatus === 'paid'");
    expect(pollEffectBody).toContain("setCheckoutStage('confirmed')");
  });

  it('the poll is guarded against a stale response landing after the order/stage has moved on', () => {
    const pollEffectIdx = source.indexOf('checkoutStage !== \'awaiting-payment\'');
    const pollEffectBody = source.slice(pollEffectIdx, source.indexOf('[checkoutStage, submittedOrderId]);', pollEffectIdx));
    expect(pollEffectBody).toContain('checkoutRequestRef.current !== requestId');
  });

  it('the poll interval is always cleared on cleanup — no leaked timer once the effect re-runs or unmounts', () => {
    const pollEffectIdx = source.indexOf('checkoutStage !== \'awaiting-payment\'');
    const pollEffectBody = source.slice(pollEffectIdx, source.indexOf('[checkoutStage, submittedOrderId]);', pollEffectIdx));
    expect(pollEffectBody).toContain('clearInterval(interval)');
  });

  it('only the single-child pricing tier shows the Gate 3 checkout UI — team orders keep the pre-Gate-3 manual-flow copy', () => {
    const idx = source.indexOf('const gate3Enabled');
    const line = source.slice(idx, source.indexOf(';', idx));
    expect(line).toContain("order.type === 'single'");
  });
});
