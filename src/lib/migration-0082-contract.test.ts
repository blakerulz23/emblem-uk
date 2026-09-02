import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0082_staff_notification_outbox.sql', 'utf8');

describe('migration 0082 staff notification outbox contract', () => {
  it('does not touch migrations 0050-0081, including the guardian card-sharing (0078/0079), Gate 3 (0080), and payment-preview (0081) objects', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0052_squad_invite_review_foundation.sql',
      'supabase/migrations/0078_guardian_card_share_consent.sql',
      'supabase/migrations/0079_card_share_asset_proxy.sql',
      'supabase/migrations/0080_gate3_payment_state.sql',
      'supabase/migrations/0081_squad_invite_payment_preview.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/staff_notification_outbox|enqueue_staff_notification/);
    }
  });

  it('defines the full, exact event_type allowlist — 11 values, no more, no fewer', () => {
    const values = [
      'new_squad_invite_request', 'deletion_request_filed', 'auth_deletion_stuck',
      'new_order_pending_approval', 'payment_verification_failed', 'finalise_pricing_issues',
      'organiser_concern_flagged', 'coach_card_submitted', 'squad_invite_payments_overdue',
      'organiser_notification_failed', 'upload_sweep_errors',
    ];
    for (const value of values) expect(sql).toContain(`'${value}'`);
    const constraintBlock = sql.match(/event_type text not null check \(event_type in \(([\s\S]*?)\)\)/)?.[1] ?? '';
    const matched = constraintBlock.match(/'[a-z_]+'/g) ?? [];
    expect(matched).toHaveLength(values.length);
  });

  it('scopes recipients to exactly the three defined values', () => {
    expect(sql).toContain("recipient_scope text not null check (recipient_scope in ('all_staff', 'squad_invite_reviewer', 'squad_invite_approver'))");
  });

  it('event_key is unique — the idempotency guarantee the enqueue RPC relies on', () => {
    expect(sql).toContain('event_key text not null unique');
  });

  it('is service-role only — RLS enabled, no policies, revoked from anon/authenticated', () => {
    expect(sql).toContain('alter table public.staff_notification_outbox enable row level security');
    expect(sql).not.toMatch(/create policy.*staff_notification_outbox/);
    expect(sql).toContain('revoke all on public.staff_notification_outbox from public, anon, authenticated');
    expect(sql).toContain('grant select, insert, update on public.staff_notification_outbox to service_role');
  });

  it('enqueue_staff_notification is idempotent via ON CONFLICT DO NOTHING, returning null (not the existing row) on a repeat event_key', () => {
    const fn = sql.match(/create or replace function public\.enqueue_staff_notification[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain('on conflict (event_key) do nothing');
    expect(fn).toContain('returning id into v_id');
    expect(fn).toContain('return v_id;');
  });

  it('enqueue_staff_notification is locked to service_role only, security definer, empty search_path', () => {
    expect(sql).toContain('create or replace function public.enqueue_staff_notification(');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('alter function public.enqueue_staff_notification(text, text, uuid, text, jsonb, text) owner to postgres');
    expect(sql).toContain('revoke all on function public.enqueue_staff_notification(text, text, uuid, text, jsonb, text) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.enqueue_staff_notification(text, text, uuid, text, jsonb, text) to service_role');
  });
});
