// Rollback ordering across 0089, 0090 and 0091.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Proves, on a fresh database taken from 0088 (with a readiness record)
// through 0089, 0090 and 0091:
//   - the 0089 rollback, even with its acknowledgement, refuses while 0091
//     is applied, and again while 0090 is applied, naming what to roll back
//     first; neither refusal changes the catalog or data, and no
//     acknowledgement persists;
//   - after the 0091 and 0090 rollbacks it succeeds and the result is the
//     exact 0088 catalog, with data unchanged and no acknowledgement left;
//   - re-applying 0089, 0090 and 0091 gives the exact final catalog again;
//   - even a wrongly session-wide 0089 acknowledgement does not survive.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = (n) => fs.readFileSync(path.resolve(HERE, `../../rollback/${n}_rollback.sql`), 'utf8');
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const ACKS = {
  '0089': ['emblem.acknowledge_0089_rollback', 'REOPEN-AUTHORIZATION-VULNERABILITY'],
  '0090': ['emblem.acknowledge_0090_rollback', 'REOPEN-GUARDIAN-INVITE-FORGERY'],
  '0091': ['emblem.acknowledge_0091_rollback', 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE'],
};

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();
const keysOf = (d) => [...d.added, ...d.removed, ...d.changed];
const sameAs = async (db, expected) => keysOf(diffCatalog(expected, await snapshotCatalog(db)));

async function dataSnapshot(db) {
  const tables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows.map((r) => r.relname);
  const parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  parts.push(`auth.users:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from auth.users x`)).rows[0].h}`);
  return parts.join(',');
}

const noAckLeft = async (db) => {
  for (const [name] of Object.values(ACKS)) {
    if ((await db.query(`select coalesce(current_setting($1, true), '') v`, [name])).rows[0].v !== '') return false;
  }
  return true;
};

// Runs one rollback file in a transaction that first sets its acknowledgement
// transaction-local. Returns null on success or the refusal message.
async function rollBack(db, n) {
  const [name, value] = ACKS[n];
  await db.exec('begin;');
  try {
    await db.query(`select set_config($1, $2, true)`, [name, value]);
    await db.exec(ROLLBACK(n));
    return null;
  } catch (e) {
    await db.exec('rollback;').catch(() => {});
    return e.message;
  }
}

const db = await createDatabase();
await applyMigrations(db, { through: '0088' });
const staff = id();
await db.query(`insert into auth.users (id, email) values ($1, 'synthetic-readiness@example.test')`, [staff]);
await db.query(`insert into profiles (id, display_name) values ($1, 'Synthetic readiness')`, [staff]);
await db.query(`insert into staff_accounts (profile_id) values ($1)`, [staff]);
await db.exec('begin; set local role service_role;');
await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, staff]);
await db.exec('commit;');
const c88 = await snapshotCatalog(db);
await applyMigrations(db, { from: '0089', through: '0089' });
const c89 = await snapshotCatalog(db);
await applyMigrations(db, { from: '0090', through: '0090' });
const c90 = await snapshotCatalog(db);
await applyMigrations(db, { from: '0091', through: '0091' });
const c91 = await snapshotCatalog(db);
const data = await dataSnapshot(db);

console.log('\n=== 0089 rollback at 0091 ===');
let refusal = await rollBack(db, '0089');
check('refused at 0091, even with the acknowledgement, naming 0091 as still applied', refusal?.includes('0089 rollback refused: 0091 is still applied'), refusal);
let diff = await sameAs(db, c91);
check('…and changed nothing (exact 0091 catalog, same data)', diff.length === 0 && (await dataSnapshot(db)) === data, diff.join(', '));
check('…and no acknowledgement persists', await noAckLeft(db));

console.log('\n=== 0091 rolled back; 0089 rollback at 0090 ===');
check('the 0091 rollback succeeds', (await rollBack(db, '0091')) === null);
diff = await sameAs(db, c90);
check('…to the exact 0090 catalog', diff.length === 0, diff.join(', '));
refusal = await rollBack(db, '0089');
check('the 0089 rollback is refused while 0090 remains, naming 0090', refusal?.includes('0089 rollback refused: 0090 is still applied'), refusal);
diff = await sameAs(db, c90);
check('…and changed nothing (exact 0090 catalog, same data)', diff.length === 0 && (await dataSnapshot(db)) === data, diff.join(', '));
check('…and no acknowledgement persists', await noAckLeft(db));

console.log('\n=== 0090 rolled back; 0089 rollback at 0089 ===');
check('the 0090 rollback succeeds', (await rollBack(db, '0090')) === null);
diff = await sameAs(db, c89);
check('…to the exact 0089 catalog', diff.length === 0, diff.join(', '));
refusal = await rollBack(db, '0089');
check('the 0089 rollback now succeeds', refusal === null, refusal);
diff = await sameAs(db, c88);
check('…and the result is the exact 0088 catalog', diff.length === 0, diff.join(', '));
check('…with data unchanged', (await dataSnapshot(db)) === data);
check('…and no acknowledgement persists', await noAckLeft(db));

console.log('\n=== re-apply ===');
const again = await applyMigrations(db, { from: '0089', through: '0091' }).then(() => null).catch((e) => e.message);
check('0089, 0090 and 0091 re-apply (readiness still valid)', again === null, again);
diff = await sameAs(db, c91);
check('…to exactly the final 0091 catalog', diff.length === 0, diff.join(', '));
check('…with data unchanged', (await dataSnapshot(db)) === data);
check('…and no acknowledgement persists', await noAckLeft(db));

// Defence in depth: even a wrongly session-wide 0089 acknowledgement is
// cleared by the file (run in the correct order, down to 0088 and back).
console.log('\n=== session-wide acknowledgement ===');
await rollBack(db, '0091');
await rollBack(db, '0090');
await db.query(`select set_config('emblem.acknowledge_0089_rollback', 'REOPEN-AUTHORIZATION-VULNERABILITY', false)`);
const sessionRun = await db.exec(ROLLBACK('0089')).then(() => null).catch((e) => e.message);
check('the 0089 rollback runs with a session-wide acknowledgement', sessionRun === null, sessionRun);
check('…and clears it: no acknowledgement survives', await noAckLeft(db));
diff = await sameAs(db, c88);
check('…at the exact 0088 catalog', diff.length === 0, diff.join(', '));
const cycle = await applyMigrations(db, { from: '0089', through: '0091' }).then(() => null).catch((e) => e.message);
diff = await sameAs(db, c91);
check('…and 0089-0091 re-apply to the exact final catalog', cycle === null && diff.length === 0, cycle ?? diff.join(', '));
await db.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} rollback ordering checks passed`);
process.exit(passed === results.length ? 0 : 1);
