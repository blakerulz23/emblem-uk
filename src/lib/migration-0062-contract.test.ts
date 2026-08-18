import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0062_cards_claim_reminder.sql', 'utf8');

describe('migration 0062 cards claim-reminder contract', () => {
  it('does not touch migrations 0050-0061', () => {
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
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('claim_reminder_sent_at');
    }
  });

  it('adds a nullable column with no default — never a breaking change to existing rows', () => {
    const alterStatement = sql.match(/alter table public\.cards[\s\S]*?;/)?.[0] ?? '';
    expect(alterStatement).toContain('add column claim_reminder_sent_at timestamptz');
    expect(alterStatement).not.toMatch(/not null|default/i);
  });

  it('is a single plain DDL statement — no function, no RPC, matching how this table is already written to', () => {
    expect(sql).not.toContain('create or replace function');
    expect(sql).not.toContain('security definer');
  });
});
