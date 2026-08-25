import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0078_guardian_card_share_consent.sql', 'utf8');

describe('migration 0078 guardian card-share consent contract', () => {
  it('is transactional', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('does not modify migration 0071, 0075, 0076, or 0077', () => {
    for (const earlier of ['0071_builder_order_authority', '0075_card_lifecycle_controls', '0076_child_data_erasure', '0077_cleanup_deletion_table_grants']) {
      expect(sql).not.toContain(earlier);
    }
  });

  it('the artwork-rights allowlist ships empty — no seeded rows, and every write path other than direct service-role access is closed', () => {
    expect(sql).not.toMatch(/insert into public\.card_social_share_asset_rights/i);
    const idx = sql.indexOf('create table public.card_social_share_asset_rights');
    const section = sql.slice(idx, sql.indexOf('create function public.card_social_sharing_allowed'));
    expect(section).toContain('revoke all on public.card_social_share_asset_rights from public, anon, authenticated, service_role');
    expect(section).toContain('grant select, insert on public.card_social_share_asset_rights to service_role');
    // No RPC anywhere in this migration is granted the ability to write to
    // this table — insert is only ever a direct service-role SQL action.
    expect(section).not.toMatch(/grant\s+[\s\S]*?\bto\s+authenticated\b/i);
  });

  it('card_social_sharing_allowed excludes uploaded artwork outright, regardless of the allowlist', () => {
    const start = sql.indexOf('create function public.card_social_sharing_allowed(');
    const body = sql.slice(start, sql.indexOf('create table public.card_share_consents'));
    expect(body).toContain("v_logo_json ->> 'source' = 'upload'");
    expect(body).toContain('if v_is_upload then');
    expect(body).toContain('return false');
  });

  it('card_social_sharing_allowed defaults to false — the only true path requires a matching allowlist row', () => {
    const start = sql.indexOf('create function public.card_social_sharing_allowed(');
    const body = sql.slice(start, sql.indexOf('create table public.card_share_consents'));
    expect(body).toContain('if v_template_id is null then');
    expect(body).toMatch(/return exists \(\s*select 1 from public\.card_social_share_asset_rights/);
  });

  it('card_social_sharing_allowed is SECURITY DEFINER with an explicit empty search_path', () => {
    const start = sql.indexOf('create function public.card_social_sharing_allowed(');
    const body = sql.slice(start, start + 400);
    expect(body).toContain('security definer');
    expect(body).toContain("set search_path = ''");
  });

  it('card_share_consents is append-only: RLS enabled, zero grants to any role including service_role, no update/delete grant anywhere', () => {
    const idx = sql.indexOf('create table public.card_share_consents');
    const section = sql.slice(idx, sql.indexOf('create function public.record_card_share_consent'));
    expect(section).toContain('enable row level security');
    expect(section).toContain('revoke all on public.card_share_consents from public, anon, authenticated, service_role');
    expect(section).not.toMatch(/grant\s+[\s\S]*?\bon\s+public\.card_share_consents\b/i);
  });

  it('card_share_consents requires both confirmations at the constraint level, not just application trust', () => {
    const idx = sql.indexOf('create table public.card_share_consents');
    const section = sql.slice(idx, sql.indexOf('create function public.record_card_share_consent'));
    expect(section).toContain('card_share_consents_confirmations_required');
    expect(section).toMatch(/check \(\s*confirmed_authority and confirmed_recall_understanding\s*\)/);
  });

  it('card_share_consents does not duplicate any player name, photo, team, or club column — only a hash and reference ids', () => {
    const idx = sql.indexOf('create table public.card_share_consents');
    const section = sql.slice(idx, sql.indexOf(');', idx));
    for (const forbidden of ['name text', 'photo ', 'team text', 'club text', 'player_id']) {
      expect(section.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(section).toContain('card_version_hash');
  });

  it('record_card_share_consent is SECURITY DEFINER with an explicit empty search_path, and fails closed on an unauthenticated caller', () => {
    const start = sql.indexOf('create function public.record_card_share_consent(');
    const body = sql.slice(start, sql.indexOf('revoke all on function public.record_card_share_consent'));
    expect(body).toContain('security definer');
    expect(body).toContain("set search_path = ''");
    expect(body).toContain('if auth.uid() is null then');
  });

  it('record_card_share_consent takes only order_id and the two confirmation booleans from the client — no card_definition_id, guardian id, authority status, or hash parameter', () => {
    const sigStart = sql.indexOf('create function public.record_card_share_consent(');
    const sigEnd = sql.indexOf(')', sql.indexOf('p_consent_wording_version text', sigStart));
    const signature = sql.slice(sigStart, sigEnd + 1);
    expect(signature).toContain('p_order_id uuid');
    expect(signature).toContain('p_confirmed_authority boolean');
    expect(signature).toContain('p_confirmed_recall_understanding boolean');
    expect(signature).toContain('p_consent_wording_version text');
    expect(signature).not.toMatch(/p_card_definition_id|p_guardian|p_authority_status|p_hash|p_card_version_hash/);
  });

  it('record_card_share_consent derives card_definition_id, guardian_user_id, and the hash entirely server-side', () => {
    const start = sql.indexOf('create function public.record_card_share_consent(');
    const end = sql.indexOf('revoke all on function public.record_card_share_consent');
    const body = sql.slice(start, end);
    expect(body).toContain('from public.card_definitions');
    expect(body).toContain('where order_id = p_order_id');
    expect(body).toContain('auth.uid()');
    expect(body).toMatch(/v_hash := md5\(/);
  });

  it('record_card_share_consent checks artwork-sharing rights before authority, and never bypasses it', () => {
    const start = sql.indexOf('create function public.record_card_share_consent(');
    const end = sql.indexOf('revoke all on function public.record_card_share_consent');
    const body = sql.slice(start, end);
    const rightsIdx = body.indexOf('card_social_sharing_allowed');
    const authorityIdx = body.indexOf('Authority path 1');
    expect(rightsIdx).toBeGreaterThan(-1);
    expect(authorityIdx).toBeGreaterThan(rightsIdx);
    expect(body).toContain('not cleared for social sharing');
  });

  it('record_card_share_consent accepts only the squad-invite-committed-guardian and builder-confirmed-guardian authority paths — never guardian_approval_pending or guardian_approved', () => {
    const start = sql.indexOf('create function public.record_card_share_consent(');
    const end = sql.indexOf('revoke all on function public.record_card_share_consent');
    const body = sql.slice(start, end);
    expect(body).toContain("guardian_profile_id = auth.uid()");
    expect(body).toContain('commitment_completed_at is not null');
    expect(body).toContain("status not in ('cancelled', 'refunded', 'reversed', 'exception')");
    expect(body).toContain("d.adult_user_id = auth.uid()");
    expect(body).toContain("d.relationship = 'parent_guardian'");
    expect(body).toContain("o.authority_status = 'confirmed'");
    expect(body).not.toContain('guardian_approval_pending');
    expect(body).not.toMatch(/authority_status = 'guardian_approved'/);
  });

  it('record_card_share_consent raises when neither authority path resolves — never inserts a consent row without one', () => {
    const start = sql.indexOf('create function public.record_card_share_consent(');
    const end = sql.indexOf('revoke all on function public.record_card_share_consent');
    const body = sql.slice(start, end);
    const failIdx = body.indexOf("raise exception 'Not authorized to share this card'");
    const insertIdx = body.indexOf('insert into public.card_share_consents');
    expect(failIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(failIdx);
  });

  it('record_card_share_consent grants execute only to authenticated, never public, anon, or service_role', () => {
    const revokeIdx = sql.indexOf('revoke all on function public.record_card_share_consent(uuid, boolean, boolean, text)');
    const revokeLine = sql.slice(revokeIdx, sql.indexOf(';', revokeIdx) + 1);
    expect(revokeLine).toContain('public, anon');
    const grantIdx = sql.indexOf('grant execute on function public.record_card_share_consent(uuid, boolean, boolean, text)');
    const grantLine = sql.slice(grantIdx, sql.indexOf(';', grantIdx) + 1);
    expect(grantLine).toContain('to authenticated');
    expect(grantLine).not.toContain('service_role');
  });

  it('does not touch Gemini, background removal, cropping, print, pricing, Shopify, or storage-object tables', () => {
    for (const term of ['gemini', 'bgremoval', 'ai-mockup', 'imgly', 'print_capture', 'pricing_engine', 'shopify', 'player_deletion_storage_objects', 'squad_invite_participation_assets']) {
      expect(sql.toLowerCase()).not.toContain(term);
    }
  });
});
