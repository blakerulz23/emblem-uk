import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0063_squad_invite_photo_moderation.sql', 'utf8');

describe('migration 0063 squad invite photo moderation contract', () => {
  it('does not touch migrations 0050-0062', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0051_squad_invite_reusable_links.sql',
      'supabase/migrations/0052_squad_invite_review_foundation.sql',
      'supabase/migrations/0053_squad_invite_append_only_history.sql',
      'supabase/migrations/0054_squad_invite_concurrent_submission_idempotency.sql',
      'supabase/migrations/0055_squad_invite_order_commitment.sql',
      'supabase/migrations/0056_squad_invite_organiser_concern_flag.sql',
      'supabase/migrations/0057_squad_invite_payment_request.sql',
      'supabase/migrations/0058_squad_invite_payment_mode_flip.sql',
      'supabase/migrations/0059_squad_invite_coach_card_lifecycle.sql',
      'supabase/migrations/0060_squad_invite_staff_permission_admin.sql',
      'supabase/migrations/0061_squad_invite_staff_promotion.sql',
      'supabase/migrations/0062_cards_claim_reminder.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('reject_squad_invite_card_photo');
    }
  });

  it('widens card_definitions.status to allow rejected, keeping draft/approved', () => {
    const statement = sql.match(/alter table public\.card_definitions[\s\S]*?;/)?.[0] ?? '';
    expect(statement).toContain("check (status in ('draft', 'approved', 'rejected'))");
  });

  it('widens the audit event_type check by exactly one new value, photo_rejected, appended last', () => {
    const statement = sql.match(/alter table public\.squad_invite_audit_events[\s\S]*?;/)?.[0] ?? '';
    expect(statement).toContain("'coach_card_changes_requested',\n      'photo_rejected'");
    // every value from the live 0059 array must still be present, untouched
    for (const value of [
      'campaign_created', 'fulfilment_started', 'coach_card_submitted', 'coach_card_locked', 'coach_card_changes_requested',
    ]) {
      expect(statement).toContain(`'${value}'`);
    }
  });

  it('the reject function is security definer with a locked-down search_path, and refuses privilege to anon/authenticated', () => {
    const fnBody = sql.slice(sql.indexOf('create or replace function public.reject_squad_invite_card_photo'));
    expect(fnBody).toContain('security definer');
    expect(fnBody).toContain("set search_path = ''");
    expect(fnBody).toContain('revoke all on function public.reject_squad_invite_card_photo(uuid,uuid,text) from public, anon, authenticated');
    expect(fnBody).toContain('grant execute on function public.reject_squad_invite_card_photo(uuid,uuid,text) to service_role');
  });

  it('refuses to reject a photo once the order is already fulfilled (approved)', () => {
    const fnBody = sql.slice(sql.indexOf('create or replace function public.reject_squad_invite_card_photo'));
    expect(fnBody).toContain("v_order.payment_status = 'fulfilled'");
  });

  it('rejects the whole order (all card_definitions rows), not a single player row', () => {
    const fnBody = sql.slice(sql.indexOf('create or replace function public.reject_squad_invite_card_photo'));
    expect(fnBody).toContain("update public.card_definitions set status = 'rejected' where order_id = p_order_id;");
  });
});
