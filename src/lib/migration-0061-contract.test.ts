import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0061_squad_invite_staff_promotion.sql', 'utf8');
// The header comment legitimately explains *why* listUsers/getUserByEmail/
// grant_squad_invite_staff_permission are NOT used here — checks that
// assert those strings are absent from the executable SQL scope to the
// function body itself, not the file's own explanatory prose.
const functionBody = sql.slice(sql.indexOf('create or replace function public.promote_email_to_staff('));

describe('migration 0061 Squad Invite staff-promotion contract', () => {
  it('does not touch migrations 0050-0060', () => {
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
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('promote_email_to_staff');
    }
  });

  it('queries auth.users directly rather than the Admin API — no getUserByEmail exists to call, and listUsers would not scale', () => {
    expect(sql).toContain('from auth.users where lower(email) = lower(trim(p_email))');
    expect(functionBody).not.toMatch(/listUsers|getUserByEmail|auth\.admin/);
  });

  it('never grants a direct DML privilege on staff_accounts or auth.users — the function itself remains the only write path', () => {
    expect(sql).not.toMatch(/grant (insert|update|delete) on (public\.)?staff_accounts/);
    expect(sql).not.toMatch(/grant .* on auth\.users/);
  });

  it('upserts profiles before inserting into staff_accounts, since no signup trigger guarantees a profiles row exists', () => {
    const profilesIndex = sql.indexOf('insert into public.profiles(id)');
    const staffIndex = sql.indexOf('insert into public.staff_accounts(profile_id)');
    expect(profilesIndex).toBeGreaterThan(-1);
    expect(staffIndex).toBeGreaterThan(profilesIndex);
    expect(sql).toContain('insert into public.profiles(id) values (v_user_id) on conflict (id) do nothing');
    expect(sql).toContain('insert into public.staff_accounts(profile_id) values (v_user_id) on conflict (profile_id) do nothing');
  });

  it('reports found:false for an email with no auth.users row, rather than raising or silently doing nothing', () => {
    expect(sql).toContain("if v_user_id is null then");
    expect(sql).toContain("return jsonb_build_object('found', false);");
  });

  it('never grants a Squad Invite permission itself — that stays a separate, composable step via the existing 0060 toggles', () => {
    expect(functionBody).not.toContain('grant_squad_invite_staff_permission');
    expect(functionBody).not.toContain('squad_invite_staff_permissions');
  });

  it('is locked to service_role only, security definer, empty search_path', () => {
    expect(sql).toContain('create or replace function public.promote_email_to_staff(');
    expect(sql).toMatch(/\)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''/);
    expect(sql).toContain('alter function public.promote_email_to_staff(text) owner to postgres');
    expect(sql).toContain('revoke all on function public.promote_email_to_staff(text) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.promote_email_to_staff(text) to service_role');
  });

  it('is a single plpgsql function body — no explicit commit/rollback/savepoint', () => {
    expect(sql).not.toMatch(/\bcommit\s*;/i);
    expect(sql).not.toMatch(/\brollback\s*;/i);
    expect(sql).not.toMatch(/\bsavepoint\b/i);
  });
});
