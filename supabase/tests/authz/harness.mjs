// Disposable, production-matched PGlite database for authorization tests.
//
// Builds a fresh in-memory PostgreSQL (PGlite) with:
//   1. minimal stand-ins for the Supabase platform objects the migrations
//      reference (roles, auth schema, extensions schema, realtime publication);
//   2. the production project's default privileges for objects created by
//      `postgres` in `public` (evidence P7), set BEFORE any migration runs, so
//      tables and functions get exactly the grants production gave them;
//   3. the repository migrations, in filename order, up to a chosen version.
//
// Never connects to any network database and needs no credentials.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadPglite } from './pglite-loader.mjs';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const MIGRATION_FILE = /^(\d{4})_(.+)\.sql$/;

// Supabase platform stand-ins. Only what the 0001–0087 migrations reference.
// auth.uid()/role()/email() read the same request.jwt.claim.* settings that
// the repository's other PGlite harnesses use.
const PLATFORM_STUBS = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema extensions;
  create extension pgcrypto schema extensions;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create function auth.email() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  grant usage on schema public, extensions to anon, authenticated, service_role;
  create publication supabase_realtime;
`;

// Production default privileges for role postgres in schema public (P7),
// reproduced as the same three per-schema pg_default_acl rows:
//   r  {postgres=arwdDxtm, anon=Dxtm, authenticated=Dxtm, service_role=arwdDxtm}
//   S  {postgres=rwU, service_role=rwU}
//   f  {postgres=X}
// P7 has no global (all-schema) row, so PostgreSQL's built-in global
// defaults still apply on top of these, exactly as in production: per-schema
// rows only add privileges. In particular new functions keep the built-in
// PUBLIC execute unless a migration revokes it.
const PRODUCTION_DEFAULT_PRIVILEGES = `
  alter default privileges for role postgres in schema public
    grant all on tables to postgres, service_role;
  alter default privileges for role postgres in schema public
    grant truncate, references, trigger, maintain on tables to anon, authenticated;
  alter default privileges for role postgres in schema public
    grant usage, select, update on sequences to postgres, service_role;
  alter default privileges for role postgres in schema public
    grant execute on functions to postgres;
`;

export function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const m = MIGRATION_FILE.exec(file);
      if (!m) throw new Error(`Unexpected file in migrations directory: ${file}`);
      return { file, version: m[1], name: m[2] };
    });
}

export async function createDatabase() {
  const { PGlite, pgcrypto } = await loadPglite();
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PLATFORM_STUBS);
  await db.exec(PRODUCTION_DEFAULT_PRIVILEGES);
  // Supabase's postgres role resolves unqualified names in public, then
  // extensions (P9 "extra search path: public, extensions").
  await db.exec(`set search_path = "$user", public, extensions;`);
  return db;
}

// Applies migrations in filename order, from `from` (default: the first)
// up to and including `through`.
export async function applyMigrations(db, { from = '0000', through }) {
  const applied = [];
  for (const m of listMigrations()) {
    if (m.version < from) continue;
    if (m.version > through) break;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8');
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${m.file} failed to apply: ${e.message}`);
    }
    applied.push(m);
  }
  return applied;
}

// Runs fn inside a transaction that is always rolled back.
export async function readOnly(db, fn) {
  await db.exec('begin; set transaction read only;');
  try {
    return await fn();
  } finally {
    await db.exec('rollback;');
  }
}
