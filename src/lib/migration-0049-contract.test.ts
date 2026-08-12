import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENCY,
  MULTI_MIN_PLAYERS,
  MULTI_UNIT_PRICE_PENCE,
  PRICING_VERSION,
  SINGLE_UNIT_PRICE_PENCE,
  SQUAD_MIN_PLAYERS,
  SQUAD_UNIT_PRICE_PENCE,
} from './pricing-engine';

const migration0048 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0048_authoritative_order_persistence.sql'),
  'utf8'
);
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0049_authoritative_pricing_enforcement.sql'),
  'utf8'
);

const captureNumber = (pattern: RegExp): number => {
  const match = sql.match(pattern);
  if (!match) throw new Error(`0049 contract pattern missing: ${pattern}`);
  return Number(match[1]);
};

const rules = {
  version: captureNumber(/p_pricing_version is distinct from (\d+)/),
  singlePrice: captureNumber(/v_expected_tier := 'single';\s+v_expected_unit_price_pence := (\d+)/),
  multiMin: captureNumber(/p_paid_player_count between (\d+) and \d+/),
  multiMax: captureNumber(/p_paid_player_count between \d+ and (\d+)/),
  multiPrice: captureNumber(/v_expected_tier := 'multi';\s+v_expected_unit_price_pence := (\d+)/),
  squadPrice: captureNumber(/v_expected_tier := 'squad';\s+v_expected_unit_price_pence := (\d+)/),
};

type PricingInput = {
  currency: string;
  tier: 'single' | 'multi' | 'squad';
  paidPlayers: number;
  prints: number;
  unitPrice: number;
  subtotal: number;
  version: number;
};

function accepts(input: PricingInput): boolean {
  const expectedTier =
    input.paidPlayers === 1
      ? 'single'
      : input.paidPlayers >= rules.multiMin && input.paidPlayers <= rules.multiMax
        ? 'multi'
        : 'squad';
  const expectedUnit =
    expectedTier === 'single'
      ? rules.singlePrice
      : expectedTier === 'multi'
        ? rules.multiPrice
        : rules.squadPrice;
  const expectedSubtotal = BigInt(input.prints) * BigInt(expectedUnit);

  return (
    input.version === rules.version &&
    input.currency === CURRENCY &&
    input.paidPlayers >= 1 &&
    input.prints >= 1 &&
    input.tier === expectedTier &&
    input.unitPrice === expectedUnit &&
    expectedSubtotal <= BigInt(2_147_483_647) &&
    BigInt(input.subtotal) === expectedSubtotal
  );
}

const valid = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  currency: 'GBP',
  tier: 'single',
  paidPlayers: 1,
  prints: 1,
  unitPrice: 2499,
  subtotal: 2499,
  version: 1,
  ...overrides,
});

describe('migration 0049 authoritative pricing contract', () => {
  it('pins the SQL constants to pricing-engine version 1', () => {
    expect(rules).toEqual({
      version: PRICING_VERSION,
      singlePrice: SINGLE_UNIT_PRICE_PENCE,
      multiMin: MULTI_MIN_PLAYERS,
      multiMax: SQUAD_MIN_PLAYERS - 1,
      multiPrice: MULTI_UNIT_PRICE_PENCE,
      squadPrice: SQUAD_UNIT_PRICE_PENCE,
    });
    expect(sql).toContain("p_currency is distinct from 'GBP'");
    expect(sql).toContain('future price or version change requires coordinated application AND');
  });

  it('accepts version 1 and rejects versions 0 and 999', () => {
    expect(accepts(valid({ version: 1 }))).toBe(true);
    expect(accepts(valid({ version: 0 }))).toBe(false);
    expect(accepts(valid({ version: 999 }))).toBe(false);
  });

  it('accepts only the canonical single price', () => {
    expect(accepts(valid())).toBe(true);
    expect(accepts(valid({ unitPrice: 1, subtotal: 1 }))).toBe(false);
  });

  it('accepts only the canonical multi price', () => {
    const multi = valid({ tier: 'multi', paidPlayers: 2, prints: 2, unitPrice: 2199, subtotal: 4398 });
    expect(accepts(multi)).toBe(true);
    expect(accepts({ ...multi, unitPrice: 1, subtotal: 2 })).toBe(false);
  });

  it('accepts only the canonical squad price', () => {
    const squad = valid({ tier: 'squad', paidPlayers: 10, prints: 10, unitPrice: 1899, subtotal: 18990 });
    expect(accepts(squad)).toBe(true);
    expect(accepts({ ...squad, unitPrice: 1, subtotal: 10 })).toBe(false);
  });

  it('accepts the canonical subtotal and rejects arithmetic based on a wrong unit price', () => {
    expect(accepts(valid({ prints: 3, subtotal: 7497 }))).toBe(true);
    expect(accepts(valid({ prints: 3, unitPrice: 1000, subtotal: 3000 }))).toBe(false);
    expect(accepts(valid({ prints: 1_000_000, subtotal: 2_499_000_000 }))).toBe(false);
    expect(sql).toContain('p_total_print_quantity::bigint * v_expected_unit_price_pence::bigint');
    expect(sql).toContain('v_expected_subtotal_pence > 2147483647');
  });

  it('rejects tier/count mismatch and non-GBP currency', () => {
    expect(accepts(valid({ tier: 'multi' }))).toBe(false);
    expect(accepts(valid({ currency: 'USD' }))).toBe(false);
  });

  it('preserves the public signature and response contract', () => {
    const signature = (source: string) =>
      source.match(/create or replace function public\.create_authoritative_order\(([\s\S]*?)\)\s*returns jsonb/)?.[1]
        .replace(/\s+/g, ' ')
        .trim();
    expect(signature(sql)).toBe(signature(migration0048));
    expect(sql).toContain("jsonb_build_object('orderId', v_order_id, 'orderRef', p_order_ref, 'created', true)");
    expect(sql).toContain("jsonb_build_object('orderId', v_existing_id, 'orderRef', v_existing_ref, 'created', false)");
  });

  it('preserves security, qualification, idempotency, asset, print and coach guarantees', () => {
    for (const fragment of [
      'security definer',
      "set search_path = ''",
      'alter function public.create_authoritative_order(',
      'owner to postgres',
      'from public;',
      'from anon;',
      'from authenticated;',
      'to service_role;',
      'from public.orders',
      'insert into public.orders',
      'insert into public.players',
      'insert into public.cards',
      'insert into public.card_definitions',
      'insert into public.moments',
      'insert into public.order_line_items',
      'insert into public.order_coach_cards',
      "raise exception 'submission_key reused with different content'",
      "raise exception 'duplicate print file for the same player'",
      "raise exception 'missing print file for a submitted player'",
      "jsonb_build_object('storageKey', v_player->>'badgeStorageKey', 'source', 'upload')::text",
      "raise exception 'badge reference for player % is not a recognised static asset'",
      "raise exception 'a squad order requires complete coach card details'",
      "values (v_order_id, 'coach_card', 'Free coach card', 1, 0, 0, 'GBP')",
    ]) {
      expect(sql).toContain(fragment);
    }
    expect(sql).not.toMatch(/\b(insert into|update|from)\s+(orders|players|cards|card_definitions|moments|order_line_items|order_coach_cards)\b/i);
    expect(sql).not.toMatch(/create policy|alter default privileges|grant .* on table/i);
  });

  it('keeps already-recorded migration 0048 byte-identical', () => {
    expect(createHash('sha256').update(migration0048).digest('hex')).toBe(
      '9469c375cb2eb2f7f7882a34052ca5e8543bde05d01aa6e867cdce2ef7e06580'
    );
  });
});
