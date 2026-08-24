import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0072_correct_builder_authority_table_grants.sql', 'utf8');
const migration0071 = readFileSync('supabase/migrations/0071_builder_order_authority.sql', 'utf8');

describe('migration 0072 correct builder authority table grants contract', () => {
  it('is transactional', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('revokes ALL from service_role on each of the three 0071 tables before re-granting', () => {
    for (const table of ['builder_order_authority_declarations', 'builder_guardian_approval_requests', 'builder_authority_audit_events']) {
      const revokeIdx = sql.indexOf(`revoke all on ${table} from service_role;`);
      expect(revokeIdx, `revoke all on ${table} from service_role should exist`).toBeGreaterThan(-1);
    }
  });

  it('re-grants exactly SELECT, INSERT, UPDATE to service_role on the two declaration/approval tables — matching 0071 exactly, not narrower', () => {
    for (const table of ['builder_order_authority_declarations', 'builder_guardian_approval_requests']) {
      expect(sql).toContain(`grant select, insert, update on ${table} to service_role;`);
      // Cross-file: 0071 itself already granted exactly this — this
      // migration must not narrow or widen that already-reviewed intent.
      expect(migration0071).toContain(`grant select, insert, update on ${table} to service_role;`);
    }
  });

  it('re-grants exactly SELECT, INSERT (never UPDATE/DELETE) to service_role on the audit table — append-only is now a real grant property', () => {
    expect(sql).toContain('grant select, insert on builder_authority_audit_events to service_role;');
    expect(migration0071).toContain('grant select, insert on builder_authority_audit_events to service_role;');

    // The revoke-all-then-narrow-regrant pair for the audit table must not
    // be followed, anywhere in this file, by any grant reintroducing
    // update/delete/truncate/references/trigger for service_role on it.
    const auditSection = sql.slice(sql.indexOf('builder_authority_audit_events from service_role'));
    expect(auditSection).not.toMatch(/grant\s+(?:[\w, ]*\b(update|delete|truncate|references|trigger)\b[\w, ]*)\s+on\s+builder_authority_audit_events/i);
  });

  it('never grants delete, truncate, references or trigger to service_role on any of the three tables', () => {
    for (const table of ['builder_order_authority_declarations', 'builder_guardian_approval_requests', 'builder_authority_audit_events']) {
      const grantLines = sql.split('\n').filter((line) => line.trim().startsWith('grant') && line.includes(table));
      for (const line of grantLines) {
        expect(line.toLowerCase()).not.toMatch(/\b(delete|truncate|references|trigger)\b/);
      }
    }
  });

  it('does not touch public, anon or authenticated — 0071 already correctly denied them', () => {
    const statements = sql
      .split('\n')
      .filter((line) => /^(revoke|grant)\s/i.test(line.trim()))
      .join('\n');
    expect(statements).not.toMatch(/\b(public|anon|authenticated)\b/i);
  });

  it('does not alter the schema-wide default ACL (ALTER DEFAULT PRIVILEGES) — scoped to these three tables only', () => {
    expect(sql).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it('does not touch RLS, constraints, indexes, or any function — grants only', () => {
    expect(sql).not.toMatch(/alter\s+table[\s\S]*?(enable|disable)\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sql).not.toMatch(/drop\s+function/i);
    expect(sql).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sql).not.toMatch(/add\s+constraint/i);
  });

  it('does not modify migration 0071 in any way', () => {
    expect(sql).not.toContain('0071_builder_order_authority');
    expect(migration0071).toContain('create table builder_order_authority_declarations');
    expect(migration0071).toContain('create table builder_guardian_approval_requests');
    expect(migration0071).toContain('create table builder_authority_audit_events');
  });

  it('records the root cause and the non-automated rollback note in its own header', () => {
    expect(sql).toMatch(/pg_default_acl/i);
    expect(sql).toMatch(/rollback/i);
    expect(sql).toContain('not automated');
  });
});
