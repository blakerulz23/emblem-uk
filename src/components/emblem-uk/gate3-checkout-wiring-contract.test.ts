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

  it('opens the checkout tab in a new tab rather than navigating the current one away', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    expect(fnBody).toMatch(/window\.open\(/);
    expect(fnBody).toContain('checkoutTab.location.href = result.checkoutUrl');
  });

  /**
   * Regression coverage for a live-confirmed defect: opening the tab only
   * after `await fetch(...)` resolved meant the call was no longer inside
   * the click's own user-activation window by the time it ran — Safari
   * silently blocks a window.open() at that point, and the original code
   * never checked whether it had actually succeeded, so the UI still
   * confidently showed "waiting for payment" with no tab having opened at
   * all. Opening blank synchronously, before the fetch, reserves a
   * legitimate popup slot inside the click itself.
   */
  it('opens the tab BLANK and synchronously, before the fetch — not only after the checkout URL is known', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    const openIdx = fnBody.indexOf("window.open('', '_blank')");
    const fetchIdx = fnBody.indexOf('await fetch(');
    expect(openIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(openIdx);
  });

  it('severs the blank tab\'s own opener reference (the same anti-tabnabbing protection `noopener` gives) without losing this window\'s own ability to navigate it afterward', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    expect(fnBody).toContain('checkoutTab.opener = null');
  });

  it('stores the resolved checkout URL regardless of whether the tab opened, so the UI can always offer a manual link too', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    expect(fnBody).toContain('setCheckoutUrl(result.checkoutUrl)');
  });

  it('closes the reserved blank tab on any failure path — never leaves an orphaned blank tab open', () => {
    const idx = source.indexOf('const startGate3Checkout');
    const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
    const matches = fnBody.match(/checkoutTab\?\.close\(\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // the !response.ok branch and the catch block
  });

  /**
   * Regression coverage for a second live-confirmed defect: "I've
   * completed payment — check again" previously called startGate3Checkout
   * itself — starting an entirely NEW checkout (and trying to open ANOTHER
   * tab) rather than simply checking whether the existing one had already
   * been paid. The button's own label never matched what the code did.
   */
  describe('checkGate3PaymentStatus — what "I\'ve completed payment — check again" actually calls', () => {
    it('exists as its own function, separate from startGate3Checkout', () => {
      const idx = source.indexOf('const checkGate3PaymentStatus');
      expect(idx).toBeGreaterThan(-1);
      const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
      expect(fnBody).not.toContain('/checkout`');
      expect(fnBody).not.toContain('window.open');
    });

    it('only ever reads payment-status — never creates a new checkout', () => {
      const idx = source.indexOf('const checkGate3PaymentStatus');
      const fnBody = source.slice(idx, source.indexOf('\n  };', idx));
      expect(fnBody).toContain('/payment-status');
      expect(fnBody).toContain("result.paymentStatus === 'paid'");
      expect(fnBody).toContain("setCheckoutStage('confirmed')");
    });

    it('the "I\'ve completed payment — check again" button calls checkGate3PaymentStatus, not startGate3Checkout', () => {
      const idx = source.indexOf("I&apos;ve completed payment");
      expect(idx).toBeGreaterThan(-1);
      const buttonBlockStart = source.lastIndexOf('<button', idx);
      const buttonBlock = source.slice(buttonBlockStart, idx);
      expect(buttonBlock).toContain('onClick={checkGate3PaymentStatus}');
      expect(buttonBlock).not.toContain('onClick={startGate3Checkout}');
    });

    it('offers a manual "Open secure checkout" link as a fallback while awaiting payment — a real link, immune to popup-blocker timing, not a scripted window.open', () => {
      const idx = source.indexOf("I&apos;ve completed payment");
      const sectionStart = source.lastIndexOf("checkoutStage === 'awaiting-payment' ?", idx);
      const section = source.slice(sectionStart, idx);
      expect(section).toContain('Open secure checkout');
      expect(section).toContain('href={checkoutUrl}');
      expect(section).toContain('target="_blank"');
      expect(section).toContain('rel="noopener noreferrer"');
    });
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
