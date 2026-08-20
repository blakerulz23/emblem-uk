import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0065_squad_invite_configurable_grace_period.sql', 'utf8');

describe('migration 0065 configurable Squad Invite grace period contract', () => {
  it('never has the old unconditional body — assignment immediately after begin, with no guard at all', () => {
    expect(sql).not.toMatch(/begin\s*\n\s*new\.grace_ends_at := new\.deadline_at \+ interval '24 hours';/);
  });

  it("case 1 — INSERT with no grace supplied: falls back to deadline_at + 24h", () => {
    expect(sql).toContain("if tg_op = 'INSERT' then");
    const insertBranch = sql.slice(sql.indexOf("if tg_op = 'INSERT' then"), sql.indexOf("elsif tg_op = 'UPDATE' then"));
    expect(insertBranch).toContain('if new.grace_ends_at is null then');
    expect(insertBranch).toContain("new.grace_ends_at := new.deadline_at + interval '24 hours';");
  });

  it('case 2 — INSERT with an explicit grace supplied: respected, the INSERT branch never touches a non-null value', () => {
    const insertBranch = sql.slice(sql.indexOf("if tg_op = 'INSERT' then"), sql.indexOf("elsif tg_op = 'UPDATE' then"));
    // The only assignment in this branch is guarded by `is null` — nothing
    // unconditionally overwrites a caller-supplied value.
    const assignmentCount = (insertBranch.match(/new\.grace_ends_at :=/g) ?? []).length;
    expect(assignmentCount).toBe(1);
    expect(insertBranch).toMatch(/if new\.grace_ends_at is null then\s*\n\s*new\.grace_ends_at :=/);
  });

  it('case 3 — UPDATE of deadline_at only (grace_ends_at unchanged in the same statement): recomputes', () => {
    expect(sql).toContain("elsif tg_op = 'UPDATE' then");
    const updateBranch = sql.slice(sql.indexOf("elsif tg_op = 'UPDATE' then"));
    expect(updateBranch).toContain('new.deadline_at is distinct from old.deadline_at');
    expect(updateBranch).toContain('and new.grace_ends_at is not distinct from old.grace_ends_at then');
    expect(updateBranch).toContain("new.grace_ends_at := new.deadline_at + interval '24 hours';");
  });

  it('case 4 — UPDATE where both deadline_at and grace_ends_at changed together: caller\'s value wins, untouched', () => {
    const updateBranch = sql.slice(sql.indexOf("elsif tg_op = 'UPDATE' then"));
    // The recompute is gated on grace_ends_at NOT having changed. When both
    // change, that condition is false, and the only other branch is the
    // null-fallback — so a caller-supplied non-null grace_ends_at can never
    // be reached/overwritten by this function when it deliberately changed
    // grace_ends_at itself in the same statement.
    expect(updateBranch).toContain('elsif new.grace_ends_at is null then');
    const updateAssignmentCount = (updateBranch.match(/new\.grace_ends_at :=/g) ?? []).length;
    expect(updateAssignmentCount).toBe(2);
  });

  it('keeps the trigger function locked down exactly as before — no execute grant to anyone, not even service_role', () => {
    expect(sql).toContain('revoke all on function public.derive_squad_invite_grace_end() from public, anon, authenticated, service_role');
  });

  it('explicitly drops the old 3-argument approve_squad_invite_request before creating the 4-argument version, avoiding an ambiguous overload', () => {
    const dropIndex = sql.indexOf('drop function if exists public.approve_squad_invite_request(uuid, uuid, text);');
    const createIndex = sql.indexOf('create or replace function public.approve_squad_invite_request(');
    expect(dropIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(dropIndex);
  });

  it('adds p_grace_hours with a default of 24 — an existing 3-arg caller keeps getting exactly 24h', () => {
    expect(sql).toContain('p_parent_link_hash text, p_grace_hours integer default 24');
  });

  it('validates p_grace_hours defensively — never a silently absurd interval', () => {
    expect(sql).toContain('if p_grace_hours is null or p_grace_hours < 1 or p_grace_hours > 720 then raise exception');
  });

  it('supplies grace_ends_at explicitly in the insert, computed from p_grace_hours', () => {
    expect(sql).toContain('deadline_at,grace_ends_at,');
    expect(sql).toContain("v_request.proposed_deadline_at + (p_grace_hours || ' hours')::interval");
  });

  it('never changes the security posture of approve_squad_invite_request — still security definer, still approver-gated, still service_role-only execute', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain("permission='squad_invite_approver'");
    expect(sql).toContain('revoke all on function public.approve_squad_invite_request(uuid,uuid,text,integer) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.approve_squad_invite_request(uuid,uuid,text,integer) to service_role');
  });

  it('never touches commit_squad_invite_participation_order or any other reader of grace_ends_at', () => {
    expect(sql).not.toContain('commit_squad_invite_participation_order');
  });

  it('is additive-only to the parent link expiry, still a flat 24h window unrelated to p_grace_hours', () => {
    expect(sql).toContain("v_request.proposed_deadline_at + interval '24 hours',p_staff_profile_id) returning id into v_link_id");
  });
});
