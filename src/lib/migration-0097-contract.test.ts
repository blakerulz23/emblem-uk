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

  // The 0076 clean-up: from the guardians scan to the last nullable reference.
  const CLEANUP_START = '  select array_agg(player_id) into v_player_ids from public.guardians where profile_id = v_uid;';
  const CLEANUP_END = '  update public.squad_invite_request_audit_events set actor_profile_id = null where actor_profile_id = v_uid;';
  const cleanupOf = (text: string) => text.slice(text.indexOf(CLEANUP_START), text.indexOf(CLEANUP_END) + CLEANUP_END.length);
  const defOf = (text: string, header: string, end = '\n$$;') => text.slice(text.indexOf(header), text.indexOf(end, text.indexOf(header)) + end.length);
  const ERASE = 'create function public.erase_account_for_deletion(p_profile_id uuid, p_email text, p_completed_by uuid)';
  const COMPLETE = 'create function public.complete_pending_profile_deletion(p_pending_deletion_id uuid, p_reason text)';
  const BLOCKING = 'create function public.account_deletion_blocking_reason(p_profile_id uuid)';
  const GUARD = 'create function public.guard_profile_deletion()';

  it('the erasure is the 0076 clean-up exactly, minus only the statement that broke coach deletion', () => {
    const before = cleanupOf(fnOf(m0076));
    const erase = defOf(sql, ERASE);
    expect(before).toContain(OLD_STATEMENT);
    expect(cleanupOf(erase)).toBe(before.replace(OLD_STATEMENT + '\n', ''));
    expect(erase).toContain('  v_uid uuid := p_profile_id;\n  v_email text := p_email;');
    // Then, in order: the open review (if any) is resolved, then the profile is deleted.
    const resolve = erase.indexOf("set status = 'resolved', resolved_by = p_completed_by, resolved_at = now()");
    const del = erase.indexOf('  delete from public.profiles where id = v_uid;');
    expect(resolve).toBeGreaterThan(erase.indexOf(CLEANUP_END));
    expect(del).toBeGreaterThan(resolve);
    expect(code).toContain('revoke all on function public.erase_account_for_deletion(uuid, text, uuid) from public, anon, authenticated, service_role;');
  });

  it('the blocker detection is the 0076 rule unchanged: same tables, same order, same reason codes', () => {
    const before = fnOf(m0076);
    const helper = defOf(sql, BLOCKING);
    const tables = (t: string) => Array.from(t.matchAll(/from public\.(\w+) where (\w+) = /g)).filter((m) => !['guardians', 'player_deletion_requests', 'profiles'].includes(m[1])).map((m) => `${m[1]}.${m[2]}`);
    const blockerTables = (t: string) => tables(t).filter((x) => /player_assessments|player_goals|player_season_focus|player_strengths|squad_invite_links|squad_invite_organiser_ownership|squad_invite_requests|squad_invites|squad_invite_request_declarations/.test(x));
    expect(blockerTables(helper)).toEqual(blockerTables(before.slice(before.indexOf('NOT-NULL blockers'))));
    const codes = (t: string) => Array.from(t.matchAll(/'(coach_authored_player_records|squad_invite_organiser_history|squad_invite_audit_history)'/g)).map((m) => m[1]);
    expect(codes(helper)).toEqual(codes(before.slice(before.indexOf('NOT-NULL blockers'))));
    expect(code).toContain('revoke all on function public.account_deletion_blocking_reason(uuid) from public, anon, authenticated, service_role;');
  });

  it('delete_own_guardian_account decides first; a deletion sent to staff review only records the request', () => {
    const strip = (t: string) => t.replace(/^\s*--.*\n/gm, '');
    const after = strip(fnOf(sql));
    expect(after).not.toContain(OLD_STATEMENT);
    const decide = after.indexOf('v_blocking_reason := public.account_deletion_blocking_reason(v_uid);');
    const review = after.slice(after.indexOf('  if v_blocking_reason is not null then'), after.indexOf('  end if;\n\n  return public.erase_account_for_deletion'));
    expect(decide).toBeGreaterThan(0);
    expect(decide).toBeLessThan(after.indexOf('insert into public.pending_profile_deletions'));
    // The review branch: one insert into pending_profile_deletions and the result; nothing else is written.
    expect(review.match(/\b(insert into|update|delete from|perform)\b/g)).toEqual(['insert into', 'update']);
    expect(review).toMatch(/on conflict \(auth_user_id\) do update\s+set blocking_reason = excluded\.blocking_reason, status = 'pending',\s+resolved_by = null, resolved_at = null,[\s\S]*returning first_detected_at into v_review_opened_at;/);
    // The account is locked first, so a staff completion of the same account waits for it.
    expect(after.indexOf('perform 1 from public.profiles where id = v_uid for update;')).toBeLessThan(decide);
    expect(review).toContain("'canDeleteIdentity', false");
    // Otherwise the erasure, once.
    expect(after.split('public.erase_account_for_deletion(').length).toBe(2);
    expect(after).toContain("  return public.erase_account_for_deletion(v_uid, v_email, null)\n    || jsonb_build_object('canDeleteIdentity', true);");
    expect(after).not.toMatch(/delete from public\.(profiles|guardians)|lockdown_for_player_deletion_request|set uploaded_by = null|verifier_account_deleted_at/);
    expect(after).toContain('security definer');
    expect(after).toContain("set search_path = ''");
    expect(after).toContain('revoke all on function public.delete_own_guardian_account() from public, anon;');
  });

  it('staff completion: staff session only, reasoned, locks account then request, refuses unless pending and unblocked, erases once', () => {
    const fn = defOf(sql, COMPLETE);
    const at = (s: string) => {
      const i = fn.indexOf(s);
      expect(i, s).toBeGreaterThan(0);
      return i;
    };
    const staff = at("raise exception 'Not authorized: staff only';");
    const reason = at("raise exception 'A reason (up to 500 characters) is required';");
    const lockProfile = at('perform 1 from public.profiles where id = v_uid for update;');
    const lockRequest = at('select * into v_pending from public.pending_profile_deletions where id = p_pending_deletion_id for update;');
    const already = at("return jsonb_build_object('status', 'already_completed', 'profileId', v_uid);");
    const notPending = at("raise exception 'Only a pending profile deletion can be completed (it is %)'");
    const staffTarget = at("raise exception 'Staff accounts are removed by the manual staff procedure, not here';");
    const blocked = at("raise exception 'The account still has records that block deletion (%); resolve them first'");
    const erase = at('v_result := public.erase_account_for_deletion(v_uid, v_pending.email, v_staff);');
    at('insert into public.pending_auth_deletions (auth_user_id, email, last_error)');
    const authQueue = fn.lastIndexOf('insert into public.pending_auth_deletions (auth_user_id, email, last_error)');
    expect(fn).toContain('v_staff uuid := auth.uid();');
    for (const [a, b] of [[staff, reason], [reason, lockProfile], [lockProfile, lockRequest], [lockRequest, already], [already, notPending], [notPending, staffTarget], [staffTarget, blocked], [blocked, erase], [erase, authQueue]]) {
      expect(a).toBeLessThan(b);
    }
    expect(fn.split('erase_account_for_deletion(').length).toBe(2);
    expect(code).toContain('revoke all on function public.complete_pending_profile_deletion(uuid, text) from public, anon, service_role;');
    expect(code).toContain('grant execute on function public.complete_pending_profile_deletion(uuid, text) to authenticated;');
  });

  it('erased accounts: the erasure records them before deleting the profile; no profile can be recreated; the app can ask for its own uid only', () => {
    const erase = defOf(sql, ERASE);
    expect(erase.indexOf('insert into public.erased_accounts')).toBeGreaterThan(erase.indexOf(CLEANUP_END));
    expect(erase.indexOf('insert into public.erased_accounts')).toBeLessThan(erase.indexOf('  delete from public.profiles where id = v_uid;'));
    expect(code).toContain("create trigger profiles_refuse_erased_account\n  before insert or update of id on public.profiles");
    expect(code).toContain("raise exception using errcode = 'EMERA', message = 'account_erased';");
    expect(code).toContain('select exists (select 1 from public.erased_accounts where profile_id = auth.uid());');
    expect(code).toContain('revoke all on function public.account_is_erased() from public, anon, service_role;');
    expect(code).toContain('revoke all on public.erased_accounts from public, anon, authenticated, service_role;');
  });

  it('staff decisions are audited once: completion writes one row after the erasure; the repeat path writes none', () => {
    const fn = defOf(sql, COMPLETE);
    const repeat = fn.slice(fn.indexOf("if v_pending.status = 'resolved' then"), fn.indexOf("if v_pending.status <> 'pending' then"));
    expect(repeat).not.toContain('account_deletion_staff_actions');
    const erase = fn.indexOf('v_result := public.erase_account_for_deletion(');
    const auditDone = fn.indexOf("values (p_pending_deletion_id, v_uid, v_staff, 'complete', btrim(p_reason), 'completed');");
    expect(auditDone).toBeGreaterThan(erase);
    expect(fn.split('insert into public.account_deletion_staff_actions').length).toBe(3); // completed + account_already_deleted
    expect(code).toContain('revoke all on public.account_deletion_staff_actions from public, anon, authenticated, service_role;');
    for (const t of ['erased_accounts', 'account_deletion_staff_actions']) {
      expect(code).toContain(`create trigger ${t}_append_only before update or delete on public.${t}`);
      expect(code).toContain(`create trigger ${t}_no_truncate before truncate on public.${t}`);
    }
    const already = fn.slice(fn.indexOf('if not exists (select 1 from public.profiles where id = v_uid) then'), fn.indexOf("'account_already_deleted', 'profileId'"));
    expect(already).toContain('insert into public.erased_accounts');
  });

  it('every profile delete: refused while parent links or a pending review remain; otherwise marks attribution (the one place)', () => {
    const fn = defOf(sql, GUARD, '\n$fn$;');
    const links = fn.indexOf('if exists (select 1 from public.guardians where profile_id = old.id) then');
    const review = fn.indexOf("if exists (select 1 from public.pending_profile_deletions where auth_user_id = old.id and status = 'pending') then");
    const mark = fn.indexOf('update public.moments');
    expect(links).toBeGreaterThan(0);
    expect(review).toBeGreaterThan(links);
    expect(mark).toBeGreaterThan(review);
    expect(fn).toMatch(/update public\.moments\s+set verified_by = null, verifier_account_deleted_at = now\(\)\s+where verified_by = old\.id;/);
    expect(fn).toMatch(/update public\.player_deletion_requests\s+set cancelled_by = null, cancelled_by_account_deleted_at = now\(\)\s+where cancelled_by = old\.id and status = 'cancelled';/);
    expect(fn).toMatch(/update public\.squad_invite_participation_deletion_requests\s+set cancelled_by = null, cancelled_by_account_deleted_at = now\(\)\s+where cancelled_by = old\.id and status = 'cancelled';/);
    // The markers are written nowhere else.
    expect(code.split('verifier_account_deleted_at = now()').length).toBe(2);
    expect(code.split('cancelled_by_account_deleted_at = now()').length).toBe(3);
    expect(code).toContain('revoke all on function public.guard_profile_deletion() from public, anon, authenticated, service_role;');
    expect(code).toContain('create trigger profiles_account_deletion_guard\n  before delete on public.profiles\n  for each row execute function public.guard_profile_deletion();');
    expect(code).toContain('a 0097 account-deletion function or trigger already exists (0097 already applied)');
    expect(rollbackCode).toContain('drop trigger profiles_account_deletion_guard on public.profiles;\ndrop function public.guard_profile_deletion();\ndrop function public.complete_pending_profile_deletion(uuid, text);\ndrop function public.erase_account_for_deletion(uuid, text, uuid);\ndrop function public.account_deletion_blocking_reason(uuid);');
  });

  it('keeps the moment coach_verified: exactly one of verified_by or the marker, verified_at always required', () => {
    expect(code).toContain('add column verifier_account_deleted_at timestamptz;');
    expect(code).toMatch(/verification_status = 'coach_verified' and verified_at is not null\s+and \(\(verified_by is not null and verifier_account_deleted_at is null\)\s+or \(verified_by is null and verifier_account_deleted_at is not null\)\)/);
    expect(code).toMatch(/and verified_at is null and verified_by is null and verifier_account_deleted_at is null/);
    expect(code).toMatch(/\) not valid;\s+alter table public\.moments validate constraint moments_verification_status_consistency;/);
  });

  it('keeps a cancelled deletion request cancelled: exactly one of cancelled_by or the marker, on both tables', () => {
    for (const [table, rule] of [
      ['player_deletion_requests', 'player_deletion_requests_cancellation_requires_actor'],
      ['squad_invite_participation_deletion_requests', 'sipdr_cancellation_requires_actor'],
    ]) {
      expect(code).toContain(`alter table public.${table} add column cancelled_by_account_deleted_at timestamptz;`);
      expect(code).toContain(`alter table public.${table} drop constraint ${rule};`);
      expect(code).toContain(`alter table public.${table} validate constraint ${rule};`);
      expect(rollbackCode).toContain(`alter table public.${table} drop column cancelled_by_account_deleted_at;`);
      expect(rollbackCode).toContain(`alter table public.${table} add constraint ${rule}\n  check (status <> 'cancelled' or (cancelled_by is not null and cancelled_at is not null));`);
    }
    expect(code.match(/\(status = 'cancelled' and cancelled_at is not null\s+and \(\(cancelled_by is not null and cancelled_by_account_deleted_at is null\)\s+or \(cancelled_by is null and cancelled_by_account_deleted_at is not null\)\)\)/g)).toHaveLength(2);
    // The precondition proves signed-in users cannot write either table.
    expect(code).toContain("'authenticated can write a deletion request table'");
  });

  it('only account deletion can set the marker: a restrictive insert policy, and no grant beyond the staff completion', () => {
    expect(code).toMatch(/create policy "moments: only account deletion marks a verifier as deleted"\s+on public\.moments\s+as restrictive\s+for insert\s+to authenticated\s+with check \(verifier_account_deleted_at is null\);/);
    // The only grants: delete_own_guardian_account (re-stated) and the staff completion (which checks staff itself).
    expect(code.match(/^\s*grant\b.*$/gim)).toEqual([
      'grant execute on function public.delete_own_guardian_account() to authenticated;',
      'grant execute on function public.complete_pending_profile_deletion(uuid, text) to authenticated;',
      'grant select on public.erased_accounts to service_role;',
      'grant execute on function public.account_is_erased() to authenticated;',
      'grant select on public.account_deletion_staff_actions to service_role;',
      'grant execute on function public.record_account_sign_in_removal(uuid, text, text) to authenticated;',
    ]);
    // No data change at top level (function bodies and DO blocks excluded).
    const topLevel = code.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');
    expect(topLevel).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
  });
});

describe('0097 rollback — emergency only', () => {
  it('warns that it breaks coach account deletion again', () => {
    expect(rollback.split('\n').slice(0, 4).join('\n')).toContain('EMERGENCY ONLY: THIS ROLLBACK BREAKS ACCOUNT DELETION FOR COACHES AGAIN.');
  });

  it('refuses before any change without the acknowledgement, unless 0097 is applied, while a review is pending with parent links, or once any moment is marked', () => {
    expect(rollbackCode.trim().startsWith('begin;')).toBe(true);
    expect(rollbackCode.trim().endsWith('commit;')).toBe(true);
    const guard = rollbackCode.indexOf("current_setting('emblem.acknowledge_0097_rollback', true) is distinct from 'BREAK-COACH-ACCOUNT-DELETION'");
    const marked = rollbackCode.indexOf('where verifier_account_deleted_at is not null');
    const reviewWithLinks = rollbackCode.indexOf('join public.guardians g on g.profile_id = d.auth_user_id');
    const firstChange = rollbackCode.indexOf(FN_START);
    expect(guard).toBeGreaterThan(0);
    expect(reviewWithLinks).toBeGreaterThan(guard);
    expect(reviewWithLinks).toBeLessThan(firstChange);
    expect(rollbackCode.indexOf('drop trigger profiles_account_deletion_guard')).toBeGreaterThan(marked);
    expect(marked).toBeGreaterThan(guard);
    expect(firstChange).toBeGreaterThan(marked);
    expect(rollbackCode).toContain("select set_config('emblem.acknowledge_0097_rollback', '', false);");
  });

  it('an erasure keeps no plaintext email in the review record or the retry record, and audits a reviewed account erasing itself', () => {
    const defOf = (text: string, header: string, end = '\n$$;') => text.slice(text.indexOf(header), text.indexOf(end, text.indexOf(header)) + end.length);
    const CLEANUP_START = '  select array_agg(player_id) into v_player_ids from public.guardians where profile_id = v_uid;';
    const erase = defOf(code, 'create function public.erase_account_for_deletion(p_profile_id uuid, p_email text, p_completed_by uuid)');
    expect(erase.length).toBeGreaterThan(1000);
    // Refuses an account already erased (a stale session cannot write a second record or event).
    expect(erase.indexOf("errcode = 'EMERA', message = 'account_erased'")).toBeLessThan(erase.indexOf(CLEANUP_START));
    // The email is used only before the erasure (the 0076 child deletion request), then cleared.
    expect(erase.indexOf('update public.pending_profile_deletions set email = null')).toBeGreaterThan(erase.indexOf('requester_email'));
    expect(erase.indexOf('update public.pending_profile_deletions set email = null')).toBeLessThan(erase.indexOf('delete from public.profiles where id = v_uid'));
    expect(erase).toContain("'self_deleted'");
    const complete = defOf(code, 'create function public.complete_pending_profile_deletion(p_pending_deletion_id uuid, p_reason text)');
    // The only use of the email: handed to the erasure (for the 0076 child deletion request), which then clears it.
    expect(complete.match(/v_pending\.email/g)).toEqual(['v_pending.email']);
    expect(complete).toContain('public.erase_account_for_deletion(v_uid, v_pending.email, v_staff)');
    expect(complete.match(/insert into public\.pending_auth_deletions \(auth_user_id, email, last_error\)\s+values \(v_uid, null,/g)).toHaveLength(2);
    expect(complete).toContain('on conflict (auth_user_id) do update set email = null;');
    expect(complete).toContain('set email = null,');
    expect(code).toContain("action in ('complete', 'reject', 'restore', 'remove_sign_in', 'self_deleted')");
    // The review row is locked before its status is read; the event is tied to the erased record this call inserted.
    expect(erase).toContain('from public.pending_profile_deletions where auth_user_id = v_uid for update;');
    expect(erase).toContain('get diagnostics v_erased_now = row_count;');
    expect(erase).toContain('if p_completed_by is null and v_review_id is not null and v_erased_now = 1 then');
    // Older Auth-retry rows lose the email at every erasure.
    expect(erase).toContain('update public.pending_auth_deletions set email = null');
    // The permanent audit refuses an email-shaped reason.
    expect(code).toContain('constraint account_deletion_staff_actions_reason_no_email');
  });

  it('invites addressed to an erased account are revoked in the erasure itself, and child-deletion contacts go when a request closes', () => {
    const defOf = (text: string, header: string, end = '\n$$;') => text.slice(text.indexOf(header), text.indexOf(end, text.indexOf(header)) + end.length);
    const CLEANUP_START = '  select array_agg(player_id) into v_player_ids from public.guardians where profile_id = v_uid;';
    const erase = defOf(code, 'create function public.erase_account_for_deletion(p_profile_id uuid, p_email text, p_completed_by uuid)');
    for (const t of ['player_invites', 'coach_invites', 'team_invites']) {
      // Revoked: a new random code, expired, no address, marked; only unused, not already revoked, addressed to the account.
      expect(erase).toContain(`  update public.${t}
     set revoked_at = now(), revoked_reason = 'recipient_account_erased', invited_email = null,
         expires_at = least(expires_at, now()), code = 'revoked:' || gen_random_uuid()::text
   where used_at is null and revoked_at is null and lower(btrim(invited_email)) = any(v_emails);`);
      // Used: the address goes, before used_by is cleared by the 0076 clean-up.
      const used = erase.indexOf(`  update public.${t} set invited_email = null`);
      expect(used).toBeGreaterThan(0);
      expect(used).toBeLessThan(erase.indexOf(CLEANUP_START));
      expect(code).toContain(`create trigger ${t}_revoked_guard before update on public.${t}`);
      expect(code).toContain(`add constraint ${t}_revoked_state check (`);
      expect(rollbackCode).toContain(`drop trigger ${t}_revoked_guard on public.${t};`);
    }
    // After the EMERA guard (a repeat changes nothing) and inside the one erasure transaction.
    expect(erase.indexOf("errcode = 'EMERA'")).toBeLessThan(erase.indexOf('recipient_account_erased'));
    expect(code).toContain("raise exception using errcode = 'EMRVK', message = 'invite_revoked';");
    // Contact cleared whenever the request is not pending, on every write, on both tables; NOT VALID check.
    expect(code).toContain("  if new.status <> 'pending' then\n    new.requester_email := null;");
    expect(code).toContain('before insert or update on public.player_deletion_requests');
    expect(code).toContain('before insert or update on public.squad_invite_participation_deletion_requests');
    expect(code).toContain("check (status = 'pending' or requester_email is null) not valid;");
    // Orders are never touched by the erasure.
    expect(erase).not.toMatch(/purchaser_email/);
    // The rollback refuses while any invite is revoked.
    expect(rollbackCode).toContain('were revoked because their recipient account was erased');
  });

  it('restores the 0076 function body exactly', () => {
    expect(fnOf(rollback)).toBe(fnOf(m0076));
  });
});
