// My Season Phase 1 (0099 + 0108) on the final schema: who can read and
// write, the feature flag, focus history and idempotency, input rules,
// withdrawal, no public path, append-only audit, immutability (service_role
// and owner included) and every deletion path (child erasure, guardian and
// coach account deletion through the app's real route functions).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

async function finalDatabase() {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [staff]);
  await db.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [staff]);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, staff]);
  await db.exec('commit;');
  await applyMigrations(db, { from: '0089', through: '9999' });
  return db;
}

// One fictional club. child1 and child2 are on team T; child3 on team T2.
//   g1, g2: guardians of child1 (g2 is the second guardian)
//   coach: active coach_team on T          ended: ended coach_team on T
//   expired: expired coach_team on T       direct: coach_players link to child1 only
//   parentCoach: guardian of child2 AND active coach on T
//   stranger: unrelated account            staff: staff_accounts only
//   review: guardian of child1 with a pending deletion review
//   reviewCoach: active coach on T with a pending deletion review
//   g3: sole guardian of child3; coach2: active coach on T2
async function world({ enable = true } = {}) {
  const db = await finalDatabase();
  const P = {};
  for (const k of ['g1', 'g2', 'g3', 'coach', 'coach2', 'ended', 'expired', 'direct', 'parentCoach', 'stranger', 'staff', 'review', 'reviewCoach']) P[k] = id();
  await db.query(`insert into auth.users (id, email) select u, 'ms-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [Object.values(P)]);
  for (const [k, uid] of Object.entries(P)) await db.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [uid, `Name ${k}`]);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [P.staff]);
  const season = id(), club = id(), T = id(), T2 = id(), child1 = id(), child2 = id(), child3 = id();
  await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await db.query(`insert into public.clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await db.query(`insert into public.teams (id, club_id, name, season_id) values ($1, $3, 'U10', $4), ($2, $3, 'U11', $4)`, [T, T2, club, season]);
  await db.query(`insert into public.players (id, name, team_id) values ($1, 'Child One', $4), ($2, 'Child Two', $4), ($3, 'Child Three', $5)`, [child1, child2, child3, T, T2]);
  await db.query(`insert into public.guardians (player_id, profile_id) values ($1, $2), ($1, $3), ($1, $4), ($5, $6), ($7, $8)`,
    [child1, P.g1, P.g2, P.review, child2, P.parentCoach, child3, P.g3]);
  await db.query(`insert into public.coach_team (team_id, profile_id) values ($1, $2), ($1, $3), ($1, $4), ($5, $6)`, [T, P.coach, P.parentCoach, P.reviewCoach, T2, P.coach2]);
  await db.query(`insert into public.coach_team (team_id, profile_id, ended_at, ended_by, end_reason) values ($1, $2, now(), $3, 'Left the club')`, [T, P.ended, P.staff]);
  await db.query(`insert into public.coach_team (team_id, profile_id, created_at, expires_at) values ($1, $2, now() - interval '2 days', now() - interval '1 day')`, [T, P.expired]);
  await db.query(`insert into public.coach_players (player_id, profile_id, created_via, created_by) values ($1, $2, 'guardian_invite', $3)`, [child1, P.direct, P.g1]);
  await db.query(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason) values ($1, 'coach_authored_player_records'), ($2, 'coach_authored_player_records')`, [P.review, P.reviewCoach]);
  if (enable) {
    await db.query(`update public.season_feature_global set kill_switch = false`);
    await db.query(`insert into public.season_feature_team_states (team_id, state) values ($1, 'pilot'), ($2, 'on')`, [T, T2]);
  }

  async function as(role, uid, sql, params) {
    await db.exec('begin;');
    try {
      await db.exec(`set local role ${role};`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid ?? '']);
      const r = await db.query(sql, params);
      await db.exec('commit;');
      return { ok: true, rows: r.rows };
    } catch (e) {
      await db.exec('rollback;');
      return { ok: false, code: e.code, message: e.message };
    }
  }
  const user = (uid, sql, params) => as('authenticated', uid, sql, params);
  const view = async (uid, player) => { const r = await user(uid, `select public.my_season_for_player($1) v`, [player]); return r.ok ? r.rows[0].v : r; };
  const setFocus = (uid, player, o = {}) => user(uid, `select public.my_season_set_focus($1, $2, $3, $4, $5::date, $6) id`,
    [player, ('title' in o ? o.title : 'Be brave on the ball'), ('why' in o ? o.why : 'It helps the team play forward'), ('looks' in o ? o.looks : 'Asking for the ball under pressure'), ('startedOn' in o ? o.startedOn : new Date().toISOString().slice(0, 10)), o.requestId ?? id()]);
  const addObs = (uid, player, o = {}) => user(uid, `select public.my_season_add_observation($1, $2, $3, $4) id`,
    [player, ('category' in o ? o.category : 'kept_going'), ('body' in o ? o.body : 'Kept going after the second goal went in.'), o.requestId ?? id()]);
  const withdraw = (uid, obs) => user(uid, `select public.my_season_withdraw_observation($1)`, [obs]);
  const n = async (sql, params) => Number((await db.query(sql, params)).rows[0].n);
  return { db, P, T, T2, child1, child2, child3, as, user, view, setFocus, addObs, withdraw, n };
}
const code = (r) => (r.ok ? 'ok' : r.code);
const deleteAccount = async (w, uid) => {
  const r = await w.user(uid, `select public.delete_own_guardian_account() as result`);
  if (!r.ok) return r;
  const result = r.rows[0].result;
  if (result.canDeleteIdentity) await w.db.query(`delete from auth.users where id = $1`, [uid]);
  return { ok: true, result };
};

// ---------------------------------------------------------------------------
console.log('\n=== 1. Authorization matrix ===');
{
  const w = await world();
  const { P, child1, child2 } = w;
  try {
    const f = await w.setFocus(P.g1, child1);
    const o = await w.addObs(P.coach, child1);
    check('1: guardian sets the focus; active team coach adds a note', f.ok && o.ok, [f, o]);
    const focusId = f.rows?.[0].id, obsId = o.rows?.[0].id;

    const g = await w.view(P.g1, child1);
    check('1: guardian reads: access guardian, canEditFocus, no canAddNote, sees focus and note',
      g.enabled === true && g.access === 'guardian' && g.canEditFocus === true && g.canAddNote === false && g.activeFocus?.id === focusId
        && g.observations.length === 1 && g.observations[0].id === obsId && g.observations[0].coachName === 'Name coach'
        && g.observations[0].formerCoach === false && g.observations[0].mine === false && g.observations[0].withdrawn === false
        && g.activeFocus.authorName === 'Name g1' && g.activeFocus.authorRole === 'guardian' && Array.isArray(g.earlierFocuses), g);
    const shapeKeys = Object.keys(g.activeFocus).sort().join(',');
    check('1: focus JSON has exactly the contract keys', shapeKeys === 'authorName,authorRole,endedAt,id,startedOn,title,whatItLooksLike,whyItMatters', shapeKeys);
    const obsKeys = Object.keys(g.observations[0]).sort().join(',');
    check('1: observation JSON has exactly the contract keys', obsKeys === 'body,category,coachName,createdAt,formerCoach,id,mine,withdrawn', obsKeys);
    const c = await w.view(P.coach, child1);
    check('1: active team coach reads: access coach, canAddNote, own note mine', c.access === 'coach' && c.canEditFocus && c.canAddNote && c.observations[0].mine === true, c);

    const none = (v, reason) => v.enabled === true && v.access === 'none' && v.reason === reason && !('activeFocus' in v) && !('observations' in v);
    check('1: coach with an ENDED assignment: access none, former_coach, no content', none(await w.view(P.ended, child1), 'former_coach'), await w.view(P.ended, child1));
    check('1: coach with an EXPIRED assignment: access none, former_coach', none(await w.view(P.expired, child1), 'former_coach'), await w.view(P.expired, child1));
    check('1: direct/private coach only: access none, private_coach', none(await w.view(P.direct, child1), 'private_coach'), await w.view(P.direct, child1));
    check('1: guardian under deletion review: access none, account_review', none(await w.view(P.review, child1), 'account_review'), await w.view(P.review, child1));
    check('1: team coach under deletion review: access none, account_review', none(await w.view(P.reviewCoach, child1), 'account_review'), await w.view(P.reviewCoach, child1));
    const disabled = (v) => JSON.stringify(v) === '{"enabled":false}';
    check('1: unrelated account: {"enabled": false}', disabled(await w.view(P.stranger, child1)), await w.view(P.stranger, child1));
    check('1: staff with no relationship: {"enabled": false}', disabled(await w.view(P.staff, child1)), await w.view(P.staff, child1));
    check('1: coach of another team: {"enabled": false}', disabled(await w.view(P.coach2, child1)));
    check('1: unknown player id: {"enabled": false}', disabled(await w.view(P.g1, id())));
    const pcOwn = await w.view(P.parentCoach, child2);
    check('1: parent who coaches their own child\'s team: access guardian, canEditFocus, canAddNote false', pcOwn.access === 'guardian' && pcOwn.canEditFocus && pcOwn.canAddNote === false, pcOwn);
    const pcOther = await w.view(P.parentCoach, child1);
    check('1: the same parent-coach on a teammate: access coach, canAddNote', pcOther.access === 'coach' && pcOther.canAddNote === true, pcOther);
    const signedOut = await w.user(null, `select public.my_season_for_player($1)`, [child1]);
    check('1: authenticated without a uid: EMS01', code(signedOut) === 'EMS01', signedOut);

    // Direct RLS reads.
    const rls = async (uid) => {
      const a = await w.user(uid, `select (select count(*) from public.my_season_focuses)::int f, (select count(*) from public.my_season_coach_observations)::int o`);
      return a.ok ? `${a.rows[0].f}/${a.rows[0].o}` : a.code;
    };
    check('1: RLS: guardian and active coach see 1 focus / 1 note', (await rls(P.g1)) === '1/1' && (await rls(P.coach)) === '1/1' && (await rls(P.parentCoach)) === '1/1');
    const rlsNone = { ended: await rls(P.ended), expired: await rls(P.expired), direct: await rls(P.direct), stranger: await rls(P.stranger), staff: await rls(P.staff), review: await rls(P.review), reviewCoach: await rls(P.reviewCoach), coach2: await rls(P.coach2) };
    check('1: RLS: ended, expired, direct, unrelated, staff, under-review and other-team accounts see nothing', Object.values(rlsNone).every((x) => x === '0/0'), rlsNone);
    const audit = await w.user(P.g1, `select count(*) from public.my_season_audit_events`);
    check('1: authenticated cannot read the audit table', code(audit) === '42501', audit);
    const flagRead = await w.user(P.g1, `select count(*) from public.season_feature_global`);
    const flagRead2 = await w.user(P.g1, `select count(*) from public.season_feature_team_states`);
    const flagFn = await w.user(P.g1, `select public.season_feature_enabled_for_team($1)`, [w.T]);
    check('1: authenticated cannot read the flag tables or call season_feature_enabled_for_team', [flagRead, flagRead2, flagFn].every((r) => code(r) === '42501'), [flagRead, flagRead2, flagFn]);
    const helper = await w.user(P.g1, `select public.my_season_is_team_coach($1, $2)`, [child1, P.coach]);
    check('1: owner-only helpers are not callable by authenticated', code(helper) === '42501', helper);
    const writeDirect = await w.user(P.g1, `insert into public.my_season_focuses (player_id, title, why_it_matters, what_it_looks_like, started_on, created_by, author_role, request_id) values ($1, 'Title', 'Why it', 'Looks it', current_date, $2, 'guardian', $3)`, [child1, P.g1, id()]);
    const updDirect = await w.user(P.coach, `update public.my_season_coach_observations set body = body`);
    check('1: authenticated cannot insert or update the tables directly', code(writeDirect) === '42501' && code(updDirect) === '42501', [writeDirect, updDirect]);

    // Writes: set focus.
    const setCodes = {};
    for (const k of ['g2', 'coach', 'parentCoach', 'ended', 'expired', 'direct', 'stranger', 'staff', 'review', 'reviewCoach', 'coach2']) setCodes[k] = code(await w.setFocus(P[k], child1));
    check('1: set focus: guardian and active team coaches ok; ended/expired/direct/unrelated/staff/other-team EMS03; under review EMS04',
      JSON.stringify(setCodes) === JSON.stringify({ g2: 'ok', coach: 'ok', parentCoach: 'ok', ended: 'EMS03', expired: 'EMS03', direct: 'EMS03', stranger: 'EMS03', staff: 'EMS03', review: 'EMS04', reviewCoach: 'EMS04', coach2: 'EMS03' }), setCodes);
    check('1: parent-coach sets the focus for their own child (as guardian)', code(await w.setFocus(P.parentCoach, child2)) === 'ok'
      && (await w.view(P.parentCoach, child2)).activeFocus?.authorRole === 'guardian');
    const coachFocus = await w.view(P.g1, child1);
    check('1: a focus set by a coach is authorRole coach', coachFocus.activeFocus.authorRole === 'coach' && coachFocus.activeFocus.authorName === 'Name parentCoach', coachFocus.activeFocus);

    // Writes: add observation.
    const obsCodes = {};
    for (const k of ['g1', 'parentCoach', 'ended', 'expired', 'direct', 'stranger', 'staff', 'review', 'reviewCoach', 'coach2']) obsCodes[k] = code(await w.addObs(P[k], child1));
    obsCodes.parentCoachOwnChild = code(await w.addObs(P.parentCoach, child2));
    check('1: add note: only active team coaches; guardian EMS03; parent-coach on own child EMS07; under review EMS04',
      JSON.stringify(obsCodes) === JSON.stringify({ g1: 'EMS03', parentCoach: 'ok', ended: 'EMS03', expired: 'EMS03', direct: 'EMS03', stranger: 'EMS03', staff: 'EMS03', review: 'EMS04', reviewCoach: 'EMS04', coach2: 'EMS03', parentCoachOwnChild: 'EMS07' }), obsCodes);

    // Withdraw.
    const wCodes = { g1: code(await w.withdraw(P.g1, obsId)), parentCoach: code(await w.withdraw(P.parentCoach, obsId)), stranger: code(await w.withdraw(P.stranger, obsId)),
      unknown: code(await w.withdraw(P.coach, id())), reviewCoach: code(await w.withdraw(P.reviewCoach, obsId)) };
    check('1: withdraw by anyone but the author refused (EMS03), unknown id EMS08, under review EMS04',
      JSON.stringify(wCodes) === JSON.stringify({ g1: 'EMS03', parentCoach: 'EMS03', stranger: 'EMS03', unknown: 'EMS08', reviewCoach: 'EMS04' }), wCodes);

    // anon: no grants at all.
    const anonExec = (await w.db.query(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) x from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and (p.proname like 'my_season%' or p.proname like 'season_feature%')`)).rows[0].x;
    const anonTable = (await w.db.query(`select bool_or(has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')) x from pg_class c
       where c.relnamespace = 'public'::regnamespace and (c.relname like 'my_season%' or c.relname like 'season_feature%') and c.relkind = 'r'`)).rows[0].x;
    const anonCall = await w.as('anon', null, `select public.my_season_for_player($1)`, [child1]);
    const anonSel = await w.as('anon', null, `select count(*) from public.my_season_focuses`);
    check('1: anon holds no privilege on any My Season / flag table or function; calls and selects are refused',
      anonExec === false && anonTable === false && code(anonCall) === '42501' && code(anonSel) === '42501', { anonExec, anonTable, anonCall, anonSel });
    const srCall = await w.as('service_role', null, `select public.my_season_for_player($1)`, [child1]);
    check('1: service_role cannot call the user RPCs (they act as auth.uid())', code(srCall) === '42501', srCall);
  } catch (e) {
    check('1: authorization matrix', false, e.stack);
  }
  await w.db.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== 2. Feature flag ===');
{
  const w = await world({ enable: false });
  const { P, child1, db } = w;
  try {
    const def = (await db.query(`select kill_switch from public.season_feature_global`)).rows;
    check('2: default: one global row, kill_switch = true; no team rows', def.length === 1 && def[0].kill_switch === true && await w.n(`select count(*) n from public.season_feature_team_states`) === 0);
    check('2: global kill on: guardian reads {"enabled": false}, writes EMS02',
      JSON.stringify(await w.view(P.g1, child1)) === '{"enabled":false}' && code(await w.setFocus(P.g1, child1)) === 'EMS02' && code(await w.addObs(P.coach, child1)) === 'EMS02');
    await db.query(`insert into public.season_feature_team_states (team_id, state) values ($1, 'pilot')`, [w.T]);
    check('2: team pilot but global kill on: still off', (await w.view(P.g1, child1)).enabled === false && code(await w.setFocus(P.g1, child1)) === 'EMS02');
    await db.query(`update public.season_feature_global set kill_switch = false`);
    await db.query(`update public.season_feature_team_states set state = 'off'`);
    check('2: kill off, team off: off', (await w.view(P.g1, child1)).enabled === false && code(await w.setFocus(P.g1, child1)) === 'EMS02');
    await db.query(`delete from public.season_feature_team_states`);
    check('2: kill off, no team row: off', (await w.view(P.g1, child1)).enabled === false);
    await db.query(`insert into public.season_feature_team_states (team_id, state) values ($1, 'demo')`, [w.T]);
    check('2: team demo: off for real data', (await w.view(P.g1, child1)).enabled === false && code(await w.addObs(P.coach, child1)) === 'EMS02');
    await db.query(`update public.season_feature_team_states set state = 'pilot'`);
    const f = await w.setFocus(P.g1, child1), o = await w.addObs(P.coach, child1);
    check('2: team pilot: works', f.ok && o.ok && (await w.view(P.g1, child1)).enabled === true, [f, o]);
    await db.query(`update public.season_feature_team_states set state = 'on'`);
    check('2: team on: works', (await w.view(P.g1, child1)).activeFocus?.id === f.rows[0].id && code(await w.setFocus(P.g1, child1)) === 'ok');
    await db.query(`update public.season_feature_team_states set state = 'off'`);
    const rls = await w.user(P.g1, `select (select count(*) from public.my_season_focuses)::int + (select count(*) from public.my_season_coach_observations)::int n`);
    check('2: switched back off: read hidden, RLS hides rows, withdraw EMS02, rows still stored',
      (await w.view(P.coach, child1)).enabled === false && rls.rows[0].n === 0 && code(await w.withdraw(P.coach, o.rows[0].id)) === 'EMS02'
        && await w.n(`select (select count(*) from public.my_season_focuses) + (select count(*) from public.my_season_coach_observations) n`) === 3);
    await db.query(`update public.season_feature_team_states set state = 'on'`);
    await db.query(`update public.season_feature_global set kill_switch = true`);
    check('2: global kill switched back on hides everything again', (await w.view(P.g1, child1)).enabled === false);
    await db.query(`update public.season_feature_global set kill_switch = false`);
    const pnull = id();
    await db.query(`insert into public.players (id, name) values ($1, 'No Team')`, [pnull]);
    await db.query(`insert into public.guardians (player_id, profile_id) values ($1, $2)`, [pnull, P.g1]);
    check('2: a player without a team is always off', (await w.view(P.g1, pnull)).enabled === false && code(await w.setFocus(P.g1, pnull)) === 'EMS02');
    const sr = await w.as('service_role', null, `select public.season_feature_enabled_for_team($1) x`, [w.T]);
    check('2: service_role may call season_feature_enabled_for_team and update the flag', sr.ok && sr.rows[0].x === true
      && (await w.as('service_role', null, `update public.season_feature_team_states set state = 'pilot' where team_id = $1`, [w.T])).ok);
    const srDel = await w.as('service_role', null, `delete from public.season_feature_team_states`);
    check('2: service_role has no delete on flag tables', code(srDel) === '42501', srDel);
    const bad = await w.as('service_role', null, `update public.season_feature_team_states set state = 'everyone'`);
    const second = await w.as('service_role', null, `insert into public.season_feature_global (id, kill_switch) values (false, false)`);
    check('2: state must be off/demo/pilot/on; global is a singleton', code(bad) === '23514' && code(second) === '23514', [bad, second]);
  } catch (e) {
    check('2: flag', false, e.stack);
  }
  await db.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== 3. Focus history, idempotency and validation ===');
{
  const w = await world();
  const { P, child1, child2, db } = w;
  try {
    const ids = [];
    for (let i = 0; i < 13; i++) {
      const r = await w.setFocus(i % 2 ? P.coach : P.g1, child1, { title: `Focus number ${i}` });
      ids.push(r.rows?.[0].id);
    }
    check('3: one active focus per player', await w.n(`select count(*) n from public.my_season_focuses where player_id = $1 and ended_at is null`, [child1]) === 1);
    const v = await w.view(P.g1, child1);
    check('3: earlier focuses newest first, max 10', v.activeFocus.id === ids[12] && v.earlierFocuses.length === 10
      && v.earlierFocuses.map((f) => f.id).join() === ids.slice(2, 12).reverse().join() && v.earlierFocuses.every((f) => f.endedAt), v.earlierFocuses.map((f) => f.title));
    check('3: ended focuses record who ended them', await w.n(`select count(*) n from public.my_season_focuses where player_id = $1 and ended_at is not null and ended_by is not null`, [child1]) === 12);
    check('3: audit: 13 focus_set and 12 focus_ended', await w.n(`select count(*) n from public.my_season_audit_events where event = 'focus_set' and player_id = $1`, [child1]) === 13
      && await w.n(`select count(*) n from public.my_season_audit_events where event = 'focus_ended' and player_id = $1`, [child1]) === 12);
    const dup = await w.db.query(`insert into public.my_season_focuses (player_id, title, why_it_matters, what_it_looks_like, started_on, created_by, author_role, request_id)
      values ($1, 'Second active', 'Why it is', 'Looks like', current_date, $2, 'guardian', $3)`, [child1, P.g1, id()]).then(() => 'ok', (e) => e.code);
    check('3: a second active focus is refused by the unique index (even as owner)', dup === '23505', dup);

    // Idempotency.
    const req = id();
    const a = await w.setFocus(P.g1, child1, { requestId: req, title: 'Retry me' });
    const before = await w.n(`select count(*) n from public.my_season_focuses`);
    const b = await w.setFocus(P.g1, child1, { requestId: req, title: 'Retry me' });
    check('3: set focus: same request_id, same caller returns the same id and writes nothing', a.ok && b.ok && a.rows[0].id === b.rows[0].id
      && await w.n(`select count(*) n from public.my_season_focuses`) === before && (await w.view(P.g1, child1)).activeFocus.id === a.rows[0].id);
    check('3: set focus: same request_id from another caller EMS06; for another player EMS06',
      code(await w.setFocus(P.g2, child1, { requestId: req })) === 'EMS06' && code(await w.setFocus(P.coach, child2, { requestId: req })) === 'EMS06');
    const oreq = id();
    const o1 = await w.addObs(P.coach, child1, { requestId: oreq }), o2 = await w.addObs(P.coach, child1, { requestId: oreq });
    check('3: add note: same request_id, same caller returns the same id', o1.ok && o2.ok && o1.rows[0].id === o2.rows[0].id
      && await w.n(`select count(*) n from public.my_season_coach_observations`) === 1);
    check('3: add note: same request_id from another coach EMS06; for another player EMS06',
      code(await w.addObs(P.parentCoach, child1, { requestId: oreq })) === 'EMS06' && code(await w.addObs(P.coach, child2, { requestId: oreq })) === 'EMS06');

    // Validation.
    const today = new Date();
    const day = (d) => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);
    const fv = {
      title2: code(await w.setFocus(P.g1, child1, { title: 'ab' })),
      title61: code(await w.setFocus(P.g1, child1, { title: 'x'.repeat(61) })),
      title60: code(await w.setFocus(P.g1, child1, { title: 'x'.repeat(60) })),
      titleNull: code(await w.setFocus(P.g1, child1, { title: null })),
      titleSpaces: code(await w.setFocus(P.g1, child1, { title: '   ab   ' })),
      why161: code(await w.setFocus(P.g1, child1, { why: 'y'.repeat(161) })),
      why2: code(await w.setFocus(P.g1, child1, { why: 'ab' })),
      looks161: code(await w.setFocus(P.g1, child1, { looks: 'z'.repeat(161) })),
      looks2: code(await w.setFocus(P.g1, child1, { looks: ' a ' })),
      plus2: code(await w.setFocus(P.g1, child1, { startedOn: day(2) })),
      plus1: code(await w.setFocus(P.g1, child1, { startedOn: day(1) })),
      y1999: code(await w.setFocus(P.g1, child1, { startedOn: '1999-12-31' })),
      y2000: code(await w.setFocus(P.g1, child1, { startedOn: '2000-01-01' })),
      dateNull: code(await w.setFocus(P.g1, child1, { startedOn: null })),
      reqNull: code(await w.user(P.g1, `select public.my_season_set_focus($1, 'Title ok', 'Why ok', 'Looks ok', current_date, null)`, [child1])),
    };
    check('3: focus validation (title 3-60, why/looks 3-160, start date 2000-01-01..tomorrow, request id required)',
      JSON.stringify(fv) === JSON.stringify({ title2: 'EMS05', title61: 'EMS05', title60: 'ok', titleNull: 'EMS05', titleSpaces: 'EMS05', why161: 'EMS05', why2: 'EMS05', looks161: 'EMS05', looks2: 'EMS05', plus2: 'EMS05', plus1: 'ok', y1999: 'EMS05', y2000: 'ok', dateNull: 'EMS05', reqNull: 'EMS05' }), fv);
    const trimmed = await w.setFocus(P.g1, child1, { title: '  Trim me \n', why: '\tWhy it matters ', looks: ' Looks like this ' });
    const row = (await db.query(`select title, why_it_matters, what_it_looks_like from public.my_season_focuses where id = $1`, [trimmed.rows[0].id])).rows[0];
    check('3: focus text is stored trimmed', row.title === 'Trim me' && row.why_it_matters === 'Why it matters' && row.what_it_looks_like === 'Looks like this', row);

    const ov = {
      b19: code(await w.addObs(P.coach, child1, { body: 'x'.repeat(19) })),
      b20: code(await w.addObs(P.coach, child1, { body: 'x'.repeat(20) })),
      b160: code(await w.addObs(P.coach, child1, { body: 'x'.repeat(160) })),
      b161: code(await w.addObs(P.coach, child1, { body: 'x'.repeat(161) })),
      padded19: code(await w.addObs(P.coach, child1, { body: '   ' + 'x'.repeat(19) + '   ' })),
      two: code(await w.addObs(P.coach, child1, { body: 'Great work today! Really kept going.' })),
      three: code(await w.addObs(P.coach, child1, { body: 'Great work. Kept going. Never stopped.' })),
      threeMixed: code(await w.addObs(P.coach, child1, { body: 'Wow!! Kept going?! Never stopped...' })),
      ellipsis: code(await w.addObs(P.coach, child1, { body: 'Wow... what an effort in the rain today' })),
      decimal: code(await w.addObs(P.coach, child1, { body: 'Ran 2.5 km more than anyone. Brilliant effort.' })),
      cat: code(await w.addObs(P.coach, child1, { category: 'best_player' })),
      catNull: code(await w.addObs(P.coach, child1, { category: null })),
      bodyNull: code(await w.addObs(P.coach, child1, { body: null })),
    };
    check('3: note validation (body 20-160 trimmed, at most two sentences, six categories only)',
      JSON.stringify(ov) === JSON.stringify({ b19: 'EMS05', b20: 'ok', b160: 'ok', b161: 'EMS05', padded19: 'EMS05', two: 'ok', three: 'EMS05', threeMixed: 'EMS05', ellipsis: 'ok', decimal: 'ok', cat: 'EMS05', catNull: 'EMS05', bodyNull: 'EMS05' }), ov);
    for (const cat of ['lifted_the_team', 'kept_going', 'tried_something_new', 'helped_someone_belong', 'spoke_up', 'came_back_stronger']) {
      if (code(await w.addObs(P.coach, child1, { category: cat })) !== 'ok') check(`3: category ${cat} accepted`, false);
    }
    const ob = await w.view(P.g1, child1);
    check('3: notes newest first; max 50', ob.observations.length <= 50 && ob.observations.every((x, i, a) => i === 0 || a[i - 1].createdAt >= x.createdAt), ob.observations.length);
    for (let i = 0; i < 45; i++) await w.addObs(P.coach, child1);
    check('3: at most 50 notes returned', (await w.view(P.g1, child1)).observations.length === 50);
    const team = (await db.query(`select bool_and(team_id = $1) x from public.my_season_coach_observations`, [w.T])).rows[0].x;
    check('3: notes record the team at the time', team === true);
  } catch (e) {
    check('3: focus/notes', false, e.stack);
  }
  await db.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== 4. Withdraw ===');
{
  const w = await world();
  const { P, child1, db } = w;
  try {
    const o = (await w.addObs(P.coach, child1)).rows[0].id;
    const keep = (await w.addObs(P.parentCoach, child1)).rows[0].id;
    const r1 = await w.withdraw(P.coach, o);
    const r2 = await w.withdraw(P.coach, o);
    check('4: the author withdraws; repeating is a no-op', r1.ok && r2.ok, [r1, r2]);
    check('4: one observation_withdrawn audit row; row retained with withdrawn_at/by',
      await w.n(`select count(*) n from public.my_season_audit_events where event = 'observation_withdrawn' and subject_id = $1`, [o]) === 1
        && await w.n(`select count(*) n from public.my_season_coach_observations where id = $1 and withdrawn_at is not null and withdrawn_by = $2`, [o, P.coach]) === 1);
    const g = await w.view(P.g1, child1), other = await w.view(P.parentCoach, child1), mine = await w.view(P.coach, child1);
    check('4: hidden from the guardian and other coaches', g.observations.map((x) => x.id).join() === keep && other.observations.map((x) => x.id).join() === keep, [g.observations, other.observations]);
    const m = mine.observations.find((x) => x.id === o);
    check('4: visible to its author as withdrawn:true, mine:true', m?.withdrawn === true && m?.mine === true && mine.observations.length === 2, mine.observations);
    const rlsG = await w.user(P.g1, `select count(*)::int n from public.my_season_coach_observations where id = $1`, [o]);
    const rlsC = await w.user(P.coach, `select count(*)::int n from public.my_season_coach_observations where id = $1`, [o]);
    check('4: RLS: the guardian cannot select a withdrawn note; the author can', rlsG.rows[0].n === 0 && rlsC.rows[0].n === 1);
    // Author no longer a team coach.
    const o2 = (await w.addObs(P.coach, child1)).rows[0].id;
    await db.query(`update public.coach_team set ended_at = now(), ended_by = $2, end_reason = 'Left' where team_id = $1 and profile_id = $3`, [w.T, P.staff, P.coach]);
    check('4: an author who is no longer a team coach cannot withdraw (EMS03)', code(await w.withdraw(P.coach, o2)) === 'EMS03');
    const after = await w.view(P.g1, child1);
    const fo = after.observations.find((x) => x.id === o2);
    check('4: the note of a coach who left stays visible, coachName kept, formerCoach true', fo?.coachName === 'Name coach' && fo?.formerCoach === true, fo);
  } catch (e) {
    check('4: withdraw', false, e.stack);
  }
  await db.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== 5. No public path, immutability, append-only audit ===');
{
  const w = await world();
  const { P, child1, db } = w;
  try {
    const cols = (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public'
      and table_name in ('my_season_focuses', 'my_season_coach_observations', 'my_season_audit_events')`)).rows;
    check('5: no visibility / public column on any new table', cols.length > 20 && !cols.some((c) => /visib|public|share|rank|score/.test(c.column_name)), cols.map((c) => c.column_name));
    const fid = (await w.setFocus(P.g1, child1)).rows[0].id;
    const fid2 = (await w.setFocus(P.g1, child1)).rows[0].id; // ends fid
    const oid = (await w.addObs(P.coach, child1)).rows[0].id;
    const sr = (sql, params) => w.as('service_role', null, sql, params);
    const own = (sql, params) => db.query(sql, params).then(() => 'ok', (e) => e.code);
    const imm = {
      srTitle: code(await sr(`update public.my_season_focuses set title = 'Changed title' where id = $1`, [fid2])),
      srReEnd: code(await sr(`update public.my_season_focuses set ended_at = now() where id = $1`, [fid])),
      srAuthorNull: code(await sr(`update public.my_season_focuses set created_by = null where id = $1`, [fid2])),
      srAuthorSwap: code(await sr(`update public.my_season_focuses set created_by = $2 where id = $1`, [fid2, P.g2])),
      srMarker: code(await sr(`update public.my_season_focuses set author_account_deleted_at = now() where id = $1`, [fid2])),
      srBody: code(await sr(`update public.my_season_coach_observations set body = 'A completely different note body' where id = $1`, [oid])),
      srTeamNull: code(await sr(`update public.my_season_coach_observations set team_id = null where id = $1`, [oid])),
      srObsAuthorNull: code(await sr(`update public.my_season_coach_observations set author_id = null where id = $1`, [oid])),
      srInsertMarker: code(await sr(`insert into public.my_season_coach_observations (player_id, category, body, author_id, author_account_deleted_at, request_id) values ($1, 'kept_going', 'Inserted with a marker set', $2, now(), $3)`, [child1, P.coach, id()])),
      srInsertWithdrawn: code(await sr(`insert into public.my_season_coach_observations (player_id, category, body, author_id, withdrawn_at, request_id) values ($1, 'kept_going', 'Inserted already withdrawn', $2, now(), $3)`, [child1, P.coach, id()])),
      ownerTitle: await own(`update public.my_season_focuses set title = 'Owner change' where id = $1`, [fid2]),
      ownerUnwithdraw: await own(`update public.my_season_coach_observations set withdrawn_at = now(), withdrawn_by = $2 where id = $1`, [oid, P.coach]),
    };
    imm.ownerUnwithdraw2 = await own(`update public.my_season_coach_observations set withdrawn_at = null where id = $1`, [oid]);
    check('5: content is immutable apart from end / withdraw / FK set null, for service_role and the owner (EMS09)',
      JSON.stringify(imm) === JSON.stringify({ srTitle: 'EMS09', srReEnd: 'EMS09', srAuthorNull: 'EMS09', srAuthorSwap: 'EMS09', srMarker: 'EMS09', srBody: 'EMS09', srTeamNull: 'EMS09', srObsAuthorNull: 'EMS09', srInsertMarker: 'EMS09', srInsertWithdrawn: 'EMS09', ownerTitle: 'EMS09', ownerUnwithdraw: 'ok', ownerUnwithdraw2: 'EMS09' }), imm);

    const audit = {
      authUpd: code(await w.user(P.g1, `update public.my_season_audit_events set event = 'focus_set'`)),
      authDel: code(await w.user(P.g1, `delete from public.my_season_audit_events`)),
      authTrunc: code(await w.user(P.g1, `truncate public.my_season_audit_events`)),
      srSel: code(await sr(`select count(*) from public.my_season_audit_events`)),
      srIns: code(await sr(`insert into public.my_season_audit_events (player_id, event, subject_id, actor_role) values ($1, 'focus_set', $1, 'guardian')`, [child1])),
      srUpd: code(await sr(`update public.my_season_audit_events set event = 'focus_set'`)),
      srDel: code(await sr(`delete from public.my_season_audit_events`)),
      srTrunc: code(await sr(`truncate public.my_season_audit_events`)),
      ownerUpd: await own(`update public.my_season_audit_events set event = 'focus_set' where event = 'focus_ended'`),
      ownerActorNull: await own(`update public.my_season_audit_events set actor_profile_id = null where actor_profile_id = $1`, [P.g1]),
      ownerDel: await own(`delete from public.my_season_audit_events`),
      ownerTrunc: await own(`truncate public.my_season_audit_events`),
    };
    check('5: audit append-only: authenticated nothing; service_role select only; owner update/delete/truncate refused (EMS09); actor nulling only once the profile is gone',
      JSON.stringify(audit) === JSON.stringify({ authUpd: '42501', authDel: '42501', authTrunc: '42501', srSel: 'ok', srIns: '42501', srUpd: '42501', srDel: '42501', srTrunc: '42501', ownerUpd: 'EMS09', ownerActorNull: 'EMS09', ownerDel: 'EMS09', ownerTrunc: 'EMS09' }), audit);
    check('5: audit rows all present', await w.n(`select count(*) n from public.my_season_audit_events`) === 4);
  } catch (e) {
    check('5: immutability', false, e.stack);
  }
  await db.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== 6. Deletion ===');
async function emailHitsInNewTables(db) {
  const cols = (await db.query(`select table_name t, column_name c from information_schema.columns where table_schema = 'public'
     and (table_name like 'my_season%' or table_name like 'season_feature%') and data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')`)).rows;
  const emails = (await db.query(`select email from auth.users`)).rows.map((r) => r.email);
  const hits = [];
  for (const { t, c } of cols) {
    const k = Number((await db.query(`select count(*) n from public."${t}" where position('@' in "${c}"::text) > 0 or "${c}"::text = any($1)`, [emails])).rows[0].n);
    if (k) hits.push(`${t}.${c}`);
  }
  return hits;
}
{
  const w = await world();
  const { P, child1, child2, child3, db } = w;
  try {
    // Content on all three children.
    const g1Focus = (await w.setFocus(P.g1, child1)).rows[0].id;
    const coachFocus2 = (await w.setFocus(P.coach, child2)).rows[0].id;
    const coachObs1 = (await w.addObs(P.coach, child1)).rows[0].id;
    const coachObs2 = (await w.addObs(P.coach, child2)).rows[0].id;
    const g3Focus = (await w.setFocus(P.g3, child3)).rows[0].id;
    await w.addObs(P.coach2, child3);
    check('6: setup', [g1Focus, coachFocus2, coachObs1, coachObs2, g3Focus].every(Boolean));

    const blocking = (await db.query(`select public.account_deletion_blocking_reason($1) r`, [P.coach])).rows[0].r;
    check('6: My Season rows never make a coach deletion a staff review (blocking reason null)', blocking === null, blocking);

    // Coach account deletion through the real route functions.
    const del = await deleteAccount(w, P.coach);
    check('6: coach account deletion succeeds immediately (not routed to staff review)', del.ok && del.result.canDeleteIdentity === true
      && await w.n(`select count(*) n from public.pending_profile_deletions where auth_user_id = $1`, [P.coach]) === 0
      && await w.n(`select count(*) n from public.profiles where id = $1`, [P.coach]) === 0, del);
    const obsRows = (await db.query(`select author_id, author_account_deleted_at from public.my_season_coach_observations where id = any($1::uuid[])`, [[coachObs1, coachObs2]])).rows;
    check('6: the coach\'s notes survive, author null + deleted marker', obsRows.length === 2 && obsRows.every((r) => r.author_id === null && r.author_account_deleted_at), obsRows);
    const fRow = (await db.query(`select created_by, author_account_deleted_at, author_role from public.my_season_focuses where id = $1`, [coachFocus2])).rows[0];
    check('6: the coach-set focus survives, created_by null + marker', fRow.created_by === null && fRow.author_account_deleted_at && fRow.author_role === 'coach', fRow);
    const gv = await w.view(P.g1, child1);
    const ob = gv.observations.find((x) => x.id === coachObs1);
    check('6: the family sees the note with coachName null, formerCoach true', ob?.coachName === null && ob?.formerCoach === true && ob?.mine === false, ob);
    const pv = await w.view(P.parentCoach, child2);
    check('6: the coach-set focus shows authorName null, authorRole coach', pv.activeFocus?.id === coachFocus2 && pv.activeFocus.authorName === null && pv.activeFocus.authorRole === 'coach', pv.activeFocus);
    check('6: audit actor cleared for the deleted coach', await w.n(`select count(*) n from public.my_season_audit_events where actor_profile_id is null`) === 3);

    // Guardian account deletion, child keeps another guardian.
    const delG = await deleteAccount(w, P.g1);
    const gRow = (await db.query(`select created_by, author_account_deleted_at from public.my_season_focuses where id = $1`, [g1Focus])).rows[0];
    check('6: guardian (with a co-guardian) deletes their account; the focus stays, created_by null + marker',
      delG.ok && delG.result.canDeleteIdentity === true && gRow.created_by === null && gRow.author_account_deleted_at !== null, [delG, gRow]);
    const g2v = await w.view(P.g2, child1);
    check('6: the other guardian still sees the focus (authorName null, authorRole guardian)', g2v.activeFocus?.id === g1Focus && g2v.activeFocus.authorName === null && g2v.activeFocus.authorRole === 'guardian', g2v.activeFocus);

    // Sole guardian: deletion files a child-deletion request; the child (and focus) remain until staff erase.
    const delG3 = await deleteAccount(w, P.g3);
    const g3Row = (await db.query(`select created_by, author_account_deleted_at from public.my_season_focuses where id = $1`, [g3Focus])).rows[0];
    check('6: sole guardian deletion succeeds; child-deletion request filed; focus kept with marker until erasure',
      delG3.ok && delG3.result.canDeleteIdentity === true && delG3.result.playersDeletionRequested?.includes(child3) && g3Row?.created_by === null && g3Row?.author_account_deleted_at !== null, [delG3, g3Row]);

    check('6: no email (or @) stored in any My Season or flag table', (await emailHitsInNewTables(db)).length === 0, await emailHitsInNewTables(db));

    // Child erasure.
    const before2 = await w.n(`select (select count(*) from public.my_season_focuses where player_id = $1) + (select count(*) from public.my_season_coach_observations where player_id = $1) + (select count(*) from public.my_season_audit_events where player_id = $1) n`, [child2]);
    const er = await db.query(`select public.erase_player_and_related_data($1) r`, [child3]).then(() => 'ok', (e) => e.message);
    check('6: erase_player_and_related_data succeeds', er === 'ok', er);
    check('6: child erasure removes the child\'s focuses, notes and audit rows', await w.n(`select (select count(*) from public.my_season_focuses where player_id = $1) + (select count(*) from public.my_season_coach_observations where player_id = $1) + (select count(*) from public.my_season_audit_events where player_id = $1) n`, [child3]) === 0);
    check('6: other children untouched', await w.n(`select (select count(*) from public.my_season_focuses where player_id = $1) + (select count(*) from public.my_season_coach_observations where player_id = $1) + (select count(*) from public.my_season_audit_events where player_id = $1) n`, [child2]) === before2 && before2 > 0);
    // Erasing child1 too (all rows authored by deleted accounts).
    await db.query(`select public.erase_player_and_related_data($1)`, [child1]);
    check('6: erasing a child whose rows have deleted authors works too', await w.n(`select count(*) n from public.my_season_audit_events where player_id = $1`, [child1]) === 0);
    // Team deletion sets team_id null on notes (FK) and drops the flag row.
    await db.query(`update public.players set team_id = null where team_id = $1`, [w.T]);
    await db.query(`delete from public.coach_team where team_id = $1`, [w.T]);
    const tdel = await db.query(`delete from public.teams where id = $1`, [w.T]).then(() => 'ok', (e) => e.message);
    check('6: deleting a team keeps the notes (team_id null) and removes its flag row', tdel === 'ok'
      && await w.n(`select count(*) n from public.my_season_coach_observations where player_id = $1 and team_id is null`, [child2]) === 1
      && await w.n(`select count(*) n from public.season_feature_team_states where team_id = $1`, [w.T]) === 0, tdel);
  } catch (e) {
    check('6: deletion', false, e.stack);
  }
  await db.close();
}

// Coach under staff review path: a coach who wrote player records goes to
// review (0097/0098); My Season rows are not the reason, and they are refused while pending.
{
  const w = await world();
  const { P, child1, db } = w;
  try {
    const o = (await w.addObs(P.coach, child1)).rows[0].id;
    await db.query(`insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [child1, P.coach]);
    const r = await deleteAccount(w, P.coach);
    check('6b: a coach with player records goes to review for coach_authored_player_records (unchanged 0097 rule)',
      r.ok && r.result.canDeleteIdentity === false && await w.n(`select count(*) n from public.pending_profile_deletions where auth_user_id = $1 and status = 'pending'`, [P.coach]) === 1, r);
    check('6b: while under review: reads account_review, writes EMS04, note kept',
      (await w.view(P.coach, child1)).reason === 'account_review' && code(await w.addObs(P.coach, child1)) === 'EMS04' && code(await w.withdraw(P.coach, o)) === 'EMS04'
        && await w.n(`select count(*) n from public.my_season_coach_observations where id = $1 and author_id = $2`, [o, P.coach]) === 1);
  } catch (e) {
    check('6b: review', false, e.stack);
  }
  await db.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} My Season checks passed`);
process.exit(failed.length ? 1 : 0);
