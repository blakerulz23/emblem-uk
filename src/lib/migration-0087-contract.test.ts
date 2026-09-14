import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0087_card_share_public_page_back_image.sql', 'utf8');
const migration0085 = readFileSync('supabase/migrations/0085_card_share_public_page.sql', 'utf8');

/**
 * migration 0087's real risk: PostgreSQL identifies a function by (schema,
 * name, parameter TYPE LIST) — a CREATE OR REPLACE with a different
 * argument count never replaces an existing function, it creates a second
 * overload. 0085's own create_card_share_public_page(uuid, text) has no
 * default on either parameter, so simply adding a three-argument version
 * would leave BOTH signatures live; a two-argument call then satisfies two
 * candidates equally (the two-arg function directly, or the three-arg one
 * with its third parameter defaulted) — proven directly against real
 * PostgreSQL (pglite) in supabase/tests/0087_overload_resolution_pglite_test.mjs
 * to raise Postgres's own "function ... is not unique" (42725) error, not
 * assumed from documentation alone.
 *
 * This file is the CI-enforced half of that proof — structural, no live
 * Postgres needed (this suite runs in a plain Node environment, no
 * database), asserting the migration's own text has the one shape that
 * makes the ambiguity structurally impossible: exactly one
 * create_card_share_public_page signature by the time this migration
 * commits, reached by an explicit DROP of the old one before the new one
 * is created — never a wrapper function duplicating the real logic.
 */
describe('migration 0087 — back-image key, corrected overload-safe contract', () => {
  it("0085's create_card_share_public_page is exactly (uuid, text), no defaults — confirms the exact incompatibility this migration must resolve", () => {
    const sig = migration0085.match(/create or replace function public\.create_card_share_public_page\(([\s\S]*?)\)\s*\nreturns/);
    expect(sig).not.toBeNull();
    const params = sig![1];
    expect(params).toContain('p_order_id uuid');
    expect(params).toContain('p_front_image_key text');
    expect(params).not.toMatch(/default/i);
    // Exactly two parameters — no stray third one already present.
    expect((params.match(/,/g) ?? []).length).toBe(1);
  });

  it('explicitly drops the old two-argument signature before creating the three-argument one', () => {
    const dropIdx = sql.indexOf('drop function if exists public.create_card_share_public_page(uuid, text)');
    const createIdx = sql.indexOf('create or replace function public.create_card_share_public_page(');
    expect(dropIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeLessThan(createIdx);
  });

  it('the drop and the create both sit inside the same begin/commit transaction — no window where either statement could apply without the other', () => {
    const beginIdx = sql.indexOf('begin;');
    const commitIdx = sql.lastIndexOf('commit;');
    const dropIdx = sql.indexOf('drop function if exists public.create_card_share_public_page(uuid, text)');
    const createIdx = sql.indexOf('create or replace function public.create_card_share_public_page(');
    expect(beginIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(dropIdx);
    expect(dropIdx).toBeGreaterThan(beginIdx);
    expect(createIdx).toBeLessThan(commitIdx);
  });

  it('create_card_share_public_page appears exactly once as a CREATE (no second, competing signature anywhere in this file)', () => {
    const creates = sql.match(/create or replace function public\.create_card_share_public_page\(/g) ?? [];
    expect(creates.length).toBe(1);
  });

  it('the one surviving signature has exactly three parameters, with the back-image key defaulting to null', () => {
    const sig = sql.match(/create or replace function public\.create_card_share_public_page\(([\s\S]*?)\)\s*\nreturns/);
    expect(sig).not.toBeNull();
    const params = sig![1];
    expect(params).toContain('p_order_id uuid');
    expect(params).toContain('p_front_image_key text');
    expect(params).toMatch(/p_back_image_key text default null/);
    // Exactly three parameters (two commas).
    expect((params.match(/,/g) ?? []).length).toBe(2);
  });

  it('no separate two-argument compatibility wrapper was introduced — one implementation only, nothing to drift out of sync', () => {
    // A wrapper would show up as a SECOND create_card_share_public_page
    // block with only two parameters. There is exactly one CREATE (checked
    // above) and it is the three-argument one — so by construction there
    // is no wrapper, no duplicated authorization/business logic.
    const twoArgCreatePattern = /create (or replace )?function public\.create_card_share_public_page\(\s*p_order_id uuid,\s*p_front_image_key text\s*\)/;
    expect(sql).not.toMatch(twoArgCreatePattern);
  });

  it('grants/revokes target the three-argument signature explicitly — never the old two-argument one', () => {
    expect(sql).toContain('revoke all on function public.create_card_share_public_page(uuid, text, text) from public, anon');
    expect(sql).toContain('grant execute on function public.create_card_share_public_page(uuid, text, text) to authenticated');
    expect(sql).not.toMatch(/on function public\.create_card_share_public_page\(uuid, text\)\s+(from|to)/);
  });

  it('back_image_key is added as a nullable column — existing front-only rows remain valid', () => {
    expect(sql).toContain('alter table public.card_share_public_pages add column back_image_key text');
    expect(sql).not.toMatch(/back_image_key text not null/);
  });

  it('every existing authorization/expiry/access-status check is reproduced unchanged from 0085', () => {
    const invariantLines = [
      "if auth.uid() is null then",
      "raise exception 'Not authenticated';",
      "if p_order_id is null then",
      "v_eligibility := public.get_card_share_eligibility(p_order_id);",
      "if (v_eligibility ->> 'eligible')::boolean is not true then",
      'security definer',
      "set search_path = ''",
      "if v_page.expires_at <= now() then",
      'v_card.access_status is not null',
    ];
    for (const line of invariantLines) {
      expect(sql).toContain(line);
    }
  });

  it("get_card_share_public_page's own signature is unchanged (text) — no overload risk there, only create_card_share_public_page's argument count changed", () => {
    const creates = sql.match(/create or replace function public\.get_card_share_public_page\(/g) ?? [];
    expect(creates.length).toBe(1);
    expect(sql).toContain('revoke all on function public.get_card_share_public_page(text) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.get_card_share_public_page(text) to service_role');
  });
});
