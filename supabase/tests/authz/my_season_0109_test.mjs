// Migration 0109: a parent-coach cannot withdraw a note about their own child.
// Applies on a database with fictional data, proves no row or other catalog
// object changes, the full withdrawal behaviour, the read-only pre/post checks
// (including that they notice regressions), the refusals, and the exact rollback.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase, listMigrations, MIGRATIONS_DIR } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(HERE, '../..', p), 'utf8');
const migration = (n) => fs.readFileSync(path.join(MIGRATIONS_DIR, listMigrations().find((m) => m.version === n).file), 'utf8');
const M0109 = migration('0109');
const RB = read('rollback/0109_rollback.sql'), PRE = read('verification/0109_precheck.sql'), POST = read('verification/0109_postcheck.sql'), POST108 = read('verification/0108_postcheck.sql');
const ACK = ['emblem.acknowledge_0109_rollback', 'reopen parent coach withdrawal'];
const MD5_0108 = '7db826bc158e12811f5e7a35c7ceafde', MD5_0109 = '081f1ea6eb6b7acd27dafda6f9a3063d';
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', FN = 'public.my_season_withdraw_observation(uuid)';

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const catalogDiff = (a, b) => { const d = diffCatalog(a, b); return [...d.added, ...d.removed, ...d.changed]; };

async function readyDatabase({ through = '9999', skip = [] } = {}) {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'readiness-0109@example.test')`, [staff]);
  await db.query(`insert into profiles (id, display_name) values ($1, 'Synthetic readiness')`, [staff]);
  await db.query(`insert into staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, staff]);
  await db.exec('commit;');
  for (const m of listMigrations()) if (m.version >= '0089' && m.version <= through && !skip.includes(m.version)) await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8'));
  return db;
}
const apply = async (db, sql) => { try { await db.exec(sql); return null; } catch (e) { await db.exec('rollback;').catch(() => {}); return e.message; } };
async function rollBack(db, ack) { await db.exec('begin;'); try { if (ack) await db.query(`select set_config($1, $2, true)`, ack); await db.exec(RB); return null; } catch (e) { await db.exec('rollback;').catch(() => {}); return e.message; } }
async function verification(db, sql) { const rows = (await db.exec(sql)).filter((r) => r.rows && r.rows.length); if (rows.length !== 1) throw new Error('expected one row'); return rows[0].rows[0]; }
const falseBooleans = (row) => Object.entries(row).filter(([, v]) => v === false).map(([k]) => k);
const onlyCountsAndBooleans = (row) => Object.values(row).every((v) => typeof v === 'boolean' || /^\d+$/.test(String(v)));
async function dataHash(db) {
  const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename), parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  return parts.join(';');
}
const fnMd5 = async (db) => (await db.query(`select md5(prosrc) m from pg_proc where oid = '${FN}'::regprocedure`)).rows[0].m;

const reference = await readyDatabase(), finalCatalog = await snapshotCatalog(reference);
await reference.close();
const db = await readyDatabase({ skip: ['0109'] });
try {
  const P = {};
  for (const k of ['guardian', 'coach', 'coach2', 'parentCoach', 'staff', 'stranger', 'reviewCoach', 'former']) P[k] = id();
  for (const [k, u] of Object.entries(P)) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u, `m0109-${k}@example.test`]);
    await db.query(`insert into profiles (id, display_name) values ($1, $2)`, [u, `Fictional ${k}`]);
  }
  await db.query(`insert into staff_accounts (profile_id) values ($1)`, [P.staff]);
  const season = id(), club = id(), team = id(), child = id();
  await db.query(`insert into seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await db.query(`insert into clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await db.query(`insert into teams (id, club_id, name, season_id) values ($1, $2, 'U10', $3)`, [team, club, season]);
  await db.query(`insert into players (id, name, team_id) values ($1, 'Fictional Child', $2)`, [child, team]);
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [child, P.guardian]);
  for (const k of ['coach', 'coach2', 'parentCoach', 'reviewCoach', 'former']) await db.query(`insert into coach_team (team_id, profile_id) values ($1, $2)`, [team, P[k]]);
  await db.query(`update season_feature_global set kill_switch = false`);
  await db.query(`insert into season_feature_team_states (team_id, state) values ($1, 'pilot')`, [team]);

  const as = async (uid, sql, params) => {
    await db.exec('begin; set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    try { const r = await db.query(sql, params); await db.exec('commit;'); return { ok: true, rows: r.rows }; } catch (e) { await db.exec('rollback;'); return { ok: false, code: e.code, message: e.message, detail: e.detail ?? null }; }
  };
  const code = (r) => (r.ok ? 'ok' : r.code);
  let serial = 0;
  const add = async (uid) => { const r = await as(uid, `select my_season_add_observation($1, 'kept_going', $2, $3) id`, [child, `Fictional note number ${++serial} about the game.`, id()]); if (!r.ok) throw new Error(`add: ${r.code}`); return r.rows[0].id; };
  const withdraw = (uid, note) => as(uid, `select my_season_withdraw_observation($1)`, [note]);
  const staffRemove = (note) => as(P.staff, `select my_season_staff_remove_observation($1, 'Fictional staff reason') r`, [note]);
  const row = async (note) => (await db.query(`select body, category, withdrawn_at, withdrawn_by, author_id from my_season_coach_observations where id = $1`, [note])).rows[0];
  const audits = async (note, event) => Number((await db.query(`select count(*) n from my_season_audit_events where subject_id = $1 and event = $2`, [note, event])).rows[0].n);

  await as(P.guardian, `select my_season_set_focus($1, 'Fictional focus', 'Why it matters', 'What it looks like', current_date, $2)`, [child, id()]);
  const N = {};
  for (const k of ['control', 'refuse', 'staff', 'already', 'staffEarlier', 'afterUnlink', 'flag']) N[k] = await add(P.parentCoach);
  N.coach = await add(P.coach); N.coach2 = await add(P.coach2); N.former = await add(P.former); N.review = await add(P.reviewCoach);
  check('setup: an author can withdraw before becoming a guardian', code(await withdraw(P.parentCoach, N.already)) === 'ok');
  check('setup: staff can remove a parent-coach\'s earlier note', (await staffRemove(N.staffEarlier)).rows?.[0]?.r?.status === 'removed');
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2), ($1, $3)`, [child, P.parentCoach, P.former]);
  await db.query(`update coach_team set ended_at = now(), ended_by = $2, end_reason = 'Left the club' where team_id = $1 and profile_id = $3`, [team, P.staff, P.former]);

  console.log('\n=== before 0109 ===');
  const pre = await verification(db, PRE);
  check('pre-check: every boolean true', falseBooleans(pre).length === 0, falseBooleans(pre));
  check('pre-check: counts and booleans only, and it counts the affected notes', onlyCountsAndBooleans(pre) && Number(pre.active_notes_by_a_guardian_author) === 6 && Number(pre.withdrawn_rows_with_content) === 0 && Number(pre.active_rows_without_content) === 0, pre);
  const writeInPre = await apply(db, PRE.replace('with w as', `insert into public.clubs (name) values ('x');\nwith w as`));
  check('pre-check runs in a read-only transaction', writeInPre !== null && /read-only/.test(writeInPre), writeInPre);
  check('control: 0108 lets the author who is now a guardian withdraw (the gap)', code(await withdraw(P.parentCoach, N.control)) === 'ok' && (await row(N.control)).body === null);

  const preCatalog = await snapshotCatalog(db), preData = await dataHash(db), preAgain = await verification(db, PRE);
  const tampered = (await db.query(`select pg_get_functiondef('${FN}'::regprocedure) d`)).rows[0].d;
  await db.exec(tampered.replace(`v_uid uuid := auth.uid();`, `v_uid uuid := auth.uid(); -- tampered`));
  const refusedTampered = await apply(db, M0109);
  check('0109 refuses a function that is not the exact 0108 one', refusedTampered?.includes('not the exact 0108') , refusedTampered);
  await db.exec(tampered);
  check('…and the catalog is exact again', catalogDiff(preCatalog, await snapshotCatalog(db)).length === 0);

  console.log('\n=== apply ===');
  check('0109 applies', (await apply(db, M0109)) === null);
  const postCatalog = await snapshotCatalog(db), changed = catalogDiff(preCatalog, postCatalog);
  check('0109 changes exactly one catalog object: the withdrawal function', changed.length === 1 && JSON.stringify(changed).includes('my_season_withdraw_observation'), changed);
  check('no row in any public table changes when 0109 applies, including notes and focuses', (await dataHash(db)) === preData);
  check('the catalog equals a filename-order build', catalogDiff(finalCatalog, postCatalog).length === 0, catalogDiff(finalCatalog, postCatalog));
  check('the function is the exact expected 0109 body', (await fnMd5(db)) === MD5_0109, await fnMd5(db));
  const again = await apply(db, M0109);
  check('0109 re-run refuses, changing nothing', again?.includes('already applied') && catalogDiff(postCatalog, await snapshotCatalog(db)).length === 0, again);
  const post = await verification(db, POST);
  check('post-check: every boolean true', falseBooleans(post).length === 0, falseBooleans(post));
  const sameCounts = Object.keys(preAgain).filter((k) => /_rows|_author/.test(k)).every((k) => String(preAgain[k]) === String(post[k]));
  check('post-check counts equal the pre-check counts', sameCounts && onlyCountsAndBooleans(post), { preAgain, post });
  const post108 = await verification(db, POST108), bad108 = falseBooleans(post108).filter((k) => k !== 'kill_switch_on');
  check('the 0108 post-check still passes with 0109 applied', bad108.length === 0, bad108);
  check('the 0109 pre-check now refuses (the function is no longer 0108)', (await verification(db, PRE)).withdraw_is_exact_0108 === false);

  console.log('\n=== behaviour ===');
  const before = await row(N.refuse), r1 = await withdraw(P.parentCoach, N.refuse);
  check('direct RPC: an author who is the child\'s guardian is refused with EMS07', r1.code === 'EMS07' && r1.message === 'my_season_own_child' && !r1.detail, r1);
  check('…the note keeps its text and category, with no audit event', JSON.stringify(await row(N.refuse)) === JSON.stringify(before) && before.body !== null && await audits(N.refuse, 'observation_withdrawn') === 0);
  check('Add note still gives the same EMS07 for that person', (await as(P.parentCoach, `select my_season_add_observation($1, 'kept_going', 'Another fictional note about the game.', $2)`, [child, id()])).code === 'EMS07');
  check('Change focus still works for that person', code(await as(P.parentCoach, `select my_season_set_focus($1, 'Another fictional focus', 'Why it matters', 'What it looks like', current_date, $2)`, [child, id()])) === 'ok');
  check('ordinary author withdrawal still works and erases the note', code(await withdraw(P.coach, N.coach)) === 'ok' && (await row(N.coach)).body === null && (await row(N.coach)).category === null && (await row(N.coach)).withdrawn_by === P.coach);
  check('it writes one audit event, and a repeat is a silent no-op', code(await withdraw(P.coach, N.coach)) === 'ok' && await audits(N.coach, 'observation_withdrawn') === 1);
  check('a note withdrawn before the guardian link stays a silent no-op on retry', code(await withdraw(P.parentCoach, N.already)) === 'ok' && await audits(N.already, 'observation_withdrawn') === 1);
  check('a note staff already removed is still EMS03 for its author', (await withdraw(P.parentCoach, N.staffEarlier)).code === 'EMS03');
  const others = { otherCoach: code(await withdraw(P.coach2, N.refuse)), guardian: code(await withdraw(P.guardian, N.refuse)), stranger: code(await withdraw(P.stranger, N.refuse)), staffAsCoach: code(await withdraw(P.staff, N.refuse)), parentCoachOnOther: code(await withdraw(P.parentCoach, N.coach2)), unknown: code(await withdraw(P.parentCoach, id())) };
  check('another coach, a guardian, a stranger, staff and unknown ids all get the same EMS03', Object.values(others).every((c) => c === 'EMS03'), others);
  check('a former coach who is a guardian keeps the 0108 EMS03', (await withdraw(P.former, N.former)).code === 'EMS03');
  await db.query(`insert into pending_profile_deletions (auth_user_id, blocking_reason) values ($1, 'coach_authored_player_records')`, [P.reviewCoach]);
  check('an account under review still gets EMS04, for any id', (await withdraw(P.reviewCoach, N.review)).code === 'EMS04' && (await withdraw(P.reviewCoach, id())).code === 'EMS04');
  await db.query(`update season_feature_team_states set state = 'off' where team_id = $1`, [team]);
  check('feature off still gives EMS02', (await withdraw(P.parentCoach, N.flag)).code === 'EMS02' && (await row(N.flag)).body !== null);
  await db.query(`update season_feature_team_states set state = 'pilot' where team_id = $1`, [team]);
  const removed = await staffRemove(N.staff);
  check('staff can still remove the parent-coach\'s note', removed.rows?.[0]?.r?.status === 'removed' && (await row(N.staff)).body === null && await audits(N.staff, 'observation_staff_removed') === 1, removed);
  await db.query(`delete from guardians where player_id = $1 and profile_id = $2`, [child, P.parentCoach]);
  check('once no longer a guardian, the author can withdraw again', code(await withdraw(P.parentCoach, N.afterUnlink)) === 'ok');
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [child, P.parentCoach]);
  const anonCall = await (async () => { await db.exec('begin; set local role anon;'); try { await db.query(`select my_season_withdraw_observation($1)`, [N.refuse]); await db.exec('commit;'); return 'ok'; } catch (e) { await db.exec('rollback;'); return e.code; } })();
  check('anon still cannot execute it', anonCall === '42501', anonCall);

  console.log('\n=== the post-check notices regressions ===');
  const liveDef = (await db.query(`select pg_get_functiondef('${FN}'::regprocedure) d`)).rows[0].d;
  const swap = (a, b) => { const out = liveDef.replace(a, b); if (out === liveDef) throw new Error(`no change: ${a}`); return out; };
  const regressions = [
    [swap('perform 1 from public.profiles pr where pr.id = v_uid for update;', 'perform 1 from public.profiles pr where pr.id = v_uid;'), liveDef, 'withdraw_has_lock_and_guardian_check'],
    [swap('if public.my_season_is_guardian(v_player, v_uid)', 'if false'), liveDef, 'withdraw_has_lock_and_guardian_check'],
    [`alter function ${FN} security invoker`, `alter function ${FN} security definer`, 'withdraw_shape_ok'],
    [`alter function ${FN} reset search_path`, `alter function ${FN} set search_path = public, pg_temp`, 'withdraw_shape_ok'],
    [`grant execute on function ${FN} to anon`, `revoke execute on function ${FN} from anon`, 'withdraw_grants_ok'],
    [`grant execute on function ${FN} to service_role`, `revoke execute on function ${FN} from service_role`, 'withdraw_grants_ok'],
    [`alter table public.guardians disable trigger all`, `alter table public.guardians enable trigger all`, 'guardian_profile_fk_ok'],
  ];
  const caught = [];
  for (const [bad, good, column] of regressions) { await db.exec(bad); const r = await verification(db, POST); await db.exec(good); caught.push(r[column] === false ? 'caught' : `missed ${column}: ${bad.slice(0, 50)}`); }
  check('post-check flags a missing lock, a missing guardian check, shape, grant and foreign-key regressions', caught.every((c) => c === 'caught'), caught);
  check('…and is clean again afterwards', falseBooleans(await verification(db, POST)).length === 0 && catalogDiff(postCatalog, await snapshotCatalog(db)).length === 0);

  console.log('\n=== rollback ===');
  const dataBeforeRollback = await dataHash(db);
  const noAck = await rollBack(db, null);
  check('rollback refuses without the acknowledgement, changing nothing', noAck?.includes('0109 rollback refused') && catalogDiff(postCatalog, await snapshotCatalog(db)).length === 0, noAck);
  const wrongAck = await rollBack(db, [ACK[0], 'yes']);
  check('rollback refuses a wrong acknowledgement', wrongAck?.includes('0109 rollback refused'), wrongAck);
  const rb = await rollBack(db, ACK);
  check('rollback restores the exact 0108 catalog and function', rb === null && catalogDiff(preCatalog, await snapshotCatalog(db)).length === 0 && (await fnMd5(db)) === MD5_0108, rb ?? catalogDiff(preCatalog, await snapshotCatalog(db)));
  check('rollback changes no row', (await dataHash(db)) === dataBeforeRollback);
  check('the acknowledgement does not persist', (await db.query(`select coalesce(current_setting('emblem.acknowledge_0109_rollback', true), '') a`)).rows[0].a === '');
  check('the 0109 post-check fails after rollback', (await verification(db, POST)).withdraw_is_exact_0109 === false);
  const twice = await rollBack(db, ACK);
  check('a second rollback refuses', twice?.includes('exact 0109 function is not installed'), twice);
  check('0109 re-applies to the exact final function', (await apply(db, M0109)) === null && catalogDiff(postCatalog, await snapshotCatalog(db)).length === 0);
  check('the guard works again after re-apply', (await withdraw(P.parentCoach, N.refuse)).code === 'EMS07');
} catch (e) {
  check('0109 suite', false, e.stack);
}
await db.close();

{
  const early = await readyDatabase({ through: '0107' });
  const r = await apply(early, M0109);
  check('0109 refuses before 0108, naming it', r?.includes('0109 refused') && r.includes('0108'), r);
  await early.close();
}

const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} 0109 checks passed`);
process.exit(failed ? 1 : 0);
