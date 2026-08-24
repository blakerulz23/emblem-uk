import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/0071_builder_order_authority.sql'), 'utf8');
// This migration's own comments legitimately mention create_authoritative_order,
// squad_invite_* and digest() by name to explain what it deliberately does
// NOT do (see its header comment) — the checks below therefore run against
// the executable SQL only, with `--` line comments stripped, so they test
// actual DDL/behaviour rather than prose.
const executableSql = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('migration 0071 builder order authority contract', () => {
  it('never touches create_authoritative_order (0048) or any squad_invite_* object', () => {
    expect(executableSql).not.toContain('create_authoritative_order');
    expect(executableSql.toLowerCase()).not.toContain('squad_invite');
  });

  it('adds authority_status as a nullable, separately-constrained column on orders', () => {
    expect(sql).toContain('alter table orders add column authority_status text;');
    expect(sql).toContain("'confirmed', 'guardian_approval_pending', 'guardian_approved', 'guardian_declined'");
  });

  it('rejects a declaration unless all three confirmations are explicitly true', () => {
    expect(sql).toContain(
      'if not (p_confirmed_age_and_authority and p_confirmed_photo_permission and p_confirmed_card_creation) then'
    );
    expect(sql).toContain("raise exception 'all three confirmations are required'");
  });

  it('requires an authenticated session before recording a declaration', () => {
    expect(sql).toContain('if auth.uid() is null then');
    expect(sql).toContain("raise exception 'Not authenticated'");
  });

  it('never hashes a token in SQL — every token_hash parameter is pre-hashed text from TypeScript', () => {
    // A real in-SQL hash call always looks like encode(digest(...), 'hex') —
    // checked for that specific invocation shape rather than the bare word
    // "digest", since this migration's own comment/doc-string text
    // legitimately explains, by name, that digest() is deliberately never
    // called (see respond_to_builder_guardian_approval's comment).
    expect(sql).not.toMatch(/encode\s*\(\s*digest\s*\(/);
    expect(sql).not.toMatch(/create extension.*pgcrypto/i);
    expect(sql).toContain("p_token_hash !~ '^[a-f0-9]{64}$'");
  });

  it('link_builder_order_authority no longer creates a guardian_approval_requests row directly', () => {
    // The token-lifecycle fix: the pending branch only flips authority_status
    // and audits the event — it must not also insert into
    // builder_guardian_approval_requests (that happens later, in one step,
    // once the real guardian email is known).
    const start = sql.indexOf('create or replace function public.link_builder_order_authority');
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end);
    expect(body).toContain("update public.orders set authority_status = 'guardian_approval_pending'");
    expect(body).not.toContain('insert into public.builder_guardian_approval_requests');
  });

  it('creates the guardian approval request in one step, alongside the real email and a fresh token hash', () => {
    const start = sql.indexOf('create or replace function public.create_builder_guardian_approval_request');
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end);
    expect(body).toContain('insert into public.builder_guardian_approval_requests');
    expect(body).toContain("raise exception 'order is not awaiting guardian approval'");
  });

  it('locks the order row before revoking/inserting, so two concurrent guardian-email submits cannot both leave a pending token', () => {
    const start = sql.indexOf('create or replace function public.create_builder_guardian_approval_request');
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end);
    const lockIndex = body.indexOf('for update');
    const revokeIndex = body.indexOf("set status = 'revoked'");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(revokeIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(revokeIndex);
  });

  it('locks the approval-request row before checking pending status, so a double-click cannot apply two decisions', () => {
    const start = sql.indexOf('create or replace function public.respond_to_builder_guardian_approval');
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end);
    const lockIndex = body.indexOf('for update');
    const pendingCheckIndex = body.indexOf("v_request.status <> 'pending'");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(pendingCheckIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(pendingCheckIndex);
  });

  it('a declined guardian decision is documented as permanent and unblockable by staff', () => {
    expect(sql).toContain('Staff review cannot override a guardian refusal');
  });

  it('gives the audit table insert-only grants (no update/delete) for immutability', () => {
    const start = sql.indexOf('create table builder_authority_audit_events');
    const end = sql.indexOf('create or replace function public.record_builder_authority_declaration');
    const section = sql.slice(start, end);
    expect(section).toContain('grant select, insert on builder_authority_audit_events to service_role');
    expect(section).not.toMatch(/grant[^;]*update[^;]*builder_authority_audit_events/i);
    expect(section).not.toMatch(/grant[^;]*delete[^;]*builder_authority_audit_events/i);
  });

  it('enables RLS with no policies on every new table (service-role-only by default-deny)', () => {
    for (const table of [
      'builder_order_authority_declarations',
      'builder_guardian_approval_requests',
      'builder_authority_audit_events',
    ]) {
      expect(sql).toContain(`alter table ${table} enable row level security`);
      expect(sql).not.toContain(`create policy`);
    }
  });

  it('records the staff-approval-blocked audit event type for the approve-route gate', () => {
    expect(sql).toContain("'staff_approval_blocked'");
  });
});
