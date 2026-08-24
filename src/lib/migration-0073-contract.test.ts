import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/0073_restrict_authenticated_card_column_access.sql'), 'utf8');
const executableSql = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('migration 0073 card claim-token access hotfix contract', () => {
  it('revokes the broad table-level authenticated SELECT grant on cards', () => {
    expect(executableSql).toMatch(/revoke\s+select\s+on\s+public\.cards\s+from\s+authenticated\s*;/i);
  });

  it('re-grants SELECT to authenticated only for a column-scoped list', () => {
    expect(executableSql).toMatch(/grant\s+select\s*\([^)]+\)\s+on\s+public\.cards\s+to\s+authenticated\s*;/i);
  });

  it('never grants claim_token or nfc_uid to authenticated, anywhere in the file', () => {
    const grantLines = executableSql
      .split('\n')
      .filter((line) => /grant\s+select/i.test(line) && /authenticated/i.test(line));
    expect(grantLines.length).toBeGreaterThan(0);
    for (const line of grantLines) {
      expect(line.toLowerCase()).not.toContain('claim_token');
      expect(line.toLowerCase()).not.toContain('nfc_uid');
    }
  });

  it('grants exactly the three columns proven necessary by the one legitimate authenticated read (player_id, card_definition_id, created_at)', () => {
    const match = executableSql.match(/grant\s+select\s*\(([^)]+)\)\s+on\s+public\.cards\s+to\s+authenticated\s*;/i);
    expect(match).not.toBeNull();
    const columns = (match?.[1] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    expect(columns.sort()).toEqual(['card_definition_id', 'created_at', 'player_id'].sort());
  });

  it('does not touch anon (which already has no grant on cards)', () => {
    expect(executableSql.toLowerCase()).not.toMatch(/\banon\b/);
  });

  it('does not create, alter or drop any RLS policy on cards — row visibility is unchanged, only column visibility', () => {
    expect(executableSql).not.toMatch(/create\s+policy/i);
    expect(executableSql).not.toMatch(/alter\s+policy/i);
    expect(executableSql).not.toMatch(/drop\s+policy/i);
    expect(executableSql).not.toMatch(/row\s+level\s+security/i);
  });

  it('does not touch service_role grants (already correct since migration 0037) or any other table', () => {
    expect(executableSql.toLowerCase()).not.toContain('service_role');
    expect(executableSql).not.toMatch(/\bon\s+public\.(?!cards\b)\w+/i);
  });

  it('does not create, alter, or reference any RPC/function — no claim-flow redesign', () => {
    expect(executableSql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(executableSql).not.toMatch(/security\s+definer/i);
  });

  it('documents the full column classification for cards, not just the changed columns', () => {
    // The migration's own header comment must classify every real column
    // on `cards` (secret/restricted/staff-only/safe) so a future column
    // addition can't silently inherit a broad grant without a deliberate
    // decision — checked against the sql source (not executableSql, since
    // this is documentation content living inside -- comments).
    for (const column of [
      'claim_token', 'nfc_uid', 'player_id', 'order_id', 'status',
      'card_definition_id', 'production_status', 'production_submitted_at',
      'production_dismissed_at', 'claim_reminder_sent_at', 'created_at',
    ]) {
      expect(sql).toContain(column);
    }
  });
});
