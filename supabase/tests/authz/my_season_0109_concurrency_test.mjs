// Real-PostgreSQL proof for 0109: a caller cannot gain guardian status while
// withdrawing their own note slips through. PGlite has one connection, so it
// cannot test this. Separate connections at READ COMMITTED (PostgREST's level):
//   a. Guardian link first, uncommitted: the withdrawal waits. Commit: EMS07 and
//      nothing is erased. Rollback: the withdrawal succeeds.
//   b. Withdrawal first, uncommitted: the guardian link waits. Commit: the note
//      was withdrawn before the link existed. Rollback: the link lands and a
//      new withdrawal gets EMS07.
//   c. The dangerous gap: the withdrawal has passed its checks and is stuck on
//      the note row. The link cannot commit until the withdrawal has finished.
//      CONTROL: without the 0109 lock, the same interleaving lets the link
//      commit first and the note is erased anyway, so this test can detect it.
//   d. A link followed by a profile update in one transaction does not deadlock.
//   e. Bursts end only in success or EMS07, with one consistent result each.
//   f. Staff removal works for such a note and is not blocked by a refusal.
//
// RUN: node --no-warnings supabase/tests/authz/my_season_0109_concurrency_test.mjs
// REQUIRES EMBLEM_AUTHZ_PG_DIR (see my_season_concurrency_test.mjs). Fully
// disposable: temporary data directory, 127.0.0.1 only, fictional data.
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { listMigrations, MIGRATIONS_DIR, PLATFORM_STUBS, PRODUCTION_DEFAULT_PRIVILEGES } from './harness.mjs';

const TOOL = process.env.EMBLEM_AUTHZ_PG_DIR;
if (!TOOL || !path.isAbsolute(TOOL)) throw new Error('Set EMBLEM_AUTHZ_PG_DIR to the absolute tooling folder holding embedded-postgres and pg.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(TOOL, 'node_modules', 'embedded-postgres', 'dist', 'index.js')).href);
const pg = (await import(pathToFileURL(path.join(TOOL, 'node_modules', 'pg', 'lib', 'index.js')).href)).default;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'emblem-0109-'));
const PORT = 57000 + Math.floor(Math.random() * 900), PASSWORD = crypto.randomBytes(12).toString('hex');
const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID(), FN = 'public.my_season_withdraw_observation(uuid)', MD5_0109 = '081f1ea6eb6b7acd27dafda6f9a3063d';
const server = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'postgres', password: PASSWORD, port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'log_min_error_statement=panic'], onLog: () => {}, onError: () => {} });
await server.initialise(); await server.start(); await server.createDatabase('emblem');
const connect = async () => { const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: PASSWORD, database: 'emblem' }); c.on('error', () => {}); await c.connect(); return c; };
const clients = [];
let O, mig;
async function waitsOnLock(client) {
  for (let i = 0; i < 200; i++) {
    if ((await O.query(`select wait_event_type w from pg_stat_activity where pid = $1`, [client.processID])).rows[0]?.w === 'Lock') return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}
try {
  const setup = await connect();
  await setup.query(PLATFORM_STUBS); await setup.query(PRODUCTION_DEFAULT_PRIVILEGES); await setup.query(`alter database emblem set search_path = "$user", public, extensions`); await setup.end();
  mig = await connect();
  for (const m of listMigrations()) {
    if (m.version === '0089') {
      const staff = id();
      await mig.query(`insert into auth.users (id, email) values ($1, 'readiness-0109c@example.test')`, [staff]);
      await mig.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness')`, [staff]);
      await mig.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
      await mig.query('begin; set local role service_role;');
      await mig.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [staff]);
      await mig.query('commit;');
    }
    await mig.query(fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8'));
  }
  const fnMd5 = async () => (await mig.query(`select md5(prosrc) m from pg_proc where oid = '${FN}'::regprocedure`)).rows[0].m;
  check('setup: the chain through 0109 applies on real PostgreSQL', (await fnMd5()) === MD5_0109);
  check('setup: READ COMMITTED', (await mig.query(`show default_transaction_isolation`)).rows[0].default_transaction_isolation === 'read committed');
  O = await connect();
  for (let i = 0; i < 6; i++) clients.push(await connect());
  const [A, B, C] = clients;

  const person = async (name) => { const u = id(); await mig.query(`insert into auth.users (id, email) values ($1, $2)`, [u, `c0109-${u.slice(0, 8)}@example.test`]); await mig.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [u, name]); return u; };
  const season = id(), club = id(), team = id(), staff = await person('Staff');
  await mig.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
  await mig.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await mig.query(`insert into public.clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await mig.query(`insert into public.teams (id, club_id, name, season_id) values ($1, $2, 'U10', $3)`, [team, club, season]);
  await mig.query(`update public.season_feature_global set kill_switch = false`);
  await mig.query(`insert into public.season_feature_team_states (team_id, state) values ($1, 'pilot')`, [team]);

  const rpc = async (c, uid, sql, params, { hold = false } = {}) => {
    await c.query('begin'); await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    try { const r = await c.query(sql, params); if (!hold) await c.query('commit'); return r.rows[0]; } catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  };
  const outcome = (p) => p.then(() => ({ ok: true }), (e) => ({ ok: false, code: e.code, message: e.message }));
  const withdraw = (c, uid, note, o) => rpc(c, uid, `select public.my_season_withdraw_observation($1)`, [note], o);
  // A fresh coach, child and active note, so each scenario is independent.
  const scene = async () => {
    const coach = await person('Coach'), child = id();
    await mig.query(`insert into public.coach_team (team_id, profile_id) values ($1, $2)`, [team, coach]);
    await mig.query(`insert into public.players (id, name, team_id) values ($1, 'Fictional Child', $2)`, [child, team]);
    const note = (await rpc(A, coach, `select public.my_season_add_observation($1, 'kept_going', 'Fictional note about the second half.', $2) id`, [child, id()])).id;
    return { coach, child, note };
  };
  const linkSql = `insert into public.guardians (player_id, profile_id, created_via) values ($1, $2, 'staff')`;
  const state = async ({ note, child, coach }) => {
    const r = (await mig.query(`select o.body is not null live, o.withdrawn_at is not null closed, (select count(*)::int from public.my_season_audit_events a where a.subject_id = o.id and a.event = 'observation_withdrawn') audits, (select count(*)::int from public.guardians g where g.player_id = $2 and g.profile_id = $3) links from public.my_season_coach_observations o where o.id = $1`, [note, child, coach])).rows[0];
    return r;
  };
  const intact = (s) => s.live && !s.closed && s.audits === 0, erased = (s) => !s.live && s.closed && s.audits === 1;

  console.log('\n=== a. The guardian link starts first ===');
  {
    const s = await scene(); await B.query('begin'); await B.query(linkSql, [s.child, s.coach]);
    const w = outcome(withdraw(C, s.coach, s.note)), waited = await waitsOnLock(C); await B.query('commit'); const r = await w, st = await state(s);
    check('a: link commits: the withdrawal waited, then got EMS07', waited && r.code === 'EMS07' && r.message === 'my_season_own_child', { waited, r });
    check('a: nothing was erased or audited', intact(st) && st.links === 1, st);
  }
  {
    const s = await scene(); await B.query('begin'); await B.query(linkSql, [s.child, s.coach]);
    const w = outcome(withdraw(C, s.coach, s.note)), waited = await waitsOnLock(C); await B.query('rollback'); const r = await w, st = await state(s);
    check('a: link rolls back: the withdrawal waited, then succeeded', waited && r.ok && erased(st) && st.links === 0, { waited, r, st });
  }

  console.log('\n=== b. The withdrawal starts first ===');
  {
    const s = await scene(); await withdraw(C, s.coach, s.note, { hold: true }); await B.query('begin');
    const link = B.query(linkSql, [s.child, s.coach]).then(() => 'linked', (e) => e.code), waited = await waitsOnLock(B); await C.query('commit'); const l = await link; await B.query('commit'); const st = await state(s);
    check('b: withdrawal commits: the link waited, then was created', waited && l === 'linked', { waited, l });
    check('b: the note was withdrawn once, before the link existed', erased(st) && st.links === 1, st);
  }
  {
    const s = await scene(); await withdraw(C, s.coach, s.note, { hold: true }); await B.query('begin');
    const link = B.query(linkSql, [s.child, s.coach]).then(() => 'linked', (e) => e.code), waited = await waitsOnLock(B); await C.query('rollback'); const l = await link; await B.query('commit');
    const again = await outcome(withdraw(C, s.coach, s.note)), st = await state(s);
    check('b: withdrawal rolls back: the link lands and a new withdrawal gets EMS07', waited && l === 'linked' && again.code === 'EMS07' && intact(st) && st.links === 1, { waited, l, again, st });
  }

  console.log('\n=== c. Withdrawal past its checks, stuck on the note ===');
  const gapRun = async () => {
    const s = await scene(); await O.query('begin'); await O.query(`select 1 from public.my_season_coach_observations where id = $1 for update`, [s.note]);
    const w = outcome(withdraw(C, s.coach, s.note)), stuck = await waitsOnLock(C);
    await B.query('begin');
    let linkDone = false; const link = B.query(linkSql, [s.child, s.coach]).then(() => { linkDone = true; return 'linked'; }, (e) => e.code);
    await new Promise((r) => setTimeout(r, 400));
    const linkFinishedFirst = linkDone; let committedFirst = false;
    if (linkFinishedFirst) { await link; await B.query('commit'); committedFirst = true; }
    const linkWaited = !linkFinishedFirst && await waitsOnLock(B);
    await O.query('rollback'); const r = await w;
    if (!committedFirst) { await link; await B.query('commit'); }
    return { stuck, linkWaited, committedFirst, r, st: await state(s) };
  };
  {
    const x = await gapRun();
    check('c: the link cannot commit while the withdrawal is in progress', x.stuck && x.linkWaited && !x.committedFirst, x);
    check('c: the withdrawal finished first, so erasing was correct; the link follows', x.r.ok && erased(x.st) && x.st.links === 1, x);
    const def = (await mig.query(`select pg_get_functiondef('${FN}'::regprocedure) d`)).rows[0].d, noLock = def.replace('perform 1 from public.profiles pr where pr.id = v_uid for update;', 'perform 1 from public.profiles pr where pr.id = v_uid;');
    if (noLock === def) throw new Error('control setup did not change the function');
    await mig.query(noLock);
    let y; try { y = await gapRun(); } finally { await mig.query(def); }
    check('c: CONTROL: without the lock the link commits first and the note is still erased', y.committedFirst && y.r.ok && erased(y.st) && y.st.links === 1, y);
    check('c: the exact 0109 function is back after the control', (await fnMd5()) === MD5_0109);
  }

  console.log('\n=== d. Link and profile update in one transaction ===');
  {
    const s = await scene(); await B.query('begin'); await B.query(linkSql, [s.child, s.coach]);
    const w = outcome(withdraw(C, s.coach, s.note)), waited = await waitsOnLock(C);
    const upd = await B.query(`update public.profiles set display_name = 'Coach and parent' where id = $1`, [s.coach]).then(() => 'ok', (e) => e.code); await B.query('commit'); const r = await w, st = await state(s);
    check('d: no deadlock: the update succeeds and the withdrawal gets EMS07', waited && upd === 'ok' && r.code === 'EMS07' && intact(st), { waited, upd, r, st });
  }

  console.log('\n=== e. Bursts ===');
  {
    let bad = [], refused = 0, withdrawn = 0;
    for (let i = 0; i < 25; i++) {
      const s = await scene(), link = async () => { await B.query('begin'); await B.query(linkSql, [s.child, s.coach]); await B.query('commit'); };
      // Odd rounds give the withdrawals a head start, so both orders really occur.
      let linkJob = i % 2 ? null : link();
      const jobs = [C, clients[3], clients[4]].map((c) => outcome(withdraw(c, s.coach, s.note)));
      if (!linkJob) { await new Promise((r) => setTimeout(r, 3)); linkJob = link(); }
      const rs = await Promise.all(jobs); await linkJob; const st = await state(s);
      const codes = rs.map((r) => (r.ok ? 'ok' : r.code)), onlyAllowed = codes.every((c) => c === 'ok' || c === 'EMS07'), ok = st.links === 1 && onlyAllowed && (codes.includes('ok') ? erased(st) : intact(st));
      if (codes.includes('ok')) withdrawn++; else refused++;
      if (!ok) bad.push({ codes, st });
    }
    check('e: 25 races end only in success or EMS07, each with a consistent note and one link', bad.length === 0, bad.slice(0, 3));
    check('e: both orders occurred', withdrawn > 0 && refused > 0, { withdrawn, refused });
  }

  console.log('\n=== f. Staff removal ===');
  {
    const s = await scene(); await mig.query(linkSql, [s.child, s.coach]);
    const refused = await outcome(withdraw(C, s.coach, s.note));
    const r = await rpc(B, staff, `select public.my_season_staff_remove_observation($1, 'Fictional staff reason') r`, [s.note]);
    const row = (await mig.query(`select body is null erased, withdrawn_by = $2 by_staff from public.my_season_coach_observations where id = $1`, [s.note, staff])).rows[0];
    check('f: the parent-coach is refused and staff can still remove the note', refused.code === 'EMS07' && r.r.status === 'removed' && row.erased && row.by_staff, { refused, r, row });
    const t = await scene(); await withdraw(C, t.coach, t.note, { hold: true });
    const other = await Promise.race([rpc(B, staff, `select public.my_season_staff_list_observations($1) v`, [t.child]).then(() => 'answered'), new Promise((res) => setTimeout(() => res('blocked'), 3000))]);
    await C.query('commit');
    check('f: a withdrawal holding the lock does not block staff lookup', other === 'answered', other);
  }
} catch (e) {
  check('0109 concurrency suite', false, e.stack);
} finally {
  for (const c of [...clients, O, mig]) await c?.end().catch(() => {});
  await server.stop().catch(() => {});
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (e) { console.log(`note: temporary data directory not removed (${e.code})`); }
}
const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} 0109 concurrency checks passed`);
process.exit(failed ? 1 : 0);
