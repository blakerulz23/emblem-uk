// Loads PGlite from an explicitly configured, isolated tooling folder.
//
// PGlite is not a project dependency (see full_migration_test.mjs). This
// harness never resolves it from the repository's node_modules, a global
// install, NODE_PATH or any other project: the folder must be named in
// EMBLEM_AUTHZ_PGLITE_DIR, and it must hold exactly the pinned version.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const PGLITE_DIR_ENV = 'EMBLEM_AUTHZ_PGLITE_DIR';
export const PGLITE_VERSION = '0.3.16';

const SETUP_HELP = `
Setup (once), in PowerShell:
  New-Item -ItemType Directory -Force <tooling-dir>
  # <tooling-dir>\\package.json: { "private": true, "dependencies": { "@electric-sql/pglite": "${PGLITE_VERSION}" } }
  npm install --prefix <tooling-dir> --save-exact --no-audit --no-fund
Then run with:
  $env:${PGLITE_DIR_ENV} = '<tooling-dir>'
See supabase/tests/authz/README.md.`;

class PgliteSetupError extends Error {}

function fail(message) {
  throw new PgliteSetupError(`PGlite setup error: ${message}\n${SETUP_HELP}`);
}

export async function loadPglite() {
  const dir = process.env[PGLITE_DIR_ENV];
  if (!dir) fail(`${PGLITE_DIR_ENV} is not set.`);
  if (!path.isAbsolute(dir)) fail(`${PGLITE_DIR_ENV} must be an absolute path (got "${dir}").`);

  const pkgDir = path.join(dir, 'node_modules', '@electric-sql', 'pglite');
  const pkgJson = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJson)) fail(`@electric-sql/pglite is not installed in ${dir}.`);

  const { version } = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  if (version !== PGLITE_VERSION) fail(`found @electric-sql/pglite ${version} in ${dir}; ${PGLITE_VERSION} is required.`);

  const entry = path.join(pkgDir, 'dist', 'index.js');
  const pgcryptoEntry = path.join(pkgDir, 'dist', 'contrib', 'pgcrypto.js');
  for (const f of [entry, pgcryptoEntry]) {
    if (!fs.existsSync(f)) fail(`expected file is missing: ${f}`);
  }

  const { PGlite } = await import(pathToFileURL(entry).href);
  const { pgcrypto } = await import(pathToFileURL(pgcryptoEntry).href);
  return { PGlite, pgcrypto, version, dir };
}

export { PgliteSetupError };
