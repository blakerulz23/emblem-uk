import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0090_guardian_invite_write_lockdown.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/0090_rollback.sql', 'utf8');
const inviteSource = readFileSync('src/lib/create-guardian-invite.ts', 'utf8');
const code = sql.replace(/--.*$/gm, '');
const rollbackCode = rollback.replace(/--.*$/gm, '');
/** Top-level statements only: function bodies and DO blocks removed. */
const topLevel = (text: string) => text.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');
/** Every top-level statement that changes something, in order. */
const changes = (text: string) =>
  topLevel(text).match(/^(revoke|grant|alter|drop|create|insert|update|delete|truncate|comment)\b[^;]*/gim) ?? [];

const FIVE = ['player_id', 'code', 'created_by', 'invited_email', 'origin'];

/**
 * 0090 locks guardian-invite (player_invites) writes to the five columns a
 * legitimate signed-in inviter supplies. Its behaviour (the 0089 forgery
 * reproduced, every forged column, update and delete refused with no partial
 * write, trusted redemption unchanged, the exact catalog change, rollback and
 * re-apply) is proven against a production-matched PostgreSQL in
 * supabase/tests/authz/migration_0090_test.mjs. This file is the structural
 * half that runs with npm test.
 */
describe('migration 0090 — guardian-invite write lockdown', () => {
  it('runs in one transaction, with the 0089 precondition before any change', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
    const precondition = code.indexOf('do $$');
    const firstChange = code.search(/^(revoke|grant)\b/im);
    expect(precondition).toBeGreaterThan(0);
    expect(precondition).toBeLessThan(firstChange);
    expect(code).toContain('0090 refused: migration 0089 is not in place');
  });

  it('makes exactly two changes: removes anon/authenticated writes, then grants INSERT on the five columns', () => {
    expect(changes(code)).toEqual([
      'revoke insert, update, delete on public.player_invites from anon, authenticated',
      'grant insert (player_id, code, created_by, invited_email, origin) on public.player_invites to authenticated',
    ]);
  });

  it('never grants a status, attribution, timing, order or id column, and never touches service_role, policies or defaults', () => {
    const grant = code.match(/grant insert \(([^)]*)\) on public\.player_invites/)?.[1].split(',').map((c) => c.trim());
    expect(grant).toEqual(FIVE);
    for (const forbidden of ['used_at', 'used_by', 'created_at', 'expires_at', 'order_id', 'email_status', 'email_sent_at', 'id']) {
      expect(grant).not.toContain(forbidden);
    }
    expect(code).not.toMatch(/grant\s+(update|delete)/i);
    expect(code).not.toMatch(/service_role/i);
    expect(topLevel(code)).not.toMatch(/\bpolicy\b/i); // the precondition only reads pg_policies
    expect(code).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it('grants exactly the columns createGuardianInvite inserts for a signed-in caller (order_id only for a trusted order caller)', () => {
    const body = inviteSource.match(/\.from\('player_invites'\)\s*\.insert\(\{([\s\S]*?)\}\)\s*\.select\(/)?.[1] ?? '';
    const keys = Array.from(body.matchAll(/^\s*([a-z_]+)(?=[:,])/gm), (m) => m[1]);
    expect(keys.sort()).toEqual([...FIVE].sort());
    expect(body).toContain('...(orderId ? { order_id: orderId } : {})');
    expect(body).not.toMatch(/order_id:\s*orderId\s*\?\?\s*null/);
  });

  it('changes no data and creates no audit events', () => {
    expect(topLevel(code)).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
    expect(code).not.toContain('emblem.trusted_operation');
  });
});

describe('0090 rollback — emergency only', () => {
  it('warns prominently that it reopens guardian-invite forgery', () => {
    expect(rollback.split('\n').slice(0, 4).join('\n')).toContain('EMERGENCY ONLY: THIS ROLLBACK REOPENS GUARDIAN-INVITE FORGERY.');
    expect(rollback).not.toMatch(/\bsafe\b/i);
  });

  it('refuses before any change unless the exact acknowledgement is set, transaction-local', () => {
    expect(rollbackCode.trim().startsWith('begin;')).toBe(true);
    expect(rollbackCode.trim().endsWith('commit;')).toBe(true);
    const guard = rollbackCode.indexOf("current_setting('emblem.acknowledge_0090_rollback', true) is distinct from 'REOPEN-GUARDIAN-INVITE-FORGERY'");
    const firstChange = rollbackCode.search(/^(revoke|grant)\b/im);
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(firstChange);
    expect(rollbackCode).toContain('0090 rollback refused: it reopens guardian-invite forgery');
    expect(rollback).toContain("select set_config('emblem.acknowledge_0090_rollback', 'REOPEN-GUARDIAN-INVITE-FORGERY', true);");
  });

  it('restores exactly the 0089 grants and clears the acknowledgement before committing', () => {
    expect(changes(rollbackCode)).toEqual([
      'revoke insert (player_id, code, created_by, invited_email, origin) on public.player_invites from authenticated',
      'grant insert on public.player_invites to authenticated',
    ]);
    const clear = rollbackCode.indexOf("select set_config('emblem.acknowledge_0090_rollback', '', false);");
    expect(clear).toBeGreaterThan(rollbackCode.indexOf('grant insert on public.player_invites to authenticated;'));
    expect(clear).toBeLessThan(rollbackCode.lastIndexOf('commit;'));
    expect(rollbackCode).not.toMatch(/grant\s+(update|delete)/i);
    expect(rollbackCode).not.toMatch(/alter\s+default\s+privileges/i);
    expect(topLevel(rollbackCode)).not.toMatch(/^\s*(insert into|update public\.|delete from|truncate)\b/im);
  });
});
