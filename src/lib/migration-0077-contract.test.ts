import { createHash } from 'node:crypto';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0077_cleanup_deletion_table_grants.sql', 'utf8');
const TABLE = 'public.squad_invite_participation_deletion_requests';

// The migration's own header documents a manual rollback in a SQL comment,
// which literally contains `grant ... to authenticated`/`to service_role`
// text describing what a future rollback would restore — that text must
// not be mistaken for an executable statement. Every assertion about what
// this migration actually *does* runs against the executable body only
// (between its own begin;/commit;), the same extraction the real apply
// script uses — never against the full file, which also carries prose
// references to other migration numbers for documentation purposes (the
// same convention 0072's own header comment already uses).
const beginIdx = sql.indexOf('\nbegin;\n');
const commitIdx = sql.lastIndexOf('\ncommit;');
const ddlBody = sql.slice(beginIdx + '\nbegin;\n'.length, commitIdx).trim();

describe('migration 0077 deletion-table grant cleanup contract', () => {
  it('is transactional', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('the entire executable body is exactly one revoke-all statement on the intended table — nothing else', () => {
    expect(ddlBody).toBe(`revoke all on ${TABLE} from public, anon, authenticated, service_role;`);
  });

  it('targets exactly the intended table, and no other', () => {
    const tableMentions = Array.from(ddlBody.matchAll(/(?:revoke|grant)[^;]*\bon\s+(\S+)/gi)).map((m) => m[1]);
    expect(tableMentions.length).toBeGreaterThan(0);
    for (const t of tableMentions) {
      expect(t).toBe(TABLE);
    }
  });

  it('explicitly revokes all privileges from public, anon, authenticated, and service_role', () => {
    const revokeMatch = ddlBody.match(/revoke all on public\.squad_invite_participation_deletion_requests from ([^;]+);/);
    expect(revokeMatch, 'expected an explicit revoke-all statement for this table').not.toBeNull();
    const roles = revokeMatch![1].split(',').map((r) => r.trim());
    expect(roles).toEqual(['public', 'anon', 'authenticated', 'service_role']);
  });

  it('anon and authenticated receive no privilege of any kind afterward — no grant statement to either role exists in the executable body', () => {
    expect(ddlBody).not.toMatch(/grant\s+[\s\S]*?\bto\s+anon\b/i);
    expect(ddlBody).not.toMatch(/grant\s+[\s\S]*?\bto\s+authenticated\b/i);
  });

  it('service_role receives only the application-required privileges — none, confirmed by exhaustive code search (see migration comment); no grant statement to service_role exists in the executable body', () => {
    expect(ddlBody).not.toMatch(/grant\s+[\s\S]*?\bto\s+service_role\b/i);
  });

  it('grants no privilege of any kind — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, or TRIGGER — to any role, since the executable body contains no grant statement at all', () => {
    expect(ddlBody).not.toMatch(/\bgrant\s/i);
  });

  it('contains no table, column, function, policy, or data mutation — one grant-cleanup statement only', () => {
    expect(ddlBody).not.toMatch(/\bcreate\s+table\b/i);
    expect(ddlBody).not.toMatch(/\balter\s+table\b/i);
    expect(ddlBody).not.toMatch(/\bdrop\s+table\b/i);
    expect(ddlBody).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/i);
    expect(ddlBody).not.toMatch(/\bdrop\s+function\b/i);
    expect(ddlBody).not.toMatch(/\bcreate\s+policy\b/i);
    expect(ddlBody).not.toMatch(/\bdrop\s+policy\b/i);
    expect(ddlBody).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from)\b/i);
  });

  it('does not modify migration 0076 or any earlier migration file', () => {
    // A prose reference to an earlier migration's name in an explanatory
    // comment (documentation precedent, matching 0072's own established
    // style) is expected and fine — what must never appear is a statement
    // that actually touches an object those migrations created. The single
    // statement this migration executes only ever names one object, this
    // table's own grants, asserted exactly above.
    expect(ddlBody).not.toMatch(/\b0071\b|\b0072\b|\b0075\b|\b0076\b/);
  });

  it('migration 0076 remains byte-identical to its released state', () => {
    const m0076 = readFileSync('supabase/migrations/0076_child_data_erasure.sql', 'utf8');
    const hash = createHash('sha256').update(m0076).digest('hex');
    // Released head b696f06f6b67dd1557a7efa471426dce1ff2bb0f, merged as
    // PR #40 (merge commit 0383166cd38bd40d171204121cddcc5ac02b40c4), and
    // independently confirmed applied to production with this exact hash.
    expect(hash).toBe('11bacb210251491009410617cb616982ea5568a334e2f6d5138a4eaee739a500');
  });
});
