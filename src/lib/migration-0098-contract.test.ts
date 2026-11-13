import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0098_deletion_review_suspension_and_verifier_identity.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/0098_rollback.sql', 'utf8');
const rollback0097 = readFileSync('supabase/rollback/0097_rollback.sql', 'utf8');
const m0097 = readFileSync('supabase/migrations/0097_coach_account_deletion_verified_moments.sql', 'utf8');
const m0088 = readFileSync('supabase/migrations/0088_relationship_authorization_foundation.sql', 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');
const rollbackCode = rollback.replace(/^\s*--.*$/gm, '');

const FN_START = 'create or replace function public.delete_own_guardian_account()';
const FN_END = 'grant execute on function public.delete_own_guardian_account() to authenticated;';
const fnOf = (text: string) => text.slice(text.indexOf(FN_START), text.indexOf(FN_END) + FN_END.length);
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * 0098 suspends coach access while an account deletion awaits staff review
 * (with an explicit staff restore), refuses staff self-deletion, and stops a
 * signed-in user naming anyone else as a moment's verifier. Its behaviour is
 * proven against a production-matched PostgreSQL in
 * supabase/tests/authz/migration_0098_test.mjs. This file is the structural
 * half that runs with npm test.
 */
describe('migration 0098 — deletion review suspension and verifier identity', () => {
  it('runs in one transaction, with the 0097 precondition before any change', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
    const precondition = code.indexOf('do $$');
    const firstChange = code.search(/^(alter|create)\b/im);
    expect(precondition).toBeGreaterThan(0);
    expect(precondition).toBeLessThan(firstChange);
    expect(code).toContain('0098 refused: the expected 0097 state is not in place');
    expect(code).toContain('(0098 already applied)');
  });

  it('keeps the 0097 function and only adds the staff refusal, the review suspension and one result field', () => {
    const before = fnOf(m0097);
    const after = fnOf(sql);
    // Every line of the 0097 body is still there, in order, apart from the
    // pending_profile_deletions upsert (now reopening a decided request) and
    // the result object's last line.
    const changed = new Set([
      '    on conflict (auth_user_id) do update set blocking_reason = excluded.blocking_reason;',
      "    'canDeleteIdentity', not v_blocked",
    ]);
    let at = 0;
    for (const line of before.split('\n')) {
      if (changed.has(line)) continue;
      const found = after.indexOf(line, at);
      expect(found, line).toBeGreaterThanOrEqual(at);
      at = found + line.length;
    }
    expect(after).toMatch(/if exists \(select 1 from public\.staff_accounts where profile_id = v_uid\) then\s+raise exception 'Staff accounts cannot be deleted from the app';/);
    // The staff refusal comes before any change.
    expect(after.indexOf('Staff accounts cannot be deleted from the app')).toBeLessThan(after.indexOf('delete from public.guardians'));
    expect(after).toContain("end_reason = 'account_deletion_review'");
    expect(after).toContain("perform set_config('emblem.trusted_operation', 'account_deletion_review', true);");
    expect(after).toContain('delete from public.coach_players where player_id = v_row.player_id and profile_id = v_uid;');
    expect(after).toContain("'coachAccessSuspended', v_suspended");
  });

  it('the staff functions are definer, staff-checked, and executable by service_role only', () => {
    for (const fn of ['reject_pending_profile_deletion', 'restore_coach_access_after_deletion_rejection']) {
      const body = code.slice(code.indexOf(`create function public.${fn}(`));
      expect(body.slice(0, 600)).toContain('security definer');
      expect(body.slice(0, 1200)).toContain("raise exception 'Not authorized: staff only'");
      expect(code).toContain(`revoke all on function public.${fn}(uuid, uuid, text) from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function public.${fn}(uuid, uuid, text) to service_role;`);
    }
    expect(code).toContain("raise exception 'Coach access can be restored only after the deletion is rejected (it is %)'");
  });

  it('the snapshot table is staff/server read-only and never blocks a later deletion', () => {
    expect(code).toContain('revoke all on public.deletion_review_access_suspensions from public, anon, authenticated, service_role;');
    expect(code).toContain('grant select on public.deletion_review_access_suspensions to service_role;');
    const table = code.slice(code.indexOf('create table public.deletion_review_access_suspensions'), code.indexOf('comment on table public.deletion_review_access_suspensions'));
    expect(table.match(/references/g)).toHaveLength(1); // only pending_deletion_id
  });

  it('adds the two restrictive verifier policies for authenticated', () => {
    expect(squash(code)).toContain(squash(`create policy "moments: a signed-in user can only name themselves as verifier"
      on public.moments as restrictive for insert to authenticated
      with check (verified_by is null or verified_by = auth.uid());`));
    expect(squash(code)).toContain(squash(`create policy "moments: a verifier change can only name the caller as coach"
      on public.moments as restrictive for update to authenticated using (true)
      with check ( public.moment_verifier_unchanged(id, verified_by) or verified_by is null
      or (verified_by = auth.uid() and public.moment_verifier_unchanged(id, null) and (`));
    expect(code).toMatch(/create function public\.moment_verifier_unchanged[\s\S]*?security invoker/);
  });
});

const GRANTING = [
  ['approve_coach_team_request', 'uuid, uuid, uuid, timestamptz, uuid'],
  ['redeem_coach_invite', 'text, uuid, text'],
  ['redeem_team_invite', 'text, uuid, text'],
] as const;
/** A granting function's definition, from its create through its service_role grant, as 'create or replace'. */
const grantingFnOf = (text: string, name: string, sig: string) => {
  const start = text.search(new RegExp(String.raw`create (or replace )?function public\.${name}\(`));
  const endMarker = `grant execute on function public.${name}(${sig}) to service_role;`;
  return text.slice(start, text.indexOf(endMarker, start) + endMarker.length).replace(/^create function/, 'create or replace function');
};

describe('migration 0098 — no new coach access while a deletion is under review', () => {
  it('a definer helper, executable by its owner only, reads only pending reviews', () => {
    expect(squash(code)).toContain(squash(`create function public.profile_has_pending_deletion_review(p_profile_id uuid)
      returns boolean language sql stable security definer set search_path = ''`));
    expect(code).toContain("where auth_user_id = p_profile_id and status = 'pending'");
    expect(code).toContain('revoke all on function public.profile_has_pending_deletion_review(uuid) from public, anon, authenticated, service_role;');
    expect(code).toContain('revoke all on function public.refuse_coach_access_during_deletion_review() from public, anon, authenticated, service_role;');
    expect(code).not.toMatch(/grant execute on function public\.(profile_has_pending_deletion_review|refuse_coach_access_during_deletion_review)/);
  });

  it('guards coach_team and coach_players inserts and updates, and team-request inserts, with SQLSTATE EMDRP', () => {
    for (const [when, table] of [
      ['before insert or update', 'coach_team'],
      ['before insert or update', 'coach_players'],
      ['before insert', 'coach_team_requests'],
    ]) {
      expect(squash(code)).toContain(
        squash(`create trigger deletion_review_access_guard ${when} on public.${table} for each row execute function public.refuse_coach_access_during_deletion_review();`)
      );
    }
    expect(code).toContain("raise exception using errcode = 'EMDRP', message = 'account_deletion_review_pending';");
  });

  it('each granting function is its 0088 body plus one early refusal, before anything changes', () => {
    for (const [name, sig] of GRANTING) {
      const before = grantingFnOf(m0088, name, sig);
      const after = grantingFnOf(sql, name, sig);
      const guard = after.indexOf(`public.profile_has_pending_deletion_review(`);
      expect(guard, name).toBeGreaterThan(0);
      // Removing the guard block gives back the 0088 definition exactly.
      const guardBlock = /(?<=\n)\n?  -- 0098:[\s\S]*?end if;\n/.exec(after)?.[0] ?? '';
      expect(guardBlock, name).toContain('profile_has_pending_deletion_review');
      expect(after.replace(guardBlock, ''), name).toBe(before);
      const firstWrite = after.search(/^\s*(update|insert into|perform public\.ensure_profile_role|select ti\.id)\b/m);
      expect(guard, name).toBeLessThan(firstWrite);
    }
  });

  it('delete_own_guardian_account locks the account first, so a racing grant is serialised', () => {
    const fn = fnOf(sql);
    expect(fn).toContain('perform 1 from public.profiles where id = v_uid for update;');
    expect(fn.indexOf('for update;')).toBeLessThan(fn.indexOf('delete from public.guardians'));
  });
});

describe('0098 rollback — emergency only', () => {
  it('warns prominently and refuses before any change unless acknowledged and unused', () => {
    expect(rollback.split('\n').slice(0, 5).join('\n')).toContain('EMERGENCY ONLY');
    expect(rollbackCode.trim().startsWith('begin;')).toBe(true);
    expect(rollbackCode.trim().endsWith('commit;')).toBe(true);
    const guard = rollbackCode.indexOf("current_setting('emblem.acknowledge_0098_rollback', true) is distinct from 'REOPEN-DELETION-REVIEW-ACCESS-AND-VERIFIER-NOMINATION'");
    const used = rollbackCode.indexOf('select count(*) into v_n from public.deletion_review_access_suspensions;');
    const rejected = rollbackCode.indexOf("where status = 'rejected' or rejection_reason is not null");
    const firstChange = rollbackCode.indexOf(FN_START);
    expect(guard).toBeGreaterThan(0);
    expect(used).toBeGreaterThan(guard);
    expect(rejected).toBeGreaterThan(used);
    expect(firstChange).toBeGreaterThan(rejected);
    expect(rollbackCode).toContain("select set_config('emblem.acknowledge_0098_rollback', '', false);");
  });

  it('restores the 0097 function body exactly', () => {
    expect(fnOf(rollback)).toBe(fnOf(m0097));
  });

  it('removes the access guards and restores the three 0088 granting functions exactly', () => {
    const drops = ['coach_team_requests', 'coach_players', 'coach_team'].map((t) => rollbackCode.indexOf(`drop trigger deletion_review_access_guard on public.${t};`));
    const dropFn = rollbackCode.indexOf('drop function public.refuse_coach_access_during_deletion_review();');
    const dropHelper = rollbackCode.indexOf('drop function public.profile_has_pending_deletion_review(uuid);');
    for (const d of drops) {
      expect(d).toBeGreaterThan(rollbackCode.indexOf("where status = 'rejected' or rejection_reason is not null"));
      expect(d).toBeLessThan(dropFn);
    }
    expect(dropFn).toBeLessThan(dropHelper);
    for (const [name, sig] of GRANTING) expect(grantingFnOf(rollback, name, sig), name).toBe(grantingFnOf(m0088, name, sig));
  });

  it('the 0097 rollback refuses while 0098 is applied', () => {
    expect(rollback0097).toContain("raise exception '0097 rollback refused: 0098 is still applied; roll back 0098 first';");
  });
});
