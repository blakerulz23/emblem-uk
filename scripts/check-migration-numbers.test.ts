import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkMigrationDir, findMigrationNumberProblems } from './check-migration-numbers.mjs';

const tempDirs: string[] = [];
function tempMigrations(files: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-numbers-'));
  tempDirs.push(dir);
  for (const f of files) fs.writeFileSync(path.join(dir, f), '-- synthetic\n');
  return dir;
}
afterEach(() => {
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('migration number uniqueness', () => {
  it('the real supabase/migrations folder uses every number once', () => {
    expect(checkMigrationDir('supabase/migrations')).toEqual({ duplicates: [], malformed: [] });
  });

  it('reports two files sharing a number', () => {
    expect(findMigrationNumberProblems(['0087_a.sql', '0088_first.sql', '0088_second.sql'])).toEqual({
      duplicates: [{ number: '0088', files: ['0088_first.sql', '0088_second.sql'] }],
      malformed: [],
    });
  });

  it('reports files that are not NNNN_name.sql', () => {
    expect(findMigrationNumberProblems(['0001_ok.sql', '88_short.sql', 'notes.md', '0002-dash.sql']).malformed).toEqual(['0002-dash.sql', '88_short.sql', 'notes.md']);
  });

  it('the command exits non-zero with a clear message on a synthetic duplicate', () => {
    const dir = tempMigrations(['0001_init.sql', '0088_test_card_archive.sql', '0088_relationship_authorization_foundation.sql']);
    let error: { status: number; stderr: Buffer } | undefined;
    try {
      execFileSync(process.execPath, ['scripts/check-migration-numbers.mjs', dir], { stdio: 'pipe' });
    } catch (e) {
      error = e as { status: number; stderr: Buffer };
    }
    expect(error?.status).toBe(1);
    expect(error?.stderr.toString()).toContain('Duplicate migration number 0088: 0088_relationship_authorization_foundation.sql, 0088_test_card_archive.sql');
  });

  it('the command exits zero when every number is used once', () => {
    const dir = tempMigrations(['0001_init.sql', '0002_grants.sql']);
    expect(execFileSync(process.execPath, ['scripts/check-migration-numbers.mjs', dir]).toString()).toContain('every number used once');
  });
});
