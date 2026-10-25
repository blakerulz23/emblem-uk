import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0095_uk_partner_programme.sql', 'utf8');

/**
 * migration 0095 (UK partner programme) — CI-enforced shape. The behaviour
 * itself (crediting, voids, payouts, privileges) is proven against real
 * Postgres in supabase/tests/0095_uk_partner_programme_pglite_test.mjs.
 */
describe('migration 0095 — UK partner programme', () => {
  const tables = ['partners', 'partner_codes', 'partner_commissions', 'partner_payouts'];

  it('runs in one transaction', () => {
    expect(sql.trimStart().indexOf('begin;')).toBeGreaterThan(-1);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });

  it.each(tables)('%s has RLS on and nothing granted to anon or authenticated', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
    expect(sql).not.toMatch(new RegExp(`grant [^;]* on [^;]*public\\.${table}[^;]* to [^;]*(anon|authenticated)`));
    expect(sql).not.toMatch(new RegExp(`create policy [^;]* on public\\.${table}`));
  });

  it('every function is security definer with a pinned search_path and executable by service_role only', () => {
    for (const fn of ['record_uk_partner_commission(uuid, text, integer)', 'void_uk_partner_commission(uuid, text)', 'create_uk_partner_payout(uuid, uuid)']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
    }
    expect((sql.match(/security definer\s+set search_path = public, pg_temp/g) ?? []).length).toBe(3);
  });

  it('a commission is unique per order, so a retried webhook can never credit twice', () => {
    expect(sql).toMatch(/order_id uuid not null unique references public\.orders/);
    expect(sql).toContain('on conflict (order_id) do nothing');
  });

  it('keeps the terms the app shows: 45-day hold and £40 payout minimum', () => {
    expect(sql).toContain("now() + interval '45 days'");
    expect(sql).toContain('if v_total < 4000 then');
  });

  it('touches no existing table, policy or function', () => {
    expect(sql).not.toMatch(/alter table public\.(?!partners|partner_codes|partner_commissions|partner_payouts)\w+/);
    expect(sql).not.toMatch(/drop (table|function|policy)/i);
  });
});
