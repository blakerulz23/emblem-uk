import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0091_guardian_invite_code_confidentiality.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/0091_rollback.sql', 'utf8');
const lockdown = readFileSync('supabase/migrations/0089_relationship_authorization_lockdown.sql', 'utf8');
const code = sql.replace(/--.*$/gm, '');
const rollbackCode = rollback.replace(/--.*$/gm, '');
/** Top-level statements only: function bodies and DO blocks removed. */
const topLevel = (text: string) => text.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');
/** Every top-level statement that changes something, in order. */
const changes = (text: string) =>
  topLevel(text).match(/^(revoke|grant|alter|drop|create|insert|update|delete|truncate|comment)\b[^;]*/gim) ?? [];
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const COACH_POLICY = 'alter policy "player_invites: coaches can view/create for their team" on public.player_invites';

/** The coach SELECT policy exactly as 0089 (and therefore 0090) left it. */
const policy0089 = squash(lockdown.slice(lockdown.indexOf(COACH_POLICY), lockdown.indexOf(';', lockdown.indexOf(COACH_POLICY))));

/**
 * 0091 keeps guardian-invite codes with the people who created them: a coach
 * reads only invites they created. Its behaviour (the disclosure reproduced
 * at 0090, every reader's access after 0091, the exact one-policy catalog
 * change, rollback, reopening and re-apply) is proven against a
 * production-matched PostgreSQL in supabase/tests/authz/migration_0091_test.mjs.
 * This file is the structural half that runs with npm test.
 */
describe('migration 0091 — guardian-invite code confidentiality', () => {
  it('runs in one transaction, with the 0090 precondition before any change', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
    const precondition = code.indexOf('do $$');
    const firstChange = code.search(/^alter\b/im);
    expect(precondition).toBeGreaterThan(0);
    expect(precondition).toBeLessThan(firstChange);
    expect(code).toContain('0091 refused: the expected 0090 state is not in place');
    expect(code).toContain('already requires created_by');
  });

  it('makes exactly one change: the coach SELECT policy additionally requires created_by = auth.uid()', () => {
    const made = changes(code).map(squash);
    expect(made).toHaveLength(1);
    expect(made[0].startsWith(squash(COACH_POLICY))).toBe(true);
    // The 0089 condition is kept unchanged, with created_by = auth.uid() added in front.
    const before = policy0089.slice(policy0089.indexOf('using (') + 'using ('.length, -1);
    expect(made[0]).toBe(`${squash(COACH_POLICY)} using (((created_by = auth.uid()) AND ${before}))`);
  });

  it('never uses origin for authorization and touches no grant, function, other policy, data or service_role', () => {
    expect(topLevel(code)).not.toMatch(/\borigin\b/);
    expect(code).not.toMatch(/^\s*(grant|revoke)\b/im);
    expect(code).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(code).not.toMatch(/service_role/i);
    expect(code).not.toContain('guardians can view/create for their player" on');
    expect(topLevel(code)).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
    expect(code).not.toContain('emblem.trusted_operation');
  });
});

describe('0091 rollback — emergency only', () => {
  it('warns prominently that it reopens guardian-invite code disclosure and relay', () => {
    expect(rollback.split('\n').slice(0, 4).join('\n')).toContain('EMERGENCY ONLY: THIS ROLLBACK REOPENS GUARDIAN-INVITE CODE DISCLOSURE AND RELAY.');
    expect(rollback).not.toMatch(/\bsafe\b/i);
  });

  it('refuses before any change unless the exact acknowledgement is set, transaction-local', () => {
    expect(rollbackCode.trim().startsWith('begin;')).toBe(true);
    expect(rollbackCode.trim().endsWith('commit;')).toBe(true);
    const guard = rollbackCode.indexOf("current_setting('emblem.acknowledge_0091_rollback', true) is distinct from 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE'");
    const firstChange = rollbackCode.search(/^alter\b/im);
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(firstChange);
    expect(rollbackCode).toContain('0091 rollback refused: it reopens guardian-invite code disclosure and relay');
    expect(rollback).toContain("select set_config('emblem.acknowledge_0091_rollback', 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE', true);");
  });

  it('restores exactly the 0089/0090 coach policy and clears the acknowledgement before committing', () => {
    const made = changes(rollbackCode).map(squash);
    expect(made).toEqual([policy0089]);
    const clear = rollbackCode.indexOf("select set_config('emblem.acknowledge_0091_rollback', '', false);");
    expect(clear).toBeGreaterThan(rollbackCode.indexOf(COACH_POLICY));
    expect(clear).toBeLessThan(rollbackCode.lastIndexOf('commit;'));
    expect(topLevel(rollbackCode)).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
  });
});
