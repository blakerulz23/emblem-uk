import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0078_guardian_card_share_consent.sql', 'utf8');

describe('migration 0078 guardian card share consent contract', () => {
  it('is transactional', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('never stores the generated image, or a name/email/phone — only ids, a version reference, and a fixed result enum', () => {
    const idx = sql.indexOf('create table public.card_share_consent_events');
    const section = sql.slice(idx, sql.indexOf(');', idx) + 2);
    expect(section).not.toMatch(/\bimage\b/i);
    expect(section).not.toMatch(/\bname\b/i);
    expect(section).not.toMatch(/\bemail\b/i);
    expect(section).not.toMatch(/\bphone\b/i);
    expect(section).toContain("result text not null check (result in ('confirmed', 'cancelled'))");
  });

  it('card_share_consent_events explicitly revokes the default ACL before granting only select+insert to service_role', () => {
    const idx = sql.indexOf('create table public.card_share_consent_events');
    const section = sql.slice(idx, idx + 2500);
    expect(section).toContain('revoke all on public.card_share_consent_events from public, anon, authenticated, service_role');
    expect(section).toContain('grant select, insert on public.card_share_consent_events to service_role');
    expect(section).not.toMatch(/grant\s+(?:[\w, ]*\b(update|delete)\b[\w, ]*)\s+on\s+public\.card_share_consent_events/i);
  });

  it('card_share_consent_events has RLS enabled with no policies (service-role only)', () => {
    expect(sql).toContain('alter table public.card_share_consent_events enable row level security');
    expect(sql).not.toMatch(/create\s+policy[\s\S]*?card_share_consent_events/i);
  });

  it('get_card_share_eligibility requires auth.uid() and fails closed to eligible:false, never throws for an ordinary ineligible case', () => {
    const idx = sql.indexOf('create or replace function public.get_card_share_eligibility');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain('if auth.uid() is null then');
    expect(section).toContain("jsonb_build_object('eligible', false, 'reason', 'not_authenticated')");
  });

  it('eligibility requires authority_status = confirmed — guardian_approved is explicitly excluded, not merely absent', () => {
    const idx = sql.indexOf('create or replace function public.get_card_share_eligibility');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain("v_order.authority_status is distinct from 'confirmed'");
  });

  it('eligibility requires auth.uid() to match the declaring adult, the parent_guardian relationship, and confirmed_photo_permission', () => {
    const idx = sql.indexOf('create or replace function public.get_card_share_eligibility');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain('v_declaration.adult_user_id is distinct from auth.uid()');
    expect(section).toContain("v_declaration.relationship is distinct from 'parent_guardian'");
    expect(section).toContain('v_declaration.confirmed_photo_permission is distinct from true');
  });

  it('a multi-card (whole-team) order is hidden, proven by a server-side row count, never a client-supplied order type', () => {
    const idx = sql.indexOf('create or replace function public.get_card_share_eligibility');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain('select count(*) into v_card_count from public.cards where order_id = p_order_id');
    expect(section).toContain('v_card_count is distinct from 1');
    expect(section).not.toMatch(/p_order_type|p_single|orderType/i);
  });

  it('a suspended or revoked card is blocked — this single check also covers a pending deletion request (0076 suspends on filing)', () => {
    const idx = sql.indexOf('create or replace function public.get_card_share_eligibility');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain('v_card.access_status is not null');
  });

  it('only an explicit Custom Collection template allowlist is eligible — Official/licensed designs are excluded by default (allowlist, not blocklist)', () => {
    const idx = sql.indexOf('create or replace function public.get_card_share_eligibility');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain("array['custom-solar', 'custom-galaxy', 'custom-comic']");
    expect(section).toContain('v_definition.template_id = any(v_custom_template_ids)');
    expect(section).not.toMatch(/emjfl-official|hollinwood/i);
  });

  it('requires the card_definitions row to be approved, not a stray draft', () => {
    const idx = sql.indexOf('create or replace function public.get_card_share_eligibility');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain("v_definition.status is distinct from 'approved'");
  });

  it('get_card_share_eligibility is granted to authenticated, not anon', () => {
    expect(sql).toContain('revoke all on function public.get_card_share_eligibility(uuid) from public, anon');
    expect(sql).toContain('grant execute on function public.get_card_share_eligibility(uuid) to authenticated');
  });

  it('record_card_share_consent requires auth.uid(), and re-derives eligibility itself for a confirmed result rather than trusting the caller', () => {
    const idx = sql.indexOf('create or replace function public.record_card_share_consent');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    expect(section).toContain('if auth.uid() is null then');
    expect(section).toContain('raise exception \'Not authenticated\'');
    expect(section).toContain('v_eligibility := public.get_card_share_eligibility(p_order_id);');
    expect(section).toContain("if (v_eligibility ->> 'eligible')::boolean is not true then");
  });

  it('a cancelled result is recorded without ever running the eligibility check or ever being treated as permission to share', () => {
    const idx = sql.indexOf('create or replace function public.record_card_share_consent');
    const section = sql.slice(idx, sql.indexOf('$$;', idx));
    const cancelBranchIdx = section.indexOf("if p_result = 'cancelled' then");
    const eligibilityIdx = section.indexOf('v_eligibility := public.get_card_share_eligibility');
    expect(cancelBranchIdx).toBeGreaterThan(-1);
    expect(eligibilityIdx).toBeGreaterThan(cancelBranchIdx);
    expect(section).toContain("values (p_order_id, auth.uid(), p_consent_version, 'cancelled')");
  });

  it('record_card_share_consent is granted to authenticated, not anon', () => {
    expect(sql).toContain('revoke all on function public.record_card_share_consent(uuid, text, text) from public, anon');
    expect(sql).toContain('grant execute on function public.record_card_share_consent(uuid, text, text) to authenticated');
  });

  it('no function in this migration ever calls pgcrypto digest() — this codebase avoids it under search_path=\'\'', () => {
    const withoutComments = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    expect(withoutComments).not.toMatch(/\bdigest\s*\(/i);
  });
});
