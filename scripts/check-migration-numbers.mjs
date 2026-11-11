// Fails when two files in supabase/migrations share a numeric prefix, when
// a file there doesn't follow the NNNN_name.sql pattern, or when a reserved
// number is used by a different migration, or when a retired number is
// used at all. Two branches that each add
// "0088_..." would otherwise both merge, and the database ledger would record
// whichever was applied first under that number.
//
// RUN: node scripts/check-migration-numbers.mjs [migrations-dir]
// Also enforced by scripts/check-migration-numbers.test.ts (npm test).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

// Reserved numbers:
// - 0088–0091: the authorization security release (applied in production).
// - 0092: test-card archive (feat/archive-test-cards still carries
//   0088_test_card_archive.sql and must rename it to 0092 before merging).
// - 0093/0094: retired, see RETIRED_NUMBERS below.
// - 0097: the coach account-deletion fix (fix/coach-account-deletion). The
//   print-PDF audit fix's unmerged 0097_erase_print_pdfs_on_player_deletion.sql
//   must take another number.
// - 0098: acquisition samples (feat/acquisition-samples).
// - 0099: the My Season feature flag, created at the start of Season Phase 1.
export const RESERVED_NUMBERS = {
  '0088': 'relationship_authorization_foundation',
  '0089': 'relationship_authorization_lockdown',
  '0090': 'guardian_invite_write_lockdown',
  '0091': 'guardian_invite_code_confidentiality',
  '0092': 'test_card_archive',
  '0097': 'coach_account_deletion_verified_moments',
  '0098': 'acquisition_samples',
  '0099': 'season_feature_states',
};

// Retired numbers may never be used. A gap number below the applied
// 0095/0096 would replay before them on a fresh database but run after them
// in production, so the two orders would differ. New migrations go above
// the highest number in use.
export const RETIRED_NUMBERS = {
  '0093': 'was achievement_card_reveals; superseded by the Season data model',
  '0094': 'never used; gap below applied 0095',
};

/** Files that use a retired number, whatever their name. */
export function findRetiredNumberProblems(filenames) {
  return filenames
    .map((f) => [f, MIGRATION_FILE.exec(f)])
    .filter(([, m]) => m && RETIRED_NUMBERS[m[1]])
    .map(([f, m]) => ({ number: m[1], file: f, reason: RETIRED_NUMBERS[m[1]] }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** Files that use a reserved number for a different migration. */
export function findReservedNumberProblems(filenames) {
  return filenames
    .map((f) => [f, MIGRATION_FILE.exec(f)])
    .filter(([f, m]) => m && RESERVED_NUMBERS[m[1]] && f !== `${m[1]}_${RESERVED_NUMBERS[m[1]]}.sql`)
    .map(([f, m]) => ({ number: m[1], file: f, reservedFor: `${m[1]}_${RESERVED_NUMBERS[m[1]]}.sql` }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function findMigrationNumberProblems(filenames) {
  const byNumber = new Map();
  const malformed = [];
  for (const f of filenames) {
    const m = MIGRATION_FILE.exec(f);
    if (!m) { malformed.push(f); continue; }
    byNumber.set(m[1], [...(byNumber.get(m[1]) ?? []), f]);
  }
  const duplicates = [...byNumber].filter(([, files]) => files.length > 1).map(([number, files]) => ({ number, files: files.sort() }));
  return { duplicates, malformed: malformed.sort() };
}

export function checkMigrationDir(dir) {
  return findMigrationNumberProblems(fs.readdirSync(dir).filter((f) => !fs.statSync(path.join(dir, f)).isDirectory()));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');
  const { duplicates, malformed } = checkMigrationDir(dir);
  const reserved = findReservedNumberProblems(fs.readdirSync(dir));
  const retired = findRetiredNumberProblems(fs.readdirSync(dir));
  for (const d of duplicates) console.error(`Duplicate migration number ${d.number}: ${d.files.join(', ')}`);
  for (const f of malformed) console.error(`Not a NNNN_name.sql migration file: ${f}`);
  for (const r of reserved) console.error(`Migration number ${r.number} is reserved for ${r.reservedFor}: ${r.file}`);
  for (const r of retired) console.error(`Migration number ${r.number} is retired (${r.reason}): ${r.file}`);
  if (duplicates.length || malformed.length || reserved.length || retired.length) {
    console.error('Renumber the newer migration(s) so every number is used once, reserved numbers keep their migration and retired numbers stay unused.');
    process.exit(1);
  }
  console.log(`OK: ${fs.readdirSync(dir).length} migration files, every number used once, reserved numbers respected, retired numbers unused.`);
}
