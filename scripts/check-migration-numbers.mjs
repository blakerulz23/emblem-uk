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

// Reserved numbers: the authorization security release owns 0088–0091; the
// archive-test-cards and achievement-reveal features move to 0092 and 0093;
// 0097 is the coach account-deletion fix (an unmerged branch's
// 0097_erase_print_pdfs_on_player_deletion.sql must take another number);
// 0098 is the deletion-review safeguarding fix, 0099 the Season feature
// states, acquisition samples move to 0100, and 0101 is the R5 gift-order
// checkout and payment gate, and 0102 closes checkout and payment for orders
// held by 0097. 0103 restores the Squad Invite audit event types, and
// 0104–0107 are Photo Day (both released from main before 0097, 0098 and
// 0102 reached production). 0108 is My Season (focus and coach
// observations; it reaches production after 0099). New work starts at 0109.
export const RESERVED_NUMBERS = {
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
  '0102': 'held_orders_checkout_payment_and_fresh_approval',
  '0103': 'restore_squad_invite_audit_event_types',
  '0104': 'squad_invite_photo_day_foundation',
  '0105': 'squad_invite_photo_day_staff_controls',
  '0106': 'squad_invite_photo_day_parent_consent',
  '0107': 'squad_invite_photo_day_retention',
  '0108': 'my_season_focus_and_observations',
};

// Retired numbers may never be used. A gap number below the applied
// 0095/0096 would replay before them on a fresh database but run after them
// in production, so the two orders would differ. New migrations go above
// the highest number in use.
export const RETIRED_NUMBERS = {
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
