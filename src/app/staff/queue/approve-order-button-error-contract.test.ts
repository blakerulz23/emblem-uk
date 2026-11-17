import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { GIFT_APPROVAL_MISSING_MESSAGE } from '@/lib/gift-order-guardian';

const source = readFileSync('src/app/staff/queue/ApproveOrderButton.tsx', 'utf8');

// Real, confirmed defect: this button's fetch response was never checked,
// so when the server rejects an approval (most commonly a Squad Invite
// order failing the payment-required gate in approve/route.ts once
// squad_invite_payment_mode_enabled() is on), staff saw the button do
// nothing — no error, no explanation, indistinguishable from "broken".
// The server logic (approve/route.ts) is completely unchanged by this fix.
describe('ApproveOrderButton — a rejected approval is now visible, not silent', () => {
  it('checks response.ok before treating the approval as successful', () => {
    expect(source).toContain('if (!response.ok) {');
  });

  it('surfaces the server\'s own error text, not a hardcoded assumption of success', () => {
    expect(source).toContain("body?.error || 'This order could not be approved.'");
  });

  it('the error is announced accessibly', () => {
    expect(source).toContain('role="alert"');
  });

  it('still only refreshes (revealing the new state) on a genuine success', () => {
    const approveFn = source.match(/const approve = async \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? '';
    const okIndex = approveFn.indexOf('!response.ok');
    const refreshIndex = approveFn.indexOf('router.refresh()');
    expect(okIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(okIndex);
  });

  it('the busy state is exposed to assistive tech and still guards against a second click', () => {
    expect(source).toContain('aria-busy={busy}');
    expect(source).toContain('disabled={busy}');
  });

  it('never touches the approval endpoint itself — same path, same method', () => {
    expect(source).toContain("fetch(`/api/orders/${orderId}/approve`, { method: 'POST' })");
  });

  // F-2 (C6 review): the approve route now refuses a gift order with no
  // genuine guardian approval with a 409 whose `error` is a staff-facing
  // explanation. This button already shows any non-OK response's `error`,
  // so staff see that message at approve time instead of nothing.
  it('shows the gift-order 409 refusal text the approve route returns', () => {
    const route = readFileSync('src/app/api/orders/[id]/approve/route.ts', 'utf8');
    expect(route).toContain('{ error: GIFT_APPROVAL_MISSING_MESSAGE }, { status: 409 }');
    expect(source).toContain('setError(body?.error');
    expect(GIFT_APPROVAL_MISSING_MESSAGE).toMatch(/guardian approval/);
  });

  it('the error text has room to be read (the gift refusal is longer than the old messages)', () => {
    expect(source).toContain('maxWidth: 280');
  });
});
