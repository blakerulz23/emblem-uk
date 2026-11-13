import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkMigrationDir, findMigrationNumberProblems, findReservedNumberProblems, RESERVED_NUMBERS } from './check-migration-numbers.mjs';

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

  it('reserves 0088–0091 for the security release, 0092 for test-card archive, 0093 for achievement reveals, 0097–0098 for the deletion fixes, 0099 for Season feature states, 0100 for acquisition samples and 0101 for the R5 checkout gate', () => {
    expect(RESERVED_NUMBERS).toEqual({
      '0088': 'relationship_authorization_foundation',
      '0089': 'relationship_authorization_lockdown',
      '0090': 'guardian_invite_write_lockdown',
      '0091': 'guardian_invite_code_confidentiality',
      '0092': 'test_card_archive',
      '0093': 'achievement_card_reveals',
      '0097': 'coach_account_deletion_verified_moments',
      '0098': 'deletion_review_suspension_and_verifier_identity',
      '0099': 'season_feature_states',
      '0100': 'acquisition_samples',
      '0101': 'gift_checkout_requires_guardian_approval',
    });
    expect(findReservedNumberProblems(fs.readdirSync('supabase/migrations'))).toEqual([]);
  });

  it('reports a reserved number used by a different migration, and accepts the reserved ones', () => {
    expect(findReservedNumberProblems(['0088_test_card_archive.sql', '0091_achievement_card_reveals.sql', '0092_test_card_archive.sql', '0093_achievement_card_reveals.sql', '0094_anything.sql'])).toEqual([
      { number: '0088', file: '0088_test_card_archive.sql', reservedFor: '0088_relationship_authorization_foundation.sql' },
      { number: '0091', file: '0091_achievement_card_reveals.sql', reservedFor: '0091_guardian_invite_code_confidentiality.sql' },
    ]);
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

  it('rejects acquisition samples at its old number 0098; accepts it at 0100', () => {
    expect(findReservedNumberProblems(['0098_acquisition_samples.sql', '0100_acquisition_samples.sql', '0102_anything.sql'])).toEqual([
      { number: '0098', file: '0098_acquisition_samples.sql', reservedFor: '0098_deletion_review_suspension_and_verifier_identity.sql' },
    ]);
  });

  it('rejects the R5 checkout gate at its draft number 0099 or any other file at 0101; accepts it at 0101', () => {
    expect(findReservedNumberProblems(['0099_gift_checkout_requires_guardian_approval.sql', '0099_season_feature_states.sql', '0101_gift_checkout_requires_guardian_approval.sql', '0101_anything.sql', '0102_anything.sql'])).toEqual([
      { number: '0099', file: '0099_gift_checkout_requires_guardian_approval.sql', reservedFor: '0099_season_feature_states.sql' },
      { number: '0101', file: '0101_anything.sql', reservedFor: '0101_gift_checkout_requires_guardian_approval.sql' },
    ]);
  });

  it('the command exits zero when every number is used once', () => {
    const dir = tempMigrations(['0001_init.sql', '0002_grants.sql']);
    expect(execFileSync(process.execPath, ['scripts/check-migration-numbers.mjs', dir]).toString()).toContain('every number used once');
  });
});
