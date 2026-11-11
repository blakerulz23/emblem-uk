import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0097_coach_account_deletion_verified_moments.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/0097_rollback.sql', 'utf8');
const m0076 = readFileSync('supabase/migrations/0076_child_data_erasure.sql', 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');
const rollbackCode = rollback.replace(/^\s*--.*$/gm, '');

const FN_START = 'create or replace function public.delete_own_guardian_account()';
const FN_END = 'grant execute on function public.delete_own_guardian_account() to authenticated;';
const fnOf = (text: string) => text.slice(text.indexOf(FN_START), text.indexOf(FN_END) + FN_END.length);
const OLD_STATEMENT = '  update public.moments set verified_by = null where verified_by = v_uid;';

/**
 * 0097 lets a coach who verified moments or sent recognitions delete their
 * account, keeping the child's coach_verified moments. Its behaviour (the
 * defect at 0096, every deletion path after 0097, the constraint, who can set
 * the marker, apply/re-run/rollback) is proven against a production-matched
 * PostgreSQL in supabase/tests/authz/migration_0097_test.mjs. This file is
 * the structural half that runs with npm test.
 */
describe('migration 0097 — coach account deletion keeps coach-verified moments', () => {
  it('runs in one transaction, with the precondition before any change', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
    const precondition = code.indexOf('do $$');
    const firstChange = code.search(/^alter\b/im);
    expect(precondition).toBeGreaterThan(0);
    expect(precondition).toBeLessThan(firstChange);
    expect(code).toContain('0097 refused: the expected state is not in place');
    expect(code).toContain('(0097 already applied)');
  });

  it('changes delete_own_guardian_account only in the one moments.verified_by statement', () => {
    const before = fnOf(m0076);
    const after = fnOf(sql);
    expect(before).toContain(OLD_STATEMENT);
    expect(after).not.toContain(OLD_STATEMENT);
    const [head, tail] = before.split(OLD_STATEMENT + '\n');
    expect(after.startsWith(head)).toBe(true);
    expect(after.endsWith(tail)).toBe(true);
    const replaced = after.slice(head.length, after.length - tail.length);
    expect(replaced.replace(/^\s*--.*\n/gm, '')).toBe(
      '  update public.moments\n     set verified_by = null, verifier_account_deleted_at = now()\n   where verified_by = v_uid;\n',
    );
    expect(after).toContain('security definer');
    expect(after).toContain("set search_path = ''");
    expect(after).toContain('revoke all on function public.delete_own_guardian_account() from public, anon;');
  });

  it('keeps the moment coach_verified: exactly one of verified_by or the marker, verified_at always required', () => {
    expect(code).toContain('add column verifier_account_deleted_at timestamptz;');
    expect(code).toMatch(/verification_status = 'coach_verified' and verified_at is not null\s+and \(\(verified_by is not null and verifier_account_deleted_at is null\)\s+or \(verified_by is null and verifier_account_deleted_at is not null\)\)/);
    expect(code).toMatch(/and verified_at is null and verified_by is null and verifier_account_deleted_at is null/);
    expect(code).toMatch(/\) not valid;\s+alter table public\.moments validate constraint moments_verification_status_consistency;/);
  });

  it('only account deletion can set the marker: a restrictive insert policy, and no new grant', () => {
    expect(code).toMatch(/create policy "moments: only account deletion marks a verifier as deleted"\s+on public\.moments\s+as restrictive\s+for insert\s+to authenticated\s+with check \(verifier_account_deleted_at is null\);/);
    expect(code).not.toMatch(/^\s*grant\b(?!.*delete_own_guardian_account)/im);
    // No data change at top level (function bodies and DO blocks excluded).
    const topLevel = code.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');
    expect(topLevel).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
  });
});

describe('0097 rollback — emergency only', () => {
  it('warns that it breaks coach account deletion again', () => {
    expect(rollback.split('\n').slice(0, 4).join('\n')).toContain('EMERGENCY ONLY: THIS ROLLBACK BREAKS ACCOUNT DELETION FOR COACHES AGAIN.');
  });

  it('refuses before any change without the acknowledgement, unless 0097 is applied, or once any moment is marked', () => {
    expect(rollbackCode.trim().startsWith('begin;')).toBe(true);
    expect(rollbackCode.trim().endsWith('commit;')).toBe(true);
    const guard = rollbackCode.indexOf("current_setting('emblem.acknowledge_0097_rollback', true) is distinct from 'BREAK-COACH-ACCOUNT-DELETION'");
    const marked = rollbackCode.indexOf('where verifier_account_deleted_at is not null');
    const firstChange = rollbackCode.indexOf(FN_START);
    expect(guard).toBeGreaterThan(0);
    expect(marked).toBeGreaterThan(guard);
    expect(firstChange).toBeGreaterThan(marked);
    expect(rollbackCode).toContain("select set_config('emblem.acknowledge_0097_rollback', '', false);");
  });

  it('restores the 0076 function body exactly', () => {
    expect(fnOf(rollback)).toBe(fnOf(m0076));
  });
});
