// Fails when two files in supabase/migrations share a numeric prefix, when
// a file there doesn't follow the NNNN_name.sql pattern, or when a reserved
// number is used by a different migration. Two branches that each add
// "0088_..." would otherwise both merge, and the database ledger would record
// whichever was applied first under that number.
//
// RUN: node scripts/check-migration-numbers.mjs [migrations-dir]
// Also enforced by scripts/check-migration-numbers.test.ts (npm test).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

// Reserved numbers: the authorization security release owns 0088–0091; the
// archive-test-cards and achievement-reveal features move to 0092 and 0093;
// 0097 is the coach account-deletion fix (an unmerged branch's
// 0097_erase_print_pdfs_on_player_deletion.sql must take another number).
export const RESERVED_NUMBERS = {
  '0088': 'relationship_authorization_foundation',
  '0089': 'relationship_authorization_lockdown',
  '0090': 'guardian_invite_write_lockdown',
  '0091': 'guardian_invite_code_confidentiality',
  '0092': 'test_card_archive',
  '0093': 'achievement_card_reveals',
  '0097': 'coach_account_deletion_verified_moments',
};

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
  for (const d of duplicates) console.error(`Duplicate migration number ${d.number}: ${d.files.join(', ')}`);
  for (const f of malformed) console.error(`Not a NNNN_name.sql migration file: ${f}`);
  for (const r of reserved) console.error(`Migration number ${r.number} is reserved for ${r.reservedFor}: ${r.file}`);
  if (duplicates.length || malformed.length || reserved.length) {
    console.error('Renumber the newer migration(s) so every number is used once and reserved numbers keep their migration.');
    process.exit(1);
  }
  console.log(`OK: ${fs.readdirSync(dir).length} migration files, every number used once, reserved numbers respected.`);
}
