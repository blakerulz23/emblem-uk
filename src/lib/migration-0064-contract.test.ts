import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0064_squad_invite_payment_mode_revert.sql', 'utf8');

describe('migration 0064 squad invite payment mode revert contract', () => {
  it('does not touch migrations 0050-0063', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0051_squad_invite_reusable_links.sql',
      'supabase/migrations/0052_squad_invite_review_foundation.sql',
      'supabase/migrations/0053_squad_invite_append_only_history.sql',
      'supabase/migrations/0054_squad_invite_concurrent_submission_idempotency.sql',
      'supabase/migrations/0055_squad_invite_order_commitment.sql',
      'supabase/migrations/0056_squad_invite_organiser_concern_flag.sql',
      'supabase/migrations/0057_squad_invite_payment_request.sql',
      'supabase/migrations/0059_squad_invite_coach_card_lifecycle.sql',
      'supabase/migrations/0060_squad_invite_staff_permission_admin.sql',
      'supabase/migrations/0061_squad_invite_staff_promotion.sql',
      'supabase/migrations/0062_cards_claim_reminder.sql',
      'supabase/migrations/0063_squad_invite_photo_moderation.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('0064');
    }
  });

  it('reverts squad_invite_payment_mode_enabled to false, same signature/grants/security posture as 0058', () => {
    expect(sql).toContain('as $$ select false; $$;');
    expect(sql).toContain('language sql');
    expect(sql).toContain('stable');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('revoke all on function public.squad_invite_payment_mode_enabled() from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.squad_invite_payment_mode_enabled() to service_role;');
  });

  it('is a single function replacement — no new table, no constraint widening', () => {
    expect(sql).not.toContain('create table');
    expect(sql).not.toContain('alter table');
  });
});
