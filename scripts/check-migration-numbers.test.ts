import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkMigrationDir, findMigrationNumberProblems, findReservedNumberProblems, findRetiredNumberProblems, RESERVED_NUMBERS, RETIRED_NUMBERS } from './check-migration-numbers.mjs';

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

  it('reserves 0088–0091 for the security release, 0092 for test-card archive, 0097 for the coach account-deletion fix, 0098 for acquisition samples and 0099 for the Season flag', () => {
    expect(RESERVED_NUMBERS).toEqual({
      '0088': 'relationship_authorization_foundation',
      '0089': 'relationship_authorization_lockdown',
      '0090': 'guardian_invite_write_lockdown',
      '0091': 'guardian_invite_code_confidentiality',
      '0092': 'test_card_archive',
      '0097': 'coach_account_deletion_verified_moments',
      '0098': 'acquisition_samples',
      '0099': 'season_feature_states',
    });
    expect(findReservedNumberProblems(fs.readdirSync('supabase/migrations'))).toEqual([]);
  });

  it('retires 0093 and 0094, which the real folder does not use, and no number is both reserved and retired', () => {
    expect(Object.keys(RETIRED_NUMBERS)).toEqual(['0093', '0094']);
    expect(Object.keys(RETIRED_NUMBERS).filter((n) => n in RESERVED_NUMBERS)).toEqual([]);
    expect(findRetiredNumberProblems(fs.readdirSync('supabase/migrations'))).toEqual([]);
  });

  it('reports a reserved number used by a different migration, and accepts the reserved ones', () => {
    expect(findReservedNumberProblems(['0088_test_card_archive.sql', '0091_achievement_card_reveals.sql', '0092_test_card_archive.sql', '0099_season_feature_states.sql', '0099_my_season.sql', '0100_anything.sql'])).toEqual([
      { number: '0088', file: '0088_test_card_archive.sql', reservedFor: '0088_relationship_authorization_foundation.sql' },
      { number: '0091', file: '0091_achievement_card_reveals.sql', reservedFor: '0091_guardian_invite_code_confidentiality.sql' },
      { number: '0099', file: '0099_my_season.sql', reservedFor: '0099_season_feature_states.sql' },
    ]);
  });

  it('reports any file using a retired number, including the old achievement-reveal name', () => {
    expect(findRetiredNumberProblems(['0092_test_card_archive.sql', '0093_achievement_card_reveals.sql', '0093_anything.sql', '0094_x.sql', '0095_uk_partner_programme.sql', 'notes.md'])).toEqual([
      { number: '0093', file: '0093_achievement_card_reveals.sql', reason: RETIRED_NUMBERS['0093'] },
      { number: '0093', file: '0093_anything.sql', reason: RETIRED_NUMBERS['0093'] },
      { number: '0094', file: '0094_x.sql', reason: RETIRED_NUMBERS['0094'] },
    ]);
  });

  it('the command exits non-zero with a "retired" message when a retired number is used', () => {
    const dir = tempMigrations(['0001_init.sql', '0094_x.sql']);
    let error: { status: number; stderr: Buffer } | undefined;
    try {
      execFileSync(process.execPath, ['scripts/check-migration-numbers.mjs', dir], { stdio: 'pipe' });
    } catch (e) {
      error = e as { status: number; stderr: Buffer };
    }
    expect(error?.status).toBe(1);
    expect(error?.stderr.toString()).toContain('Migration number 0094 is retired (never used; gap below applied 0095): 0094_x.sql');
  });

  it('the command exits non-zero on a reserved number used by another migration', () => {
    const dir = tempMigrations(['0001_init.sql', '0092_achievement_card_reveals.sql']);
    let error: { status: number; stderr: Buffer } | undefined;
    try {
      execFileSync(process.execPath, ['scripts/check-migration-numbers.mjs', dir], { stdio: 'pipe' });
    } catch (e) {
      error = e as { status: number; stderr: Buffer };
    }
    expect(error?.status).toBe(1);
    expect(error?.stderr.toString()).toContain('Migration number 0092 is reserved for 0092_test_card_archive.sql: 0092_achievement_card_reveals.sql');
  });

  it('rejects an unmerged branch 0097 file, which must be renumbered', () => {
    expect(findReservedNumberProblems(['0097_coach_account_deletion_verified_moments.sql', '0097_erase_print_pdfs_on_player_deletion.sql'])).toEqual([
      { number: '0097', file: '0097_erase_print_pdfs_on_player_deletion.sql', reservedFor: '0097_coach_account_deletion_verified_moments.sql' },
    ]);
  });

  it('the command exits zero when every number is used once', () => {
    const dir = tempMigrations(['0001_init.sql', '0002_grants.sql']);
    expect(execFileSync(process.execPath, ['scripts/check-migration-numbers.mjs', dir]).toString()).toContain('every number used once');
  });
});
