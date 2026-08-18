import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0055_squad_invite_order_commitment.sql', 'utf8');

describe('migration 0055 Squad Invite order commitment contract', () => {
  it('does not touch migrations 0050-0054', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0051_squad_invite_reusable_links.sql',
      'supabase/migrations/0052_squad_invite_review_foundation.sql',
      'supabase/migrations/0053_squad_invite_append_only_history.sql',
      'supabase/migrations/0054_squad_invite_concurrent_submission_idempotency.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('commit_squad_invite_participation_order');
    }
  });

  it('extends orders.source to include squad_invite without touching the pre-0050 orders table definition', () => {
    expect(sql).toContain("check (source in ('team_order', 'standalone_order', 'squad_invite'))");
    expect(sql).toContain('alter table public.orders drop constraint orders_source_check');
  });

  it('defines a hardcoded, server-only payment-mode boundary — never derived from env or a client value', () => {
    const fn = sql.match(/create or replace function public\.squad_invite_payment_mode_enabled\(\)[\s\S]*?\$\$ select false; \$\$;/)?.[0];
    expect(fn).toBeDefined();
    expect(fn).toMatch(/language sql\s+stable/);
    expect(sql).not.toMatch(/squad_invite_payment_mode_enabled[\s\S]{0,200}process\.env/);
    expect(sql).toContain('grant execute on function public.squad_invite_payment_mode_enabled() to service_role');
    expect(sql).not.toMatch(/grant execute on function public\.squad_invite_payment_mode_enabled\(\) to (authenticated|anon|public)/);
  });

  it('re-verifies guardian ownership and the builder-token hash inside the transaction, never trusting the caller alone', () => {
    expect(sql).toContain('v_participation.guardian_profile_id is distinct from p_guardian_profile_id');
    expect(sql).toContain('v_participation.builder_token_hash is distinct from p_builder_token_hash');
  });

  it('is idempotent per participation via row lock, returning the existing order/card rather than re-inserting', () => {
    expect(sql).toContain('where id = p_participation_id for update');
    expect(sql).toContain('if v_participation.order_id is not null then');
    expect(sql).toMatch(/created['"]?,\s*false/);
  });

  it('re-derives campaign eligibility authoritatively (active/deadline_reached/grace_period AND before grace_ends_at)', () => {
    expect(sql).toContain("v_campaign.campaign_status not in ('active', 'deadline_reached', 'grace_period')");
    expect(sql).toContain('now() >= v_campaign.grace_ends_at');
  });

  it('every order this function creates starts unpaid — never paid or fulfilled', () => {
    const insertOrders = sql.match(/insert into public\.orders[\s\S]{0,400}?;/)?.[0] ?? '';
    expect(insertOrders).toContain("'order_intent'");
    expect(insertOrders).not.toContain("'paid'");
    expect(insertOrders).not.toContain("'fulfilled'");
    // The migration never updates orders.payment_status at all (only the
    // future-behaviour comment on the policy boundary mentions 'paid' in
    // prose, describing what the separate approval route must do later).
    expect(sql).not.toMatch(/update public\.orders set[^;]*payment_status/);
  });

  it('leaves per-order pricing columns null — Squad Invite pricing is campaign-level, set later', () => {
    expect(sql).not.toMatch(/insert into public\.orders[\s\S]{0,400}pricing_tier/);
  });

  it('records a zero-price line item rather than omitting it or fabricating a real price', () => {
    expect(sql).toMatch(/values \(v_order_id, 'player_card', v_description, p_print_quantity, 0, 0, 'GBP'\)/);
  });

  it('never creates a parallel card table — reuses orders/players/cards/card_definitions exactly', () => {
    expect(sql).toContain('insert into public.orders');
    expect(sql).toContain('insert into public.players');
    expect(sql).toContain('insert into public.cards');
    expect(sql).toContain('insert into public.card_definitions');
    expect(sql).not.toMatch(/create table/);
  });

  it('sets squad_invite_participations.order_id as the authoritative association', () => {
    expect(sql).toMatch(/update public\.squad_invite_participations set[\s\S]{0,200}order_id = v_order_id/);
  });

  it('is locked to service_role only, security definer, empty search_path', () => {
    expect(sql).toContain('create or replace function public.commit_squad_invite_participation_order(');
    expect(sql).toMatch(/\)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''/);
    expect(sql).toContain('revoke all on function public.commit_squad_invite_participation_order');
    expect(sql).toContain('grant execute on function public.commit_squad_invite_participation_order');
    expect(sql).toMatch(/revoke all on function public\.commit_squad_invite_participation_order\([^)]*\) from public, anon, authenticated/);
  });

  it('never accepts a raw builder token — only a pre-hashed value — and never logs/returns it', () => {
    expect(sql).toContain('p_builder_token_hash text');
    expect(sql).not.toContain('p_builder_token text');
    expect(sql).not.toMatch(/raise (notice|warning)[^;]*builder_token/i);
  });

  it('is a single plpgsql function body — one Postgres transaction — so a failure anywhere rolls everything back together', () => {
    // Exactly one function definition; no explicit commit/rollback/savepoint
    // (those aren't valid inside a plain SQL function body anyway, and
    // their presence would signal an attempt to split this into multiple
    // transactions, defeating atomic rollback).
    expect(sql.match(/create or replace function/g)?.length).toBe(2); // payment-mode boundary + the commit function
    expect(sql).not.toMatch(/\bcommit\s*;/i);
    expect(sql).not.toMatch(/\brollback\s*;/i);
    expect(sql).not.toMatch(/\bsavepoint\b/i);
  });

  it('every card this function creates is immediately eligible for the existing Profile Setup queue (player_id and order_id always set, never left for a later step)', () => {
    expect(sql).toMatch(/insert into public\.cards \(claim_token, player_id, order_id, status\)\s*\n\s*values \(v_claim_token, v_player_id, v_order_id, 'assigned'\)/);
    // production_status is never written here — it keeps the table's own
    // default ('needs_setup'), exactly like create_authoritative_order,
    // so the card lands in the "Waiting for Setup" bucket, not skipped.
    expect(sql).not.toContain('production_status');
  });
});
