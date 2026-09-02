import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0084_squad_invite_card_share_eligibility.sql', 'utf8');
const migration0078 = readFileSync('supabase/migrations/0078_guardian_card_share_consent.sql', 'utf8');

describe('migration 0084 — Squad Invite card-share eligibility contract', () => {
  it('does not touch migrations 0050-0077, 0079-0083 — no other prior migration file is modified by this one existing', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0055_squad_invite_order_commitment.sql',
      'supabase/migrations/0067_squad_invite_payment_mode_live.sql',
      'supabase/migrations/0079_card_share_asset_proxy.sql',
      'supabase/migrations/0080_gate3_payment_state.sql',
      'supabase/migrations/0081_squad_invite_payment_preview.sql',
      'supabase/migrations/0082_staff_notification_outbox.sql',
      'supabase/migrations/0083_squad_invite_ready_to_finalise_notification.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/create or replace function public\.get_card_share_eligibility/);
    }
  });

  it('0078 itself (the migration this one extends via CREATE OR REPLACE, applied later) is not edited in place — its own file is untouched', () => {
    expect(migration0078).toContain('create or replace function public.get_card_share_eligibility');
    expect(migration0078).not.toContain("v_order.source = 'squad_invite'");
  });

  it('adds a genuinely separate branch keyed on orders.source, rather than modifying the ordinary builder\'s own logic', () => {
    const branchIdx = sql.indexOf("if v_order.source = 'squad_invite' then");
    const ordinaryIdx = sql.indexOf('Ordinary builder path');
    expect(branchIdx).toBeGreaterThan(-1);
    expect(ordinaryIdx).toBeGreaterThan(branchIdx);
  });

  it('the ordinary builder branch is reproduced byte-for-byte from 0078 — the exact same authority_status/relationship/confirmed_photo_permission checks, in the same order', () => {
    const ordinaryStart = sql.indexOf("if v_order.authority_status is distinct from 'confirmed' then");
    const ordinaryBody = sql.slice(ordinaryStart, sql.indexOf('end;\n$$;', ordinaryStart));

    const original0078Start = migration0078.indexOf("if v_order.authority_status is distinct from 'confirmed' then");
    const original0078Body = migration0078.slice(original0078Start, migration0078.indexOf('end;\n$$;', original0078Start));

    expect(ordinaryBody).toContain(original0078Body.trim());
  });

  it('the Squad Invite branch requires the exact caller (auth.uid()) to be the participation\'s own guardian_profile_id — never trusted from a participation id, invitation token, or order id alone', () => {
    const idx = sql.indexOf("if v_order.source = 'squad_invite' then");
    const branch = sql.slice(idx, sql.indexOf('end if;', sql.indexOf('multi_child_order', idx)));
    expect(branch).toContain('v_participation.guardian_profile_id is distinct from auth.uid()');
  });

  it('requires the participation to have actually completed a commitment (status <> started) — never eligible before any declaration was recorded', () => {
    expect(sql).toContain("v_participation.status = 'started'");
  });

  it('requires BOTH child_information_authority and photograph_manufacture to be currently granted and not withdrawn, from the real persisted squad_invite_permissions audit table — never merely the client-supplied request body', () => {
    const idx = sql.indexOf('not exists (');
    const section = sql.slice(idx, sql.indexOf('not_authorized', idx));
    expect(section).toContain("purpose = 'child_information_authority'");
    expect(section).toContain("purpose = 'photograph_manufacture'");
    expect(section).toContain('granted = true');
    expect(section).toContain('withdrawn_at is null');
  });

  it('a withdrawn permission blocks eligibility — the check is withdrawn_at IS NULL, not merely granted = true, so a later revocation actually removes sharing access', () => {
    const matches = sql.match(/withdrawn_at is null/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('still enforces single-child order, non-suspended/revoked access status, and the approved Custom Collection template allowlist for the Squad Invite branch — the exact same strength as the ordinary builder path, not a relaxed version of it', () => {
    const idx = sql.indexOf("if v_order.source = 'squad_invite' then");
    const branch = sql.slice(idx, sql.indexOf('Ordinary builder path', idx));
    expect(branch).toContain("'multi_child_order'");
    expect(branch).toContain('v_card.access_status is not null');
    expect(branch).toContain("v_definition.status is distinct from 'approved'");
    expect(branch).toContain("v_definition.template_id = any(v_custom_template_ids)");
  });

  it('is still service-role/authenticated-only, security definer, empty search_path — no relaxation of the function\'s own access boundary', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('revoke all on function public.get_card_share_eligibility(uuid) from public, anon');
    expect(sql).toContain('grant execute on function public.get_card_share_eligibility(uuid) to authenticated');
  });

  it('fails closed (not_authenticated) before ever inspecting orders.source, for both paths equally', () => {
    const idx = sql.indexOf('if auth.uid() is null then');
    const sourceCheckIdx = sql.indexOf("v_order.source = 'squad_invite'");
    expect(idx).toBeGreaterThan(-1);
    expect(sourceCheckIdx).toBeGreaterThan(idx);
  });
});
