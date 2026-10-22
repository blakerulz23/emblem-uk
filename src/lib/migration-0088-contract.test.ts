import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0088_relationship_authorization_foundation.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/0088_rollback.sql', 'utf8');
const code = sql.replace(/--.*$/gm, '');

/**
 * 0088 is the additive half of the relationship-authorization fix: it must
 * not remove or narrow any existing access, because the application that
 * stops depending on that access ships before 0089. The behaviour is proven
 * against a production-matched PostgreSQL in
 * supabase/tests/authz/migration_0088_test.mjs (whole-catalog before/after
 * comparison, rollback to the exact 0087 catalog). This file is the
 * structural half that runs with npm test, no database needed.
 */
describe('migration 0088 — additive relationship-authorization foundation', () => {
  it('runs in one transaction', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
  });

  it('drops nothing and revokes nothing on an existing object', () => {
    expect(code).not.toMatch(/\bdrop\s+(policy|table|column|function|trigger|index)\b/i);
    // Constraints replaced, exactly these and in this order: the outbox
    // event-type check (widened by one type), the coach_players creator key
    // and the coach_invites redeemer key (both now ON DELETE SET NULL).
    const droppedConstraints = code.match(/drop\s+constraint\s+\w+/gi) ?? [];
    expect(droppedConstraints).toEqual([
      'drop constraint staff_notification_outbox_event_type_check',
      'drop constraint coach_players_created_by_fkey',
      'drop constraint coach_invites_used_by_fkey',
    ]);
    expect(code).toContain('add constraint coach_players_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;');
    expect(code).toContain('add constraint coach_invites_used_by_fkey foreign key (used_by) references public.profiles (id) on delete set null;');
    expect(code).toContain('alter table public.coach_invites alter column created_by drop not null;');
    const revokes = code.match(/revoke[^;]+;/gi) ?? [];
    const newObjects = [
      'coach_assignment_is_active', 'coach_team_requests', 'enforce_coach_team_request_transition',
      'relationship_audit_events', 'reject_relationship_audit_mutation', 'record_relationship_audit_event',
      'approve_coach_team_request', 'reject_coach_team_request', 'cancel_own_coach_team_request', 'end_coach_assignment',
      'ensure_profile_role', 'activate_coach_assignment', 'remove_direct_coach_link', 'redeem_coach_invite', 'redeem_team_invite',
      'release_readiness_confirmations', 'stamp_release_readiness_confirmation', 'reject_release_readiness_mutation', 'confirm_release_readiness',
    ];
    for (const r of revokes) expect(newObjects.some((o) => r.includes(`public.${o}`))).toBe(true);
  });

  it('alters no existing policy', () => {
    expect(code).not.toMatch(/alter\s+policy/i);
    const policies = code.match(/create policy "[^"]+"\s+on\s+public\.(\w+)/gi) ?? [];
    expect(policies.length).toBe(2);
    for (const p of policies) expect(p).toMatch(/on\s+public\.coach_team_requests$/);
  });

  it('adds history columns without defaults first, so existing rows are not stamped', () => {
    for (const table of ['coach_team', 'guardians']) {
      const add = code.match(new RegExp(`alter table public\\.${table}\\s+add column[\\s\\S]*?;`))![0];
      expect(add).not.toMatch(/default/i);
      expect(code.indexOf(`alter table public.${table} alter column created_at set default now();`)).toBeGreaterThan(code.indexOf(add));
    }
    expect(code).not.toMatch(/update\s+public\.(coach_team|guardians)\s+set\s+created_/i);
  });

  it('gives every new table explicit grants instead of relying on project defaults', () => {
    expect(code).toContain('revoke all on public.coach_team_requests from public, anon, authenticated, service_role;');
    expect(code).toContain('revoke all on public.relationship_audit_events from public, anon, authenticated, service_role;');
    expect(code).toContain('revoke all on public.release_readiness_confirmations from public, anon, authenticated, service_role;');
    expect(code).toContain('grant select on public.release_readiness_confirmations to service_role;');
  });

  it('release readiness is written only through the staff-checked function, once, and never changed', () => {
    expect(code).toMatch(/grant execute on function public\.confirm_release_readiness\([^)]*\) to service_role;/);
    expect(code).not.toMatch(/grant (insert|update|delete)[^;]*release_readiness_confirmations/);
    expect(code).toContain('contract text not null unique');
    expect(code).not.toMatch(/release_readiness_confirmations[\s\S]{0,200}on conflict/);
    expect(code).toContain('before update or delete on public.release_readiness_confirmations');
    expect(code).toContain('before truncate on public.release_readiness_confirmations');
  });

  it('keeps staff and trusted-write functions off the signed-in role', () => {
    for (const f of ['approve_coach_team_request', 'reject_coach_team_request', 'end_coach_assignment', 'ensure_profile_role', 'activate_coach_assignment', 'remove_direct_coach_link', 'redeem_coach_invite', 'redeem_team_invite']) {
      const grant = code.match(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to ([^;]+);`))!;
      expect(grant[1].trim()).toBe('service_role');
    }
  });

  it('never overwrites an existing role on approval or in ensure_profile_role', () => {
    expect(code).toContain("update public.profiles set role = 'coach' where id = v_request.requester_profile_id and role is null;");
    expect(code).toContain('set role = coalesce(public.profiles.role, excluded.role),');
  });

  it('coach-invite redemption consumes an invite only through one conditional claim', () => {
    // Structural half of the concurrency proof (PGlite can't run two
    // simultaneous transactions): every statement in 0088 that sets
    // coach_invites.used_at is a single UPDATE whose WHERE requires the
    // invite to be unused and unexpired, so PostgreSQL row locking lets only
    // one of several simultaneous redemptions succeed.
    const fn = code.match(/create function public\.redeem_coach_invite\([\s\S]*?\n\$\$;/)![0];
    const inviteUpdates = code.match(/update public\.coach_invites[\s\S]*?;/g) ?? [];
    const consumes = inviteUpdates.filter((u) => /set\s+used_at\s*=/.test(u));
    expect(consumes).toHaveLength(1);
    expect(consumes[0]).toMatch(/where ci\.code = p_code\s+and ci\.used_at is null\s+and ci\.expires_at > now\(\)/);
    expect(consumes[0]).toContain('exists (select 1 from public.guardians g where g.player_id = ci.player_id and g.profile_id = ci.created_by)');
    expect(fn).toContain(consumes[0]);
    // used_by is filled in only on the row this call has just claimed.
    expect(fn).toContain('update public.coach_invites ci set used_by = p_coach_profile_id where ci.code = p_code and ci.used_by is null;');
    // The link is created in the same function; a pre-existing link undoes the claim.
    expect(fn).toContain('on conflict on constraint coach_players_pkey do nothing;');
    expect(fn).toContain("exception when sqlstate 'EM409' then");
  });

  it('team-invite redemption is one atomic, locked, cutoff-checked operation', () => {
    // Structural half of the concurrency proof for redeem_team_invite (the
    // behaviour, including both orders of each race, is in
    // supabase/tests/authz/team_invite_redemption_test.mjs).
    const fn = code.match(/create function public\.redeem_team_invite\([\s\S]*?\n\$\$;/)![0];
    expect(fn).toMatch(/security definer\s+set search_path = ''/);
    // The invite row is locked before anything else; then this coach's
    // assignment row, which end_coach_assignment also locks FOR UPDATE.
    const inviteLock = fn.search(/from public\.team_invites ti\s+where ti\.code = p_code\s+for update;/);
    const assignmentLock = fn.search(/from public\.coach_team ct\s+where ct\.team_id = v_team_id and ct\.profile_id = p_coach_profile_id\s+for update;/);
    expect(inviteLock).toBeGreaterThan(0);
    expect(assignmentLock).toBeGreaterThan(inviteLock);
    expect(code).toMatch(/from public\.coach_team where team_id = p_team_id and profile_id = p_profile_id for update;/);
    // The cutoff: ended_at, or an expiry that has passed; the later of the two.
    expect(fn).toContain('v_cutoff := greatest(v_ended_at, case when v_expires_at <= now() then v_expires_at end);');
    expect(fn).toContain('if v_issued_at <= v_cutoff then');
    // The reactivating upsert repeats the rule against the row as it is then.
    expect(fn).toMatch(/where not public\.coach_assignment_is_active\(public\.coach_team\.ended_at, public\.coach_team\.expires_at\)\s+and v_issued_at > coalesce\(greatest\(public\.coach_team\.ended_at,/);
    // The invite is consumed by exactly one statement, after the assignment write.
    const consumes = (code.match(/update public\.team_invites[\s\S]*?;/g) ?? []).filter((u) => /set\s+used_at\s*=/.test(u));
    expect(consumes).toHaveLength(1);
    expect(fn.indexOf(consumes[0])).toBeGreaterThan(fn.indexOf('insert into public.coach_team'));
    // Role only when empty, audited as this operation, markers always cleared.
    expect(fn).toContain("perform public.ensure_profile_role(p_coach_profile_id, 'coach', p_display_name);");
    expect(fn).toContain("perform set_config('emblem.trusted_operation', 'redeem_team_invite', true);");
    expect((fn.match(/set_config\('emblem\.trusted_operation', '', true\)/g) ?? []).length).toBe(2);
    // A fixed status contract, and no dynamic SQL.
    const statuses = Array.from(new Set(Array.from(fn.matchAll(/'([a-z_]+)'::text/g), (m) => m[1])));
    expect(statuses.sort()).toEqual(['already_active', 'already_redeemed_by_you', 'invalid', 'redeemed']);
    expect(fn).toContain("then 'stale_after_end' else 'stale_after_expiry' end");
    expect(fn).not.toMatch(/execute\s+(format|'|\$)/i);
    expect(code).toContain('revoke all on function public.redeem_team_invite(text, uuid, text) from public, anon, authenticated;');
  });

  it('widens the outbox event-type check without removing a type', () => {
    const [before] = readFileSync('supabase/migrations/0083_squad_invite_ready_to_finalise_notification.sql', 'utf8')
      .match(/staff_notification_outbox_event_type_check check \(event_type in \(([\s\S]*?)\)\);/)!.slice(1);
    const [after] = code.match(/add constraint staff_notification_outbox_event_type_check check \(event_type in \(([\s\S]*?)\)\);/)!.slice(1);
    const list = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);
    expect(list(after)).toEqual([...list(before), "'new_coach_team_request'"]);
  });

  it('the rollback undoes every new object and restores the helpers with search_path public', () => {
    for (const o of ['relationship_audit_events', 'coach_team_requests', 'record_relationship_audit_event', 'coach_assignment_is_active',
      'approve_coach_team_request', 'reject_coach_team_request', 'cancel_own_coach_team_request', 'end_coach_assignment',
      'redeem_coach_invite', 'redeem_team_invite']) {
      expect(rollback).toContain(`public.${o}`);
    }
    expect((rollback.match(/set search_path = public/g) ?? []).length).toBe(2);
  });
});
