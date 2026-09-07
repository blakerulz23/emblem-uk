import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { FULL_PX } from './print-master-geometry';

const sql = readFileSync('supabase/migrations/0086_print_masters.sql', 'utf8');

describe('migration 0086 print_masters contract', () => {
  it('creates print_masters with RLS and no direct public/anon/authenticated grants', () => {
    expect(sql).toContain('create table public.print_masters');
    expect(sql).toContain('alter table public.print_masters enable row level security');
    expect(sql).toContain('revoke all on public.print_masters from public, anon, authenticated, service_role');
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete).*\s+to\s+(anon|authenticated)/i);
    expect(sql).toContain('grant select, insert, update on public.print_masters to service_role');
  });

  it('hardcodes the authoritative full-bleed dimensions as a CHECK constraint, in sync with print-master-geometry.ts', () => {
    expect(sql).toContain(`check (width_px = ${FULL_PX.w} and height_px = ${FULL_PX.h})`);
  });

  it('constrains mime type, product, and digest format', () => {
    expect(sql).toContain("check (mime_type = 'image/png')");
    expect(sql).toContain("check (product in ('card'))");
    expect(sql).toMatch(/front_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'/);
    expect(sql).toMatch(/back_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'/);
  });

  it('constrains front/back keys to their own submission+product namespace and correct side suffix — no cross-order or swapped reference possible at the schema level', () => {
    expect(sql).toMatch(/front_key like \(\s*'print-masters\/' \|\| submission_id::text \|\| '\/' \|\| product \|\| '\/%-front\.png'\s*\)/);
    expect(sql).toMatch(/back_key like \(\s*'print-masters\/' \|\| submission_id::text \|\| '\/' \|\| product \|\| '\/%-back\.png'\s*\)/);
  });

  it('enforces at most one confirmed master per (submission, player, product) — idempotency and immutability at the schema level', () => {
    expect(sql).toContain('create unique index print_masters_one_confirmed_idx');
    expect(sql).toMatch(/on public\.print_masters \(submission_id, player_id, product\)\s*where status = 'confirmed'/);
  });

  it('a superseded row must always carry a superseded_at timestamp; a confirmed row must never carry one', () => {
    expect(sql).toMatch(/status = 'confirmed' and superseded_at is null and superseded_by is null/);
    expect(sql).toMatch(/status = 'superseded' and superseded_at is not null/);
  });

  it('does not alter orders.print_files or any other existing table — a genuinely separate, additive table (only referenced in this file\'s own explanatory comments, never mutated)', () => {
    expect(sql).not.toMatch(/alter table public\.orders/);
    expect(sql).not.toMatch(/alter table[^;]*print_files/i);
  });

  it('documents rollback and recovery, per this session\'s migration convention', () => {
    expect(sql).toMatch(/rollback/i);
    expect(sql).toMatch(/drop table if exists public\.print_masters/i);
    expect(sql).toMatch(/recovery/i);
  });
});
