import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/emblem-uk/PaymentRecovery.tsx', 'utf8');
const page = readFileSync('src/app/builder/page.tsx', 'utf8');
const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

describe('PaymentRecovery — reuses existing verification and checkout, never creates an order', () => {
  it('verifies with the existing builder email-code endpoints', () => {
    expect(source).toContain("postJson('/api/builder-authority/request-code'");
    expect(source).toContain("postJson('/api/builder-authority/verify-code'");
  });

  it('pays only through the existing checkout and payment-status routes; never calls order creation or upload', () => {
    expect(source).toContain('`/api/orders/${order.orderId}/checkout`');
    expect(source).toContain('`/api/orders/${orderId}/payment-status`');
    expect(source).not.toMatch(/order-enquiry|order-assets|render-print|builder-submissions|squad-invite-participations/);
  });

  it('sends no price, quantity or variant to checkout (only the CSRF header)', () => {
    const checkoutCall = source.slice(source.indexOf('`/api/orders/${order.orderId}/checkout`'), source.indexOf('`/api/orders/${order.orderId}/checkout`') + 160);
    expect(checkoutCall).not.toMatch(/body:/);
  });

  it('only opens one checkout at a time and re-checks a previously started checkout before opening a new one', () => {
    expect(source).toMatch(/if \(openingRef\.current\) return;/);
    expect(source).toMatch(/if \(order\.checkoutStarted\) \{\s*const status = await readPaymentStatus\(order\.orderId\);\s*if \(status === 'paid' \|\| status === 'fulfilled'\) \{ tab\?\.close\(\); setOrderState\(order\.orderId, 'paid'\); return; \}/);
    expect(source).toMatch(/don&apos;t pay again/);
  });

  it('marks paid only from the server-recorded payment status, never from the browser returning', () => {
    expect(source).not.toMatch(/visibilitychange|focus['"]|location\.search/);
    expect(source).toMatch(/!cancelled && \(status === 'paid' \|\| status === 'fulfilled'\)\) setOrderState\(id, 'paid'\)/);
  });

  it('a stale or missing session is sent back to the email-code step', () => {
    expect(source).toMatch(/if \(response\.status === 401\) \{\s*setPhase\('email'\);/);
  });

  it('a failed checkout start closes the blank tab and lets the parent try again', () => {
    expect(source).toMatch(/setOrderState\(order\.orderId, response\.status === 409 \? 'closed' : 'error'\)/);
    expect(source).toMatch(/\(state === 'idle' \|\| state === 'error'\) && \(/);
  });

  it('is served at /builder?pay=1 (builder CSRF cookie applies) and linked from the builder', () => {
    expect(page).toMatch(/if \(searchParams\.pay === '1'\) \{\s*return <PaymentRecovery \/>;/);
    expect(builder).toContain('href="/builder?pay=1"');
  });
});
