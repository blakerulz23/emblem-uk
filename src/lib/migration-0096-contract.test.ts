import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0096_partner_tables_service_role_least_privilege.sql', 'utf8');
const statements = sql.replace(/--.*$/gm, '');

/**
 * migration 0096 — service_role least privilege on the partner tables.
 * Behaviour (app operations still work, DELETE refused, exact grants) is
 * proven on real Postgres with Supabase-style default privileges; this is
 * the CI-enforced shape.
 */
describe('migration 0096 — partner tables, service_role least privilege', () => {
  it('runs in one transaction', () => {
    expect(statements.trim().startsWith('begin;')).toBe(true);
    expect(statements.trim().endsWith('commit;')).toBe(true);
  });

  it('revokes everything from service_role on all four tables, then grants back exactly what the app uses', () => {
    expect(statements).toContain('revoke all on public.partners, public.partner_codes, public.partner_payouts, public.partner_commissions from service_role;');
    expect(statements).toContain('grant select, insert, update on public.partners, public.partner_codes, public.partner_payouts to service_role;');
    expect(statements).toContain('grant select on public.partner_commissions to service_role;');
    expect(statements).not.toMatch(/grant[^;]*\b(delete|truncate|references|trigger|all)\b[^;]*;/i);
  });

  it('keeps EXECUTE on the three intended functions and grants nothing on the integrity functions', () => {
    for (const fn of ['record_uk_partner_commission(uuid, text, integer)', 'void_uk_partner_commission(uuid, text)', 'create_uk_partner_payout(uuid, uuid)']) {
      expect(statements).toContain(`grant execute on function public.${fn} to service_role;`);
    }
    expect(statements).not.toMatch(/assert_partner_payout_balanced|partner_payout_balance_trigger/);
  });

  it('touches privileges only, and never 0095 objects or anon/authenticated', () => {
    expect(statements).not.toMatch(/\b(create|alter|drop|insert into|update public|delete from)\b/i);
    expect(statements).not.toMatch(/\b(anon|authenticated)\b/);
  });
});
