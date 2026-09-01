import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0081_squad_invite_payment_preview.sql', 'utf8');

describe('migration 0081 Squad Invite payment preview contract', () => {
  it('does not touch migrations 0050-0080', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0057_squad_invite_payment_request.sql',
      'supabase/migrations/0059_squad_invite_coach_card_lifecycle.sql',
      'supabase/migrations/0078_guardian_card_share_consent.sql',
      'supabase/migrations/0079_card_share_asset_proxy.sql',
      'supabase/migrations/0080_gate3_payment_state.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/resolve_squad_invite_payment_preview|payment_preview_token_hash|payment_preview_opened/);
    }
  });

  it('never touches the guardian card-sharing objects (0078/0079) or the Gate 3 payment objects (0080) — a deliberately separate mechanism', () => {
    expect(sql).not.toMatch(/get_card_share_eligibility|card_share_consent_events|begin_gate3_checkout|apply_gate3_payment_event|get_gate3_payment_status/);
  });

  it('widens the event_type constraint additively — the prior 24 values plus exactly one new one', () => {
    const priorValues = [
      'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
      'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
      'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
      'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override',
      'delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared',
      'payment_requested',
    ];
    for (const value of priorValues) expect(sql).toContain(`'${value}'`);
    expect(sql).toContain("'payment_preview_opened'");
    expect(sql).toContain('drop constraint squad_invite_audit_events_event_type_check');
  });

  it('adds payment_preview_token_hash as a nullable, uniquely-hashed column — same check shape as squad_invite_links.token_hash', () => {
    expect(sql).toContain('add column payment_preview_token_hash text unique');
    expect(sql).toContain("check (payment_preview_token_hash is null or payment_preview_token_hash ~ '^[a-f0-9]{64}$')");
  });

  it('drops the old 1-arg issue_squad_invite_payment_request before recreating it with 2 args, rather than risking a co-existing overload', () => {
    expect(sql).toContain('drop function if exists public.issue_squad_invite_payment_request(uuid);');
    expect(sql).toContain('create or replace function public.issue_squad_invite_payment_request(\n  p_participation_id uuid,\n  p_preview_token_hash text\n)');
  });

  it('sets the preview token hash in the SAME atomic update that opens the 72-hour payment window — not a second RPC call', () => {
    const fn = sql.match(/create or replace function public\.issue_squad_invite_payment_request[\s\S]*?\$\$;/)?.[0] ?? '';
    const updateBlock = fn.match(/update public\.squad_invite_participations set[\s\S]*?where id = p_participation_id;/)?.[0] ?? '';
    expect(updateBlock).toContain("status = 'payment_requested'");
    expect(updateBlock).toContain('payment_deadline_at = now() + interval \'72 hours\'');
    expect(updateBlock).toContain('payment_preview_token_hash = p_preview_token_hash');
  });

  it('issue_squad_invite_payment_request rejects a malformed preview token hash before touching any row', () => {
    const fn = sql.match(/create or replace function public\.issue_squad_invite_payment_request[\s\S]*?\$\$;/)?.[0] ?? '';
    const firstCheckIdx = fn.indexOf("raise exception 'invalid preview token hash'");
    const firstSelectIdx = fn.indexOf('select * into v_participation');
    expect(firstCheckIdx).toBeGreaterThan(-1);
    expect(firstCheckIdx).toBeLessThan(firstSelectIdx);
  });

  it('resolve_squad_invite_payment_preview fails closed (returns null) for a malformed token, an unresolved token, an ineligible status, or an expired deadline', () => {
    const fn = sql.match(/create or replace function public\.resolve_squad_invite_payment_preview[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain("if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then\n    return null;");
    expect(fn).toContain('if v_participation.id is null then\n    return null;');
    expect(fn).toContain("if v_participation.status not in ('payment_requested', 'paid') then\n    return null;");
    expect(fn).toContain('v_participation.payment_deadline_at <= now()');
  });

  it('resolve_squad_invite_payment_preview remains resolvable through a paid status, not just payment_requested — so a stale re-click after paying shows "already paid," not a dead link', () => {
    const fn = sql.match(/create or replace function public\.resolve_squad_invite_payment_preview[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain("v_participation.status not in ('payment_requested', 'paid')");
    // The deadline check is scoped to the not-yet-paid branch only.
    expect(fn).toMatch(/if v_participation\.status = 'payment_requested'\s*\n\s*and \(v_participation\.payment_deadline_at is null or v_participation\.payment_deadline_at <= now\(\)\) then/);
  });

  it('resolve_squad_invite_payment_preview never selects purchaser_email, and returns orderRef only for server-side checkout-URL rebuilding', () => {
    const fn = sql.match(/create or replace function public\.resolve_squad_invite_payment_preview[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).not.toContain('purchaser_email');
    expect(fn).toContain('select id, order_ref into v_order from public.orders');
    expect(fn).toContain("'orderRef', v_order.order_ref");
  });

  it('resolve_squad_invite_payment_preview returns only the fixed, documented field allowlist — no accidental extra columns', () => {
    const fn = sql.match(/create or replace function public\.resolve_squad_invite_payment_preview[\s\S]*?\$\$;/)?.[0] ?? '';
    const returnBlock = fn.match(/return jsonb_build_object\(([\s\S]*?)\);\nend;/)?.[0] ?? '';
    for (const key of ['status', 'teamName', 'tier', 'unitPricePence', 'printQuantity', 'totalPence', 'deadlineAt', 'orderRef', 'card']) {
      expect(returnBlock).toContain(`'${key}'`);
    }
  });

  it('the card object is built from CardFaceData-shaped fields plus a raw photoStorageKey (never a signed URL) — signing happens only in the API route', () => {
    const fn = sql.match(/create or replace function public\.resolve_squad_invite_payment_preview[\s\S]*?\$\$;/)?.[0] ?? '';
    for (const key of ['templateId', 'sport', 'name', 'number', 'team', 'position', 'logo', 'photoStorageKey', 'photoCrop', 'stats']) {
      expect(fn).toContain(`'${key}'`);
    }
    expect(fn).not.toMatch(/getSignedDownloadUrl|signed/i);
  });

  it('records a payment_preview_opened audit event on every successful resolve', () => {
    const fn = sql.match(/create or replace function public\.resolve_squad_invite_payment_preview[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toMatch(/insert into public\.squad_invite_audit_events\(campaign_id, participation_id, actor_role, event_type, metadata\)\s*\n\s*values \(v_participation\.campaign_id, v_participation\.id, 'parent', 'payment_preview_opened', '\{\}'::jsonb\);/);
  });

  it('resolve_squad_invite_payment_preview is NOT declared stable — it writes an audit event, matching resolve_squad_invite_link\'s own plain volatile shape', () => {
    expect(sql).toMatch(/create or replace function public\.resolve_squad_invite_payment_preview\(\s*\n\s*p_token_hash text\s*\n\)\s*\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''\nas \$\$/);
  });

  it('every new/changed function is locked to service_role only, security definer, empty search_path', () => {
    for (const [name, signature] of [
      ['issue_squad_invite_payment_request', '(uuid, text)'],
      ['resolve_squad_invite_payment_preview', '(text)'],
    ]) {
      expect(sql).toContain(`revoke all on function public.${name}${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${name}${signature} to service_role`);
    }
  });
});
