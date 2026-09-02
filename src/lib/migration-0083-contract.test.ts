import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0083_squad_invite_ready_to_finalise_notification.sql', 'utf8');

describe('migration 0083 squad-invite-ready-to-finalise notification contract', () => {
  it('does not touch migrations 0050-0082, including the staff-notification outbox table/RPC definitions themselves', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0052_squad_invite_review_foundation.sql',
      'supabase/migrations/0078_guardian_card_share_consent.sql',
      'supabase/migrations/0079_card_share_asset_proxy.sql',
      'supabase/migrations/0080_gate3_payment_state.sql',
      'supabase/migrations/0081_squad_invite_payment_preview.sql',
      'supabase/migrations/0082_staff_notification_outbox.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/squad_invite_ready_to_finalise/);
    }
  });

  it('looks up the existing event_type check constraint by definition rather than assuming its auto-generated name', () => {
    expect(sql).toContain("contype = 'c'");
    expect(sql).toContain("pg_get_constraintdef(oid) like '%event_type%'");
    expect(sql).toContain("execute format('alter table public.staff_notification_outbox drop constraint %I', v_constraint_name)");
  });

  it('re-adds the constraint with all 11 original values plus the new one — 12 total, no fewer', () => {
    const values = [
      'new_squad_invite_request', 'deletion_request_filed', 'auth_deletion_stuck',
      'new_order_pending_approval', 'payment_verification_failed', 'finalise_pricing_issues',
      'organiser_concern_flagged', 'coach_card_submitted', 'squad_invite_payments_overdue',
      'organiser_notification_failed', 'upload_sweep_errors', 'squad_invite_ready_to_finalise',
    ];
    for (const value of values) expect(sql).toContain(`'${value}'`);
    const constraintBlock = sql.match(/add constraint staff_notification_outbox_event_type_check check \(event_type in \(([\s\S]*?)\)\)/)?.[1] ?? '';
    const matched = constraintBlock.match(/'[a-z_]+'/g) ?? [];
    expect(matched).toHaveLength(values.length);
  });

  it('does not touch the outbox table, RPC, grants, or RLS from 0082 — only the check constraint', () => {
    expect(sql).not.toMatch(/create table|enqueue_staff_notification\(|grant |revoke |enable row level security/);
  });
});
