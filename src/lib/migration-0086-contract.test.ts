import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0086_card_share_custom_collection_allowlist.sql', 'utf8');
const migration0084 = readFileSync('supabase/migrations/0084_squad_invite_card_share_eligibility.sql', 'utf8');

const NEW_TEMPLATE_IDS = ['custom-crimson', 'custom-royal', 'custom-emerald', 'custom-glacier'] as const;
const PRE_EXISTING_TEMPLATE_IDS = ['custom-solar', 'custom-galaxy', 'custom-comic'] as const;

describe('migration 0086 — Custom Collection card-share allowlist contract', () => {
  it('does not touch any prior migration file — 0086 is additive-only', () => {
    for (const file of [
      'supabase/migrations/0078_guardian_card_share_consent.sql',
      'supabase/migrations/0079_card_share_asset_proxy.sql',
      'supabase/migrations/0084_squad_invite_card_share_eligibility.sql',
      'supabase/migrations/0085_card_share_public_page.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('0086');
    }
  });

  it('widens v_custom_template_ids to include all four new templates, in both branches (ordinary builder and Squad Invite share the one declaration)', () => {
    const arrayMatches = sql.match(/v_custom_template_ids text\[\] := array\[[^\]]*\]/g) ?? [];
    // Declared once (both branches reference the same local variable), but
    // assert on the declaration itself rather than counting occurrences of
    // each id, so this doesn't silently pass if the array were duplicated
    // with different contents in the two branches like 0078/0084 were.
    expect(arrayMatches.length).toBe(1);
    for (const id of [...PRE_EXISTING_TEMPLATE_IDS, ...NEW_TEMPLATE_IDS]) {
      expect(arrayMatches[0]).toContain(`'${id}'`);
    }
  });

  it('both v_custom_template_ids checks (ordinary builder + Squad Invite branch) reference the widened array — neither branch was left on the old allowlist', () => {
    const checks = sql.match(/v_definition\.template_id = any\(v_custom_template_ids\)/g) ?? [];
    expect(checks.length).toBe(2);
  });

  it('does not narrow or remove any of the three originally-shareable templates', () => {
    for (const id of PRE_EXISTING_TEMPLATE_IDS) {
      expect(sql).toContain(`'${id}'`);
    }
  });

  it('every other check from 0084 is reproduced unchanged — same authorization boundary, same authentication/authority/single-child/access-status/approved-design gates, same grants', () => {
    const invariantLines = [
      "if auth.uid() is null then",
      "return jsonb_build_object('eligible', false, 'reason', 'not_authenticated');",
      "if v_order.source = 'squad_invite' then",
      'v_participation.guardian_profile_id is distinct from auth.uid()',
      "v_participation.status = 'started'",
      "purpose = 'child_information_authority'",
      "purpose = 'photograph_manufacture'",
      'granted = true',
      'withdrawn_at is null',
      "if v_order.authority_status is distinct from 'confirmed' then",
      "v_declaration.relationship is distinct from 'parent_guardian'",
      'v_declaration.confirmed_photo_permission is distinct from true',
      "v_definition.status is distinct from 'approved'",
      "case when v_card.access_status = 'revoked' then 'card_revoked' else 'card_suspended' end",
      'security definer',
      "set search_path = ''",
      'revoke all on function public.get_card_share_eligibility(uuid) from public, anon',
      'grant execute on function public.get_card_share_eligibility(uuid) to authenticated',
    ];
    for (const line of invariantLines) {
      expect(sql).toContain(line);
      expect(migration0084).toContain(line);
    }
  });

  it("does not create or replace get_card_share_asset_key (0079) or create_card_share_public_page (0085) — both already call get_card_share_eligibility rather than re-implementing its checks, so widening this one array is sufficient (this migration's own header comment names them only in prose, explaining why they are untouched)", () => {
    expect(sql).not.toMatch(/create (or replace )?function public\.get_card_share_asset_key/);
    expect(sql).not.toMatch(/create (or replace )?function public\.create_card_share_public_page/);
  });

  it('is still a single CREATE OR REPLACE of the one function, wrapped in begin/commit like every prior migration touching it', () => {
    const createCount = (sql.match(/create or replace function public\.get_card_share_eligibility/g) ?? []).length;
    expect(createCount).toBe(1);
    expect(sql.trim().startsWith('begin;') || sql.includes('\nbegin;\n')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
  });
});
