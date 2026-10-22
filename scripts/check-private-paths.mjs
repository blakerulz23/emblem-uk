// Fails when a tracked text file contains a machine-specific or private path:
// a Windows or macOS/Linux home directory, a OneDrive or temp folder, or the
// name of a private review folder. Examples in committed documentation use
// placeholders such as <REPO_ROOT>, <PGLITE_TOOLING_DIR> and
// <PRIVATE_EVIDENCE_DIR> instead.
//
// RUN: node scripts/check-private-paths.mjs
// Also enforced by scripts/check-private-paths.test.ts (npm test).
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const PRIVATE_PATH_RULES = [
  { name: 'Windows user directory', pattern: /\b[A-Za-z]:\\+(?:Users|Documents and Settings)\\+/i },
  { name: 'macOS or Linux home directory', pattern: /(?:^|[\s'"`(=])\/(?:Users|home)\/[A-Za-z0-9._-]+\//m },
  { name: 'OneDrive folder', pattern: /OneDrive/i },
  { name: 'Windows temp folder', pattern: /AppData[\\/]+Local[\\/]+Temp/i },
  { name: 'private review folder', pattern: /(?:^|[\\/\s'"`])_audit[\\/]/m },
  { name: 'private evidence folder', pattern: /production-evidence[\\/]/ },
  { name: 'private review folder name', pattern: /authz-relationship-escalation/ },
];

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|json|md|mdx|sql|css|html|ya?ml|toml|txt|sh|ps1|env\.example)$|(?:^|\/)\.env\.example$/;

export function findPrivatePaths(text) {
  return PRIVATE_PATH_RULES.filter((r) => r.pattern.test(text)).map((r) => r.name);
}

/** Tracked text files, relative to the repository root. */
export function trackedTextFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString();
  return out.split('\0').filter((f) => f && TEXT_FILE.test(f));
}

/**
 * @param {string} root
 * @param {{ exclude?: string[] }} [options]
 * @returns {{ file: string, line: number, rule: string }[]}
 */
export function checkRepository(root, { exclude = [] } = {}) {
  const problems = [];
  for (const file of trackedTextFiles(root)) {
    if (exclude.includes(file)) continue;
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const rule of findPrivatePaths(line)) problems.push({ file, line: i + 1, rule });
    });
  }
  return problems;
}

// This file and its test name the patterns, so they are the only exclusions.
export const SELF = ['scripts/check-private-paths.mjs', 'scripts/check-private-paths.test.ts'];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkRepository(root, { exclude: SELF });
  // Report the location and rule only, never the matched text.
  for (const p of problems) console.error(`${p.file}:${p.line}: ${p.rule}`);
  if (problems.length) {
    console.error('Replace machine-specific paths with placeholders such as <REPO_ROOT> or <PRIVATE_EVIDENCE_DIR>.');
    process.exit(1);
  }
  console.log('OK: no machine-specific or private paths in tracked text files.');
}
