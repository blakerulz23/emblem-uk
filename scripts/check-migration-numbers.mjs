// Fails when two files in supabase/migrations share a numeric prefix, or when
// a file there doesn't follow the NNNN_name.sql pattern. Two branches that
// each add "0088_..." would otherwise both merge, and the database ledger
// would record whichever was applied first under that number.
//
// RUN: node scripts/check-migration-numbers.mjs [migrations-dir]
// Also enforced by scripts/check-migration-numbers.test.ts (npm test).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

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
  for (const d of duplicates) console.error(`Duplicate migration number ${d.number}: ${d.files.join(', ')}`);
  for (const f of malformed) console.error(`Not a NNNN_name.sql migration file: ${f}`);
  if (duplicates.length || malformed.length) {
    console.error('Renumber the newer migration(s) so every number is used once.');
    process.exit(1);
  }
  console.log(`OK: ${fs.readdirSync(dir).length} migration files, every number used once.`);
}
