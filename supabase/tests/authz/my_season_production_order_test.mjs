// Production order for My Season Phase 1 (0099 + 0108).
//
// Production received 0101, then 0103-0107 (Photo Day), then 0097, 0098 and
// 0102 (migration_production_order_photo_day_test.mjs). 0099 is a reserved
// number below them, so it reaches production after 0107, followed by 0108.
// This suite builds exactly that order:
//   … 0096, 0101, 0103, 0104, 0105, 0106, 0107, 0097, 0098, 0102, 0099, 0108
// and proves:
//   1. before 0099 the catalog equals a filename-order build without 0099/0108;
//   2. after 0099 and 0108 the catalog equals a filename-order build of the
//      whole chain (the database every other suite tests);
//   3. no pre-existing table's data changes when 0099 and 0108 apply;
//   4. a My Season round trip works on the production-order database;
//   5. rollback 0108 then 0099 returns to the step-1 catalog, and both
//      re-apply to the final catalog.
//
// Run: node --no-warnings supabase/tests/authz/my_season_production_order_test.mjs
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase, listMigrations, MIGRATIONS_DIR } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(HERE, '../..', p), 'utf8');
const migration = (n) => fs.readFileSync(path.join(MIGRATIONS_DIR, listMigrations().find((m) => m.version === n).file), 'utf8');
const PRODUCTION_ORDER = ['0101', '0103', '0104', '0105', '0106', '0107', '0097', '0098', '0102', '0099', '0108'];
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const catalogDiff = (a, b) => { const d = diffCatalog(a, b); return [...d.added, ...d.removed, ...d.changed]; };

check('every migration after 0096 is in the production order list (none forgotten)',
  JSON.stringify(listMigrations().filter((m) => m.version > '0096').map((m) => m.version).sort()) === JSON.stringify([...PRODUCTION_ORDER].sort()),
  listMigrations().filter((m) => m.version > '0096').map((m) => m.version));

async function readyDatabase({ through = '9999', skip = [] } = {}) {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'synthetic-readiness@example.test')`, [staff]);
  await db.query(`insert into profiles (id, display_name) values ($1, 'Synthetic readiness')`, [staff]);
  await db.query(`insert into staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, staff]);
  await db.exec('commit;');
  for (const m of listMigrations()) {
    if (m.version < '0089' || m.version > through || skip.includes(m.version)) continue;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8'));
  }
  return db;
}
async function rollBack(db, sql, ack) {
  await db.exec('begin;');
  try {
    await db.query(`select set_config($1, $2, true)`, ack);
    await db.exec(sql);
    return null;
  } catch (e) {
    await db.exec('rollback;').catch(() => {});
    return e.message;
  }
}
async function dataHash(db, exclude = []) {
  const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename).filter((t) => !exclude.includes(t));
  const parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  return parts.join(';');
}

const filenameFull = await readyDatabase();
const finalCatalog = await snapshotCatalog(filenameFull);
await filenameFull.close();
const filenameWithout = await readyDatabase({ skip: ['0099', '0108'] });
const withoutCatalog = await snapshotCatalog(filenameWithout);
await filenameWithout.close();

const db = await readyDatabase({ through: '0096' });
try {
  // Fictional family, team and coach before anything after 0096.
  const g = id(), c = id(), season = id(), club = id(), team = id(), player = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'po-g@example.test'), ($2, 'po-c@example.test')`, [g, c]);
  await db.query(`insert into profiles (id, display_name) values ($1, 'Fictional Parent'), ($2, 'Fictional Coach')`, [g, c]);
  await db.query(`insert into seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await db.query(`insert into clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await db.query(`insert into teams (id, club_id, name, season_id) values ($1, $2, 'U10', $3)`, [team, club, season]);
  await db.query(`insert into players (id, name, team_id) values ($1, 'Fictional Player', $2)`, [player, team]);
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [player, g]);
  await db.query(`insert into coach_team (team_id, profile_id) values ($1, $2)`, [team, c]);

  for (const n of PRODUCTION_ORDER.slice(0, -2)) await db.exec(migration(n));
  const before = await snapshotCatalog(db);
  check('production order through 0102 equals a filename-order build without 0099/0108', catalogDiff(withoutCatalog, before).length === 0, catalogDiff(withoutCatalog, before));
  const dataBefore = await dataHash(db);

  await db.exec(migration('0099'));
  await db.exec(migration('0108'));
  const after = await snapshotCatalog(db);
  check('production order (… 0107, 0097, 0098, 0102, 0099, 0108) equals the filename-order catalog', catalogDiff(finalCatalog, after).length === 0, catalogDiff(finalCatalog, after));
  const newTables = ['season_feature_global', 'season_feature_team_states', 'my_season_focuses', 'my_season_coach_observations', 'my_season_audit_events', 'my_season_observation_staff_removals'];
  check('applying 0099 and 0108 changes no existing table\'s data', (await dataHash(db, newTables)) === dataBefore);

  // Round trip.
  await db.query(`update season_feature_global set kill_switch = false`);
  await db.query(`insert into season_feature_team_states (team_id, state) values ($1, 'pilot')`, [team]);
  const as = async (uid, sql, params) => {
    await db.exec('begin; set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    try { const r = await db.query(sql, params); await db.exec('commit;'); return r.rows; } catch (e) { await db.exec('rollback;'); throw e; }
  };
  await as(g, `select my_season_set_focus($1, 'Fictional focus', 'Why it matters', 'What it looks like', current_date, $2)`, [player, id()]);
  await as(c, `select my_season_add_observation($1, 'came_back_stronger', 'Came back stronger after the knock.', $2)`, [player, id()]);
  const v = (await as(g, `select my_season_for_player($1) v`, [player]))[0].v;
  check('round trip on the production-order database', v.enabled && v.access === 'guardian' && v.activeFocus?.title === 'Fictional focus' && v.observations.length === 1, v);

  const r108 = await rollBack(db, read('rollback/0108_rollback.sql'), ['emblem.acknowledge_0108_rollback', 'drop my season data']);
  const r99 = await rollBack(db, read('rollback/0099_rollback.sql'), ['emblem.acknowledge_0099_rollback', 'drop season feature states']);
  check('rollback 0108 then 0099 returns to the exact pre-0099 production catalog', r108 === null && r99 === null && catalogDiff(before, await snapshotCatalog(db)).length === 0, [r108, r99]);
  check('…with every existing table\'s data unchanged', (await dataHash(db)) === dataBefore);
  await db.exec(migration('0099'));
  await db.exec(migration('0108'));
  check('0099 and 0108 re-apply to the exact final catalog', catalogDiff(finalCatalog, await snapshotCatalog(db)).length === 0);
} catch (e) {
  check('production order', false, e.stack);
}
await db.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} My Season production-order checks passed`);
process.exit(failed.length ? 1 : 0);
