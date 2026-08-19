import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  SINGLE_UNIT_PRICE_PENCE, MULTI_UNIT_PRICE_PENCE, SQUAD_UNIT_PRICE_PENCE,
  MULTI_MIN_PLAYERS, SQUAD_MIN_PLAYERS,
} from './pricing-engine';

const sql = readFileSync('supabase/migrations/0050_squad_invite_foundation.sql', 'utf8');
const sql51 = readFileSync('supabase/migrations/0051_squad_invite_reusable_links.sql', 'utf8');
const sql52 = readFileSync('supabase/migrations/0052_squad_invite_review_foundation.sql', 'utf8');

describe('migration 0050 Squad Invite contract', () => {
  it.each([
    'squad_invites','squad_invite_participations','squad_invite_permissions',
    'squad_invite_coach_cards','squad_invite_audit_events',
    'campaign_fulfilment_batches','campaign_fulfilment_items',
  ])('creates %s with RLS', (table) => {
    expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it('pins commitment pricing without changing the general pricing engine', () => {
    expect(sql).toContain('squad_invite_commitment_pricing_v1');
    expect(sql).toContain("final_unit_price_pence in (2499,2199,1899)");
    expect(sql).toContain("final_commitment_count = 1 and final_tier = 'single'");
  });

  // Two independently hand-maintained copies of the same commercial rules
  // (finalise_squad_invite_pricing here, pricing-engine.ts's exported
  // constants) — neither generates the other. This is the same shape as
  // the 0058 payment-mode incident: a silent drift between two "sources of
  // truth" that nothing catches until it's live. Deriving the expected SQL
  // substrings FROM the imported constants (not from hardcoded literals)
  // means this fails in both directions — change either file's numbers
  // without updating the other, and this test is what breaks.
  it('keeps finalise_squad_invite_pricing\'s thresholds and unit prices in sync with pricing-engine.ts', () => {
    expect(sql).toContain(
      `v_count >= ${SQUAD_MIN_PLAYERS} then v_tier := 'squad'; v_unit := ${SQUAD_UNIT_PRICE_PENCE};`
    );
    expect(sql).toContain(
      `elsif v_count >= ${MULTI_MIN_PLAYERS} then v_tier := 'multi'; v_unit := ${MULTI_UNIT_PRICE_PENCE};`
    );
    expect(sql).toContain(
      `else v_tier := 'single'; v_unit := ${SINGLE_UNIT_PRICE_PENCE};`
    );
  });

  it('derives the 24-hour grace deadline with a server-authoritative trigger', () => {
    const triggerFunction = sql.match(/create or replace function public\.derive_squad_invite_grace_end\(\)[\s\S]*?\n\$\$;/i)?.[0];
    expect(sql).not.toMatch(/grace_ends_at\s+timestamptz\s+generated\s+always/i);
    expect(sql).toMatch(/grace_ends_at\s+timestamptz\s+not null/i);
    expect(triggerFunction).toBeDefined();
    expect(triggerFunction).toMatch(/returns\s+trigger\s+language\s+plpgsql\s+set search_path\s*=\s*''/i);
    expect(triggerFunction).not.toMatch(/security definer/i);
    expect(triggerFunction).toContain("new.grace_ends_at := new.deadline_at + interval '24 hours'");
    expect(sql).toMatch(/before insert or update of deadline_at, grace_ends_at on public\.squad_invites/i);
    expect(sql).toContain('execute function public.derive_squad_invite_grace_end()');
    expect(sql).toContain('revoke all on function public.derive_squad_invite_grace_end() from public, anon, authenticated, service_role');
  });

  it('encodes 72-hour payment and one batch per campaign', () => {
    expect(sql).toContain("deadline_at + interval '24 hours'");
    expect(sql).toContain("payment_request_issued_at + interval '72 hours'");
    expect(sql).toMatch(/campaign_id uuid not null unique references public\.squad_invites/);
  });

  it('remains compatible with later migrations without accepting a client grace deadline', () => {
    expect(sql51).not.toMatch(/alter table public\.squad_invites[^;]*grace_ends_at/i);
    expect(sql52).not.toMatch(/alter table public\.squad_invites[^;]*grace_ends_at/i);
    expect(sql52).toMatch(/insert into public\.squad_invites\([^;]*deadline_at,[^;]*\)\s*values/i);
    expect(sql52).not.toMatch(/insert into public\.squad_invites\([^;]*grace_ends_at[^;]*\)\s*values/i);
    expect(sql52).toContain('v_campaign.grace_ends_at');
  });

  it('has no direct public, anon or authenticated table access', () => {
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete).*\s+to\s+(anon|authenticated)/i);
  });

  it('uses server-authoritative idempotent pricing and paid-only coach reconciliation', () => {
    expect(sql).toContain('create or replace function public.finalise_squad_invite_pricing');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("status = 'commitment_completed'");
    expect(sql).toContain('create or replace function public.reconcile_squad_invite_coach_eligibility');
    expect(sql).toContain("status = 'paid'");
    expect(sql).toContain('count(distinct order_id)');
    expect(sql).toContain('from public, anon, authenticated');
  });

  it('keeps private registration and sensitive reviews visibly unresolved', () => {
    expect(sql).toContain("'private_registration'");
    expect(sql).toContain('subject to specialist review');
  });
});
