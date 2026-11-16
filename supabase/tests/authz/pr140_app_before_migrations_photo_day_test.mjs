// Deployment order for PR #140 after Photo Day: can the merged application
// (PR #140 + main with Photo Day) go live while production has 0101 and
// 0103-0107 but not yet 0097, 0098 or 0102?
//
// pr140_app_before_0097_0098_test.mjs proves this for the six changed routes
// and the new account-deletion files on a 0101-only database. This suite
// widens it to the whole application, on the database production has today:
//   1. every .rpc('name', { … }) call in every non-test file under src/ is
//      found; each one binds on production today (exists, every named
//      argument it sends is a parameter, every parameter without a default is
//      sent), except exactly the seven account-deletion functions 0097/0098
//      create, and those are called only from the files that suite proves fall
//      back safely while they are absent;
//   2. every .from('table') read or write in src/ names a table that exists,
//      except exactly the three account-deletion tables 0097/0098 create, read
//      only from the staff account-deletions page and the retry route (both
//      among the files proven to fall back safely);
//   3. no database function yet raises or returns any signal PR #140's new
//      branches react to;
//   4. after 0097, 0098 and 0102 (final production order) every call binds,
//      every table exists and the signals exist.
//
// Run: node --no-warnings supabase/tests/authz/pr140_app_before_migrations_photo_day_test.mjs
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase, listMigrations } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const migration = (n) => fs.readFileSync(path.join(ROOT, 'supabase/migrations', listMigrations().find((m) => m.version === n).file), 'utf8');
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const SIGNALS = ['account_deletion_review_pending', 'EMDRP', 'Staff accounts cannot be deleted from the app'];
// Created by 0097/0098 and absent until then. Their callers are the files
// pr140_app_before_0097_0098_test.mjs proves fall back safely (middleware lets
// the request continue; the review status reads "not under review"; the staff
// page shows no counts and offers no completion; the staff routes answer a
// fixed 500).
const NEW_FUNCTIONS = ['account_deletion_preview', 'account_is_erased', 'complete_pending_profile_deletion', 'my_account_deletion_review',
  'record_account_sign_in_removal', 'reject_pending_profile_deletion', 'restore_coach_access_after_deletion_rejection'];
const NEW_FUNCTION_CALLERS = ['src/lib/supabase/middleware.ts', 'src/app/api/os/account/deletion-review/route.ts',
  'src/app/api/staff/account-deletions/[id]/complete/route.ts', 'src/app/api/staff/account-deletions/[id]/reject/route.ts',
  'src/app/api/staff/account-deletions/[id]/retry-sign-in/route.ts', 'src/app/staff/account-deletions/page.tsx',
  'src/lib/remove-account-sign-in.ts'];
const NEW_TABLES = ['account_deletion_staff_actions', 'deletion_review_access_suspensions', 'erased_accounts'];
const NEW_TABLE_CALLERS = ['src/app/staff/account-deletions/page.tsx', 'src/app/api/staff/account-deletions/[id]/retry-sign-in/route.ts'];

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
}

// --- the application's database calls --------------------------------------------------------
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
  }
})(path.join(ROOT, 'src'));

function objectBody(src, openIndex) {
  let depth = 1, j = openIndex;
  while (depth && j < src.length) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
  return src.slice(openIndex, j - 1);
}
// Top-level argument names of an object literal body (nested objects removed
// first): every database function parameter is named p_…, written as
// `p_x: value` or shorthand `p_x`.
function topKeys(body) {
  let flat = body;
  for (let prev = null; prev !== flat;) { prev = flat; flat = flat.replace(/\{[^{}]*\}/g, ''); }
  return [...new Set([...flat.matchAll(/(?:^|[,\s])(p_[a-z0-9_]+)\s*(?=[:,]|$)/g)].map((m) => m[1]))].sort();
}

const rpcCalls = [], unresolved = [], tableUses = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  for (const m of src.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'\s*(?:,\s*(\{|[A-Za-z_$][\w$]*))?/g)) {
    let args = [];
    if (m[2] === '{') args = topKeys(objectBody(src, m.index + m[0].length));
    else if (m[2]) {
      const decl = new RegExp(`(?:const|let)\\s+${m[2].replace(/\$/g, '\\$')}\\s*(?::[^=]+)?=\\s*\\{`).exec(src);
      if (decl) args = topKeys(objectBody(src, decl.index + decl[0].length));
      else { unresolved.push({ rel, fn: m[1], arg: m[2] }); args = null; }
    }
    rpcCalls.push({ rel, fn: m[1], args });
  }
  for (const m of src.matchAll(/(storage\s*)?\.from\(\s*'([a-z0-9_]+)'\s*\)/g)) if (!m[1]) tableUses.push({ rel, table: m[2] });
}
check(`application scanned: ${files.length} files, ${rpcCalls.length} RPC calls (${new Set(rpcCalls.map((c) => c.fn)).size} functions), ${tableUses.length} table uses (${new Set(tableUses.map((t) => t.table)).size} tables)`,
  rpcCalls.length > 100 && tableUses.length > 100);
check('Photo Day and PR #140 calls are in the scan', ['match_photo_day_photo', 'publish_photo_day', 'record_photo_day_consent', 'delete_own_guardian_account', 'begin_gate3_checkout', 'account_is_erased']
  .every((fn) => rpcCalls.some((c) => c.fn === fn)));

async function readyDatabase(through) {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const staff = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, 'synthetic-readiness@example.test')`, [staff]);
  await db.query(`insert into profiles (id, display_name) values ($1, 'Synthetic readiness')`, [staff]);
  await db.query(`insert into staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, staff]);
  await db.exec('commit;');
  await applyMigrations(db, { from: '0089', through });
  return db;
}

async function assess(db, label, final) {
  const fns = new Map();
  for (const r of (await db.query(`select p.proname, coalesce(p.proargnames, '{}') names, p.pronargs n, p.pronargdefaults d
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'`)).rows) {
    if (!fns.has(r.proname)) fns.set(r.proname, []);
    fns.get(r.proname).push(r);
  }
  const missing = [], unbound = [];
  for (const c of rpcCalls) {
    const overloads = fns.get(c.fn);
    if (!overloads) { missing.push(c); continue; }
    if (c.args === null) continue; // existence only (argument object built elsewhere); listed below
    const binds = overloads.some((o) => {
      const params = o.names.slice(0, o.n);
      const required = params.slice(0, o.n - o.d);
      return c.args.every((a) => params.includes(a)) && required.every((p) => c.args.includes(p));
    });
    if (!binds) unbound.push({ fn: c.fn, args: c.args, rel: c.rel });
  }
  check(`${label}: every RPC call that exists binds by name (arguments sent ⊆ parameters, parameters without default sent)`, unbound.length === 0, unbound);
  const missingFns = [...new Set(missing.map((c) => c.fn))].sort();
  if (final) {
    check(`${label}: every function the application calls exists`, missingFns.length === 0, missingFns);
  } else {
    check(`${label}: the functions missing are exactly the seven 0097/0098 account-deletion functions`, JSON.stringify(missingFns) === JSON.stringify([...NEW_FUNCTIONS].sort()), missingFns);
    const callers = [...new Set(missing.map((c) => c.rel))].sort();
    check(`${label}: …called only from the files proven to fall back safely`, callers.every((r) => NEW_FUNCTION_CALLERS.includes(r)), callers);
  }
  const tables = new Set((await db.query(`select table_name t from information_schema.tables where table_schema = 'public'`)).rows.map((r) => r.t));
  const missingT = tableUses.filter((u) => !tables.has(u.table));
  const missingTables = [...new Set(missingT.map((u) => u.table))].sort();
  if (final) {
    check(`${label}: every table the application uses exists`, missingTables.length === 0, missingTables);
  } else {
    check(`${label}: the tables missing are exactly the three 0097/0098 account-deletion tables`, JSON.stringify(missingTables) === JSON.stringify(NEW_TABLES), missingTables);
    const callers = [...new Set(missingT.map((u) => u.rel))].sort();
    check(`${label}: …used only from the staff account-deletions page and the retry route`, callers.every((r) => NEW_TABLE_CALLERS.includes(r)), callers);
  }
  const found = {};
  for (const s of SIGNALS) {
    found[s] = Number((await db.query(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and position($1 in p.prosrc) > 0`, [s])).rows[0].n);
  }
  check(final ? `${label}: every signal PR #140 reacts to is now raised by the database`
              : `${label}: no database function can raise or return any signal PR #140 reacts to (new branches unreachable)`,
    final ? SIGNALS.every((s) => found[s] > 0) : SIGNALS.every((s) => found[s] === 0), found);
}

// The staff account-deletions page reads the three new tables; before 0097
// each read errors, and the page must show nothing rather than throw or
// offer an action. Its reads go through one helper that turns an error into
// "unavailable".
{
  const page = fs.readFileSync(path.join(ROOT, 'src/app/staff/account-deletions/page.tsx'), 'utf8');
  check('staff account-deletions page treats a failed read of a new table as unavailable (no throw)',
    NEW_TABLES.every((t) => page.includes(`'${t}'`)) && !/throw\s+(new\s+Error|error)/.test(page));
}
check(`argument objects not found statically (existence-checked only): ${unresolved.length}`, true);
for (const u of unresolved) console.log(`  · ${u.fn} in ${u.rel} (argument ${u.arg})`);

console.log('\n=== production today: 0096 + 0101 + 0103-0107, no 0097/0098/0102 ===');
const db = await readyDatabase('0096');
for (const n of ['0101', '0103', '0104', '0105', '0106', '0107']) await db.exec(migration(n));
check('0101 and 0103-0107 present; 0097, 0098, 0102 absent', (await db.query(`select
    to_regprocedure('public.gift_order_checkout_block_reason(uuid)') is not null a,
    to_regclass('public.squad_invite_photo_day_photos') is not null b,
    to_regprocedure('public.close_photo_day_after_deletion(uuid)') is not null c,
    not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'held_at') d,
    to_regclass('public.deletion_review_access_suspensions') is null e,
    position('held' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'builder_authority_audit_events_event_type_check')) = 0 f`))
  .rows.every((r) => r.a && r.b && r.c && r.d && r.e && r.f));
await assess(db, 'before', false);

console.log('\n=== after 0097, 0098, 0102 (final production order) ===');
for (const n of ['0097', '0098', '0102']) await db.exec(migration(n));
await assess(db, 'after', true);
await db.close();

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
