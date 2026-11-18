// My Season Phase 1 (0099 + 0108) on the final schema: who can read and
// write, the feature flag, focus history and idempotency, input rules,
// withdrawal (which erases the note), duplicate submissions, no public path, append-only audit, immutability (service_role
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
      return { ok: false, code: e.code, message: e.message, detail: e.detail, hint: e.hint, where: e.where };
    }
  }
  const user = (uid, sql, params) => as('authenticated', uid, sql, params);
  // Defence in depth: authenticated holds no SELECT on the content tables.
  // To prove the RLS policies still limit rows if a grant were ever added
  // back, grant it inside a transaction that is always rolled back.
  async function withSelectGrant(uid, sql, params) {
    await db.exec('begin;');
    try {
      await db.exec('grant select on public.my_season_focuses, public.my_season_coach_observations to authenticated;');
      await db.exec('set local role authenticated;');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid ?? '']);
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, code: e.code, message: e.message };
    } finally {
      await db.exec('rollback;');
    }
  }
  const view = async (uid, player) => { const r = await user(uid, `select public.my_season_for_player($1) v`, [player]); return r.ok ? r.rows[0].v : r; };
  const setFocus = (uid, player, o = {}) => user(uid, `select public.my_season_set_focus($1, $2, $3, $4, $5::date, $6) id`,
    [player, ('title' in o ? o.title : 'Be brave on the ball'), ('why' in o ? o.why : 'It helps the team play forward'), ('looks' in o ? o.looks : 'Asking for the ball under pressure'), ('startedOn' in o ? o.startedOn : new Date().toISOString().slice(0, 10)), o.requestId ?? id()]);
  const addObs = (uid, player, o = {}) => user(uid, `select public.my_season_add_observation($1, $2, $3, $4) id`,
    [player, ('category' in o ? o.category : 'kept_going'), ('body' in o ? o.body : 'Kept going after the second goal went in.'), o.requestId ?? id()]);
  const withdraw = (uid, obs) => user(uid, `select public.my_season_withdraw_observation($1)`, [obs]);
  const n = async (sql, params) => Number((await db.query(sql, params)).rows[0].n);
  return { db, P, T, T2, child1, child2, child3, as, user, withSelectGrant, view, setFocus, addObs, withdraw, n };
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
    check('1: observation JSON has exactly the contract keys', obsKeys === 'body,category,coachName,createdAt,formerCoach,id,mine,removedByStaff,withdrawn', obsKeys);
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

    // Direct table reads: refused for every role (no SELECT grant). The app
    // reads only through my_season_for_player.
    const everyone = ['g1', 'g2', 'coach', 'parentCoach', 'ended', 'expired', 'direct', 'stranger', 'staff', 'review', 'reviewCoach', 'coach2'];
    const direct = {};
    for (const k of everyone) {
      direct[k] = [
        code(await w.user(P[k], `select count(*) from public.my_season_focuses`)),
        code(await w.user(P[k], `select count(*) from public.my_season_coach_observations`)),
        code(await w.user(P[k], `select created_by, ended_by, request_id from public.my_season_focuses`)),
        code(await w.user(P[k], `select author_id, withdrawn_by, request_id, team_id from public.my_season_coach_observations`)),
      ].join();
    }
    direct.signedOut = [code(await w.user(null, `select count(*) from public.my_season_focuses`)), code(await w.user(null, `select count(*) from public.my_season_coach_observations`))].join();
    check('1: direct SELECT on my_season_focuses / my_season_coach_observations is refused (42501) for every authenticated account',
      Object.values(direct).every((x) => x.split(',').every((c) => c === '42501')), direct);
    const authSelect = (await w.db.query(`select bool_or(has_table_privilege('authenticated', c.oid, 'select')) x from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relname like 'my_season%' and c.relkind = 'r'`)).rows[0].x;
    const rlsOn = (await w.db.query(`select bool_and(relrowsecurity) x from pg_class where relnamespace = 'public'::regnamespace and relname like 'my_season%' and relkind = 'r'`)).rows[0].x;
    check('1: authenticated holds no SELECT on any My Season table; RLS stays enabled', authSelect === false && rlsOn === true, { authSelect, rlsOn });

    // Defence in depth: with SELECT granted back (rolled back afterwards), the policies still limit rows.
    const rls = async (uid) => {
      const a = await w.withSelectGrant(uid, `select (select count(*) from public.my_season_focuses)::int f, (select count(*) from public.my_season_coach_observations)::int o`);
      return a.ok ? `${a.rows[0].f}/${a.rows[0].o}` : a.code;
    };
    check('1: policies (if SELECT were granted): guardian and active coach see 1 focus / 1 note', (await rls(P.g1)) === '1/1' && (await rls(P.coach)) === '1/1' && (await rls(P.parentCoach)) === '1/1');
    const rlsNone = { ended: await rls(P.ended), expired: await rls(P.expired), direct: await rls(P.direct), stranger: await rls(P.stranger), staff: await rls(P.staff), review: await rls(P.review), reviewCoach: await rls(P.reviewCoach), coach2: await rls(P.coach2) };
    check('1: policies (if SELECT were granted): ended, expired, direct, unrelated, staff, under-review and other-team accounts see nothing', Object.values(rlsNone).every((x) => x === '0/0'), rlsNone);
    check('1: the temporary grant was rolled back', code(await w.user(P.g1, `select count(*) from public.my_season_focuses`)) === '42501');
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
      unknown: code(await w.withdraw(P.coach, id())), strangerUnknown: code(await w.withdraw(P.stranger, id())),
      reviewCoach: code(await w.withdraw(P.reviewCoach, obsId)), reviewCoachUnknown: code(await w.withdraw(P.reviewCoach, id())) };
    check('1: withdraw by anyone but the author refused (EMS03); an unknown id is EMS03 too (no existence oracle); under review EMS04 for any id',
      JSON.stringify(wCodes) === JSON.stringify({ g1: 'EMS03', parentCoach: 'EMS03', stranger: 'EMS03', unknown: 'EMS03', strangerUnknown: 'EMS03', reviewCoach: 'EMS04', reviewCoachUnknown: 'EMS04' }), wCodes);
    const ems08 = (await w.db.query(`select string_agg(p.proname, ',' order by p.proname) n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'my_season%' and p.prosrc like '%EMS08%'`)).rows[0].n;
    check('1: only the staff RPCs raise EMS08 (never a family or coach path)', ems08 === 'my_season_staff_list_observations,my_season_staff_remove_observation', ems08);

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
    const rls = await w.withSelectGrant(P.g1, `select (select count(*) from public.my_season_focuses)::int + (select count(*) from public.my_season_coach_observations)::int n`);
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
    const retryContent = { requestId: req, title: 'Retry me' };
    const padded = await w.setFocus(P.g1, child1, { ...retryContent, title: '  Retry me \n' });
    check('3: set focus: a retry differing only in surrounding spaces is the same request', padded.ok && padded.rows[0].id === a.rows[0].id, padded);
    const focusAudit = () => w.n(`select count(*) n from public.my_season_audit_events where player_id = $1 and event like 'focus%'`, [child1]);
    const auditBefore = await focusAudit();
    const otherContent = {
      title: code(await w.setFocus(P.g1, child1, { ...retryContent, title: 'A different title' })),
      why: code(await w.setFocus(P.g1, child1, { ...retryContent, why: 'A different reason' })),
      looks: code(await w.setFocus(P.g1, child1, { ...retryContent, looks: 'A different picture' })),
      date: code(await w.setFocus(P.g1, child1, { ...retryContent, startedOn: '2024-01-01' })),
    };
    check('3: set focus: same key with different content is EMS06 for every field', Object.values(otherContent).every((c) => c === 'EMS06'), otherContent);
    check('3: ...and nothing was written', await w.n(`select count(*) n from public.my_season_focuses`) === before && await focusAudit() === auditBefore
      && (await w.view(P.g1, child1)).activeFocus.title === 'Retry me');
    // A unique violation on the one-active index (not the request_id) is EMS09
    // my_season_conflict. Provoked by a temporary trigger that skips the
    // "end the old focus" update, inside a rolled-back transaction.
    const conflict = await (async () => {
      await db.exec('begin;');
      try {
        await db.exec(`create function pg_temp.skip_end() returns trigger language plpgsql as $f$ begin return null; end; $f$;
          create trigger zz_skip_end before update on public.my_season_focuses for each row execute function pg_temp.skip_end();
          set local role authenticated;`);
        await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [P.g1]);
        await db.query(`select public.my_season_set_focus($1, 'Race me', 'Why it matters', 'Looks like it', current_date, $2)`, [child1, id()]);
        return { ok: true };
      } catch (e) {
        return { ok: false, code: e.code, message: e.message };
      } finally {
        await db.exec('rollback;');
      }
    })();
    check('3: set focus: a one-active index violation is EMS09 my_season_conflict (not EMS06)', conflict.code === 'EMS09' && conflict.message === 'my_season_conflict', conflict);
    check('3: ...and nothing was written', await w.n(`select count(*) n from public.my_season_focuses where title = 'Race me'`) === 0
      && await w.n(`select count(*) n from pg_trigger where tgname = 'zz_skip_end'`) === 0);

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
    check('4: one observation_withdrawn audit row; row kept with withdrawn_at/by',
      await w.n(`select count(*) n from public.my_season_audit_events where event = 'observation_withdrawn' and subject_id = $1`, [o]) === 1
        && await w.n(`select count(*) n from public.my_season_coach_observations where id = $1 and withdrawn_at is not null and withdrawn_by = $2`, [o, P.coach]) === 1);
    const g = await w.view(P.g1, child1), other = await w.view(P.parentCoach, child1), mine = await w.view(P.coach, child1);
    check('4: hidden from the guardian and other coaches', g.observations.map((x) => x.id).join() === keep && other.observations.map((x) => x.id).join() === keep, [g.observations, other.observations]);
    const m = mine.observations.find((x) => x.id === o);
    check('4: visible to its author as withdrawn:true, mine:true', m?.withdrawn === true && m?.mine === true && mine.observations.length === 2, mine.observations);
    const rlsG = await w.withSelectGrant(P.g1, `select count(*)::int n from public.my_season_coach_observations where id = $1`, [o]);
    const rlsC = await w.withSelectGrant(P.coach, `select count(*)::int n from public.my_season_coach_observations where id = $1`, [o]);
    check('4: policies (if SELECT were granted): the guardian cannot select a withdrawn note; the author can', rlsG.rows?.[0].n === 0 && rlsC.rows?.[0].n === 1, [rlsG, rlsC]);
    const directW = [code(await w.user(P.coach, `select withdrawn_by from public.my_season_coach_observations where id = $1`, [o])), code(await w.user(P.g1, `select withdrawn_by from public.my_season_coach_observations where id = $1`, [o]))];
    check('4: neither the author nor the guardian can select the withdrawn row directly (42501)', directW.every((c) => c === '42501'), directW);
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
console.log('\n=== 4b. Withdrawal erases the note ===');
const MARK = `ZQMARK${crypto.randomBytes(6).toString('hex')}`;
const MARK_BODY = `${MARK} helped a new teammate join in.`;
const MARK_CATEGORY = 'helped_someone_belong';
const STATE_CONSTRAINT = 'my_season_coach_observations_content_state';
const leaksMark = (r) => JSON.stringify([r.message, r.detail, r.hint, r.where]).includes(MARK);
// Every row of every public table, all columns, as text.
async function tablesHolding(db, needle) {
  const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
  const hits = [];
  for (const t of tables) {
    if (Number((await db.query(`select count(*) n from public."${t}" x where x::text like $1`, [`%${needle}%`])).rows[0].n)) hits.push(t);
  }
  return hits;
}
// A statement run as the owner with the table's triggers off, so it reaches
// the CHECK constraints themselves. Always rolled back.
async function pastTriggers(db, sql, params) {
  await db.exec('begin; alter table public.my_season_coach_observations disable trigger user;');
  try {
    await db.query(sql, params);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  } finally {
    await db.exec('rollback;');
  }
}
{
  const w = await world();
  const { P, child1, child2, db } = w;
  try {
    const mine = { category: MARK_CATEGORY, body: MARK_BODY };
    const req = id();
    const o = (await w.addObs(P.coach, child1, { ...mine, requestId: req })).rows[0].id;
    const other = (await w.addObs(P.parentCoach, child1)).rows[0].id;
    check('4b: before withdrawal the text is stored', (await tablesHolding(db, MARK)).join() === 'my_season_coach_observations');
    const created = (await db.query(`select created_at, team_id from public.my_season_coach_observations where id = $1`, [o])).rows[0];

    const first = await w.withdraw(P.coach, o);
    const row = (await db.query(`select * from public.my_season_coach_observations where id = $1`, [o])).rows[0];
    check('4b: the row read as superuser has no body and no category', first.ok && row.body === null && row.category === null, row);
    check('4b: metadata stays: ids, team, author, created_at, withdrawn_at/by, request_id',
      row.player_id === child1 && row.team_id === created.team_id && row.author_id === P.coach && row.author_account_deleted_at === null
        && +row.created_at === +created.created_at && row.withdrawn_at && row.withdrawn_by === P.coach && row.request_id === req, row);
    const sr = (await w.as('service_role', null, `select body, category from public.my_season_coach_observations where id = $1`, [o]));
    check('4b: service_role reads no content either', sr.ok && sr.rows[0].body === null && sr.rows[0].category === null, sr);
    check('4b: the marker is in no column of any public table', (await tablesHolding(db, MARK)).length === 0, await tablesHolding(db, MARK));
    const auditCols = (await db.query(`select column_name c from information_schema.columns where table_schema = 'public' and table_name = 'my_season_audit_events' order by ordinal_position`)).rows.map((r) => r.c).join();
    check('4b: the audit table has id-only columns', auditCols === 'id,occurred_at,player_id,event,subject_id,actor_profile_id,actor_role', auditCols);
    const auditText = await w.n(`select count(*) n from public.my_season_audit_events x where x::text like $1 or x::text like $2`, [`%${MARK}%`, `%${MARK_CATEGORY}%`]);
    check('4b: no audit row holds the text or the category', auditText === 0, auditText);

    const audits = () => w.n(`select count(*) n from public.my_season_audit_events where event = 'observation_withdrawn' and subject_id = $1`, [o]);
    const again = await w.withdraw(P.coach, o);
    check('4b: withdrawing again is a silent no-op with no second audit row', again.ok && await audits() === 1, again);

    // One indistinguishable refusal.
    const refusal = (r) => `${r.code}|${r.message}|${r.detail ?? ''}|${r.hint ?? ''}`;
    const activeOther = await w.withdraw(P.coach, other);
    const unknown = await w.withdraw(P.coach, id());
    const someoneWithdrawn = await w.withdraw(P.parentCoach, o);
    const ineligible = await w.withdraw(P.stranger, o);
    const ineligibleUnknown = await w.withdraw(P.stranger, id());
    const guardianTry = await w.withdraw(P.g1, o);
    const answers = [activeOther, unknown, someoneWithdrawn, ineligible, ineligibleUnknown, guardianTry].map(refusal);
    check('4b: unknown id, another coach\'s note (active or withdrawn) and an ineligible caller get the identical EMS03',
      new Set(answers).size === 1 && answers[0].startsWith('EMS03|my_season_not_allowed|'), answers);
    const review = [await w.withdraw(P.reviewCoach, o), await w.withdraw(P.reviewCoach, other), await w.withdraw(P.reviewCoach, id())].map(refusal);
    check('4b: an account under review gets the same EMS04 for any id', new Set(review).size === 1 && review[0].startsWith('EMS04|'), review);

    const family = await w.view(P.g1, child1), peer = await w.view(P.parentCoach, child1), author = await w.view(P.coach, child1);
    check('4b: the guardian and another coach never receive it', !family.observations.some((x) => x.id === o) && !peer.observations.some((x) => x.id === o));
    const m = author.observations.find((x) => x.id === o);
    check('4b: its author gets it with body null, category null, withdrawn true', m && m.body === null && m.category === null && m.withdrawn === true && m.mine === true
      && m.removedByStaff === false && Object.keys(m).sort().join() === 'body,category,coachName,createdAt,formerCoach,id,mine,removedByStaff,withdrawn', m);
    check('4b: the read never returns the marker to anyone', ![family, peer, author].some((v) => JSON.stringify(v).includes(MARK)));

    // Nobody can put content back.
    const restore = {};
    const srUpd = (sql, params) => w.as('service_role', null, sql, params).then(code);
    const own = (sql, params) => db.query(sql, params).then(() => 'ok', (e) => e.code);
    restore.srDelete = await w.as('service_role', null, `delete from public.my_season_coach_observations where id = $1`, [o]).then(code);
    restore.srBody = await srUpd(`update public.my_season_coach_observations set body = 'Text put back by a support tool.' where id = $1`, [o]);
    restore.srCategory = await srUpd(`update public.my_season_coach_observations set category = 'spoke_up' where id = $1`, [o]);
    restore.srBoth = await srUpd(`update public.my_season_coach_observations set body = 'Text put back by a support tool.', category = 'spoke_up' where id = $1`, [o]);
    restore.srReopen = await srUpd(`update public.my_season_coach_observations set withdrawn_at = null, withdrawn_by = null, body = 'Text put back by a support tool.', category = 'spoke_up' where id = $1`, [o]);
    restore.ownerBody = await own(`update public.my_season_coach_observations set body = 'Text put back by the owner role.' where id = $1`, [o]);
    restore.ownerReopen = await own(`update public.my_season_coach_observations set withdrawn_at = null, withdrawn_by = null, body = 'Text put back by the owner role.', category = 'spoke_up' where id = $1`, [o]);
    restore.ownerMoveDate = await own(`update public.my_season_coach_observations set withdrawn_at = now() - interval '1 day' where id = $1`, [o]);
    check('4b: service_role has no write privilege at all (42501); the owner is stopped by the trigger (EMS09)',
      Object.entries(restore).every(([k, c]) => c === (k.startsWith('sr') ? '42501' : 'EMS09')), restore);
    check('4b: ...and the row is still empty', await w.n(`select count(*) n from public.my_season_coach_observations where id = $1 and body is null and category is null and withdrawn_at is not null`, [o]) === 1);

    // Partial withdrawals through normal SQL.
    const partial = {
      noErase: await own(`update public.my_season_coach_observations set withdrawn_at = now(), withdrawn_by = $2 where id = $1`, [other, P.parentCoach]),
      bodyOnly: await own(`update public.my_season_coach_observations set withdrawn_at = now(), withdrawn_by = $2, body = null where id = $1`, [other, P.parentCoach]),
      categoryOnly: await own(`update public.my_season_coach_observations set withdrawn_at = now(), withdrawn_by = $2, category = null where id = $1`, [other, P.parentCoach]),
      noActor: await own(`update public.my_season_coach_observations set withdrawn_at = now(), body = null, category = null where id = $1`, [other]),
      eraseOnly: await own(`update public.my_season_coach_observations set body = null, category = null where id = $1`, [other]),
    };
    check('4b: the only allowed transition nulls both content columns together with withdrawn_at/by', Object.values(partial).every((c) => c === 'EMS09'), partial);

    // Inserts.
    const ins = (cols, vals, params) => own(`insert into public.my_season_coach_observations (player_id, author_id, request_id, ${cols}) values ($1, $2, $3, ${vals})`, [child1, P.coach, id(), ...params]);
    const inserts = {
      nullBody: await ins('category, body', `'kept_going', null`, []),
      nullCategory: await ins('category, body', `null, 'A perfectly valid note body.'`, []),
      bothNull: await ins('category, body', `null, null`, []),
      withdrawnEmpty: await ins('category, body, withdrawn_at, withdrawn_by', `null, null, now(), $2`, []),
      badCategory: await ins('category, body', `'best_player', 'A perfectly valid note body.'`, []),
      shortBody: await ins('category, body', `'kept_going', 'Too short'`, []),
      padded: await ins('category, body', `'kept_going', '  A perfectly valid note body.'`, []),
      nullId: await ins('id, category, body', `null, 'kept_going', 'A perfectly valid note body.'`, []),
      nullCreatedAt: await ins('created_at, category, body', `null, 'kept_going', 'A perfectly valid note body.'`, []),
    };
    check('4b: inserts cannot create withdrawn rows or rows without valid content (fixed EMS09)', Object.values(inserts).every((c) => c === 'EMS09'), inserts);
    const direct = await db.query(`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body) values ($1, $2, $3, 'kept_going', $4)`, [child1, P.coach, id(), `${MARK} `]).then(() => null, (e) => e);
    check('4b: a refused direct insert does not echo its text (no "Failing row contains")', direct?.code === 'EMS09' && !leaksMark(direct) && !/Failing row/.test(`${direct.detail}`), direct && { code: direct.code, detail: direct.detail });

    // NOT NULL / CHECK paths reachable by a direct write: fixed error, nothing echoed.
    const refused = async (sql, params) => db.query(sql, params).then(() => ({ code: 'ok' }), (e) => e);
    const echoed = {};
    const noteCols = 'player_id, author_id, category, body';
    const focusCols = 'player_id, created_by, author_role, started_on, title, why_it_matters, what_it_looks_like';
    const focusText = `${MARK} focus`;
    const shapes = {
      noteNullId: [`insert into public.my_season_coach_observations (id, request_id, ${noteCols}) values (null, $1, $2, $3, 'kept_going', $4)`, [id(), child1, P.coach, MARK_BODY]],
      noteNullCreated: [`insert into public.my_season_coach_observations (created_at, request_id, ${noteCols}) values (null, $1, $2, $3, 'kept_going', $4)`, [id(), child1, P.coach, MARK_BODY]],
      noteNullRequest: [`insert into public.my_season_coach_observations (request_id, ${noteCols}) values (null, $1, $2, 'kept_going', $3)`, [child1, P.coach, MARK_BODY]],
      noteNullPlayer: [`insert into public.my_season_coach_observations (request_id, ${noteCols}) values ($1, null, $2, 'kept_going', $3)`, [id(), P.coach, MARK_BODY]],
      focusNullId: [`insert into public.my_season_focuses (id, request_id, ${focusCols}) values (null, $1, $2, $3, 'guardian', current_date, $4, $4, $4)`, [id(), child1, P.g1, focusText]],
      focusNullCreated: [`insert into public.my_season_focuses (created_at, request_id, ${focusCols}) values (null, $1, $2, $3, 'guardian', current_date, $4, $4, $4)`, [id(), child1, P.g1, focusText]],
      focusNullRequest: [`insert into public.my_season_focuses (request_id, ${focusCols}) values (null, $1, $2, 'guardian', current_date, $3, $3, $3)`, [child1, P.g1, focusText]],
      focusNullPlayer: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, null, $2, 'guardian', current_date, $3, $3, $3)`, [id(), P.g1, focusText]],
      focusNullDate: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, 'guardian', null, $4, $4, $4)`, [id(), child1, P.g1, focusText]],
      focusNullRole: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, null, current_date, $4, $4, $4)`, [id(), child1, P.g1, focusText]],
      focusBadRole: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, 'staff', current_date, $4, $4, $4)`, [id(), child1, P.g1, focusText]],
      focusNullTitle: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, 'guardian', current_date, null, $4, $4)`, [id(), child1, P.g1, focusText]],
      focusLongTitle: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, 'guardian', current_date, $4 || repeat('x', 70), $4, $4)`, [id(), child1, P.g1, focusText]],
      focusPaddedTitle: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, 'guardian', current_date, ' ' || $4, $4, $4)`, [id(), child1, P.g1, focusText]],
      focusShortWhy: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, 'guardian', current_date, $4, 'x', $4)`, [id(), child1, P.g1, focusText]],
      focusNullLooks: [`insert into public.my_season_focuses (request_id, ${focusCols}) values ($1, $2, $3, 'guardian', current_date, $4, $4, null)`, [id(), child1, P.g1, focusText]],
      updNoteNullId: [`update public.my_season_coach_observations set id = null where id = $1`, [other]],
      updNoteNullCreated: [`update public.my_season_coach_observations set created_at = null where id = $1`, [other]],
      updNoteNullRequest: [`update public.my_season_coach_observations set request_id = null where id = $1`, [other]],
      updNoteBody: [`update public.my_season_coach_observations set body = $2 where id = $1`, [other, 'x']],
    };
    for (const [k, [sql, params]] of Object.entries(shapes)) {
      const e = await refused(sql, params);
      echoed[k] = e.code === 'EMS09' && !e.detail && !leaksMark(e) && !/Failing row/.test(`${e.detail}`) ? 'fixed' : { code: e.code, detail: e.detail };
    }
    check('4b: every NOT NULL / CHECK path a direct insert or update can reach gets EMS09 with no DETAIL and no text', Object.values(echoed).every((v) => v === 'fixed'), echoed);

    // The constraint itself, reached with the triggers off (superuser).
    const G = `'kept_going'`, B = `'A perfectly valid note body.'`;
    const bad = {
      insActiveNoBody: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body) values ($1, $2, $3, ${G}, null)`, [child1, P.coach, id()]],
      insActiveNoCategory: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body) values ($1, $2, $3, null, ${B})`, [child1, P.coach, id()]],
      insActiveBadCategory: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body) values ($1, $2, $3, 'best_player', ${B})`, [child1, P.coach, id()]],
      insActivePadded: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body) values ($1, $2, $3, ${G}, ' A perfectly valid note body.')`, [child1, P.coach, id()]],
      insActiveShort: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body) values ($1, $2, $3, ${G}, 'Too short')`, [child1, P.coach, id()]],
      insActiveLong: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body) values ($1, $2, $3, ${G}, repeat('x', 161))`, [child1, P.coach, id()]],
      insWithdrawnWithBody: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body, withdrawn_at) values ($1, $2, $3, null, ${B}, now())`, [child1, P.coach, id()]],
      insWithdrawnWithCategory: [`insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body, withdrawn_at) values ($1, $2, $3, ${G}, null, now())`, [child1, P.coach, id()]],
      updRestoreBody: [`update public.my_season_coach_observations set body = ${B} where id = $1`, [o]],
      updRestoreCategory: [`update public.my_season_coach_observations set category = ${G} where id = $1`, [o]],
      updActiveNoErase: [`update public.my_season_coach_observations set withdrawn_at = now() where id = $1`, [other]],
      updActiveNullBody: [`update public.my_season_coach_observations set body = null where id = $1`, [other]],
    };
    const constraintResults = {};
    for (const [k, [sql, params]] of Object.entries(bad)) {
      const r = await pastTriggers(db, sql, params);
      constraintResults[k] = !r.ok && r.code === '23514' && r.message.includes(STATE_CONSTRAINT) ? 'refused' : r;
    }
    check(`4b: ${STATE_CONSTRAINT} refuses both bad states on direct superuser inserts and updates`, Object.values(constraintResults).every((v) => v === 'refused'), constraintResults);
    const good = await pastTriggers(db, `insert into public.my_season_coach_observations (player_id, author_id, request_id, category, body, withdrawn_at) values ($1, $2, $3, null, null, now())`, [child1, P.coach, id()]);
    check('4b: the constraint accepts the withdrawn shape (the control for the refusals above)', good.ok, good);

    // Invalid RPC input carrying the marker.
    const invalid = [
      await w.addObs(P.coach, child1, { body: `${MARK} ${'x'.repeat(170)}` }),
      await w.addObs(P.coach, child1, { body: `${MARK} one. Two here. Three here. Four.` }),
      await w.addObs(P.coach, child1, { body: `${MARK}`.slice(0, 5) }),
      await w.addObs(P.coach, child1, { category: `${MARK}_x` }),
    ];
    check('4b: invalid notes through the RPC get EMS05 with nothing echoed', invalid.every((r) => r.code === 'EMS05' && r.message === 'my_season_invalid_input' && !r.detail && !r.hint && !leaksMark(r)), invalid);
    const fnSrc = (await db.query(`select string_agg(prosrc, ' ') s from pg_proc where pronamespace = 'public'::regnamespace and proname like 'my_season%'`)).rows[0].s;
    const raises = fnSrc.match(/raise exception[^;]*;/g) ?? [];
    check('4b: every My Season RAISE is a fixed errcode + message with no parameters, DETAIL or HINT',
      raises.length > 10 && raises.every((r) => /^raise exception using errcode = 'EMS\d\d', message = 'my_season_[a-z_]+';$/.test(r)), raises.filter((r) => !/^raise exception using errcode = 'EMS\d\d', message = 'my_season_[a-z_]+';$/.test(r)));

    // Removed with the child; other children untouched.
    const o2 = (await w.addObs(P.coach, child2, mine)).rows[0].id;
    await w.withdraw(P.coach, o2);
    await db.query(`select public.erase_player_and_related_data($1)`, [child2]);
    check('4b: child deletion removes the withdrawn row and its audit events',
      await w.n(`select count(*) n from public.my_season_coach_observations where id = $1`, [o2]) === 0 && await w.n(`select count(*) n from public.my_season_audit_events where subject_id = $1`, [o2]) === 0);
    // service_role now holds SELECT only: the cascade must not depend on its grants.
    const lastFocus = (await w.setFocus(P.g3, w.child3)).rows[0].id;
    const lastNote = (await w.addObs(P.coach2, w.child3, mine)).rows[0].id;
    const srErase = await db.query(`select public.erase_player_and_related_data($1)`, [w.child3]).then(() => ({ ok: true }), (e) => ({ ok: false, message: e.message }));
    check('4b: with service_role read-only, erase_player_and_related_data still cascades through both content tables and the audit', srErase.ok
      && await w.n(`select count(*) n from public.my_season_focuses where id = $1`, [lastFocus]) === 0
      && await w.n(`select count(*) n from public.my_season_coach_observations where id = $1`, [lastNote]) === 0
      && await w.n(`select count(*) n from public.my_season_audit_events where player_id = $1`, [w.child3]) === 0, srErase);
  } catch (e) {
    check('4b: erasure', false, e.stack);
  }
  await db.close();
}
{
  // Coach account deletion after a withdrawal.
  const w = await world();
  const { P, child1, db } = w;
  try {
    const gone = (await w.addObs(P.coach, child1, { body: MARK_BODY, category: MARK_CATEGORY })).rows[0].id;
    const kept = (await w.addObs(P.coach, child1)).rows[0].id;
    await w.withdraw(P.coach, gone);
    const del = await deleteAccount(w, P.coach);
    const row = (await db.query(`select * from public.my_season_coach_observations where id = $1`, [gone])).rows[0];
    check('4b: coach deletion after a withdrawal leaves metadata only (author and withdrawn_by null, marker and withdrawn_at kept)',
      del.ok && del.result.canDeleteIdentity === true && row.body === null && row.category === null && row.author_id === null && row.author_account_deleted_at !== null && row.withdrawn_by === null && row.withdrawn_at !== null, row);
    const fam = await w.view(P.g1, child1);
    check('4b: the withdrawn note stays hidden; the active note survives as a former coach\'s',
      fam.observations.length === 1 && fam.observations[0].id === kept && fam.observations[0].coachName === null && fam.observations[0].formerCoach === true && typeof fam.observations[0].body === 'string', fam.observations);
    const post = await w.n(`select count(*) n from public.my_season_coach_observations where id = $1 and body is null and category is null`, [gone]);
    check('4b: still empty after the FK updates', post === 1 && (await tablesHolding(db, MARK)).length === 0);
  } catch (e) {
    check('4b: coach deletion', false, e.stack);
  }
  await db.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== 4c. Duplicate submissions (sequential; simultaneous ones are in my_season_concurrency_test.mjs) ===');
{
  const w = await world();
  const { P, child1, child2, db } = w;
  try {
    const conName = (await db.query(`select conname c from pg_constraint where conrelid = 'public.my_season_coach_observations'::regclass and contype = 'u'`)).rows.map((r) => r.c).join();
    check('4c: request_id has the named unique constraint', conName === 'my_season_coach_observations_request_id_key', conName);
    const req = id(), note = { body: 'Stayed late to help the goalkeeper.', category: 'lifted_the_team', requestId: req };
    const state = async () => `${await w.n(`select count(*) n from public.my_season_coach_observations`)}/${await w.n(`select count(*) n from public.my_season_audit_events`)}`;
    const first = await w.addObs(P.coach, child1, note);
    const retry = await w.addObs(P.coach, child1, note);
    const padded = await w.addObs(P.coach, child1, { ...note, body: `  ${note.body}\n` });
    check('4c: a retry (also with surrounding spaces) returns the same id', first.ok && retry.rows?.[0].id === first.rows[0].id && padded.rows?.[0].id === first.rows[0].id, [first, retry, padded]);
    check('4c: one observation, one observation_added, one family entry', await state() === '1/1'
      && await w.n(`select count(*) n from public.my_season_audit_events where event = 'observation_added'`) === 1 && (await w.view(P.g1, child1)).observations.length === 1);
    const mismatch = {
      otherChild: code(await w.addObs(P.coach, child2, note)),
      otherBody: code(await w.addObs(P.coach, child1, { ...note, body: 'A different note about the same game.' })),
      otherCategory: code(await w.addObs(P.coach, child1, { ...note, category: 'spoke_up' })),
      otherCaller: code(await w.addObs(P.parentCoach, child1, note)),
    };
    check('4c: same key with another child, other content or another caller: EMS06', Object.values(mismatch).every((c) => c === 'EMS06'), mismatch);
    check('4c: ...and nothing was written', await state() === '1/1', await state());
    const gates = {
      invalidBody: code(await w.addObs(P.coach, child1, { ...note, body: 'short' })),
      invalidCategory: code(await w.addObs(P.coach, child1, { ...note, category: 'best_player' })),
      stranger: code(await w.addObs(P.stranger, child1, note)),
      guardian: code(await w.addObs(P.g1, child1, note)),
      ownChild: code(await w.addObs(P.parentCoach, child2, note)),
      review: code(await w.addObs(P.reviewCoach, child1, note)),
    };
    check('4c: authorisation and validation run before the idempotent return',
      JSON.stringify(gates) === JSON.stringify({ invalidBody: 'EMS05', invalidCategory: 'EMS05', stranger: 'EMS03', guardian: 'EMS03', ownChild: 'EMS07', review: 'EMS04' }), gates);

    await w.withdraw(P.coach, first.rows[0].id);
    const before = await state();
    const after = await w.addObs(P.coach, child1, note);
    const afterOther = await w.addObs(P.coach, child1, { ...note, body: 'A different note about the same game.' });
    check('4c: after withdrawal the same key returns the original id (content can no longer be compared)', after.rows?.[0].id === first.rows[0].id && afterOther.rows?.[0].id === first.rows[0].id, [after, afterOther]);
    const row = (await db.query(`select body, category from public.my_season_coach_observations where id = $1`, [first.rows[0].id])).rows[0];
    check('4c: ...the note is not recreated and its text does not come back', await state() === before && row.body === null && row.category === null && !(await w.view(P.g1, child1)).observations.length, { before, now: await state(), row });
    check('4c: after withdrawal another caller or child still gets EMS06', code(await w.addObs(P.parentCoach, child1, note)) === 'EMS06' && code(await w.addObs(P.coach, child2, note)) === 'EMS06');
    const fReq = id();
    const f1 = await w.setFocus(P.g1, child1, { requestId: fReq });
    check('4c: set focus validates before its idempotent return', f1.ok && code(await w.setFocus(P.g1, child1, { requestId: fReq, title: 'ab' })) === 'EMS05');
  } catch (e) {
    check('4c: duplicates', false, e.stack);
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
    const stmts = {
      Title: [`update public.my_season_focuses set title = 'Changed title' where id = $1`, [fid2]],
      ReEnd: [`update public.my_season_focuses set ended_at = now() where id = $1`, [fid]],
      AuthorNull: [`update public.my_season_focuses set created_by = null where id = $1`, [fid2]],
      AuthorSwap: [`update public.my_season_focuses set created_by = $2 where id = $1`, [fid2, P.g2]],
      Marker: [`update public.my_season_focuses set author_account_deleted_at = now() where id = $1`, [fid2]],
      Body: [`update public.my_season_coach_observations set body = 'A completely different note body' where id = $1`, [oid]],
      TeamNull: [`update public.my_season_coach_observations set team_id = null where id = $1`, [oid]],
      ObsAuthorNull: [`update public.my_season_coach_observations set author_id = null where id = $1`, [oid]],
      InsertMarker: [`insert into public.my_season_coach_observations (player_id, category, body, author_id, author_account_deleted_at, request_id) values ($1, 'kept_going', 'Inserted with a marker set', $2, now(), $3)`, [child1, P.coach, id()]],
      InsertWithdrawn: [`insert into public.my_season_coach_observations (player_id, category, body, author_id, withdrawn_at, request_id) values ($1, 'kept_going', 'Inserted already withdrawn', $2, now(), $3)`, [child1, P.coach, id()]],
    };
    const srCodes = {}, ownerCodes = {};
    for (const [k, [sql, params]] of Object.entries(stmts)) {
      srCodes[k] = code(await sr(sql, params));
      ownerCodes[k] = await own(sql, params);
    }
    check('5: service_role cannot write the content tables at all (42501)', Object.values(srCodes).every((c) => c === '42501'), srCodes);
    check('5: the triggers bind even the owner (EMS09)', Object.values(ownerCodes).every((c) => c === 'EMS09'), ownerCodes);
    const srRest = {
      delFocus: code(await sr(`delete from public.my_season_focuses where id = $1`, [fid])),
      delNote: code(await sr(`delete from public.my_season_coach_observations where id = $1`, [oid])),
      truncFocus: code(await sr(`truncate public.my_season_focuses`)),
      truncNote: code(await sr(`truncate public.my_season_coach_observations`)),
      selFocus: code(await sr(`select count(*) from public.my_season_focuses`)),
      selNote: code(await sr(`select count(*) from public.my_season_coach_observations`)),
    };
    check('5: service_role: no delete or truncate, SELECT still works', JSON.stringify(srRest) === JSON.stringify({ delFocus: '42501', delNote: '42501', truncFocus: '42501', truncNote: '42501', selFocus: 'ok', selNote: 'ok' }), srRest);
    const srPrivs = (await db.query(`select c.relname t, string_agg(a.privilege_type, ',' order by a.privilege_type) p
       from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid in ('public.my_season_focuses'::regclass, 'public.my_season_coach_observations'::regclass, 'public.my_season_audit_events'::regclass)
        and a.grantee = 'service_role'::regrole group by 1`)).rows;
    check('5: the ACL gives service_role exactly SELECT on all three tables', srPrivs.length === 3 && srPrivs.every((r) => r.p === 'SELECT'), srPrivs);
    const statTargets = (await db.query(`select attname a, attstattarget t from pg_attribute where attnum > 0 and attrelid in ('public.my_season_focuses'::regclass, 'public.my_season_coach_observations'::regclass)
       and attname in ('body', 'category', 'title', 'why_it_matters', 'what_it_looks_like')`)).rows;
    check('5: planner statistics are off for every content column', statTargets.length === 5 && statTargets.every((r) => r.t === 0), statTargets);
    const imm = {
      ownerTitle: await own(`update public.my_season_focuses set title = 'Owner change' where id = $1`, [fid2]),
      ownerWithdrawKeepingText: await own(`update public.my_season_coach_observations set withdrawn_at = now(), withdrawn_by = $2 where id = $1`, [oid, P.coach]),
      ownerWithdraw: await own(`update public.my_season_coach_observations set withdrawn_at = now(), withdrawn_by = $2, body = null, category = null where id = $1`, [oid, P.coach]),
    };
    imm.ownerUnwithdraw = await own(`update public.my_season_coach_observations set withdrawn_at = null where id = $1`, [oid]);
    check('5: content is immutable apart from end / withdraw / FK set null, for the owner too (EMS09)',
      JSON.stringify(imm) === JSON.stringify({ ownerTitle: 'EMS09', ownerWithdrawKeepingText: 'EMS09', ownerWithdraw: 'ok', ownerUnwithdraw: 'EMS09' }), imm);

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

// ---------------------------------------------------------------------------
console.log('\n=== 7. Audited staff removal ===');
const REMOVALS = 'public.my_season_observation_staff_removals';
const NOTES = 'public.my_season_coach_observations';
const AUDIT = 'public.my_season_audit_events';
const staffRemove = (w, uid, obs, reason = 'Reported by the family') => w.user(uid, `select public.my_season_staff_remove_observation($1, $2) r`, [obs, reason]);
const staffList = (w, uid, player) => w.user(uid, `select public.my_season_staff_list_observations($1) r`, [player]);
const status = (r) => (r.ok ? r.rows[0].r.status : r.code);
async function addTeamCoach(w, name) {
  const uid = id();
  await w.db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `ms-${uid.slice(0, 8)}@example.test`]);
  await w.db.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [uid, name]);
  await w.db.query(`insert into public.coach_team (team_id, profile_id) values ($1, $2)`, [w.T, uid]);
  return uid;
}
async function addStaff(w, name) {
  const uid = id();
  await w.db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `ms-${uid.slice(0, 8)}@example.test`]);
  await w.db.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [uid, name]);
  await w.db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [uid]);
  return uid;
}
// As the superuser/owner, with the staff member's id forged into the claim and no role set.
async function asOwnerForging(w, uid, sql, params) {
  await w.db.exec('begin;');
  try {
    await w.db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await w.db.query(sql, params);
    await w.db.exec('commit;');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await w.db.exec('rollback;');
    return { ok: false, code: e.code, message: e.message, detail: e.detail, hint: e.hint, where: e.where };
  }
}
const ownerDo = (db, sql, params) => db.query(sql, params).then(() => ({ ok: true }), (e) => ({ ok: false, code: e.code, message: e.message, detail: e.detail, hint: e.hint }));
const noteRow = async (w, obs) => (await w.db.query(`select body, category, withdrawn_at, withdrawn_by, author_id, author_account_deleted_at from ${NOTES} where id = $1`, [obs])).rows[0];
const removalRow = async (w, obs) => (await w.db.query(`select * from ${REMOVALS} where observation_id = $1`, [obs])).rows[0];
const auditFor = async (w, obs, event) => (await w.db.query(`select actor_profile_id, actor_role, player_id from ${AUDIT} where subject_id = $1 and event = $2`, [obs, event])).rows;
// Every text-like column of every public table, as text.
async function hitsEverywhere(db, marker) {
  const tables = (await db.query(`select tablename t from pg_tables where schemaname = 'public'`)).rows.map((r) => r.t);
  const hits = [];
  for (const t of tables) if (Number((await db.query(`select count(*) n from public."${t}" x where x::text like $1`, [`%${marker}%`])).rows[0].n)) hits.push(t);
  return hits;
}
{
  const w = await world();
  const { P, child1, db } = w;
  try {
    const NOTE_MARK = `ZQNOTE${crypto.randomBytes(5).toString('hex')}`, REASON_MARK = `ZQREASON${crypto.randomBytes(5).toString('hex')}`;
    const obs = (await w.addObs(P.coach, child1, { body: `${NOTE_MARK} kept going after the goal.`, category: 'spoke_up' })).rows[0].id;
    const r = await staffRemove(w, P.staff, obs, `  ${REASON_MARK} family asked  `);
    check('7: staff removal returns exactly {"status":"removed"}', r.ok && JSON.stringify(r.rows[0].r) === '{"status": "removed"}' || JSON.stringify(r.rows?.[0]?.r) === '{"status":"removed"}', r);
    const row = await noteRow(w, obs);
    check('7: as superuser the row has no text or category, and records the staff member', row.body === null && row.category === null && row.withdrawn_at !== null && row.withdrawn_by === P.staff && row.author_id === P.coach, row);
    const rem = await removalRow(w, obs);
    check('7: one removal row with the trimmed reason, the actor and no marker', rem?.reason === `${REASON_MARK} family asked` && rem.player_id === child1 && rem.removed_by === P.staff && rem.removed_by_account_deleted_at === null && rem.removed_at !== null, rem);
    const ev = await auditFor(w, obs, 'observation_staff_removed');
    check('7: exactly one audit event, staff actor and role', ev.length === 1 && ev[0].actor_profile_id === P.staff && ev[0].actor_role === 'staff' && ev[0].player_id === child1, ev);
    check('7: the audit columns are exactly the content-free set', (await db.query(`select string_agg(column_name, ',' order by column_name) c from information_schema.columns where table_schema='public' and table_name='my_season_audit_events'`)).rows[0].c === 'actor_profile_id,actor_role,event,id,occurred_at,player_id,subject_id');
    check('7: note marker is nowhere in any public table', (await hitsEverywhere(db, NOTE_MARK)).length === 0, await hitsEverywhere(db, NOTE_MARK));
    const reasonHits = await hitsEverywhere(db, REASON_MARK);
    check('7: reason marker is only in the removals table', reasonHits.length === 1 && reasonHits[0] === 'my_season_observation_staff_removals', reasonHits);

    const gv = await w.view(P.g1, child1), ov = await w.view(P.parentCoach, child1), av = await w.view(P.coach, child1);
    check('7: gone for the guardian and for other coaches', gv.observations.length === 0 && ov.observations.length === 0, [gv.observations, ov.observations]);
    const mine = av.observations.find((o) => o.id === obs);
    check('7: its author gets a metadata-only row with removedByStaff', mine?.removedByStaff === true && mine.withdrawn === true && mine.body === null && mine.category === null && mine.mine === true, mine);
    check('7: nothing returned to anyone holds the note or the reason', ![gv, ov, av].some((v) => JSON.stringify(v).includes(NOTE_MARK) || JSON.stringify(v).includes(REASON_MARK)));
    const again = await w.withdraw(P.coach, obs);
    check('7: the author cannot withdraw it again (EMS03), and nothing changes', code(again) === 'EMS03' && (await noteRow(w, obs)).withdrawn_by === P.staff && (await auditFor(w, obs, 'observation_withdrawn')).length === 0, again);

    const retry = await staffRemove(w, P.staff, obs, `${REASON_MARK} retry`);
    const other = await addStaff(w, 'Second Staff');
    const diff = await staffRemove(w, other, obs, 'A different reason entirely');
    check('7: retry and a different reason or staff member: already_removed', status(retry) === 'already_removed' && status(diff) === 'already_removed', [retry, diff]);
    check('7: no new rows; the first reason and actor stay', (await removalRow(w, obs)).reason === `${REASON_MARK} family asked` && (await removalRow(w, obs)).removed_by === P.staff
      && (await auditFor(w, obs, 'observation_staff_removed')).length === 1 && await w.n(`select count(*) n from ${REMOVALS}`) === 1);

    const restore = {
      body: await ownerDo(db, `update ${NOTES} set body = 'Restored text of twenty chars.', category = 'spoke_up' where id = $1`, [obs]),
      unwithdraw: await ownerDo(db, `update ${NOTES} set withdrawn_at = null where id = $1`, [obs]),
    };
    check('7: nothing can restore content, even the owner (EMS09)', restore.body.code === 'EMS09' && restore.unwithdraw.code === 'EMS09', restore);
    const noTrigger = await (async () => {
      await db.exec('begin;');
      try {
        await db.exec(`alter table ${NOTES} disable trigger user;`);
        await db.query(`update ${NOTES} set body = 'Restored text of twenty chars.' where id = $1`, [obs]);
        return 'updated';
      } catch (e) { return e.code; } finally { await db.exec('rollback;'); }
    })();
    check('7: with triggers off the CHECK constraint still refuses text on a removed row', noTrigger === '23514', noTrigger);

    // Privileges on the removals table.
    const sr = (sql, p) => w.as('service_role', null, sql, p);
    const anon = (sql, p) => w.as('anon', null, sql, p);
    const direct = {};
    for (const [label, run] of [['auth', (s, p) => w.user(P.staff, s, p)], ['sr', sr], ['anon', anon]]) {
      direct[label] = [
        code(await run(`select reason from ${REMOVALS}`)), code(await run(`select count(*) from ${REMOVALS}`)),
        code(await run(`update ${REMOVALS} set reason = 'Changed'`)), code(await run(`delete from ${REMOVALS}`)),
        code(await run(`truncate ${REMOVALS}`)),
        code(await run(`insert into ${REMOVALS} (observation_id, player_id, removed_by, reason) values ($1, $2, $3, 'Reason')`, [obs, child1, P.staff])),
      ].join();
    }
    check('7: authenticated, service_role and anon cannot read or alter removals (42501)', Object.values(direct).every((x) => x.split(',').every((c) => c === '42501')), direct);
    const own = {
      upd: await ownerDo(db, `update ${REMOVALS} set reason = 'Changed' where observation_id = $1`, [obs]),
      nullReason: await ownerDo(db, `update ${REMOVALS} set reason = null where observation_id = $1`, [obs]),
      actor: await ownerDo(db, `update ${REMOVALS} set removed_by = null where observation_id = $1`, [obs]),
      del: await ownerDo(db, `delete from ${REMOVALS} where observation_id = $1`, [obs]),
      trunc: await ownerDo(db, `truncate ${REMOVALS}`),
    };
    check('7: removals are append-only for the owner too (EMS09, no row echoed)', Object.values(own).every((o) => o.code === 'EMS09' && !o.detail && !o.hint), own);
    const obs2 = (await w.addObs(P.coach, child1)).rows[0].id;
    const shapes = {
      nullReason: await ownerDo(db, `insert into ${REMOVALS} (observation_id, player_id, removed_by, reason) values ($1, $2, $3, null)`, [obs2, child1, P.staff]),
      shortReason: await ownerDo(db, `insert into ${REMOVALS} (observation_id, player_id, removed_by, reason) values ($1, $2, $3, 'x')`, [obs2, child1, P.staff]),
      nullActor: await ownerDo(db, `insert into ${REMOVALS} (observation_id, player_id, reason) values ($1, $2, $3)`, [obs2, child1, REASON_MARK]),
      activeNote: await ownerDo(db, `insert into ${REMOVALS} (observation_id, player_id, removed_by, reason) values ($1, $2, $3, $4)`, [obs2, child1, P.staff, REASON_MARK]),
      nullWhen: await ownerDo(db, `insert into ${REMOVALS} (observation_id, player_id, removed_by, removed_at, reason) values ($1, $2, $3, null, $4)`, [obs, child1, P.staff, REASON_MARK]),
    };
    check('7: a bad direct insert gets the fixed EMS09 with no row in the error', Object.values(shapes).every((o) => o.code === 'EMS09' && o.message === 'my_season_insert_shape' && !o.detail && !JSON.stringify(o).includes(REASON_MARK)), shapes);
    check('7: statistics are off for the reason, and no index covers it', (await db.query(`select attstattarget t from pg_attribute where attrelid = '${REMOVALS}'::regclass and attname = 'reason'`)).rows[0].t === 0
      && await w.n(`select count(*) n from pg_indexes where schemaname = 'public' and tablename = 'my_season_observation_staff_removals' and indexdef ~ '\\mreason\\M'`) === 0);
    const readers = (await db.query(`select p.proname n, p.prosrc s from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%my_season_observation_staff_removals%'`)).rows;
    const leaks = readers.filter((f) => /\.reason\b/.test(f.s) || /select[^;]*\breason\b/i.test(f.s)).map((f) => f.n);
    check('7: no function reads the reason (only the removal RPC mentions it, to insert)', readers.some((f) => f.n === 'my_season_for_player') && leaks.length === 0, leaks);
    const exec = (await db.query(`select r, f, has_function_privilege(r, f, 'execute') x from unnest(array['anon','service_role','public','authenticated']) r
       cross join unnest(array['public.my_season_staff_remove_observation(uuid, text)', 'public.my_season_staff_list_observations(uuid)']) f`)).rows;
    check('7: both staff RPCs: EXECUTE for authenticated only', exec.every((e) => e.x === (e.r === 'authenticated')), exec);
    const defs = (await db.query(`select proname n, prosecdef d, proconfig c from pg_proc where pronamespace = 'public'::regnamespace and proname in ('my_season_staff_remove_observation', 'my_season_staff_list_observations', 'my_season_require_staff')`)).rows;
    check('7: SECURITY DEFINER with a pinned search_path', defs.length === 3 && defs.every((d) => d.d && String(d.c).includes('search_path=public, pg_temp')), defs);
    check('7: the helper is not callable by authenticated', code(await w.user(P.staff, `select public.my_season_require_staff()`)) === '42501');
    const args = (await db.query(`select pg_get_function_identity_arguments('public.my_season_staff_remove_observation(uuid, text)'::regprocedure) a`)).rows[0].a;
    check('7: no argument names the staff member', args === 'p_observation_id uuid, p_reason text', args);
  } catch (e) {
    check('7: core', false, e.stack);
  }
  await db.close();
}
{
  // Whatever happened to the coach, and whatever the flag says.
  const w = await world();
  const { P, child1, db } = w;
  try {
    const mk = async (name) => { const c = await addTeamCoach(w, name); return { c, o: (await w.addObs(c, child1)).rows[0].id }; };
    const left = await mk('Left Coach'), review = await mk('Review Coach'), gone = await mk('Gone Coach'), offNote = await mk('Off Coach');
    await db.query(`update public.coach_team set ended_at = now(), ended_by = $1, end_reason = 'Left' where profile_id = $2`, [P.staff, left.c]);
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason) values ($1, 'coach_authored_player_records')`, [review.c]);
    const d = await deleteAccount(w, gone.c);
    check('7b: setup: the third coach really deleted their account', d.ok && d.result.canDeleteIdentity === true && (await noteRow(w, gone.o)).author_id === null, d);
    for (const [label, n] of [['left the team', left], ['under deletion review', review], ['deleted', gone]]) {
      const r = await staffRemove(w, P.staff, n.o);
      const row = await noteRow(w, n.o);
      check(`7b: works when the coach has ${label}`, status(r) === 'removed' && row.body === null && row.category === null && row.withdrawn_by === P.staff && (await auditFor(w, n.o, 'observation_staff_removed')).length === 1, [r, row]);
    }
    await db.query(`update public.season_feature_global set kill_switch = true`);
    const off = await staffRemove(w, P.staff, offNote.o);
    check('7b: works with the feature switched off', status(off) === 'removed' && (await noteRow(w, offNote.o)).body === null, off);
    const offList = await staffList(w, P.staff, child1);
    check('7b: the list works with the feature off', offList.ok && offList.rows[0].r.observations.length === 4, offList);
  } catch (e) {
    check('7b: coach states', false, e.stack);
  }
  await db.close();
}
{
  // Refusals.
  const w = await world();
  const { P, child1, db } = w;
  try {
    const obs = (await w.addObs(P.coach, child1)).rows[0].id;
    const unknown = id();
    const removedStaff = await addStaff(w, 'Removed Staff');
    await db.query(`delete from public.staff_accounts where profile_id = $1`, [removedStaff]);
    const reviewStaff = await addStaff(w, 'Review Staff');
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason) values ($1, 'coach_authored_player_records')`, [reviewStaff]);
    const refused = { guardian: P.g1, coach: P.coach2, author: P.coach, stranger: P.stranger, signedOut: null, removedStaff, reviewStaff };
    const same = {};
    for (const [label, uid] of Object.entries(refused)) {
      const a = await staffRemove(w, uid, obs), b = await staffRemove(w, uid, unknown), c = await staffList(w, uid, child1), e = await staffList(w, uid, unknown);
      same[label] = [a, b, c, e].every((x) => x.code === 'EMS10' && x.message === 'my_season_staff_only' && !x.detail && !x.hint);
    }
    check('7c: non-staff, removed staff and staff under review: one identical EMS10 whether or not the id exists', Object.values(same).every(Boolean), same);
    const anon = await w.as('anon', P.staff, `select public.my_season_staff_remove_observation($1, 'A reason')`, [obs]);
    const sr = await w.as('service_role', P.staff, `select public.my_season_staff_remove_observation($1, 'A reason')`, [obs]);
    const srList = await w.as('service_role', P.staff, `select public.my_season_staff_list_observations($1)`, [child1]);
    check('7c: anon and service_role with a forged staff sub have no EXECUTE (42501)', [anon, sr, srList].every((x) => code(x) === '42501'), [anon, sr, srList]);
    const forged = await asOwnerForging(w, P.staff, `select public.my_season_staff_remove_observation($1, 'A reason')`, [obs]);
    const forgedRole = await w.as('postgres', P.staff, `select public.my_season_staff_remove_observation($1, 'A reason')`, [obs]);
    check('7c: the owner with a forged staff sub is refused by the role check (EMS10)', code(forged) === 'EMS10' && code(forgedRole) === 'EMS10', [forged, forgedRole]);
    check('7c: after all of that the note is untouched', (await noteRow(w, obs)).body !== null && await w.n(`select count(*) n from ${REMOVALS}`) === 0
      && await w.n(`select count(*) n from ${AUDIT} where actor_role = 'staff'`) === 0);

    const MARK = `ZQBAD${crypto.randomBytes(4).toString('hex')}`;
    const bad = { blank: '', spaces: '     ', short: 'ab', nul: null, long: `${MARK}${'x'.repeat(500)}` };
    const results2 = {};
    for (const [k, v] of Object.entries(bad)) results2[k] = await staffRemove(w, P.staff, obs, v);
    check('7c: blank, short, null and long reasons: EMS11, fixed text, no echo', Object.values(results2).every((x) => x.code === 'EMS11' && x.message === 'my_season_invalid_reason' && !x.detail && !x.hint && !JSON.stringify(x).includes(MARK)), results2);
    const nul = await staffRemove(w, P.staff, obs, `${MARK}\u0000 tail`);
    check('7c: a NUL in the reason never reaches a row and is not echoed', !nul.ok && !JSON.stringify(nul).includes(MARK), nul);
    check('7c: exactly 3 and exactly 500 characters are accepted (boundary, on separate notes)',
      status(await staffRemove(w, P.staff, (await w.addObs(P.coach, child1)).rows[0].id, 'abc')) === 'removed'
        && status(await staffRemove(w, P.staff, (await w.addObs(P.coach, child1)).rows[0].id, 'y'.repeat(500))) === 'removed');
    check('7c: refused reasons wrote nothing for that note', (await noteRow(w, obs)).body !== null && !(await removalRow(w, obs)));
    const nf = await staffRemove(w, P.staff, unknown);
    check('7c: unknown id for real staff: the fixed not-found code', code(nf) === 'EMS08' && nf.message === 'my_season_not_found', nf);
    check('7c: unknown player on the list: not found, no audit', code(await staffList(w, P.staff, unknown)) === 'EMS08' && await w.n(`select count(*) n from ${AUDIT} where event = 'observation_staff_viewed'`) === 0);

    // Already withdrawn by the coach.
    const wd = (await w.addObs(P.coach, child1)).rows[0].id;
    await w.withdraw(P.coach, wd);
    const already = await staffRemove(w, P.staff, wd);
    const wr = await noteRow(w, wd);
    check('7c: a coach-withdrawn note: already_removed, no removal row, no staff event, the coach stays recorded',
      status(already) === 'already_removed' && !(await removalRow(w, wd)) && (await auditFor(w, wd, 'observation_staff_removed')).length === 0 && wr.withdrawn_by === P.coach, [already, wr]);
    const av = await w.view(P.coach, child1);
    check('7c: the author still sees a plain withdrawal there', av.observations.find((o) => o.id === wd)?.removedByStaff === false);
    const noop = await w.withdraw(P.coach, wd);
    check('7c: the coach\'s own repeat withdrawal stays a silent no-op', noop.ok, noop);
  } catch (e) {
    check('7c: refusals', false, e.stack);
  }
  await db.close();
}
{
  // The staff list.
  const w = await world();
  const { P, child1, child2, db } = w;
  try {
    const leaving = await addTeamCoach(w, 'Leaving Coach');
    const a = (await w.addObs(P.coach, child1, { body: 'ZQACTIVE active note text stays.', category: 'kept_going' })).rows[0].id;
    await db.query(`select pg_sleep(0.01)`);
    const b = (await w.addObs(P.coach, child1, { body: 'ZQWITHDRAWN note text is erased.' })).rows[0].id;
    await db.query(`select pg_sleep(0.01)`);
    const c = (await w.addObs(P.coach, child1, { body: 'ZQREMOVED note text is erased too.' })).rows[0].id;
    await db.query(`select pg_sleep(0.01)`);
    const d = (await w.addObs(leaving, child1)).rows[0].id;
    await w.withdraw(P.coach, b);
    await staffRemove(w, P.staff, c);
    await db.query(`update public.coach_team set ended_at = now(), ended_by = $1, end_reason = 'Left' where profile_id = $2`, [P.staff, leaving]);
    const before = await w.n(`select count(*) n from ${AUDIT} where event = 'observation_staff_viewed'`);
    const res = await staffList(w, P.staff, child1);
    const list = res.rows?.[0].r.observations ?? [];
    check('7d: newest first', JSON.stringify(list.map((o) => o.id)) === JSON.stringify([d, c, b, a]), list);
    const by = Object.fromEntries(list.map((o) => [o.id, o]));
    check('7d: active note: text, category and state', by[a].state === 'active' && by[a].body === 'ZQACTIVE active note text stays.' && by[a].category === 'kept_going' && by[a].coachName === 'Name coach' && by[a].formerCoach === false, by[a]);
    check('7d: withdrawn and removed: metadata only, no such keys at all', by[b].state === 'withdrawn' && by[c].state === 'removed'
      && [b, c].every((k) => Object.keys(by[k]).sort().join() === 'coachName,createdAt,formerCoach,id,state'), [by[b], by[c]]);
    check('7d: a coach who left is flagged', by[d].formerCoach === true, by[d]);
    check('7d: no erased text and no reason in the answer', !/ZQWITHDRAWN|ZQREMOVED|Reported by the family/.test(JSON.stringify(res.rows[0].r)));
    const ev = (await db.query(`select subject_id, actor_profile_id, actor_role, player_id from ${AUDIT} where event = 'observation_staff_viewed'`)).rows;
    check('7d: one content-free audit event per lookup, subject = the player', before === 0 && ev.length === 1 && ev[0].subject_id === child1 && ev[0].player_id === child1 && ev[0].actor_profile_id === P.staff && ev[0].actor_role === 'staff', ev);
    await staffList(w, P.staff, child1);
    check('7d: a second lookup is a second event', await w.n(`select count(*) n from ${AUDIT} where event = 'observation_staff_viewed'`) === 2);
    for (let i = 0; i < 101; i++) await w.addObs(P.coach, child2, { body: `Note number ${i} for the list limit.` });
    check('7d: at most 100 notes', (await staffList(w, P.staff, child2)).rows[0].r.observations.length === 100);
  } catch (e) {
    check('7d: list', false, e.stack);
  }
  await db.close();
}
{
  // Erasure and account deletion.
  const w = await world();
  const { P, child1, child3, db } = w;
  try {
    const staffB = await addStaff(w, 'Leaving Staff');
    const o1 = (await w.addObs(P.coach, child1)).rows[0].id;
    const o3 = (await w.addObs(P.coach2, child3)).rows[0].id;
    await staffRemove(w, staffB, o1, 'Reason about the first note');
    await staffRemove(w, staffB, o3, 'Reason about the third child');
    await db.query(`delete from public.staff_accounts where profile_id = $1`, [staffB]);
    const del = await ownerDo(db, `delete from public.profiles where id = $1`, [staffB]);
    const rem = await removalRow(w, o1), row = await noteRow(w, o1);
    check('7e: deleting the staff account: actor null + marker, reason kept, note still erased', del.ok && rem.removed_by === null && rem.removed_by_account_deleted_at !== null && rem.reason === 'Reason about the first note' && row.withdrawn_by === null && row.body === null, [del, rem, row]);
    check('7e: the audit actor is cleared', (await auditFor(w, o1, 'observation_staff_removed'))[0].actor_profile_id === null);
    check('7e: the list still answers, with the note as removed', (await staffList(w, P.staff, child1)).rows[0].r.observations.find((o) => o.id === o1)?.state === 'removed');
    const er = await db.query(`select public.erase_player_and_related_data($1)`, [child3]).then(() => 'ok', (e) => e.message);
    check('7e: child erasure removes the note and its removal row; others stay', er === 'ok' && !(await removalRow(w, o3)) && !(await noteRow(w, o3)) && !!(await removalRow(w, o1)), er);
    check('7e: no email in any My Season table', (await emailHitsInNewTables(db)).length === 0 || (await emailHitsInNewTables(db)).every((h) => !h.includes('removals')), await emailHitsInNewTables(db));
  } catch (e) {
    check('7e: deletion', false, e.stack);
  }
  await db.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} My Season checks passed`);
process.exit(failed.length ? 1 : 0);
