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
    expect(code).not.toMatch(/\bdrop\s+(policy|table|column|function|trigger|index|constraint)\b/i);
    const revokes = code.match(/revoke[^;]+;/gi) ?? [];
    const newObjects = [
      'coach_assignment_is_active', 'coach_team_requests', 'enforce_coach_team_request_transition',
      'relationship_audit_events', 'reject_relationship_audit_mutation', 'record_relationship_audit_event',
      'approve_coach_team_request', 'reject_coach_team_request', 'cancel_own_coach_team_request', 'end_coach_assignment',
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
  });

  it('keeps staff functions off the signed-in role', () => {
    for (const f of ['approve_coach_team_request', 'reject_coach_team_request', 'end_coach_assignment']) {
      const grant = code.match(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to ([^;]+);`))!;
      expect(grant[1].trim()).toBe('service_role');
    }
  });

  it('never overwrites an existing role on approval', () => {
    expect(code).toContain("update public.profiles set role = 'coach' where id = v_request.requester_profile_id and role is null;");
  });

  it('the rollback undoes every new object and restores the helpers with search_path public', () => {
    for (const o of ['relationship_audit_events', 'coach_team_requests', 'record_relationship_audit_event', 'coach_assignment_is_active',
      'approve_coach_team_request', 'reject_coach_team_request', 'cancel_own_coach_team_request', 'end_coach_assignment']) {
      expect(rollback).toContain(`public.${o}`);
    }
    expect((rollback.match(/set search_path = public/g) ?? []).length).toBe(2);
  });
});
