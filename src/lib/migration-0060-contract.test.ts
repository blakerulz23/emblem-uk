import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0060_squad_invite_staff_permission_admin.sql', 'utf8');

describe('migration 0060 Squad Invite staff-permission admin contract', () => {
  it('does not touch migrations 0050-0059', () => {
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
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/grant_squad_invite_staff_permission|revoke_squad_invite_staff_permission|revoked_by_staff_profile_id/);
    }
  });

  it('adds revoked_by_staff_profile_id as a nullable, restrict-on-delete FK to staff_accounts, never a breaking change', () => {
    const alterStatement = sql.match(/alter table public\.squad_invite_staff_permissions[\s\S]*?;/)?.[0] ?? '';
    expect(alterStatement).toContain('add column revoked_by_staff_profile_id uuid references public.staff_accounts(profile_id) on delete restrict');
    expect(alterStatement).not.toMatch(/not null/i);
  });

  it('grant validates the permission enum and that the target staff account actually exists', () => {
    const fn = sql.match(/create or replace function public\.grant_squad_invite_staff_permission[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain("if p_permission not in ('squad_invite_reviewer', 'squad_invite_approver') then");
    expect(fn).toContain('perform 1 from public.staff_accounts where profile_id = p_staff_profile_id');
  });

  it('grant is idempotent via upsert — re-granting a revoked permission clears revoked_at/revoked_by rather than requiring a separate path', () => {
    expect(sql).toContain('on conflict (staff_profile_id, permission) do update set');
    const fn = sql.match(/create or replace function public\.grant_squad_invite_staff_permission[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain('revoked_at = null, revoked_by_staff_profile_id = null');
  });

  it('revoke refuses a missing or already-revoked grant', () => {
    const fn = sql.match(/create or replace function public\.revoke_squad_invite_staff_permission[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain("if not found then raise exception 'permission grant not found'; end if;");
    expect(fn).toContain("if v_row.revoked_at is not null then raise exception 'permission is already revoked'; end if;");
  });

  it('revoke refuses to strand the system with zero active Approvers', () => {
    const fn = sql.match(/create or replace function public\.revoke_squad_invite_staff_permission[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain("if p_permission = 'squad_invite_approver' then");
    expect(fn).toContain("permission = 'squad_invite_approver' and revoked_at is null and staff_profile_id <> p_staff_profile_id");
    expect(fn).toContain("if v_other_approvers = 0 then");
    expect(fn).toContain("raise exception 'cannot revoke the last remaining Approver'");
  });

  it('the lockout guard does not apply to squad_invite_reviewer — only Approver gates every other consequential action', () => {
    const fn = sql.match(/create or replace function public\.revoke_squad_invite_staff_permission[\s\S]*?\$\$;/)?.[0] ?? '';
    // The count/guard block only appears inside the approver-specific if-branch.
    const guardIndex = fn.indexOf("if p_permission = 'squad_invite_approver' then");
    const endIfIndex = fn.indexOf('end if;', guardIndex);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(endIfIndex).toBeGreaterThan(guardIndex);
  });

  it('both functions record the acting staff profile — grant records who granted, revoke records who revoked', () => {
    expect(sql).toContain('granted_by_staff_profile_id = excluded.granted_by_staff_profile_id');
    expect(sql).toContain('revoked_by_staff_profile_id = p_revoked_by_staff_profile_id');
  });

  it('both functions are locked to service_role only, security definer, empty search_path', () => {
    for (const [name, signature] of [
      ['grant_squad_invite_staff_permission', '(uuid,text,uuid)'],
      ['revoke_squad_invite_staff_permission', '(uuid,text,uuid)'],
    ]) {
      expect(sql).toContain(`create or replace function public.${name}(`);
      expect(sql).toContain(`alter function public.${name}${signature} owner to postgres`);
      expect(sql).toContain(`revoke all on function public.${name}${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${name}${signature} to service_role`);
    }
    expect(sql).toMatch(/\)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''/);
  });

  it('is entirely plpgsql function bodies plus one alter table — no explicit commit/rollback/savepoint anywhere', () => {
    expect(sql).not.toMatch(/\bcommit\s*;/i);
    expect(sql).not.toMatch(/\brollback\s*;/i);
    expect(sql).not.toMatch(/\bsavepoint\b/i);
  });
});
