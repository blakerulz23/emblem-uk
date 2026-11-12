import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0099_gift_checkout_requires_guardian_approval.sql', 'utf8').replace(/\r\n/g, '\n');
const rollback = readFileSync('supabase/rollback/0099_rollback.sql', 'utf8').replace(/\r\n/g, '\n');
const m0080 = readFileSync('supabase/migrations/0080_gate3_payment_state.sql', 'utf8').replace(/\r\n/g, '\n');
const code = sql.replace(/--.*$/gm, '');
/** Top-level statements only: function bodies and DO blocks removed. */
const topLevel = (text: string) => text.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');
const changes = (text: string) =>
  topLevel(text.replace(/--.*$/gm, '')).match(/^(revoke|grant|alter|drop|create|insert|update|delete|truncate|comment)\b[^;]*/gim) ?? [];
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** One `create [or replace] function public.<name>(` statement, through its closing `$$;`. */
function fn(text: string, name: string): string {
  const start = text.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  if (start < 0) throw new Error(`${name} not found`);
  const end = text.indexOf('\n$$;', start) + 4;
  return text.slice(start, end);
}

/** The 0099 function with exactly its R5 additions removed. */
function withoutR5(body: string): string {
  return body
    .replace(/\n {2}v_gift_block text;/, '')
    .replace(/\n {2}-- 0099 \(R5\): a gift order needs[\s\S]*?return jsonb_build_object\('ok', false, 'reason', 'gift_approval_invalid'\);\n {2}end if;\n\n/, '\n')
    .replace(/\n {4}-- 0099 \(R5\): never mark a gift order paid[\s\S]*?'gift_approval_invalid', 'orderId', v_order\.id\);\n {4}end if;/, '');
}

/**
 * 0099 (R5) closes checkout and payment for a gift order whose approval came
 * from the buyer's own address. Its behaviour (refusals, fail-closed paths,
 * genuine and ordinary orders unaffected, rollback to the exact 0096
 * catalog) is proven against a production-matched PostgreSQL in
 * supabase/tests/authz/migration_0099_test.mjs. This file is the structural
 * half that runs with npm test.
 */
describe('migration 0099: gift-order checkout and payment require a genuine guardian approval', () => {
  it('is ASCII only and states the deploy order (app before migration)', () => {
    expect(/^[\x00-\x7f]*$/.test(sql.replace(/\u2014/g, '-'))).toBe(true);
    expect(sql).toContain('DEPLOY ORDER: the app change');
  });

  it('runs in one transaction, with the 0080 precondition before any change', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
    const precondition = code.indexOf('do $$');
    const firstChange = code.search(/^create\b/im);
    expect(precondition).toBeGreaterThan(0);
    expect(precondition).toBeLessThan(firstChange);
    expect(code).toContain('0099 refused: the expected 0080 state is not in place');
    expect(code).toContain('0099 already applied');
  });

  it('creates one helper and replaces exactly the two 0080 payment functions; no table, policy, data or other grant changes', () => {
    const made = changes(sql).map(squash);
    expect(made).toEqual([
      'create function public.gift_order_checkout_block_reason( p_order_id uuid ) returns text language plpgsql stable set search_path = \'\' as',
      'revoke all on function public.gift_order_checkout_block_reason(uuid) from public, anon, authenticated',
      'grant execute on function public.gift_order_checkout_block_reason(uuid) to service_role',
      expect.stringMatching(/^comment on function public\.gift_order_checkout_block_reason\(uuid\) is/),
      'create or replace function public.begin_gate3_checkout( p_order_id uuid ) returns jsonb language plpgsql security definer set search_path = \'\' as',
      expect.stringMatching(/^create or replace function public\.apply_gate3_payment_event\(.*security definer set search_path = '' as$/),
    ]);
  });

  it('the helper is not SECURITY DEFINER and never callable by anon or authenticated', () => {
    expect(fn(sql, 'gift_order_checkout_block_reason')).not.toMatch(/security definer/i);
  });

  it('begin_gate3_checkout is the 0080 body plus only the gift-approval check, placed before any write', () => {
    const body = fn(sql, 'begin_gate3_checkout');
    expect(withoutR5(body)).toBe(fn(m0080, 'begin_gate3_checkout'));
    const check = body.indexOf('gift_order_checkout_block_reason(v_order.id)');
    // 0080's refusal order is kept: authority, already paid, closed; then the gift check; then pricing and the only write.
    expect(check).toBeGreaterThan(body.indexOf("'authority_not_confirmed'"));
    expect(check).toBeGreaterThan(body.indexOf("'already_paid'"));
    expect(check).toBeGreaterThan(body.indexOf("'order_' || v_order.payment_status"));
    expect(check).toBeLessThan(body.indexOf("'pricing_not_available'"));
    expect(check).toBeLessThan(body.indexOf('update public.orders'));
    // Fail closed: an error in the check refuses checkout.
    expect(body).toMatch(/exception when others then\s+return jsonb_build_object\('ok', false, 'reason', 'gift_approval_unverified'\);/);
  });

  it('apply_gate3_payment_event is the 0080 body plus only the check on paid, before the paid update, with no exception handler', () => {
    const body = fn(sql, 'apply_gate3_payment_event');
    expect(withoutR5(body)).toBe(fn(m0080, 'apply_gate3_payment_event'));
    const check = body.indexOf('gift_order_checkout_block_reason(v_order.id)');
    expect(check).toBeGreaterThan(body.indexOf("if p_to_status = 'paid' then"));
    expect(check).toBeLessThan(body.indexOf("payment_status = 'paid',"));
    expect(check).toBeGreaterThan(body.indexOf('on conflict (id) do nothing'));
    // An error must roll back the whole call (dedup row included), so no handler.
    expect(body).not.toMatch(/exception\s+when/i);
    expect(body).toContain("'paid_refused_gift_approval_invalid'");
  });

  it('the helper applies the same rule as loadApprovedGuardianEmail: latest approved request, trimmed and lower-cased, purchaser or any declaring adult', () => {
    const body = fn(sql, 'gift_order_checkout_block_reason');
    expect(body).toContain("r.status = 'approved'");
    // PostgREST's descending order puts NULL first; the helper matches it.
    expect(body).toContain('order by r.responded_at desc nulls first, r.created_at desc');
    // JavaScript trim(): all leading/trailing whitespace, including no-break and BOM.
    const TRIM = String.raw`'^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g'`;
    expect(body).toContain(`lower(regexp_replace(r.guardian_email, ${TRIM}))`);
    expect(body).toContain(`lower(regexp_replace(coalesce(v_order.purchaser_email, ''), ${TRIM}))`);
    expect(body).toContain(`lower(regexp_replace(d.adult_email, ${TRIM})) = v_approver`);
    expect(body).not.toContain('btrim');
    // Non-gift orders return before any approval table is read.
    expect(body.indexOf('return null;')).toBeLessThan(body.indexOf('builder_guardian_approval_requests'));
  });
});

describe('0099 rollback: emergency only', () => {
  it('refuses without the transaction-local acknowledgement, and clears it', () => {
    expect(rollback).toContain("current_setting('emblem.acknowledge_0099_rollback', true) is distinct from 'REOPEN-SELF-APPROVED-GIFT-CHECKOUT'");
    expect(rollback).toContain("select set_config('emblem.acknowledge_0099_rollback', '', false);");
    expect(rollback.replace(/--.*$/gm, '').trim().startsWith('begin;')).toBe(true);
    expect(rollback.replace(/--.*$/gm, '').trim().endsWith('commit;')).toBe(true);
  });

  it('restores both functions verbatim from 0080 and drops the helper; nothing else', () => {
    expect(fn(rollback, 'begin_gate3_checkout')).toBe(fn(m0080, 'begin_gate3_checkout'));
    expect(fn(rollback, 'apply_gate3_payment_event')).toBe(fn(m0080, 'apply_gate3_payment_event'));
    expect(changes(rollback).map(squash).map((s) => s.slice(0, 60))).toEqual([
      'create or replace function public.begin_gate3_checkout( p_or',
      'create or replace function public.apply_gate3_payment_event(',
      'drop function public.gift_order_checkout_block_reason(uuid)',
    ]);
  });
});
