// Deployment order for PR #140: can its application code go live while the
// production database has 0101 but not yet 0097 or 0098?
//
// PR #140 changes six routes (account delete, coach-invite redeem, team-invite
// redeem, team requests, staff team-request approve, moment verify). This suite
// reads those route files as they are on disk and, against a database built
// through 0096 plus 0101 only (production today), proves:
//   1. every RPC the routes call exists, and the named arguments they send
//      bind to it as PostgREST would (no unknown argument, no missing
//      argument without a default);
//   2. every column the changed writes name exists (moments update, the
//      coach_team_requests insert);
//   3. nothing in the database can yet produce the signals PR #140's new
//      branches react to ('account_deletion_review_pending', SQLSTATE EMDRP,
//      'Staff accounts cannot be deleted from the app'), so before 0098 none of
//      the new error branches can run. The one change that takes effect as
//      soon as the app deploys, with or without the migrations, is moment
//      verify's verified_at IS NULL filter: re-approving an already-verified
//      moment now updates nothing and gets the existing 403 instead of
//      overwriting the verifier (intended; needs only the existing column);
//   4. the same checks after 0097 + 0098 (on top of 0101): every binding still
//      holds and the signals now exist, so the new branches become reachable
//      only once the migrations are applied.
//
// Run: node --no-warnings supabase/tests/authz/pr140_app_before_0097_0098_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ROUTES = [
  'src/app/api/os/account/delete/route.ts',
  'src/app/api/os/coach-invites/redeem/route.ts',
  'src/app/api/os/team-invites/redeem/route.ts',
  'src/app/api/os/team-requests/route.ts',
  'src/app/api/staff/team-requests/[id]/approve/route.ts',
  'src/app/api/os/moments/verify/route.ts',
];
const SIGNALS = ['account_deletion_review_pending', 'EMDRP', 'Staff accounts cannot be deleted from the app'];
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
}

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

// RPC calls as written in the routes: .rpc('name') or .rpc('name', { p_a: …, p_b: … }).
const calls = [];
for (const rel of ROUTES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of src.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'\s*(?:,\s*\{([\s\S]*?)\}\s*)?\)/g)) {
    calls.push({ route: rel, fn: m[1], args: [...(m[2] ?? '').matchAll(/\b(p_[a-z0-9_]+)\s*:/g)].map((a) => a[1]).sort() });
  }
}
check('route files parsed: the four RPC calls in the changed PR #140 routes are found', JSON.stringify(calls.map((c) => c.fn).sort()) ===
  JSON.stringify(['approve_coach_team_request', 'delete_own_guardian_account', 'redeem_coach_invite', 'redeem_team_invite']), calls.map((c) => c.fn));
const teamReq = fs.readFileSync(path.join(ROOT, 'src/app/api/os/team-requests/route.ts'), 'utf8');
const insertCols = [...(/\.from\('coach_team_requests'\)\s*\.insert\(\{([\s\S]*?)\}\)/.exec(teamReq)?.[1] ?? '').matchAll(/\b([a-z_]+)\s*:/g)].map((m) => m[1]);
const verify = fs.readFileSync(path.join(ROOT, 'src/app/api/os/moments/verify/route.ts'), 'utf8');
const updateCols = [...(/\.from\('moments'\)\s*\.update\(\{([\s\S]*?)\}\)/.exec(verify)?.[1] ?? '').matchAll(/\b([a-z_]+)\s*:/g)].map((m) => m[1]);
check('route files parsed: coach_team_requests insert and moments update columns found', insertCols.length === 4 && updateCols.length === 3, { insertCols, updateCols });
check('moment verify filters on verified_at IS NULL', /\.is\('verified_at',\s*null\)/.test(verify));

async function assess(db, label, expectSignals) {
  for (const c of calls) {
    const overloads = (await db.query(
      `select coalesce(p.proargnames, '{}') names, p.pronargs n, p.pronargdefaults d
         from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`, [c.fn])).rows;
    const binds = overloads.some((o) => {
      const params = o.names.slice(0, o.n);
      const required = params.slice(0, o.n - o.d);
      return c.args.every((a) => params.includes(a)) && required.every((p) => c.args.includes(p));
    });
    check(`${label}: ${c.fn}(${c.args.join(', ')}) binds (${path.basename(path.dirname(c.route))})`, binds, overloads);
  }
  const cols = async (t) => (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [t])).rows.map((r) => r.column_name);
  const crq = await cols('coach_team_requests');
  check(`${label}: coach_team_requests has every inserted column`, insertCols.every((c) => crq.includes(c)), insertCols.filter((c) => !crq.includes(c)));
  const mom = await cols('moments');
  check(`${label}: moments has every updated column and verified_at`, [...updateCols, 'verified_at'].every((c) => mom.includes(c)));
  const found = {};
  for (const s of SIGNALS) {
    found[s] = Number((await db.query(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and position($1 in p.prosrc) > 0`, [s])).rows[0].n);
  }
  if (expectSignals) {
    check(`${label}: every signal PR #140 reacts to is now raised by the database`, SIGNALS.every((s) => found[s] > 0), found);
  } else {
    check(`${label}: no database function can raise or return any signal PR #140 reacts to (new branches unreachable)`, SIGNALS.every((s) => found[s] === 0), found);
  }
}

console.log('\n=== production today: 0096 + 0101, no 0097/0098 ===');
const db = await readyDatabase('0096');
await db.exec(fs.readFileSync(path.resolve(HERE, '../../migrations/0101_gift_checkout_requires_guardian_approval.sql'), 'utf8'));
check('0101 present, 0097/0098 absent', (await db.query(`select to_regprocedure('public.gift_order_checkout_block_reason(uuid)') is not null a,
  exists (select 1 from information_schema.columns where table_name = 'moments' and column_name = 'verifier_account_deleted_at') b,
  to_regclass('public.deletion_review_access_suspensions') is not null c`)).rows.every((r) => r.a && !r.b && !r.c));
await assess(db, 'before', false);

console.log('\n=== after 0097 + 0098 (production order) ===');
for (const f of ['0097_coach_account_deletion_verified_moments.sql', '0098_deletion_review_suspension_and_verifier_identity.sql']) {
  await db.exec(fs.readFileSync(path.resolve(HERE, '../../migrations', f), 'utf8'));
}
await assess(db, 'after', true);
await db.close();

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
