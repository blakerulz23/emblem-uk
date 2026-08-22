import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0069_windowed_rate_limit.sql', 'utf8');
const migration0051 = readFileSync('supabase/migrations/0051_squad_invite_reusable_links.sql', 'utf8');

describe('migration 0069 windowed rate limit contract', () => {
  it('does not touch migration 0051 — reuses squad_invite_rate_limits as an existing table, never redefines or alters it', () => {
    expect(sql).not.toContain('create table public.squad_invite_rate_limits');
    expect(sql).not.toContain('alter table public.squad_invite_rate_limits');
    expect(sql).not.toContain('consume_squad_invite_rate_limit(text');
    // Confirms the table this migration inserts into still exists exactly
    // as 0051 defined it — a cross-file consistency check, not just an
    // assertion about 0069 in isolation.
    expect(migration0051).toContain('create table public.squad_invite_rate_limits');
    expect(migration0051).toContain('primary key (bucket_hash, window_started_at)');
  });

  it('validates the bucket hash format and bounds before ever touching the table', () => {
    expect(sql).toContain("p_bucket_hash !~ '^[a-f0-9]{64}$'");
    expect(sql).toContain('p_limit < 1');
    expect(sql).toContain('p_window_minutes < 1');
    expect(sql).toContain('p_window_minutes > 1440');
    expect(sql).toContain('return false;');
  });

  it('is security definer with an explicit empty search_path', () => {
    const body = sql.split('create or replace function public.consume_windowed_rate_limit')[1];
    expect(body).toContain('security definer');
    expect(body).toContain("set search_path = ''");
  });

  it('is locked to service_role only', () => {
    expect(sql).toContain('revoke all on function public.consume_windowed_rate_limit(text, integer, integer) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.consume_windowed_rate_limit(text, integer, integer) to service_role');
  });

  it('increments and checks the limit atomically in one insert-or-update, never a separate select-then-write', () => {
    const body = sql.split('create or replace function public.consume_windowed_rate_limit')[1];
    expect(body).toContain('insert into public.squad_invite_rate_limits(bucket_hash, window_started_at, attempt_count)');
    expect(body).toContain('on conflict (bucket_hash, window_started_at) do update set attempt_count = public.squad_invite_rate_limits.attempt_count + 1');
    expect(body).toContain('returning attempt_count into v_count');
    expect(body).not.toMatch(/select[\s\S]*?attempt_count[\s\S]*?;\s*(insert|update)/i);
  });

  it('never persists or logs a raw IP — only the caller-supplied opaque hash ever reaches this function', () => {
    expect(sql).not.toContain('ip_address');
    expect(sql).not.toContain('x-forwarded-for');
  });
});
