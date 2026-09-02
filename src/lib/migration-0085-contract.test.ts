import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0085_card_share_public_page.sql', 'utf8');

describe('migration 0085 — founder-approved public share page contract', () => {
  it('does not touch migrations 0050-0084', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0078_guardian_card_share_consent.sql',
      'supabase/migrations/0079_card_share_asset_proxy.sql',
      'supabase/migrations/0084_squad_invite_card_share_eligibility.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/card_share_public_pages|create_card_share_public_page|get_card_share_public_page/);
    }
  });

  it('the table is service-role only — RLS enabled, no policies, revoked from anon/authenticated', () => {
    expect(sql).toContain('alter table public.card_share_public_pages enable row level security');
    expect(sql).not.toMatch(/create policy.*card_share_public_pages/);
    expect(sql).toContain('revoke all on public.card_share_public_pages from public, anon, authenticated');
    expect(sql).toContain('grant select, insert, delete on public.card_share_public_pages to service_role');
  });

  it('token is constrained to exactly 64 lowercase hex characters — the shape the write/read RPCs both assume', () => {
    expect(sql).toContain("token text not null unique check (token ~ '^[0-9a-f]{64}$')");
  });

  it('the token is built from two gen_random_uuid() values, never an actual call to pgcrypto\'s gen_random_bytes() — this codebase\'s own documented reason (0048/0049): pgcrypto can live outside an empty search_path', () => {
    expect(sql).toContain("replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')");
    // gen_random_bytes is mentioned by name, without a call, only in
    // explanatory comments (the migration header, the column comment) —
    // never actually invoked as a function anywhere in this file.
    expect(sql).not.toContain('gen_random_bytes(');
  });

  it('create_card_share_public_page re-runs get_card_share_eligibility itself — never trusts a client-supplied "already checked" claim', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.create_card_share_public_page'), sql.indexOf('create or replace function public.get_card_share_public_page'));
    expect(fn).toContain('v_eligibility := public.get_card_share_eligibility(p_order_id);');
    expect(fn).toContain("if (v_eligibility ->> 'eligible')::boolean is not true then");
    expect(fn).toContain('raise exception');
  });

  it('create_card_share_public_page fails closed when not authenticated, before touching the eligibility check', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.create_card_share_public_page'));
    const authIdx = fn.indexOf('if auth.uid() is null then');
    const eligIdx = fn.indexOf('get_card_share_eligibility');
    expect(authIdx).toBeGreaterThan(-1);
    expect(eligIdx).toBeGreaterThan(authIdx);
  });

  it('the expiry is fixed at creation time to exactly 7 days — never derived from a client-supplied duration', () => {
    expect(sql).toContain("v_expires_at := now() + interval '7 days';");
    expect(sql).not.toMatch(/p_expires_at|p_duration|p_days/);
  });

  it('create_card_share_public_page is authenticated-callable only, never anon', () => {
    expect(sql).toContain('revoke all on function public.create_card_share_public_page(uuid, text) from public, anon');
    expect(sql).toContain('grant execute on function public.create_card_share_public_page(uuid, text) to authenticated');
  });

  it('get_card_share_public_page (the read path) is service_role only — never directly callable by a browser, authenticated or not', () => {
    expect(sql).toContain('revoke all on function public.get_card_share_public_page(text) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.get_card_share_public_page(text) to service_role');
  });

  it('get_card_share_public_page re-checks BOTH expiry and the linked card\'s current access_status on every call — a page is never valid merely because a row exists', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.get_card_share_public_page'));
    expect(fn).toContain('v_page.expires_at <= now()');
    expect(fn).toContain('v_card.access_status is not null');
  });

  it('get_card_share_public_page validates the token shape before ever querying — a malformed token never reaches the database as a wildcard/injection surface', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.get_card_share_public_page'));
    expect(fn).toContain("p_token !~ '^[0-9a-f]{64}\\$'".replace('\\$', '$'));
  });

  it('both functions are security definer with an empty search_path, matching every other RPC in this feature', () => {
    const create = sql.slice(sql.indexOf('create or replace function public.create_card_share_public_page'), sql.indexOf('create or replace function public.get_card_share_public_page'));
    const read = sql.slice(sql.indexOf('create or replace function public.get_card_share_public_page'));
    for (const fn of [create, read]) {
      expect(fn).toContain('security definer');
      expect(fn).toContain("set search_path = ''");
    }
  });
});
