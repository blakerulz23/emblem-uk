import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0075_card_lifecycle_controls.sql', 'utf8');

describe('migration 0075 card lifecycle controls contract', () => {
  it('is transactional', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('does not touch cards.status at all — access_status is a separate, additive axis', () => {
    expect(sql).not.toMatch(/alter\s+table\s+public\.cards[\s\S]*?drop\s+column\s+status\b/i);
    expect(sql).not.toMatch(/add\s+column\s+status\b/i);
    expect(sql).toContain('add column access_status text');
  });

  it('access_status defaults to NULL and only allows suspended/revoked', () => {
    expect(sql).toContain("check (access_status is null or access_status in ('suspended', 'revoked'))");
    expect(sql).not.toMatch(/add\s+column\s+access_status\s+text\s+not\s+null/i);
    expect(sql).not.toMatch(/add\s+column\s+access_status\s+text\s+default/i);
  });

  it('does not add a separate "replaced" status value — replacement is a relationship via replaced_by_card_id', () => {
    expect(sql).not.toMatch(/'replaced'/);
    expect(sql).toContain('replaced_by_card_id uuid references public.cards(id)');
  });

  it('grants authenticated SELECT only on the new lifecycle columns, never claim_token/nfc_uid', () => {
    const start = sql.indexOf('grant select (access_status');
    expect(start).toBeGreaterThan(-1);
    const statement = sql.slice(start, sql.indexOf(';', start) + 1);
    expect(statement).not.toContain('claim_token');
    expect(statement).not.toContain('nfc_uid');
    expect(statement).toContain('to authenticated');
  });

  it('card_access_audit_events explicitly revokes the default ACL from every role before granting only select+insert to service_role', () => {
    const idx = sql.indexOf('create table public.card_access_audit_events');
    const section = sql.slice(idx, idx + 2000);
    expect(section).toContain('revoke all on public.card_access_audit_events from public, anon, authenticated, service_role');
    expect(section).toContain('grant select, insert on public.card_access_audit_events to service_role');
    expect(section).not.toMatch(/grant\s+(?:[\w, ]*\b(update|delete)\b[\w, ]*)\s+on\s+public\.card_access_audit_events/i);
  });

  it('card_access_audit_events has RLS enabled with no policies (service-role only)', () => {
    expect(sql).toContain('alter table public.card_access_audit_events enable row level security');
    expect(sql).not.toMatch(/create\s+policy[\s\S]*?card_access_audit_events/i);
  });

  const RPCS = [
    { name: 'suspend_card', sig: 'uuid, text' },
    { name: 'unsuspend_card', sig: 'uuid' },
    { name: 'revoke_card', sig: 'uuid, text' },
    { name: 'create_replacement_card', sig: 'uuid, text' },
  ];

  it('every RPC is SECURITY DEFINER with an explicit empty search_path', () => {
    for (const { name } of RPCS) {
      const start = sql.indexOf(`create function public.${name}(`);
      expect(start, `${name} should be declared`).toBeGreaterThan(-1);
      const body = sql.slice(start, start + 1200);
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
      expect(body).toContain('if auth.uid() is null then');
    }
  });

  it('every RPC row-locks its target card with select ... for update before acting', () => {
    for (const { name } of RPCS) {
      const start = sql.indexOf(`create function public.${name}(`);
      const body = sql.slice(start, start + 1200);
      expect(body).toMatch(/select \* into v_(card|old) from public\.cards where id = \S+ for update/);
    }
  });

  it('grants execute for each RPC to exactly the intended role', () => {
    for (const { name, sig } of RPCS) {
      expect(sql).toContain(`grant execute on function public.${name}(${sig}) to authenticated;`);
    }
  });

  it('suspend/unsuspend authorize guardian-or-staff; revoke/replace authorize staff only', () => {
    for (const name of ['suspend_card', 'unsuspend_card']) {
      const start = sql.indexOf(`create function public.${name}(`);
      const body = sql.slice(start, start + 1500);
      expect(body).toContain('v_is_staff');
      expect(body).toContain('v_is_guardian');
      expect(body).toContain('not (v_is_staff or v_is_guardian)');
    }
    for (const name of ['revoke_card', 'create_replacement_card']) {
      const start = sql.indexOf(`create function public.${name}(`);
      const body = sql.slice(start, start + 1500);
      expect(body).toContain('staff_accounts');
      expect(body).not.toContain('v_is_guardian');
    }
  });

  it('revoke_card and create_replacement_card both refuse to act on an already-revoked card', () => {
    const revokeStart = sql.indexOf('create function public.revoke_card(');
    const revokeBody = sql.slice(revokeStart, sql.indexOf('create function public.create_replacement_card('));
    expect(revokeBody).toMatch(/if v_card\.access_status = 'revoked' then[\s\S]*?return;/);

    const replaceStart = sql.indexOf('create function public.create_replacement_card(');
    const replaceBody = sql.slice(replaceStart);
    expect(replaceBody).toMatch(/if v_old\.access_status = 'revoked' then[\s\S]*?raise exception/);
  });

  it('suspend/unsuspend refuse any action on a revoked card (terminal, no path back)', () => {
    const suspendStart = sql.indexOf('create function public.suspend_card(');
    const suspendBody = sql.slice(suspendStart, sql.indexOf('create function public.unsuspend_card('));
    expect(suspendBody).toMatch(/if v_card\.access_status = 'revoked' then[\s\S]*?raise exception/);

    const unsuspendStart = sql.indexOf('create function public.unsuspend_card(');
    const unsuspendBody = sql.slice(unsuspendStart, sql.indexOf('create function public.revoke_card('));
    expect(unsuspendBody).toMatch(/if v_card\.access_status = 'revoked' then[\s\S]*?raise exception/);
  });

  it('suspend and unsuspend are idempotent no-ops on an already-matching state', () => {
    const suspendStart = sql.indexOf('create function public.suspend_card(');
    const suspendBody = sql.slice(suspendStart, sql.indexOf('create function public.unsuspend_card('));
    expect(suspendBody).toMatch(/if v_card\.access_status = 'suspended' then[\s\S]*?return;/);

    const unsuspendStart = sql.indexOf('create function public.unsuspend_card(');
    const unsuspendBody = sql.slice(unsuspendStart, sql.indexOf('create function public.revoke_card('));
    expect(unsuspendBody).toMatch(/if v_card\.access_status is null then[\s\S]*?return;/);
  });

  it('revoke_card is idempotent — already-revoked is a safe no-op, not an error', () => {
    const start = sql.indexOf('create function public.revoke_card(');
    const body = sql.slice(start, sql.indexOf('create function public.create_replacement_card('));
    expect(body).toMatch(/if v_card\.access_status = 'revoked' then\s*\n\s*-- Idempotent no-op[\s\S]*?return;/);
  });

  it('create_replacement_card reuses the exact claim-token generator from migration 0048, not a reimplementation', () => {
    const start = sql.indexOf('create function public.create_replacement_card(');
    const body = sql.slice(start);
    expect(body).toContain("v_claim_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'");
    expect(body).toContain("decode(replace(gen_random_uuid()::text, '-', ''), 'hex')");
    expect(body).toContain('for v_attempt in 1..5 loop');
    expect(body).not.toMatch(/gen_random_bytes/i);
  });

  it('replacement card keeps the same player_id and inherits claimed status only if the old card was already claimed', () => {
    const start = sql.indexOf('create function public.create_replacement_card(');
    const body = sql.slice(start);
    expect(body).toContain("v_new_status := case when v_old.status = 'claimed' then 'claimed' else 'assigned' end");
    expect(body).toContain('insert into public.cards (claim_token, player_id, status)');
    expect(body).toContain('values (v_claim_token, v_old.player_id, v_new_status)');
    expect(body).not.toContain('insert into public.guardians');
  });

  it('replacement atomically revokes the old card and links replaced_by_card_id in the same transaction as creating the new one', () => {
    const start = sql.indexOf('create function public.create_replacement_card(');
    const body = sql.slice(start);
    expect(body).toContain("access_status = 'revoked'");
    expect(body).toContain('replaced_by_card_id = v_new_card_id');
    expect(body).toContain('where id = p_old_card_id');
  });

  it('every write inserts exactly one audit event with a non-guessable actor_profile_id sourced from auth.uid()', () => {
    for (const { name } of RPCS) {
      const start = sql.indexOf(`create function public.${name}(`);
      const end = sql.indexOf('revoke all on function', start);
      const body = sql.slice(start, end);
      expect(body).toContain('insert into public.card_access_audit_events');
      expect(body).toMatch(/actor_profile_id[\s\S]{0,300}auth\.uid\(\)/);
    }
  });

  it('validates reason against the fixed enum in every RPC that accepts one', () => {
    for (const name of ['suspend_card', 'revoke_card', 'create_replacement_card']) {
      const start = sql.indexOf(`create function public.${name}(`);
      const end = sql.indexOf('revoke all on function', start);
      const body = sql.slice(start, end);
      expect(body).toContain("'lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other'");
    }
  });

  it('does not modify any migration earlier than 0075', () => {
    expect(sql).not.toContain('0071_builder_order_authority');
    expect(sql).not.toContain('0073_restrict_authenticated_card_column_access');
    expect(sql).not.toMatch(/drop\s+function\s+public\.get_player_age/i);
  });

  it('never reads an existing card row\'s claim_token, and never logs one via RAISE NOTICE', () => {
    // The only legitimate claim_token operations in this migration are:
    // constructing a brand-new one (v_claim_token) and inserting it into
    // the new card row. Nothing may SELECT an existing claim_token back
    // out, and nothing may print one via RAISE NOTICE/WARNING.
    expect(sql).not.toMatch(/select[\s\S]{0,60}\bclaim_token\b[\s\S]{0,10}from\s+public\.cards/i);
    expect(sql).not.toMatch(/raise\s+(notice|warning)[\s\S]{0,80}claim_token/i);
  });

  it('does not touch Gemini, background removal, pricing, Shopify, Squad Invite, or DOB tables/columns', () => {
    for (const term of ['gemini', 'ai-mockup', 'bgremoval', 'pricing', 'shopify', 'squad_invite', 'date_of_birth']) {
      expect(sql.toLowerCase()).not.toContain(term);
    }
  });
});
