import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0070_squad_invite_asset_limits.sql', 'utf8');
const migration0050 = readFileSync('supabase/migrations/0050_squad_invite_foundation.sql', 'utf8');

describe('migration 0070 squad invite asset limits contract', () => {
  it('does not touch squad_invite_participations or any other already-applied table/function', () => {
    expect(sql).not.toContain('create table public.squad_invite_participations');
    expect(sql).not.toContain('alter table public.squad_invite_participations');
    expect(sql).not.toMatch(/create or replace function public\.(start_squad_invite_participation|commit_squad_invite_participation_order)/);
    // Cross-file consistency: confirms the table this migration reads
    // (read-only, via SELECT ... FOR UPDATE for locking) still has the
    // exact column this migration's ownership check depends on.
    expect(migration0050).toContain('builder_token_hash text not null unique check (char_length(builder_token_hash) = 64)');
  });

  it('creates a new, additive per-participation ledger table with a stable (participation_id, slot_key) primary key', () => {
    expect(sql).toContain('create table public.squad_invite_participation_assets');
    expect(sql).toContain('primary key (participation_id, slot_key)');
    expect(sql).toContain('bytes bigint not null check (bytes >= 0)');
    expect(sql).toContain('references public.squad_invite_participations(id) on delete cascade');
  });

  it('enables RLS and restricts every grant to service_role only', () => {
    expect(sql).toContain('alter table public.squad_invite_participation_assets enable row level security');
    expect(sql).toContain('revoke all on public.squad_invite_participation_assets from public, anon, authenticated');
    expect(sql).toContain('grant select, insert, update, delete on public.squad_invite_participation_assets to service_role');
  });

  const functionNames = [
    'reserve_squad_invite_participation_asset_slot',
    'finish_squad_invite_participation_asset_reservation',
    'release_squad_invite_participation_asset_slot',
  ];

  it('declares every function security definer with an explicit empty search_path', () => {
    for (const name of functionNames) {
      const start = sql.indexOf(`create or replace function public.${name}(`);
      expect(start, `${name} should be declared`).toBeGreaterThan(-1);
      const body = sql.slice(start, start + 600);
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
    }
  });

  it('locks every function to service_role only', () => {
    expect(sql).toContain('revoke all on function public.reserve_squad_invite_participation_asset_slot(uuid, text, text, bigint, integer, bigint) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.reserve_squad_invite_participation_asset_slot(uuid, text, text, bigint, integer, bigint) to service_role');
    expect(sql).toContain('revoke all on function public.finish_squad_invite_participation_asset_reservation(uuid, text, uuid) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.finish_squad_invite_participation_asset_reservation(uuid, text, uuid) to service_role');
    expect(sql).toContain('revoke all on function public.release_squad_invite_participation_asset_slot(uuid, text, uuid, bigint) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.release_squad_invite_participation_asset_slot(uuid, text, uuid, bigint) to service_role');
  });

  it('verifies ownership (builder_token_hash match) AND that the participation is still started, in the SAME locked read the ceiling check uses', () => {
    const body = sql.split('create or replace function public.reserve_squad_invite_participation_asset_slot')[1].split('create or replace function public.finish_squad_invite_participation_asset_reservation')[0];
    expect(body).toContain('builder_token_hash = p_builder_token_hash');
    expect(body).toContain("status = 'started'");
    expect(body).toMatch(/from public\.squad_invite_participations[\s\S]*?for update/);
  });

  it('computes current count/total from the ledger (count()/sum()), never a stored column, enforces both ceilings atomically, and stamps a fresh reservation_id on every successful reserve', () => {
    const body = sql.split('create or replace function public.reserve_squad_invite_participation_asset_slot')[1].split('create or replace function public.finish_squad_invite_participation_asset_reservation')[0];
    expect(body).toContain('select count(*), coalesce(sum(bytes), 0) into v_current_count, v_current_total');
    expect(body).toContain('v_new_count > p_max_count');
    expect(body).toContain('v_new_total > p_max_total_bytes');
    expect(body).toContain('on conflict (participation_id, slot_key) do update');
    expect(body).toContain('set bytes = excluded.bytes, reservation_id = excluded.reservation_id');
    expect(body).toContain('v_new_reservation_id := gen_random_uuid()');
  });

  it('reserve returns a reservation_id in its result signature', () => {
    const start = sql.indexOf('create or replace function public.reserve_squad_invite_participation_asset_slot(');
    const signature = sql.slice(start, sql.indexOf('$$', start));
    expect(signature).toContain('returns table(ok boolean, previous_bytes bigint, reservation_id uuid)');
  });

  it('finish confirms reservation currency by identity (locks the row, compares reservation_id), never mutates state', () => {
    const body = sql.split('create or replace function public.finish_squad_invite_participation_asset_reservation')[1].split('create or replace function public.release_squad_invite_participation_asset_slot')[0];
    expect(body).toContain('for update');
    expect(body).toContain('v_current is not null and v_current = p_reservation_id');
    expect(body).not.toMatch(/\bupdate\s+public\.squad_invite_participation_assets/);
    expect(body).not.toMatch(/\bdelete\s+from\s+public\.squad_invite_participation_assets/);
  });

  it('release reverses a reservation exactly, gated on reservation_id identity (not the byte value) still matching the current row', () => {
    const body = sql.split('create or replace function public.release_squad_invite_participation_asset_slot')[1];
    expect(body).toContain('if p_previous_bytes is null then');
    expect(body).toContain('delete from public.squad_invite_participation_assets');
    expect(body).toContain('update public.squad_invite_participation_assets');
    expect(body).toContain('set bytes = p_previous_bytes, reservation_id = null');
    expect(body.match(/and reservation_id = p_reservation_id/g)?.length).toBe(2);
    expect(body).not.toContain('and bytes = p_reserved_bytes');
  });

  it('release returns a boolean — whether the release actually matched the current reservation, not void', () => {
    const start = sql.indexOf('create or replace function public.release_squad_invite_participation_asset_slot(');
    const signature = sql.slice(start, sql.indexOf('language plpgsql', start));
    expect(signature).toContain('returns boolean');
  });

  it('never returns or logs a raw builder token, only accepts an already-hashed value, and never touches child information', () => {
    expect(sql).not.toContain('display_first_name');
    expect(sql).not.toContain('display_surname_initial');
    expect(sql).not.toMatch(/return\s+.*builder_token_hash/i);
  });
});
