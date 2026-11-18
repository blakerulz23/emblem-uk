// Real-PostgreSQL concurrency tests for My Season (0108): duplicate submission
// protection and the erasure of withdrawn coach notes. PGlite has one
// connection, so it cannot test any of this.
//
// WHAT THIS PROVES, on PostgreSQL 17 at the default READ COMMITTED isolation
// (the level PostgREST uses), with separate connections, each running the RPC
// as `authenticated` with the JWT claim set exactly as the platform stubs read
// it:
//   a. The same request_id sent at once by the same coach (2 connections, and
//      repeated 8-connection bursts) returns one id everywhere and leaves one
//      observation, one observation_added audit event and one family entry.
//   b. A duplicate arriving while the first insert is uncommitted really waits
//      (proved from pg_stat_activity). First commits: it returns the original
//      id. First rolls back: it creates the single row itself. A duplicate
//      with other content or from another coach gets EMS06 and writes nothing.
//   c. Simultaneous withdrawals (forced, rolled back, burst) give one
//      observation_withdrawn event and leave no text or category.
//   d. A withdrawal racing a same-key retry never brings the text back and
//      never yields a second row.
//   e. Simultaneous focus changes keep exactly one active focus and the full
//      history; simultaneous retries of one request give one row and one
//      audit event; nothing but fixed EMS codes ever reaches a caller.
//   f. With PostgreSQL's default logging, none of these calls (including ones
//      refused for invalid input) puts a note's text in the server log.
//   g. ANALYZE before and after a withdrawal never puts a note's text or
//      category into pg_statistic / pg_stats (superuser and service_role).
//   h. A direct insert or update that breaks a NOT NULL or CHECK rule gets the
//      fixed EMS09: the row is in neither the error object nor the server log.
//   i. service_role holds SELECT only; child erasure still cascades.
//   j. A write racing child erasure ends in EMS03, never a raw 23503.
//
// WHAT THIS DOES NOT PROVE: anything about PostgREST, Supabase's log settings
// or what remains physically on disk. Erasure here means no SQL query can
// return the text; dead row versions, WAL, backups and statement logging
// enabled by an operator are outside what any migration controls.
//
// RUN: node --no-warnings supabase/tests/authz/my_season_concurrency_test.mjs
// REQUIRES EMBLEM_AUTHZ_PG_DIR, the isolated tooling folder holding
// `embedded-postgres` and `pg` (see concurrency_0097_0102_test.mjs). Fully
// disposable: a temporary data directory, 127.0.0.1 only, deleted at the end.
// No real project, no credentials, fictional data only.
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

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'emblem-my-season-'));
const PORT = 56000 + Math.floor(Math.random() * 900);
const PASSWORD = crypto.randomBytes(12).toString('hex');
const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const serverLog = [];
const MARK = `ZQMARK${crypto.randomBytes(6).toString('hex')}`;
const noteText = (extra = '') => `${MARK} kept going after the second goal${extra}.`;
const CATEGORY = 'tried_something_new';

const server = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'postgres', password: PASSWORD, port: PORT, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: (m) => serverLog.push(String(m)), onError: (m) => serverLog.push(String(m)) });
await server.initialise();
await server.start();
await server.createDatabase('emblem');
const connect = async () => { const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: PASSWORD, database: 'emblem' }); c.on('error', () => {}); await c.connect(); return c; };

// True once the client's backend is blocked on a heavyweight lock.
async function waitsOnLock(observer, client) {
  for (let i = 0; i < 200; i++) {
    const r = (await observer.query(`select wait_event_type from pg_stat_activity where pid = $1`, [client.processID])).rows[0];
    if (r?.wait_event_type === 'Lock') return true;
    await new Promise((res) => setTimeout(res, 25));
  }
  return false;
}
// Either blocked, or the call has already finished: for races where both are correct.
async function waitsOrFinishes(observer, client, promise) {
  let finished = false;
  promise.finally(() => { finished = true; }).catch(() => {});
  for (let i = 0; i < 200 && !finished; i++) {
    const r = (await observer.query(`select wait_event_type from pg_stat_activity where pid = $1`, [client.processID])).rows[0];
    if (r?.wait_event_type === 'Lock') return 'waited';
    await new Promise((res) => setTimeout(res, 25));
  }
  return finished ? 'finished' : 'neither';
}

const clients = [];
let O, mig;
try {
  const setup = await connect();
  console.log((await setup.query('select version()')).rows[0].version.split(',')[0]);
  await setup.query(PLATFORM_STUBS);
  await setup.query(PRODUCTION_DEFAULT_PRIVILEGES);
  await setup.query(`alter database emblem set search_path = "$user", public, extensions`);
  await setup.end();
  mig = await connect();
  for (const m of listMigrations()) {
    if (m.version === '0089') {
      const staff = id();
      await mig.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [staff]);
      await mig.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [staff]);
      await mig.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
      await mig.query('begin; set local role service_role;');
      await mig.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [staff]);
      await mig.query('commit;');
    }
    try { await mig.query(fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8')); } catch (e) { throw new Error(`${m.file}: ${e.message}`); }
  }
  check('setup: every migration applies on real PostgreSQL (numbered order)', true);
  const iso = (await mig.query(`show default_transaction_isolation`)).rows[0].default_transaction_isolation;
  check('setup: the tests run at READ COMMITTED', iso === 'read committed', iso);

  // Fixtures (owner): one club, one enabled team, two coaches, a guardian per child.
  const person = async (name) => {
    const uid = id();
    await mig.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `ms-${uid.slice(0, 8)}@example.test`]);
    await mig.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [uid, name]);
    return uid;
  };
  const coach = await person('Coach One'), coach2 = await person('Coach Two'), guardian = await person('Guardian');
  const season = id(), club = id(), team = id();
  await mig.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await mig.query(`insert into public.clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await mig.query(`insert into public.teams (id, club_id, name, season_id) values ($1, $2, 'U10', $3)`, [team, club, season]);
  await mig.query(`insert into public.coach_team (team_id, profile_id) values ($1, $2), ($1, $3)`, [team, coach, coach2]);
  await mig.query(`update public.season_feature_global set kill_switch = false`);
  await mig.query(`insert into public.season_feature_team_states (team_id, state) values ($1, 'pilot')`, [team]);
  const child = async () => {
    const p = id();
    await mig.query(`insert into public.players (id, name, team_id) values ($1, 'Fictional Child', $2)`, [p, team]);
    await mig.query(`insert into public.guardians (player_id, profile_id) values ($1, $2)`, [p, guardian]);
    return p;
  };

  O = await connect();
  for (let i = 0; i < 8; i++) clients.push(await connect());
  const [A, B] = clients;

  // One RPC call in its own transaction, as PostgREST runs it. `hold` leaves
  // the transaction open for the test to commit or roll back.
  const rpc = async (c, uid, sql, params, { hold = false } = {}) => {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    try {
      const r = await c.query(sql, params);
      if (!hold) await c.query('commit');
      return r.rows[0];
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    }
  };
  const outcome = (p) => p.then((v) => ({ id: v }), (e) => ({ code: e.code, message: e.message, detail: e.detail ?? null, hint: e.hint ?? null }));
  const add = (c, uid, player, requestId, o = {}) =>
    rpc(c, uid, `select public.my_season_add_observation($1, $2, $3, $4) as id`, [player, o.category ?? CATEGORY, o.body ?? noteText(), requestId], o).then((r) => r.id);
  const withdraw = (c, uid, obs, o = {}) => rpc(c, uid, `select public.my_season_withdraw_observation($1)`, [obs], o).then(() => obs);
  const setFocus = (c, uid, player, requestId, title, o = {}) =>
    rpc(c, uid, `select public.my_season_set_focus($1, $2, 'Why it matters', 'What it looks like', $3::date, $4) as id`, [player, title, new Date().toISOString().slice(0, 10), requestId], o).then((r) => r.id);
  const n = async (sql, params) => Number((await mig.query(sql, params)).rows[0].n);
  const obsRows = async (p) => (await mig.query(`select id, body, category, withdrawn_at, withdrawn_by, author_id from public.my_season_coach_observations where player_id = $1`, [p])).rows;
  const audits = (p, event) => n(`select count(*) n from public.my_season_audit_events where player_id = $1 and event = $2`, [p, event]);
  const familyEntries = async (p) => (await rpc(clients[7], guardian, `select public.my_season_for_player($1) as v`, [p])).v.observations.length;
  const allSame = (rs) => rs.every((r) => r.id && r.id === rs[0].id);
  const errorsOf = (rs) => rs.filter((r) => !r.id);

  console.log('\n=== a. Same request, same coach, at the same moment ===');
  {
    const p = await child(), req = id();
    const rs = await Promise.all([outcome(add(A, coach, p, req)), outcome(add(B, coach, p, req))]);
    check('a: 2 connections: both return the same id', allSame(rs), rs);
    check('a: 2 connections: 1 observation, 1 observation_added, 1 family entry',
      (await obsRows(p)).length === 1 && await audits(p, 'observation_added') === 1 && await familyEntries(p) === 1);
  }
  {
    let sameId = true, one = true, oneAudit = true, oneEntry = true; const problems = [];
    for (let round = 0; round < 10; round++) {
      const p = await child(), req = id();
      const rs = await Promise.all(clients.map((c) => outcome(add(c, coach, p, req))));
      if (!allSame(rs)) { sameId = false; problems.push(errorsOf(rs)); }
      if ((await obsRows(p)).length !== 1) one = false;
      if (await audits(p, 'observation_added') !== 1) oneAudit = false;
      if (await familyEntries(p) !== 1) oneEntry = false;
    }
    check('a: 8-connection burst x10: every call returns the same id', sameId, problems);
    check('a: 8-connection burst x10: always 1 observation, 1 audit event, 1 family entry', one && oneAudit && oneEntry, { one, oneAudit, oneEntry });
  }

  console.log('\n=== b. The duplicate waits for an uncommitted insert ===');
  {
    const p = await child(), req = id();
    const first = await add(A, coach, p, req, { hold: true });
    const dup = outcome(add(B, coach, p, req));
    const waited = await waitsOnLock(O, B);
    const seenWhileOpen = (await obsRows(p)).length;
    await A.query('commit');
    const r = await dup;
    check('b: commit: the duplicate waited, then returned the original id', waited && seenWhileOpen === 0 && r.id === first, { waited, seenWhileOpen, r });
    check('b: commit: 1 observation, 1 audit event, 1 family entry',
      (await obsRows(p)).length === 1 && await audits(p, 'observation_added') === 1 && await familyEntries(p) === 1);
  }
  {
    const p = await child(), req = id();
    const first = await add(A, coach, p, req, { hold: true });
    const dup = outcome(add(B, coach, p, req));
    const waited = await waitsOnLock(O, B);
    await A.query('rollback');
    const r = await dup;
    const rows = await obsRows(p);
    const subject = (await mig.query(`select subject_id from public.my_season_audit_events where player_id = $1 and event = 'observation_added'`, [p])).rows;
    check('b: rollback: the waiter then creates the single row under its own id', waited && r.id && r.id !== first && rows.length === 1 && rows[0].id === r.id, { waited, r, rows: rows.length });
    check('b: rollback: exactly 1 audit event, for the surviving row', subject.length === 1 && subject[0].subject_id === r.id, subject);
  }
  {
    const p = await child(), req = id();
    const first = await add(A, coach, p, req, { hold: true });
    const otherText = outcome(add(B, coach, p, req, { body: noteText(' and again') }));
    const waited = await waitsOnLock(O, B);
    const otherCoach = outcome(add(clients[2], coach2, p, req));
    const waited2 = await waitsOnLock(O, clients[2]);
    await A.query('commit');
    const [r1, r2] = await Promise.all([otherText, otherCoach]);
    const rows = await obsRows(p);
    check('b: while it waits, different content and a different coach both end in EMS06 with no write',
      waited && waited2 && r1.code === 'EMS06' && r2.code === 'EMS06' && rows.length === 1 && rows[0].id === first && rows[0].body === noteText() && await audits(p, 'observation_added') === 1, { waited, waited2, r1, r2 });
    check('b: the refusals carry only the fixed message', [r1, r2].every((r) => r.message === 'my_season_request_conflict' && !r.detail && !r.hint), [r1, r2]);
  }

  console.log('\n=== c. Simultaneous withdrawals ===');
  const gone = (rows) => rows.length === 1 && rows[0].body === null && rows[0].category === null && rows[0].withdrawn_at !== null && rows[0].withdrawn_by === coach;
  {
    const p = await child();
    const o = await add(A, coach, p, id());
    await withdraw(A, coach, o, { hold: true });
    const second = outcome(withdraw(B, coach, o));
    const waited = await waitsOnLock(O, B);
    await A.query('commit');
    const r = await second;
    check('c: forced: the second waits on the row, then is a silent no-op', waited && r.id === o, { waited, r });
    check('c: forced: text and category gone, exactly 1 observation_withdrawn', gone(await obsRows(p)) && await audits(p, 'observation_withdrawn') === 1);
  }
  {
    const p = await child();
    const o = await add(A, coach, p, id());
    await withdraw(A, coach, o, { hold: true });
    const second = outcome(withdraw(B, coach, o));
    const waited = await waitsOnLock(O, B);
    await A.query('rollback');
    const r = await second;
    check('c: first rolls back: the waiter does the withdrawal, 1 audit event, text gone',
      waited && r.id === o && gone(await obsRows(p)) && await audits(p, 'observation_withdrawn') === 1, { waited, r });
  }
  {
    let ok = true; const problems = [];
    for (let round = 0; round < 10; round++) {
      const p = await child();
      const o = await add(A, coach, p, id());
      const rs = await Promise.all(clients.map((c) => outcome(withdraw(c, coach, o))));
      if (!rs.every((r) => r.id === o) || !gone(await obsRows(p)) || await audits(p, 'observation_withdrawn') !== 1) { ok = false; problems.push(errorsOf(rs)); }
    }
    check('c: 8-connection burst x10: all succeed, 1 audit event each time, text gone', ok, problems);
  }

  console.log('\n=== d. Withdrawal racing a same-key retry ===');
  {
    const p = await child(), req = id();
    const o = await add(A, coach, p, req);
    await withdraw(A, coach, o, { hold: true });
    const retry = outcome(add(B, coach, p, req));
    const how = await waitsOrFinishes(O, B, retry);
    await A.query('commit');
    const r = await retry;
    const rows = await obsRows(p);
    check(`d: forced (retry ${how}): the retry returns the original id; 1 row, no text`, how !== 'neither' && r.id === o && gone(rows), { how, r });
    check('d: forced: 1 observation_added, 1 observation_withdrawn', await audits(p, 'observation_added') === 1 && await audits(p, 'observation_withdrawn') === 1);
    const after = await outcome(add(B, coach, p, req));
    check('d: a retry after the withdrawal commits returns the id and writes nothing', after.id === o && gone(await obsRows(p)) && await audits(p, 'observation_added') === 1, after);
  }
  {
    let ok = true; const problems = [];
    for (let round = 0; round < 10; round++) {
      const p = await child(), req = id();
      const o = await add(A, coach, p, req);
      const jobs = clients.map((c, i) => outcome(i % 2 ? withdraw(c, coach, o) : add(c, coach, p, req)));
      const rs = await Promise.all(jobs);
      if (!rs.every((r) => r.id === o) || !gone(await obsRows(p)) || await audits(p, 'observation_added') !== 1 || await audits(p, 'observation_withdrawn') !== 1) { ok = false; problems.push(errorsOf(rs)); }
    }
    check('d: burst x10 (4 withdrawals, 4 retries): one row, no text, one event of each kind', ok, problems);
  }
  {
    // First insert still open: nobody else can withdraw a row they cannot see.
    const p = await child(), req = id();
    const o = await add(A, coach, p, req, { hold: true });
    const early = await outcome(withdraw(B, coach, o));
    await A.query('commit');
    check('d: withdrawing an uncommitted note is the same EMS03 as an unknown id, and the note is unaffected',
      early.code === 'EMS03' && (await obsRows(p))[0].body === noteText(), early);
  }

  console.log('\n=== e. Focus changes at the same moment ===');
  const focusState = async (p) => ({
    total: await n(`select count(*) n from public.my_season_focuses where player_id = $1`, [p]),
    active: await n(`select count(*) n from public.my_season_focuses where player_id = $1 and ended_at is null`, [p]),
    ended: await n(`select count(*) n from public.my_season_focuses where player_id = $1 and ended_at is not null and ended_by is not null`, [p]),
    set: await audits(p, 'focus_set'),
    endedAudit: await audits(p, 'focus_ended'),
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  {
    const p = await child();
    const first = await setFocus(A, guardian, p, id(), 'First focus', { hold: true });
    const second = outcome(setFocus(B, coach, p, id(), 'Second focus'));
    const waited = await waitsOnLock(O, B);
    await A.query('commit');
    const r = await second;
    const active = (await mig.query(`select id from public.my_season_focuses where player_id = $1 and ended_at is null`, [p])).rows;
    check('e: two different requests, forced: the second waits, then replaces the first', waited && r.id && r.id !== first && active.length === 1 && active[0].id === r.id, { waited, r });
    check('e: forced: one active focus, history intact', same(await focusState(p), { total: 2, active: 1, ended: 1, set: 2, endedAudit: 1 }), await focusState(p));
  }
  {
    const p = await child();
    const rs = await Promise.all(clients.map((c, i) => outcome(setFocus(c, guardian, p, id(), `Focus number ${i}`))));
    check('e: 8 different requests at once: all succeed with no error', rs.every((r) => r.id) && new Set(rs.map((r) => r.id)).size === 8, errorsOf(rs));
    check('e: 8 at once: one active focus, seven in history, matching audit', same(await focusState(p), { total: 8, active: 1, ended: 7, set: 8, endedAudit: 7 }), await focusState(p));
  }
  {
    const p = await child(), req = id();
    await setFocus(A, guardian, p, id(), 'Earlier focus');
    const rs = await Promise.all(clients.map((c) => outcome(setFocus(c, guardian, p, req, 'Retried focus'))));
    check('e: the same request 8 times at once: one id, no error', allSame(rs), errorsOf(rs));
    check('e: ...one new row, one focus_set, the earlier focus ended once', same(await focusState(p), { total: 2, active: 1, ended: 1, set: 2, endedAudit: 1 }), await focusState(p));
  }
  {
    // Different players take different advisory locks, so this one reaches the unique index.
    const p1 = await child(), p2 = await child(), req = id();
    const kept = await setFocus(A, guardian, p2, id(), 'Must stay active');
    await setFocus(A, guardian, p1, req, 'Claims the key', { hold: true });
    const other = outcome(setFocus(B, guardian, p2, req, 'Wants the same key'));
    const waited = await waitsOnLock(O, B);
    await A.query('commit');
    const r = await other;
    const active = (await mig.query(`select id from public.my_season_focuses where player_id = $1 and ended_at is null`, [p2])).rows;
    check('e: one key used for two children at once: the second waits, gets EMS06, and its child keeps the old focus',
      waited && r.code === 'EMS06' && r.message === 'my_season_request_conflict' && active.length === 1 && active[0].id === kept
        && same(await focusState(p2), { total: 1, active: 1, ended: 0, set: 1, endedAudit: 0 }), { waited, r, state: await focusState(p2) });
  }

  console.log('\n=== f. Nothing leaks ===');
  {
    const tables = (await mig.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
    const p = await child();
    const o = await add(A, coach, p, id());
    await withdraw(A, coach, o);
    // The other fixtures keep active notes with the marker; look only at what this withdrawal could have left.
    const auditHits = await n(`select count(*) n from public.my_season_audit_events x where x::text like $1 or x::text like $2`, [`%${MARK}%`, `%${CATEGORY}%`]);
    const elsewhere = [];
    for (const t of tables) {
      if (t === 'my_season_coach_observations') continue;
      if (await n(`select count(*) n from public."${t}" x where x::text like $1`, [`%${MARK}%`])) elsewhere.push(t);
    }
    check('f: the marker text is in no public table except active notes; the audit table holds neither text nor category', auditHits === 0 && elsewhere.length === 0, { auditHits, elsewhere });
    check('f: no withdrawn row anywhere still holds content', await n(`select count(*) n from public.my_season_coach_observations where withdrawn_at is not null and (body is not null or category is not null)`) === 0);

    // Refused inputs carrying the marker: fixed answers.
    const q = await child();
    const bad = await Promise.all([
      outcome(add(A, coach, q, id(), { body: `${MARK} ${'x'.repeat(170)}` })),
      outcome(add(B, coach, q, id(), { body: `${MARK} one. Two here. Three here. Four.` })),
      outcome(add(clients[2], coach, q, id(), { category: `${MARK}_category` })),
    ]);
    check('f: invalid notes get EMS05 with the fixed message, no DETAIL or HINT, and nothing is stored',
      bad.every((r) => r.code === 'EMS05' && r.message === 'my_season_invalid_input' && !r.detail && !r.hint) && (await obsRows(q)).length === 0, bad);

    await mig.query(`select 1/0 as my_season_log_canary`).catch(() => {});
    await new Promise((res) => setTimeout(res, 300));
    const log = serverLog.join('');
    check('f: control: the captured server log does record failing statements', log.includes('my_season_log_canary'));
    check('f: default logging: the marker is nowhere in the server log (parameterised calls, including refused ones)', !log.includes(MARK));
  }

  console.log('\n=== g. Planner statistics never hold note text ===');
  {
    const STAT = `ZQSTAT${crypto.randomBytes(6).toString('hex')}`;
    const STAT_CATEGORY = 'came_back_stronger';
    const T = 'public.my_season_coach_observations';
    const p = await child(), notes = [];
    for (let i = 0; i < 40; i++) notes.push(await add(A, coach, p, id(), { body: `${STAT} note number ${i} kept going.`, category: STAT_CATEGORY }));

    const statsViewText = `select coalesce(string_agg(concat_ws('|', tablename, attname, most_common_vals::text, histogram_bounds::text, most_common_elems::text), chr(10)), '') t from pg_stats where schemaname = 'public'`;
    const statsColumns = `select count(*)::int n from pg_stats where schemaname = 'public' and tablename = 'my_season_coach_observations' and attname in ('body', 'category')`;
    const rawText = `select coalesce(string_agg(concat_ws('|', stavalues1::text, stavalues2::text, stavalues3::text, stavalues4::text, stavalues5::text), chr(10)), '') t from pg_statistic`;
    const rawForTable = `select coalesce(string_agg(concat_ws('|', stavalues1::text, stavalues2::text, stavalues3::text, stavalues4::text, stavalues5::text), chr(10)), '') t from pg_statistic where starelid = '${T}'::regclass`;
    const rawColumns = `select count(*)::int n from pg_statistic s join pg_attribute a on a.attrelid = s.starelid and a.attnum = s.staattnum where s.starelid = '${T}'::regclass and a.attname in ('body', 'category')`;
    const asServiceRole = async (sql) => {
      await mig.query('begin');
      await mig.query('set local role service_role');
      try { return (await mig.query(sql)).rows[0]; } catch (e) { return { code: e.code }; } finally { await mig.query('rollback'); }
    };
    const inspect = async (label) => {
      const su = {
        columns: (await mig.query(statsColumns)).rows[0].n,
        rawColumns: (await mig.query(rawColumns)).rows[0].n,
        view: (await mig.query(statsViewText)).rows[0].t,
        raw: (await mig.query(rawText)).rows[0].t,
        rawTable: (await mig.query(rawForTable)).rows[0].t,
      };
      check(`g: ${label}: superuser: no pg_stats or pg_statistic row for body or category`, su.columns === 0 && su.rawColumns === 0, su);
      check(`g: ${label}: superuser: the marker is nowhere in pg_stats or pg_statistic, the category nowhere in this table's statistics`,
        !su.view.includes(STAT) && !su.raw.includes(STAT) && !su.rawTable.includes(STAT_CATEGORY));
      const sr = await asServiceRole(statsViewText), srColumns = await asServiceRole(statsColumns), srRaw = await asServiceRole(rawText);
      check(`g: ${label}: service_role: no such row, no marker in pg_stats, pg_statistic refused`,
        srColumns.n === 0 && typeof sr.t === 'string' && !sr.t.includes(STAT) && !sr.t.includes(STAT_CATEGORY) && srRaw.code === '42501', { srColumns, srRaw });
    };
    const targets = (await mig.query(`select attname a, attstattarget t from pg_attribute where attrelid = '${T}'::regclass and attname in ('body', 'category')`)).rows;
    check('g: attstattarget is 0 for body and category', targets.length === 2 && targets.every((r) => r.t === 0), targets);
    await mig.query('analyze');
    const otherColumns = (await mig.query(`select count(*)::int n from pg_stats where schemaname = 'public' and tablename = 'my_season_coach_observations'`)).rows[0].n;
    check('g: ANALYZE did run on the table (its other columns have statistics)', otherColumns > 0, otherColumns);
    await inspect('before withdrawal');
    for (const o of notes) await withdraw(A, coach, o);
    await mig.query('analyze');
    await inspect('after withdrawal');

    // Control: the same queries do find text in an ordinary analysed column.
    await mig.query(`create table public.zz_stats_control as select $1::text || ' row ' || g as t from generate_series(1, 200) g`, [STAT]);
    await mig.query('analyze public.zz_stats_control');
    const control = (await mig.query(statsViewText)).rows[0].t.includes(STAT) && (await mig.query(rawText)).rows[0].t.includes(STAT);
    await mig.query('drop table public.zz_stats_control');
    check('g: control: an ordinary text column does expose its values, so these checks can fail', control);
  }

  console.log('\n=== h. Direct writes never echo a row ===');
  {
    const SECRET = `ZQECHO${crypto.randomBytes(6).toString('hex')}`;
    const note = `${SECRET} direct insert note text here.`;
    const p = await child();
    const live = await add(A, coach, p, id());
    const focusLive = await setFocus(A, guardian, p, id(), 'Focus to update');
    const nc = 'player_id, author_id, request_id, category, body';
    const fc = 'player_id, created_by, request_id, author_role, started_on, title, why_it_matters, what_it_looks_like';
    const today = new Date().toISOString().slice(0, 10);
    const noteRow = (extraCols, extraVals, vals = [p, coach, id(), 'kept_going', note]) =>
      [`insert into public.my_season_coach_observations (${nc}${extraCols}) values ($1, $2, $3, $4, $5${extraVals})`, vals];
    const focusRow = (extraCols, extraVals, vals = [p, guardian, id(), 'guardian', today, SECRET, SECRET, SECRET]) =>
      [`insert into public.my_season_focuses (${fc}${extraCols}) values ($1, $2, $3, $4, $5::date, $6, $7, $8${extraVals})`, vals];
    const fixed = {
      noteNullId: noteRow(', id', ', null'),
      noteNullCreatedAt: noteRow(', created_at', ', null'),
      noteNullPlayer: noteRow('', '', [null, coach, id(), 'kept_going', note]),
      noteNullRequest: noteRow('', '', [p, coach, null, 'kept_going', note]),
      noteBadCategory: noteRow('', '', [p, coach, id(), 'nope', note]),
      noteTooLong: noteRow('', '', [p, coach, id(), 'kept_going', note.repeat(10)]),
      notePadded: noteRow('', '', [p, coach, id(), 'kept_going', ` ${note}`]),
      focusNullId: focusRow(', id', ', null'),
      focusNullCreatedAt: focusRow(', created_at', ', null'),
      focusNullPlayer: focusRow('', '', [null, guardian, id(), 'guardian', today, SECRET, SECRET, SECRET]),
      focusNullRequest: focusRow('', '', [p, guardian, null, 'guardian', today, SECRET, SECRET, SECRET]),
      focusNullDate: focusRow('', '', [p, guardian, id(), 'guardian', null, SECRET, SECRET, SECRET]),
      focusBadRole: focusRow('', '', [p, guardian, id(), 'staff', today, SECRET, SECRET, SECRET]),
      focusLongTitle: focusRow('', '', [p, guardian, id(), 'guardian', today, SECRET.repeat(9), SECRET, SECRET]),
      focusPaddedTitle: focusRow('', '', [p, guardian, id(), 'guardian', today, ` ${SECRET}`, SECRET, SECRET]),
      focusShortLooks: focusRow('', '', [p, guardian, id(), 'guardian', today, SECRET, SECRET, 'x']),
      updNoteBody: [`update public.my_season_coach_observations set body = $2 where id = $1`, [live, note]],
      updNoteNullId: [`update public.my_season_coach_observations set id = null, body = $2 where id = $1`, [live, note]],
      updNoteNullCreated: [`update public.my_season_coach_observations set created_at = null, body = $2 where id = $1`, [live, note]],
      updNoteNullRequest: [`update public.my_season_coach_observations set request_id = null, body = $2 where id = $1`, [live, note]],
      updFocusTitle: [`update public.my_season_focuses set title = $2 where id = $1`, [focusLive, SECRET]],
      updFocusNullStart: [`update public.my_season_focuses set started_on = null, title = $2 where id = $1`, [focusLive, SECRET]],
    };
    const keyOnly = {
      noteBadPlayerFk: noteRow('', '', [id(), coach, id(), 'kept_going', note]),
      noteBadAuthorFk: noteRow('', '', [p, id(), id(), 'kept_going', note]),
      noteBadTeamFk: noteRow(', team_id', `, '${id()}'`),
      focusBadPlayerFk: focusRow('', '', [id(), guardian, id(), 'guardian', today, SECRET, SECRET, SECRET]),
    };
    const attempt = ([sql, params]) => mig.query(sql, params).then(() => ({ code: 'ok' }), (e) => e);
    const shown = (e) => JSON.stringify({ ...e, message: e.message });
    const bad = {};
    for (const [k, c] of Object.entries(fixed)) {
      const e = await attempt(c);
      if (!(e.code === 'EMS09' && !e.detail && !e.hint && !shown(e).includes(SECRET))) bad[k] = { code: e.code, detail: e.detail };
    }
    check('h: every NOT NULL / CHECK path (insert and update, both tables) gets EMS09 and the error object holds no text', Object.keys(bad).length === 0, bad);
    const badKeys = {};
    for (const [k, c] of Object.entries(keyOnly)) {
      const e = await attempt(c);
      if (!(e.code === '23503' && !shown(e).includes(SECRET))) badKeys[k] = { code: e.code, detail: e.detail };
    }
    check('h: foreign-key failures name only the key', Object.keys(badKeys).length === 0, badKeys);
    const stored = (await mig.query(`select count(*)::int n from public.my_season_coach_observations where body like $1`, [`%${SECRET}%`])).rows[0].n
      + (await mig.query(`select count(*)::int n from public.my_season_focuses where title like $1 or why_it_matters like $1 or what_it_looks_like like $1`, [`%${SECRET}%`])).rows[0].n;
    check('h: nothing was stored', stored === 0, stored);
    await new Promise((res) => setTimeout(res, 300));
    const log = serverLog.join('');
    check('h: the server log recorded these refusals (control)', log.includes('my_season_insert_shape'));
    check('h: the text is nowhere in the server log, and no "Failing row" line exists', !log.includes(SECRET) && !log.includes('Failing row contains'));
  }

  console.log('\n=== i. service_role reads only; erasure still works ===');
  {
    const tables = ['my_season_focuses', 'my_season_coach_observations'];
    const privs = {};
    for (const t of tables) {
      privs[t] = (await mig.query(`select p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('service_role', $1, p)`, [`public.${t}`])).rows.map((r) => r.p).join();
    }
    check('i: service_role holds exactly SELECT on both content tables (MAINTAIN included in the check)', tables.every((t) => privs[t] === 'SELECT'), privs);
    const p = await child();
    const o = await add(A, coach, p, id()); await withdraw(A, coach, o);
    await add(A, coach, p, id());
    await setFocus(A, guardian, p, id(), 'Focus to erase');
    // Called as the existing suites call it (the owner); service_role has no EXECUTE on it.
    const erased = await mig.query(`select public.erase_player_and_related_data($1)`, [p]).then(() => 'ok', (e) => e.message);
    const left = await n(`select (select count(*) from public.my_season_focuses where player_id = $1) + (select count(*) from public.my_season_coach_observations where player_id = $1) + (select count(*) from public.my_season_audit_events where player_id = $1) n`, [p]);
    check('i: with service_role read-only, erase_player_and_related_data still removes the focus, notes and audit rows', erased === 'ok' && left === 0, { erased, left });
  }

  console.log('\n=== j. A write racing child erasure ===');
  {
    const race = async (start) => {
      const p = await child();
      await O.query('begin');
      await O.query('delete from public.players where id = $1', [p]);
      const write = outcome(start(p));
      const waited = await waitsOnLock(mig, B);
      await O.query('commit');
      return { waited, r: await write, p };
    };
    const fixedRefusal = (r) => r.code === 'EMS03' && r.message === 'my_season_not_allowed' && !r.detail && !r.hint;
    const a = await race((p) => add(B, coach, p, id()));
    check('j: add_observation: waits on the deleting transaction, then a fixed EMS03 (no 23503)', a.waited && fixedRefusal(a.r), a);
    const f = await race((p) => setFocus(B, guardian, p, id(), 'Racing focus'));
    check('j: set_focus: waits on the deleting transaction, then a fixed EMS03 (no 23503)', f.waited && fixedRefusal(f.r), f);
    check('j: nothing was left behind', await n(`select (select count(*) from public.my_season_focuses where player_id = any($1)) + (select count(*) from public.my_season_coach_observations where player_id = any($1)) + (select count(*) from public.my_season_audit_events where player_id = any($1)) n`, [[a.p, f.p]]) === 0);
  }
} catch (e) {
  check('concurrency suite', false, e.stack);
} finally {
  for (const c of [...clients, O, mig]) await c?.end().catch(() => {});
  await server.stop().catch(() => {});
  // Windows may still hold the stopped server's files for a moment: retry, and never fail the run over temp clean-up.
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (e) { console.log(`note: temporary data directory not removed (${e.code})`); }
}
const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} My Season concurrency checks passed`);
// Explicit exit: embedded-postgres installs an exit hook, so an exit code set earlier would be lost.
process.exit(failed ? 1 : 0);
