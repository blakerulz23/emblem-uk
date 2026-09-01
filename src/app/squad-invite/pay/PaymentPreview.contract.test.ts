import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/squad-invite/pay/PaymentPreview.tsx', 'utf8');

describe('PaymentPreview — Squad Invite pre-checkout card preview', () => {
  it('reads the token from the URL fragment, never a query param or the server-rendered path', () => {
    expect(source).toContain('window.location.hash.slice(1)');
    expect(source).toContain("fragment.get('token')");
  });

  it('does NOT strip the token from the address bar (unlike InvitationAccess.tsx) — this page is meant to be revisited within the 72-hour window', () => {
    expect(source).not.toContain('history.replaceState');
  });

  it('posts the token to the resolve endpoint with no-store caching', () => {
    expect(source).toContain("fetch('/api/squad-invite-payment-preview/resolve'");
    expect(source).toContain("method: 'POST'");
    expect(source).toContain("cache: 'no-store'");
  });

  it('renders the card via the shared CardFace component, never a bespoke renderer', () => {
    expect(source).toContain("import { CardFace } from '@/lib/card-definition'");
    expect(source).toMatch(/<CardFace[^]*?data=\{preview\.card\}/);
    expect(source).toMatch(/<CardFace[^]*?photoUrl=\{preview\.card\.photoUrl\}/);
  });

  it('the checkout control is a plain anchor to the server-computed checkoutUrl — no client-side URL construction', () => {
    expect(source).toMatch(/href=\{preview\.checkoutUrl\}/);
    expect(source).not.toMatch(/buildSquadInvitePaymentUrl|shopify\.com\/cart/);
  });

  it('styled to match this page\'s Squad Invite siblings (manage/DeliverySetup/access) — plain Tailwind with the brand orange, not the builder wizard\'s own uk-wizard-* classes, which only render correctly inside the builder\'s phone-frame shell', () => {
    expect(source).not.toMatch(/uk-wizard-panel|uk-wizard-primary|uk-wizard-copy|uk-wizard-kicker|uk-production-snapshot|uk-gate3-checkout|uk-order-club-list|uk-real-card/);
    expect(source).toMatch(/bg-orange-600/);
    expect(source).toMatch(/text-orange-600/);
  });

  it('handles all three non-happy-path states: loading, unavailable, and already-paid', () => {
    expect(source).toContain("phase === 'loading'");
    expect(source).toContain("phase === 'unavailable'");
    expect(source).toContain("preview.status === 'paid'");
    expect(source).toContain('This payment link is no longer available.');
    expect(source).toContain('Payment already received.');
  });

  it('never renders a raw order ref, participation id, or purchaser email — only fields the resolve API already scoped', () => {
    expect(source).not.toMatch(/purchaserEmail|participationId|orderRef/);
  });
});
