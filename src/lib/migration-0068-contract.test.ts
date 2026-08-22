import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0068_builder_submission_capabilities.sql', 'utf8');

describe('migration 0068 builder submission capabilities contract', () => {
  it('never persists a raw token — only a 64-char hex hash, uniquely constrained', () => {
    expect(sql).toContain('create table public.builder_submission_capabilities');
    expect(sql).toContain('token_hash text not null unique check (char_length(token_hash) = 64)');
    expect(sql).not.toMatch(/create table public\.builder_submission_capabilities[\s\S]*?\btoken\s+text/i);
  });

  it('defines the full active/finalising/submitted/revoked/expired state machine and defaults to active', () => {
    expect(sql).toContain("state text not null default 'active' check (state in ('active', 'finalising', 'submitted', 'revoked', 'expired'))");
  });

  it('does not store a redundant running total on the capability row — counts/bytes are always derived from the per-slot ledger', () => {
    const capsTable = sql.split('create table public.builder_submission_capabilities')[1].split('create index')[0];
    expect(capsTable).not.toContain('upload_count');
    expect(capsTable).not.toContain('upload_bytes_total');
  });

  it('has a per-slot ledger table with a stable (submission_id, slot_key) primary key and a non-negative byte check', () => {
    expect(sql).toContain('create table public.builder_submission_assets');
    expect(sql).toContain('primary key (submission_id, slot_key)');
    expect(sql).toContain('bytes bigint not null check (bytes >= 0)');
  });

  it('enables RLS and restricts every grant to service_role only, on both tables', () => {
    for (const table of ['builder_submission_capabilities', 'builder_submission_assets']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from public, anon, authenticated`);
      expect(sql).toMatch(new RegExp(`grant select, insert, update(, delete)? on public\\.${table} to service_role`));
    }
  });

  it('has an index supporting expiry/cleanup queries', () => {
    expect(sql).toContain('create index builder_submission_capabilities_expires_idx');
    expect(sql).toContain('on public.builder_submission_capabilities(expires_at)');
    expect(sql).toContain("where state = 'active'");
  });

  const functionNames = [
    'issue_builder_submission_capability',
    'verify_and_touch_builder_submission_capability',
    'reserve_builder_submission_asset_slot',
    'finish_builder_submission_asset_reservation',
    'release_builder_submission_asset_slot',
    'begin_builder_submission_finalising',
    'finish_builder_submission_finalising',
    'revoke_builder_submission_capability',
  ];

  it('declares every function security definer with an explicit empty search_path', () => {
    for (const name of functionNames) {
      const start = sql.indexOf(`create or replace function public.${name}(`);
      expect(start, `${name} should be declared`).toBeGreaterThan(-1);
      const body = sql.slice(start, start + 500);
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
    }
  });

  it('locks every function to service_role only — revoked from public/anon/authenticated, granted only to service_role', () => {
    for (const name of functionNames) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`));
    }
  });

  it('issues a capability only from a well-formed hash, never accepting an arbitrary one', () => {
    const body = sql.split('create or replace function public.issue_builder_submission_capability')[1].split('create or replace function public.verify_and_touch_builder_submission_capability')[0];
    expect(body).toContain("p_token_hash !~ '^[a-f0-9]{64}$'");
    expect(body).toContain('raise exception');
  });

  it('verify_and_touch is pure auth — no ceiling parameters at all', () => {
    const start = sql.indexOf('create or replace function public.verify_and_touch_builder_submission_capability(');
    const signature = sql.slice(start, sql.indexOf(')', start) + 1);
    expect(signature).toContain('p_token_hash text');
    expect(signature).not.toContain('p_upload_ceiling');
    expect(signature).not.toContain('p_asset_bytes');
  });

  it('reserve computes current count/total from the ledger (count()/sum()), never from a stored column, and enforces both ceilings plus a non-negative total in one atomic statement', () => {
    const body = sql.split('create or replace function public.reserve_builder_submission_asset_slot')[1].split('create or replace function public.release_builder_submission_asset_slot')[0];
    expect(body).toContain('select count(*), coalesce(sum(bytes), 0) into v_current_count, v_current_total');
    expect(body).toContain('v_new_count > p_max_count');
    expect(body).toContain('v_new_total > p_max_total_bytes');
    expect(body).toContain('v_new_total < 0');
    expect(body).toContain("state = 'active'");
    expect(body).toContain('expires_at > now()');
    // Locks both the capability row and the existing slot row before
    // deciding — not a separate, unlocked read-then-write.
    expect(body).toMatch(/where id = p_id and state = 'active' and expires_at > now\(\)\s*\n\s*for update/);
    expect(body).toMatch(/where submission_id = p_id and slot_key = p_slot_key\s*\n\s*for update/);
  });

  it('reserve replaces an existing slot in place (on conflict do update), never appends a second row for the same slot, and stamps a fresh reservation_id every time', () => {
    const body = sql.split('create or replace function public.reserve_builder_submission_asset_slot')[1].split('create or replace function public.finish_builder_submission_asset_reservation')[0];
    expect(body).toContain('on conflict (submission_id, slot_key) do update');
    expect(body).toContain('set bytes = excluded.bytes, reservation_id = excluded.reservation_id');
    expect(body).toContain('v_new_reservation_id := gen_random_uuid()');
  });

  it('reserve returns a reservation_id in its result signature', () => {
    const start = sql.indexOf('create or replace function public.reserve_builder_submission_asset_slot(');
    const signature = sql.slice(start, sql.indexOf('$$', start));
    expect(signature).toContain('returns table(ok boolean, previous_bytes bigint, reservation_id uuid)');
  });

  it('finish confirms reservation currency by identity (locks the row, compares reservation_id), never mutates state', () => {
    const body = sql.split('create or replace function public.finish_builder_submission_asset_reservation')[1].split('create or replace function public.release_builder_submission_asset_slot')[0];
    expect(body).toContain('for update');
    expect(body).toContain('v_current is not null and v_current = p_reservation_id');
    expect(body).not.toMatch(/\bupdate\s+public\.builder_submission_assets/);
    expect(body).not.toMatch(/\bdelete\s+from\s+public\.builder_submission_assets/);
  });

  it('release reverses a reservation exactly — deletes a brand-new slot or restores the previous byte value, gated on reservation_id identity (not the byte value) still matching the current row', () => {
    const body = sql.split('create or replace function public.release_builder_submission_asset_slot')[1].split('create or replace function public.begin_builder_submission_finalising')[0];
    expect(body).toContain('if p_previous_bytes is null then');
    expect(body).toContain('delete from public.builder_submission_assets');
    expect(body).toContain('update public.builder_submission_assets');
    expect(body).toContain('set bytes = p_previous_bytes, reservation_id = null');
    expect(body.match(/and reservation_id = p_reservation_id/g)?.length).toBe(2);
    // The old, unsafe value-based match must not have survived.
    expect(body).not.toContain('and bytes = p_reserved_bytes');
  });

  it('release returns a boolean — whether the release actually matched the current reservation, not void', () => {
    const start = sql.indexOf('create or replace function public.release_builder_submission_asset_slot(');
    const signature = sql.slice(start, sql.indexOf('language plpgsql', start));
    expect(signature).toContain('returns boolean');
  });

  it('never returns a hash, a raw token, or any other secret from any function', () => {
    for (const name of functionNames) {
      const start = sql.indexOf(`create or replace function public.${name}(`);
      const end = sql.indexOf('$$;', start) + 3;
      const body = sql.slice(start, end);
      expect(body).not.toMatch(/return\s+.*token_hash/i);
      expect(body).not.toContain('returning token_hash');
    }
  });

  it('the finalising transition is atomic (single UPDATE gated on the current state) and only "finalising" or "submitted" is ever surfaced to the caller as a proceed signal', () => {
    const body = sql.split('create or replace function public.begin_builder_submission_finalising')[1].split('create or replace function public.finish_builder_submission_finalising')[0];
    expect(body).toContain("set state = 'finalising'");
    expect(body).toContain("where id = p_id and state = 'active' and expires_at > now()");
    expect(body).toContain("coalesce(v_state, 'not_found')");
  });

  it('finish reverts to active on failure and moves to submitted on success, both gated on the finalising state only', () => {
    const body = sql.split('create or replace function public.finish_builder_submission_finalising')[1].split('create or replace function public.revoke_builder_submission_capability')[0];
    expect(body).toContain("set state = 'submitted'");
    expect(body).toContain("set state = 'active'");
    expect(body.match(/where id = p_id and state = 'finalising'/g)?.length).toBe(2);
  });

  it('staff/explicit revocation works by capability id alone, never the raw token, and is idempotent', () => {
    const body = sql.split('create or replace function public.revoke_builder_submission_capability')[1];
    expect(body).toContain("set state = 'revoked'");
    expect(body).toContain("where id = p_id and state in ('active', 'finalising')");
    expect(body).not.toContain('token_hash');
  });
});
