import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0089_relationship_authorization_lockdown.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/0089_rollback.sql', 'utf8');
const code = sql.replace(/--.*$/gm, '');
const rollbackCode = rollback.replace(/--.*$/gm, '');
/** Top-level statements only: function bodies and DO blocks removed. */
const topLevel = (text: string) => text.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');

/** Every top-level statement that changes something, in order. */
const changes = (text: string) => text.match(/^(revoke|grant|alter policy|drop policy|create policy|create or replace function)\b[^;]*/gim) ?? [];

/**
 * 0089 is the lockdown half of the relationship-authorization fix. Its
 * behaviour (readiness refusals as no-ops, the exact catalog change, the
 * access matrix, approved flows, rollback) is proven against a
 * production-matched PostgreSQL in supabase/tests/authz/migration_0089_test.mjs.
 * This file is the structural half that runs with npm test.
 */
describe('migration 0089 — relationship authorization lockdown', () => {
  it('runs in one transaction, with the readiness precondition before any change', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
    const precondition = code.indexOf('do $$');
    const firstChange = code.search(/^(revoke|grant|alter policy|drop policy|create or replace function)\b/im);
    expect(precondition).toBeGreaterThan(0);
    expect(precondition).toBeLessThan(firstChange);
    const block = code.slice(precondition, code.indexOf('$$;', precondition));
    for (const fragment of [
      "where contract = 'authorization_relationships_v1'",
      'expected exactly one release-readiness confirmation',
      'does not confirm all six smoke checks',
      "'^[0-9a-f]{7,40}$'",
      'no longer staff',
      'migration 0088 is not fully in place',
      'public.redeem_coach_invite(text,uuid,text)',
      'public.confirm_release_readiness(text,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean)',
    ]) {
      expect(block).toContain(fragment);
    }
    for (const check of ['check_card_claim', 'check_guardian_invite', 'check_team_invite', 'check_coach_invite', 'check_dual_view', 'check_team_request_flow']) {
      expect(block).toContain(check);
    }
  });

  it('locks profiles to own row, display_name only, and never a role', () => {
    expect(code).toContain('revoke insert, update, delete on public.profiles from authenticated;');
    expect(code).toContain('grant insert (id, display_name) on public.profiles to authenticated;');
    expect(code).toContain('grant update (display_name) on public.profiles to authenticated;');
    expect(code).toMatch(/alter policy "profiles: insert own row on signup" on public\.profiles\s+with check \(\(auth\.uid\(\) = id\) and \(role is null\)\);/);
    expect(code).not.toMatch(/grant\s+(insert|update)\s*\([^)]*\brole\b/i);
  });

  it('drops exactly the four self-attach, self-link and coach-create policies and revokes signed-in writes', () => {
    expect(code.match(/drop policy "[^"]+" on public\.\w+/g)).toEqual([
      'drop policy "coach_team: a coach can attach themselves" on public.coach_team',
      'drop policy "guardians: a parent can link themselves" on public.guardians',
      'drop policy "clubs: coaches can create" on public.clubs',
      'drop policy "teams: coaches can create" on public.teams',
    ]);
    expect(code).toContain('revoke insert, update, delete on public.coach_team, public.guardians, public.clubs, public.teams from authenticated;');
    expect(code).not.toMatch(/create policy/i);
  });

  it('limits coach-invite inserts to four columns', () => {
    expect(code).toContain('revoke insert on public.coach_invites from authenticated;');
    expect(code).toContain('grant insert (player_id, code, created_by, invited_email) on public.coach_invites to authenticated;');
  });

  it('requires an active assignment on every coach_team branch, and leaves direct-link branches untouched', () => {
    // Each coach_team predicate (ct, ct1, ct2 on auth.uid(), profiles.id or
    // v_uid) is immediately followed by the active check on the same alias.
    const branch = /\b(ct\d?)\.profile_id = (auth\.uid\(\)|profiles\.id|v_uid)\)?\s*(?=([\s\S]{0,80}))/g;
    let count = 0;
    for (let m = branch.exec(code); m; m = branch.exec(code)) {
      count += 1;
      expect(m[3]).toMatch(new RegExp(`^(and|AND) public\\.coach_assignment_is_active\\(${m[1]}\\.ended_at, ${m[1]}\\.expires_at\\)`));
    }
    expect(count).toBe(29);
    expect(code.match(/coach_assignment_is_active\(ct\d?\.ended_at/g)?.length).toBe(29);
    expect(code).not.toMatch(/coach_assignment_is_active\(cp\./);
    expect(code).toContain('grant execute on function public.coach_assignment_is_active(timestamptz, timestamptz) to authenticated;');
  });

  it('removes anon execute on the two helpers and table-maintenance privileges from anon and authenticated', () => {
    for (const fn of ['is_authorized_coach_for_player', 'is_guardian_of_team_player']) {
      expect(code).toContain(`revoke all on function public.${fn}(uuid) from public, anon;`);
      expect(code).toContain(`grant execute on function public.${fn}(uuid) to authenticated;`);
    }
    expect(code).toMatch(/revoke truncate, references, trigger on table[\s\S]+?from anon, authenticated;/);
    expect(code).toMatch(/server_version_num[\s\S]+?revoke maintain/);
  });

  it('keeps decisions B and C and service-role access unchanged', () => {
    expect(code).not.toMatch(/alter\s+default\s+privileges/i);
    for (const stmt of changes(code)) {
      expect(stmt).not.toMatch(/service_role/i);
      // Club and team reads are unchanged (decision B): only their two write policies are dropped.
      if (/policy/i.test(stmt) && /on public\.(clubs|teams)\b/.test(stmt)) expect(stmt).toMatch(/^drop policy "(clubs|teams): coaches can create"/);
    }
  });

  it('changes no data and creates no audit events', () => {
    expect(topLevel(code)).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
    expect(code).not.toContain('emblem.trusted_operation');
  });
});

describe('0089 rollback — emergency only', () => {
  it('warns prominently that it reopens the vulnerability', () => {
    expect(rollback.split('\n').slice(0, 4).join('\n')).toContain('EMERGENCY ONLY: THIS ROLLBACK REOPENS THE CONFIRMED AUTHORIZATION');
    expect(rollback).not.toMatch(/\bsafe\b/i);
  });

  it('refuses before any change while 0091 or 0090 is still applied, so they are rolled back first', () => {
    const firstChange = rollbackCode.search(/^(revoke|grant|alter policy|drop policy|create policy|create or replace function)\b/im);
    const at0091 = rollbackCode.indexOf("like '%created_by = auth.uid()%'");
    const at0090 = rollbackCode.indexOf("not pg_catalog.has_column_privilege('authenticated', 'public.player_invites', 'used_at', 'INSERT')");
    expect(at0091).toBeGreaterThan(0);
    expect(at0090).toBeGreaterThan(0);
    expect(at0091).toBeLessThan(firstChange);
    expect(at0090).toBeLessThan(firstChange);
    expect(rollbackCode).toContain("pol.polname = 'player_invites: coaches can view/create for their team'");
    expect(rollbackCode).toContain('0089 rollback refused: 0091 is still applied. Roll back 0091 first, then 0090');
    expect(rollbackCode).toContain('0089 rollback refused: 0090 is still applied. Roll back 0090 first');
  });

  it('documents a transaction-local acknowledgement and clears it before committing', () => {
    expect(rollback).toContain("select set_config('emblem.acknowledge_0089_rollback', 'REOPEN-AUTHORIZATION-VULNERABILITY', true);");
    expect(rollback).not.toContain("'REOPEN-AUTHORIZATION-VULNERABILITY', false)");
    const clear = rollbackCode.indexOf("select set_config('emblem.acknowledge_0089_rollback', '', false);");
    expect(clear).toBeGreaterThan(rollbackCode.indexOf('create policy "profiles: update own row"'));
    expect(clear).toBeLessThan(rollbackCode.lastIndexOf('commit;'));
  });

  it('refuses before any change unless the exact acknowledgement is set', () => {
    expect(rollbackCode.trim().startsWith('begin;')).toBe(true);
    expect(rollbackCode.trim().endsWith('commit;')).toBe(true);
    const guard = rollbackCode.indexOf("current_setting('emblem.acknowledge_0089_rollback', true) is distinct from 'REOPEN-AUTHORIZATION-VULNERABILITY'");
    const firstChange = rollbackCode.search(/^(revoke|grant|alter policy|drop policy|create policy|create or replace function)\b/im);
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(firstChange);
    expect(rollbackCode).toContain('0089 rollback refused: it reopens the confirmed authorization vulnerability');
  });

  it('restores the four dropped policies and changes no data or default privileges', () => {
    for (const p of ['coach_team: a coach can attach themselves', 'guardians: a parent can link themselves', 'clubs: coaches can create', 'teams: coaches can create']) {
      expect(rollbackCode).toContain(`create policy "${p}"`);
    }
    expect(rollbackCode).not.toMatch(/alter\s+default\s+privileges/i);
    expect(topLevel(rollbackCode)).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
  });
});
