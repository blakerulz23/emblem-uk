import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * Founder's confirmed product decision: payment does not enable or gate
 * card sharing. These are two independent actions, in either order.
 * PR #44 (guardian-controlled card-front sharing) is not part of this
 * branch, so this proves the boundary from Gate 3's own side: nothing
 * Gate 3 adds ever references, reads, or writes anything PR #44 owns —
 * by name, anywhere in this work package's migration, routes, or client
 * wiring. See docs/gate3-pr44-integration.md for the full contract this
 * enforces, and the correction of an earlier (incorrect, never
 * implemented) proposal to couple the two.
 */
const MIGRATION = readFileSync('supabase/migrations/0080_gate3_payment_state.sql', 'utf8');
const CHECKOUT_ROUTE = readFileSync('src/app/api/orders/[id]/checkout/route.ts', 'utf8');
const PAYMENT_STATUS_ROUTE = readFileSync('src/app/api/orders/[id]/payment-status/route.ts', 'utf8');
const APPROVE_ROUTE = readFileSync('src/app/api/orders/[id]/approve/route.ts', 'utf8');
const ORDERS_PAID_WEBHOOK = readFileSync('src/app/api/webhooks/shopify/orders-paid/route.ts', 'utf8');
const ORDERS_CANCELLED_WEBHOOK = readFileSync('src/app/api/webhooks/shopify/orders-cancelled/route.ts', 'utf8');
const REFUNDS_WEBHOOK = readFileSync('src/app/api/webhooks/shopify/refunds-create/route.ts', 'utf8');
const PRODUCTION_BUILDER = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

const SHARING_OBJECT_NAMES = [
  'card_share_consent_events',
  'get_card_share_eligibility',
  'record_card_share_consent',
  'get_card_share_asset_key',
  'ShareCardSheet',
  'shareCapture',
  'CARD_SHARE_',
];

describe('Gate 3 — payment code never references anything PR #44 (sharing) owns', () => {
  const files: Array<[string, string]> = [
    ['migration 0080', MIGRATION],
    ['checkout route', CHECKOUT_ROUTE],
    ['payment-status route', PAYMENT_STATUS_ROUTE],
    ['approve route', APPROVE_ROUTE],
    ['orders-paid webhook', ORDERS_PAID_WEBHOOK],
    ['orders-cancelled webhook', ORDERS_CANCELLED_WEBHOOK],
    ['refunds-create webhook', REFUNDS_WEBHOOK],
  ];

  for (const [label, source] of files) {
    it(`${label} contains no reference to any PR #44 sharing object`, () => {
      for (const name of SHARING_OBJECT_NAMES) {
        expect(source).not.toContain(name);
      }
    });
  }
});

describe('Gate 3 — migration 0080 writes only to its own tables', () => {
  it('touches only orders (existing columns/status values), payment_state_events, and shopify_webhook_events — never a sharing table', () => {
    const createTableMatches = Array.from(MIGRATION.matchAll(/create table public\.(\w+)/g)).map((m) => m[1]);
    expect(createTableMatches.sort()).toEqual(['payment_state_events', 'shopify_webhook_events']);
  });
});

describe('Gate 3 — payment transitions never touch sharing consent, and sharing is never a precondition for anything Gate 3 checks', () => {
  it('begin_gate3_checkout\'s eligibility checks are authority_status and payment_status only — no sharing/consent condition', () => {
    const idx = MIGRATION.indexOf('create or replace function public.begin_gate3_checkout');
    const fnBody = MIGRATION.slice(idx, MIGRATION.indexOf('$$;', idx));
    expect(fnBody).toContain('authority_status');
    expect(fnBody).toContain('payment_status');
    expect(fnBody).not.toMatch(/consent|sharing|share/i);
  });

  it('apply_gate3_payment_event only ever writes payment_status, paid_at, shopify_order_id, paid_amount_pence, paid_currency — never anything sharing-related', () => {
    const idx = MIGRATION.indexOf('create or replace function public.apply_gate3_payment_event');
    const fnBody = MIGRATION.slice(idx, MIGRATION.indexOf('$$;', idx));
    expect(fnBody).toMatch(/update public\.orders set/);
    expect(fnBody).not.toMatch(/consent|sharing|share/i);
  });
});

describe('Gate 3 — the staff production gate is the only place payment blocks anything, and it never mentions sharing', () => {
  it('the payment-required check added to the approve route is scoped to production/fulfilment, not sharing', () => {
    const idx = APPROVE_ROUTE.indexOf('Gate 3 — payment wall');
    expect(idx).toBeGreaterThan(-1);
    const commentBlock = APPROVE_ROUTE.slice(idx, idx + 900);
    expect(commentBlock).not.toMatch(/consent|sharing|share card|ShareCardSheet/i);
  });
});

describe('Gate 3 — the client-side checkout/payment wiring never reads or writes anything sharing-related', () => {
  it('startGate3Checkout and the payment-status poll never reference a sharing/consent concept', () => {
    const startIdx = PRODUCTION_BUILDER.indexOf('const startGate3Checkout');
    const startBody = PRODUCTION_BUILDER.slice(startIdx, PRODUCTION_BUILDER.indexOf('\n  };', startIdx));
    expect(startBody).not.toMatch(/consent|sharing|ShareCardSheet/i);

    const pollIdx = PRODUCTION_BUILDER.indexOf('checkoutStage !== \'awaiting-payment\'');
    const pollBody = PRODUCTION_BUILDER.slice(pollIdx, PRODUCTION_BUILDER.indexOf('[checkoutStage, submittedOrderId]);', pollIdx));
    expect(pollBody).not.toMatch(/consent|sharing|ShareCardSheet/i);
  });

  it('gate3Enabled (which controls whether the checkout UI shows at all) depends only on the Shopify variant config and order type — never on any sharing/eligibility state', () => {
    const idx = PRODUCTION_BUILDER.indexOf('const gate3Enabled');
    const line = PRODUCTION_BUILDER.slice(idx, PRODUCTION_BUILDER.indexOf(';', idx));
    expect(line).not.toMatch(/consent|sharing|eligib/i);
  });
});
