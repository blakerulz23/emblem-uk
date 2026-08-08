import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Proves supabase/rollback/0036_stage1_rollback.sql's guard actually fails
// closed: (1) zero-DOB case — rollback proceeds and fully undoes Stage 1;
// (2) populated-DOB case — rollback aborts and changes NOTHING (schema or
// grants), proven by snapshotting both before and after the attempt.
//
// RUN: node supabase/tests/rollback_test.mjs
// REQUIRES (not a project dependency — install ad hoc before running):
//   npm install --no-save @electric-sql/pglite
// Fully disposable — in-memory Postgres only, no credentials needed.

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');
const ROLLBACK_SQL_PATH = path.join(REPO_ROOT, 'supabase/rollback/0036_stage1_rollback.sql');
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
}

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec('create extension if not exists pgcrypto;');
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    create or replace function auth.email() returns text language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
    create publication supabase_realtime;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  `);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const pre0036 = files.filter((f) => !f.startsWith('0036') && !f.startsWith('0037') && !f.startsWith('0038') && !f.startsWith('0039'));
  const stage1 = files.find((f) => f.startsWith('0036'));
  for (const f of pre0036) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    } catch (e) {
      console.log(`MIGRATION FAILED: ${f} —`, e.message);
      throw e;
    }
  }
  // Minimal seed: one club/team/player, enough for the rollback's own
  // guard query and for exercising columns/grants Stage 1 touches.
  await db.exec(`
    insert into clubs (id, name) values ('00000000-0000-0000-0000-000000000001', 'Test FC');
    insert into seasons (id, label, normalized_label, starts_on, ends_on) values
      ('00000000-0000-0000-0000-000000000004', '2026/27', '2026/27-test', '2026-08-01', '2027-07-31');
    insert into teams (id, club_id, name, season, season_id) values
      ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Test Team', '2026/27', '00000000-0000-0000-0000-000000000004');
    insert into players (id, team_id, name, "position") values
      ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000002', 'Casey Test', 'CDM');
  `);
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, stage1), 'utf8'));
  return db;
}

async function snapshotGrants(db) {
  const grants = await db.query(`
    select grantee, privilege_type, column_name
    from information_schema.role_column_grants
    where table_name = 'players' and grantee in ('anon','authenticated')
    order by grantee, privilege_type, column_name;
  `);
  const tableGrants = await db.query(`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_name = 'players' and grantee in ('anon','authenticated')
    order by grantee, privilege_type;
  `);
  const columns = await db.query(`
    select column_name from information_schema.columns where table_name = 'players' order by column_name;
  `);
  const functions = await db.query(`
    select proname from pg_proc where proname in
      ('get_player_age','get_player_date_of_birth','update_player_coach_fields','update_primary_position')
    order by proname;
  `);
  return JSON.stringify({ grants: grants.rows, tableGrants: tableGrants.rows, columns: columns.rows, functions: functions.rows });
}

// ============================================================================
// CASE 1 — zero DOB rows. Rollback must proceed and fully undo Stage 1.
// ============================================================================
console.log('=== Case 1: zero-DOB rollback (must proceed) ===\n');
{
  const db = await freshDb();
  const beforeDobCheck = await db.query(`select count(*) filter (where date_of_birth is not null) as n from players;`);
  check('precondition: zero rows have a stored date_of_birth', Number(beforeDobCheck.rows[0].n) === 0, beforeDobCheck.rows[0]);

  const rollbackSql = fs.readFileSync(ROLLBACK_SQL_PATH, 'utf8');
  try {
    await db.exec(rollbackSql);
    check('zero-DOB case: rollback script runs to completion without error', true);
  } catch (e) {
    check('zero-DOB case: rollback script runs to completion without error', false, e.message);
  }

  const columnsAfter = await db.query(`select column_name from information_schema.columns where table_name = 'players' and column_name = 'date_of_birth';`);
  check('zero-DOB case: date_of_birth column no longer exists after rollback', columnsAfter.rows.length === 0, columnsAfter.rows);

  const functionsAfter = await db.query(`select proname from pg_proc where proname = 'get_player_age';`);
  check('zero-DOB case: get_player_age function dropped after rollback', functionsAfter.rows.length === 0, functionsAfter.rows);

  const tableGrantsAfter = await db.query(`
    select privilege_type from information_schema.role_table_grants
    where table_name = 'players' and grantee = 'authenticated' order by privilege_type;
  `);
  check(
    'zero-DOB case: broad table-level SELECT/UPDATE/INSERT restored to authenticated',
    ['SELECT', 'UPDATE', 'INSERT'].every((p) => tableGrantsAfter.rows.some((r) => r.privilege_type === p)),
    tableGrantsAfter.rows
  );
}

// ============================================================================
// CASE 2 — at least one populated DOB row. Rollback must abort and change
// NOTHING — proven by comparing a full before/after snapshot.
// ============================================================================
console.log('\n=== Case 2: populated-DOB rollback (must abort, change nothing) ===\n');
{
  const db = await freshDb();
  // Seed a real DOB directly (as db owner — just test setup, mirrors a
  // real coach save having already happened via update_player_coach_fields).
  await db.query(`update players set date_of_birth = '2016-03-20' where id = '00000000-0000-0000-0000-000000000020';`);

  const dobCheck = await db.query(`select count(*) filter (where date_of_birth is not null) as n from players;`);
  check('precondition: at least one row has a stored date_of_birth', Number(dobCheck.rows[0].n) > 0, dobCheck.rows[0]);

  const before = await snapshotGrants(db);
  const dobValueBefore = await db.query(`select date_of_birth from players where id = '00000000-0000-0000-0000-000000000020';`);

  const rollbackSql = fs.readFileSync(ROLLBACK_SQL_PATH, 'utf8');
  let threw = false;
  let errorMessage = '';
  try {
    await db.exec(rollbackSql);
  } catch (e) {
    threw = true;
    errorMessage = e.message;
  }
  check('populated-DOB case: rollback script raises and does not complete', threw, errorMessage);
  check('populated-DOB case: the raised error names the guard, not an unrelated failure', errorMessage.includes('Stage 1 rollback aborted'), errorMessage);

  // Standard Postgres semantics, not a bug in the script: once a
  // transaction hits an error, the session sits in "current transaction
  // is aborted" until an explicit ROLLBACK (or disconnect) — this is
  // exactly the fail-closed guarantee (nothing further can run, committed
  // or not, without a deliberate ROLLBACK first). Issue it here the same
  // way an operator running this via psql would after seeing the guard
  // fire, then confirm the session recovers and nothing was left applied.
  await db.exec('rollback;');
  let sessionUsable = false;
  try {
    await db.query(`select 1;`);
    sessionUsable = true;
  } catch (e) {
    errorMessage = e.message;
  }
  check('populated-DOB case: after an explicit ROLLBACK (standard recovery from any aborted Postgres transaction), the session works normally again', sessionUsable);

  const after = await snapshotGrants(db);
  check('populated-DOB case: schema + grants snapshot is byte-for-byte identical before and after the aborted attempt', before === after, before === after ? 'identical' : { before, after });

  const dobValueAfter = await db.query(`select date_of_birth from players where id = '00000000-0000-0000-0000-000000000020';`);
  check(
    'populated-DOB case: the stored date_of_birth value itself is untouched',
    String(dobValueBefore.rows[0].date_of_birth) === String(dobValueAfter.rows[0].date_of_birth),
    { before: dobValueBefore.rows[0].date_of_birth, after: dobValueAfter.rows[0].date_of_birth }
  );

  // And prove the *protection* is still fully intact — not just that the
  // column exists, but that authenticated still can't read it.
  await db.exec('begin;');
  try {
    await db.exec(`set local role authenticated;`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, ['00000000-0000-0000-0000-000000000099']);
    try {
      await db.query(`select date_of_birth from players where id = '00000000-0000-0000-0000-000000000020';`);
      check('populated-DOB case: date_of_birth is still unreadable by authenticated after the aborted rollback', false, 'query unexpectedly succeeded');
    } catch (e) {
      check('populated-DOB case: date_of_birth is still unreadable by authenticated after the aborted rollback', e.message.includes('permission denied'), e.message);
    }
  } finally {
    await db.exec('rollback;');
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n\n${results.length - failed.length}/${results.length} TOTAL checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach((f) => console.log(' -', f.name, f.detail));
}
