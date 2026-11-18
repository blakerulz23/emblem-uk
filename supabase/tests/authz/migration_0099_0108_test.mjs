// Migrations 0099 (season feature states) and 0108 (My Season): apply on top
// of the full chain, re-run refusal, preconditions, the read-only pre/post
// checks, rollback (0108 then 0099) to the exact earlier catalogs, the 0099
// rollback refusing while 0108 is applied, and re-apply after rollback.
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
const M0099 = migration('0099');
const M0108 = migration('0108');
const RB0099 = read('rollback/0099_rollback.sql');
const RB0108 = read('rollback/0108_rollback.sql');
const PRE = read('verification/0108_precheck.sql');
const POST = read('verification/0108_postcheck.sql');
const ACK_0099 = ['emblem.acknowledge_0099_rollback', 'drop season feature states'];
const ACK_0108 = ['emblem.acknowledge_0108_rollback', 'drop my season data'];
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const catalogDiff = (a, b) => { const d = diffCatalog(a, b); return [...d.added, ...d.removed, ...d.changed]; };

// Every migration in filename order except those in `skip`, through `through`.
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
async function apply(db, sql) {
  try { await db.exec(sql); return null; } catch (e) { await db.exec('rollback;').catch(() => {}); return e.message; }
}
async function rollBack(db, sql, ack) {
  await db.exec('begin;');
  try {
    if (ack) await db.query(`select set_config($1, $2, true)`, ack);
    await db.exec(sql);
    return null;
  } catch (e) {
    await db.exec('rollback;').catch(() => {});
    return e.message;
  }
}
// Runs a verification file; returns its one row.
async function verification(db, sql) {
  const res = await db.exec(sql);
  const withRows = res.filter((r) => r.rows && r.rows.length);
  if (withRows.length !== 1 || withRows[0].rows.length !== 1) throw new Error(`expected one row, got ${withRows.length} result sets`);
  return withRows[0].rows[0];
}
async function dataHash(db) {
  const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
  const parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  return parts.join(';');
}

// Fictional rows in the tables the migrations touch or reference.
async function fixtures(db) {
  const g = id(), c = id(), season = id(), club = id(), team = id(), player = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'mg@example.test'), ($2, 'mc@example.test')`, [g, c]);
  await db.query(`insert into profiles (id, display_name) values ($1, 'Fictional Parent'), ($2, 'Fictional Coach')`, [g, c]);
  await db.query(`insert into seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await db.query(`insert into clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await db.query(`insert into teams (id, club_id, name, season_id) values ($1, $2, 'U10', $3)`, [team, club, season]);
  await db.query(`insert into players (id, name, team_id) values ($1, 'Fictional Player', $2)`, [player, team]);
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [player, g]);
  await db.query(`insert into coach_team (team_id, profile_id) values ($1, $2)`, [team, c]);
  return { g, c, team, player };
}

// --- reference: the full chain in filename order ------------------------------------------
const ref = await readyDatabase();
const finalCatalog = await snapshotCatalog(ref);
await ref.close();

// --- apply on top of the full chain (everything but 0099/0108) ------------------------------
{
  const db = await readyDatabase({ skip: ['0099', '0108'] });
  try {
    const fx = await fixtures(db);
    const pre0099 = await snapshotCatalog(db);
    const dataBefore = await dataHash(db);

    const pre = await verification(db, PRE);
    check('pre-check: every guard true before applying', pre.guard_0099_not_applied && pre.guard_0108_not_applied && pre.has_0088_0089_lockdown
      && pre.has_0097 && pre.has_0098 && pre.has_child_erasure && pre.legacy_season_focus_present && Number(pre.teams_count) === 1, pre);
    check('pre-check is read-only (no catalog or data change)', catalogDiff(pre0099, await snapshotCatalog(db)).length === 0 && (await dataHash(db)) === dataBefore);
    const writeInPre = await apply(db, PRE.replace('select\n', 'insert into public.clubs (name) values (\'x\');\nselect\n'));
    check('pre-check runs in a read-only transaction (a write inside it is refused)', writeInPre !== null && /read-only/.test(writeInPre), writeInPre);

    const early = await apply(db, M0108);
    check('0108 refuses without 0099, changing nothing', early?.includes('0108 refused') && early.includes('0099') && catalogDiff(pre0099, await snapshotCatalog(db)).length === 0, early);

    check('0099 applies after 0107 (production order)', (await apply(db, M0099)) === null);
    const post0099 = await snapshotCatalog(db);
    const again = await apply(db, M0099);
    check('0099 re-run refuses, changing nothing', again?.includes('0099 refused') && again.includes('already applied') && catalogDiff(post0099, await snapshotCatalog(db)).length === 0, again);
    check('0099 seeds exactly one global row with kill_switch = true and no team rows',
      JSON.stringify((await db.query(`select id, kill_switch, updated_by from season_feature_global`)).rows) === '[{"id":true,"kill_switch":true,"updated_by":null}]'
        && Number((await db.query(`select count(*) n from season_feature_team_states`)).rows[0].n) === 0);

    check('0108 applies', (await apply(db, M0108)) === null);
    const post0108 = await snapshotCatalog(db);
    const again8 = await apply(db, M0108);
    check('0108 re-run refuses, changing nothing', again8?.includes('0108 refused') && again8.includes('already applied') && catalogDiff(post0108, await snapshotCatalog(db)).length === 0, again8);
    check('0099 then 0108 on top of the full chain equals the filename-order catalog', catalogDiff(finalCatalog, post0108).length === 0, catalogDiff(finalCatalog, post0108));

    const post = await verification(db, POST);
    const bools = Object.entries(post).filter(([, v]) => typeof v === 'boolean' && v === false && true).map(([k]) => k).filter((k) => k !== 'kill_switch_on');
    check('post-check: every boolean true', bools.length === 0, bools);
    check('post-check: fail-closed flag state and empty tables straight after applying', post.kill_switch_on === true && Number(post.global_rows) === 1
      && Number(post.team_states_count) === 0 && Number(post.team_states_enabled) === 0 && Number(post.focus_rows) === 0 && Number(post.observation_rows) === 0 && Number(post.audit_rows) === 0
      && Number(post.staff_removal_rows) === 0 && Number(post.staff_removals_missing_note) === 0 && Number(post.staff_removals_note_not_erased) === 0, post);
    check('post-check is read-only', catalogDiff(post0108, await snapshotCatalog(db)).length === 0);

    // The post-check catches grant regressions (each applied and revoked again).
    const regressions = [
      ['grant select on public.my_season_focuses to authenticated', 'revoke select on public.my_season_focuses from authenticated', 'authenticated_no_content_table_privileges'],
      ['grant select on public.my_season_coach_observations to public', 'revoke select on public.my_season_coach_observations from public', 'public_no_table_privileges'],
      ['grant execute on function public.my_season_focuses_before_update() to public', 'revoke execute on function public.my_season_focuses_before_update() from public', 'owner_only_functions_locked'],
      ['grant execute on function public.my_season_audit_refuse_truncate() to authenticated', 'revoke execute on function public.my_season_audit_refuse_truncate() from authenticated', 'owner_only_functions_locked'],
      ['grant execute on function public.my_season_trim(text) to service_role', 'revoke execute on function public.my_season_trim(text) from service_role', 'owner_only_functions_locked'],
      ['grant execute on function public.my_season_is_guardian(uuid, uuid) to anon', 'revoke execute on function public.my_season_is_guardian(uuid, uuid) from anon', 'owner_only_functions_locked'],
      ['grant execute on function public.my_season_for_player(uuid) to public', 'revoke execute on function public.my_season_for_player(uuid) from public', 'public_no_execute'],
      ['grant insert on public.my_season_coach_observations to service_role', 'revoke insert on public.my_season_coach_observations from service_role', 'service_role_content_select_only'],
      ['grant update on public.my_season_focuses to service_role', 'revoke update on public.my_season_focuses from service_role', 'service_role_content_select_only'],
      ['grant maintain on public.my_season_focuses to service_role', 'revoke maintain on public.my_season_focuses from service_role', 'service_role_content_select_only'],
      ['revoke select on public.my_season_focuses from service_role', 'grant select on public.my_season_focuses to service_role', 'service_role_content_select_only'],
      ['alter table public.my_season_coach_observations disable trigger my_season_observations_before_update', 'alter table public.my_season_coach_observations enable trigger my_season_observations_before_update', 'triggers_enabled'],
      ['alter table public.my_season_audit_events disable trigger my_season_audit_before_delete', 'alter table public.my_season_audit_events enable trigger my_season_audit_before_delete', 'triggers_enabled'],
      ['alter table public.my_season_coach_observations alter column body set statistics 100', 'alter table public.my_season_coach_observations alter column body set statistics 0', 'content_statistics_off'],
      ['alter table public.my_season_focuses alter column title set statistics -1', 'alter table public.my_season_focuses alter column title set statistics 0', 'content_statistics_off'],
      ['create index zz_body on public.my_season_coach_observations (body)', 'drop index public.zz_body', 'content_not_indexed'],
      ['create index zz_cat on public.my_season_coach_observations (player_id) where category is not null', 'drop index public.zz_cat', 'content_not_indexed'],
      ['create index zz_reason on public.my_season_observation_staff_removals (reason)', 'drop index public.zz_reason', 'content_not_indexed'],
      ['alter table public.my_season_observation_staff_removals alter column reason set statistics 100', 'alter table public.my_season_observation_staff_removals alter column reason set statistics 0', 'content_statistics_off'],
      ['grant select on public.my_season_observation_staff_removals to service_role', 'revoke select on public.my_season_observation_staff_removals from service_role', 'staff_removals_owner_only'],
      ['grant select (reason) on public.my_season_observation_staff_removals to authenticated', 'revoke select (reason) on public.my_season_observation_staff_removals from authenticated', 'staff_removals_owner_only'],
      ['create policy zz_p on public.my_season_observation_staff_removals for select to authenticated using (true)', 'drop policy zz_p on public.my_season_observation_staff_removals', 'staff_removals_no_policy'],
      ['alter table public.my_season_observation_staff_removals disable row level security', 'alter table public.my_season_observation_staff_removals enable row level security', 'rls_enabled'],
      ['alter table public.my_season_observation_staff_removals disable trigger my_season_staff_removals_before_update', 'alter table public.my_season_observation_staff_removals enable trigger my_season_staff_removals_before_update', 'triggers_enabled'],
      ['grant execute on function public.my_season_staff_remove_observation(uuid, text) to service_role', 'revoke execute on function public.my_season_staff_remove_observation(uuid, text) from service_role', 'staff_rpcs_authenticated_only'],
      ['grant execute on function public.my_season_staff_list_observations(uuid) to anon', 'revoke execute on function public.my_season_staff_list_observations(uuid) from anon', 'staff_rpcs_authenticated_only'],
      ['revoke execute on function public.my_season_staff_list_observations(uuid) from authenticated', 'grant execute on function public.my_season_staff_list_observations(uuid) to authenticated', 'staff_rpcs_authenticated_only'],
      ['grant execute on function public.my_season_require_staff() to authenticated', 'revoke execute on function public.my_season_require_staff() from authenticated', 'owner_only_functions_locked'],
      ['alter function public.my_season_staff_remove_observation(uuid, text) security invoker', 'alter function public.my_season_staff_remove_observation(uuid, text) security definer', 'staff_rpcs_definer_safe_path'],
      ['alter function public.my_season_staff_list_observations(uuid) reset search_path', 'alter function public.my_season_staff_list_observations(uuid) set search_path = public, pg_temp', 'staff_rpcs_definer_safe_path'],
      [`alter table public.my_season_coach_observations drop constraint my_season_coach_observations_content_state, add constraint my_season_coach_observations_content_state check (
         (withdrawn_at is null and category is not null
          and category in ('lifted_the_team', 'kept_going', 'tried_something_new', 'helped_someone_belong', 'spoke_up', 'came_back_stronger')
          and body is not null and body = btrim(body) and char_length(body) between 20 and 500)
         or (withdrawn_at is not null and body is null and category is null))`,
       `alter table public.my_season_coach_observations drop constraint my_season_coach_observations_content_state, add constraint my_season_coach_observations_content_state check (
         (withdrawn_at is null and category is not null
          and category in ('lifted_the_team', 'kept_going', 'tried_something_new', 'helped_someone_belong', 'spoke_up', 'came_back_stronger')
          and body is not null and body = btrim(body) and char_length(body) between 20 and 160)
         or (withdrawn_at is not null and body is null and category is null))`, 'observation_content_constraint_definition_ok'],
    ];
    const caught = [];
    for (const [grant, revoke, column] of regressions) {
      await db.exec(grant);
      const r = await verification(db, POST);
      await db.exec(revoke);
      caught.push(r[column] === false ? 'caught' : `missed ${column} after: ${grant}`);
    }
    check('post-check flags grant, trigger, statistics, index and constraint-definition regressions', caught.every((c) => c === 'caught'), caught);
    check('…and is clean again once each grant is revoked', catalogDiff(post0108, await snapshotCatalog(db)).length === 0
      && Object.entries(await verification(db, POST)).filter(([k, v]) => v === false && k !== 'kill_switch_on').length === 0);

    // Data in, so the post-check counts and the rollback with data are exercised.
    await db.query(`update season_feature_global set kill_switch = false`);
    await db.query(`insert into season_feature_team_states (team_id, state) values ($1, 'pilot')`, [fx.team]);
    await db.exec('begin; set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [fx.g]);
    await db.query(`select my_season_set_focus($1, 'Fictional focus', 'Why it matters', 'What it looks like', current_date, $2)`, [fx.player, id()]);
    await db.exec('commit; begin; set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [fx.c]);
    const obsId = (await db.query(`select my_season_add_observation($1, 'spoke_up', 'Spoke up for a teammate at half time.', $2) id`, [fx.player, id()])).rows[0].id;
    await db.exec('commit;');
    const post2 = await verification(db, POST);
    check('post-check counts after a pilot', post2.kill_switch_on === false && Number(post2.team_states_enabled) === 1 && Number(post2.focus_rows) === 1
      && Number(post2.observation_rows) === 1 && Number(post2.audit_rows) === 2, post2);
    check('post-check: withdrawal columns: nothing withdrawn yet, no bad rows', Number(post2.withdrawn_rows) === 0 && Number(post2.withdrawn_rows_with_content) === 0 && Number(post2.active_rows_without_content) === 0, post2);
    await db.exec('begin; set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [fx.c]);
    await db.query(`select my_season_withdraw_observation($1)`, [obsId]);
    await db.exec('commit;');
    const postW = await verification(db, POST);
    check('post-check after a withdrawal: 1 withdrawn row, 0 with content, 0 active without content, audit +1',
      Number(postW.withdrawn_rows) === 1 && Number(postW.withdrawn_rows_with_content) === 0 && Number(postW.active_rows_without_content) === 0 && Number(postW.audit_rows) === 3, postW);
    check('post-check returns counts and booleans only (never note text)', Object.values(postW).every((v) => typeof v === 'boolean' || /^\d+$/.test(String(v))), postW);

    // A staff removal, so the counts and the rollback cover the removals table.
    const staffUser = id();
    await db.query(`insert into auth.users (id, email) values ($1, 'mstaff@example.test')`, [staffUser]);
    await db.query(`insert into profiles (id, display_name) values ($1, 'Fictional Staff')`, [staffUser]);
    await db.query(`insert into staff_accounts (profile_id) values ($1)`, [staffUser]);
    await db.exec('begin; set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [fx.c]);
    const staffObs = (await db.query(`select my_season_add_observation($1, 'kept_going', 'Kept going after the second goal went in.', $2) id`, [fx.player, id()])).rows[0].id;
    await db.exec('commit; begin; set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [staffUser]);
    await db.query(`select my_season_staff_remove_observation($1, 'Reported by the family')`, [staffObs]);
    await db.exec('commit;');
    const postS = await verification(db, POST);
    check('post-check after a staff removal: 1 removal row, its note erased, none missing',
      Number(postS.staff_removal_rows) === 1 && Number(postS.staff_removals_missing_note) === 0 && Number(postS.staff_removals_note_not_erased) === 0 && Number(postS.withdrawn_rows_with_content) === 0, postS);
    check('post-check after a staff removal: still counts and booleans only', Object.values(postS).every((v) => typeof v === 'boolean' || /^\d+$/.test(String(v))), postS);

    // The post-check notices a missing constraint and rows in either bad state.
    const c = 'public.my_season_coach_observations', badA = id(), badB = id();
    await db.exec(`alter table ${c} drop constraint my_season_coach_observations_content_state; alter table ${c} disable trigger user;`);
    await db.query(`insert into ${c} (id, player_id, author_id, request_id, category, body, withdrawn_at) values ($1, $3, $4, $5, 'kept_going', 'Text left on a withdrawn row.', now()), ($2, $3, $4, $6, null, null, null)`, [badA, badB, fx.player, fx.c, id(), id()]);
    const postBad = await verification(db, POST);
    check('post-check catches a missing constraint, a withdrawn row with content and an active row without',
      postBad.observation_content_constraint_present === false && Number(postBad.withdrawn_rows_with_content) === 1 && Number(postBad.active_rows_without_content) === 1, postBad);
    await db.query(`delete from ${c} where id = any($1::uuid[])`, [[badA, badB]]);
    await db.exec(`alter table ${c} enable trigger user;
      alter table ${c} add constraint my_season_coach_observations_content_state check (
        (withdrawn_at is null and category is not null
         and category in ('lifted_the_team', 'kept_going', 'tried_something_new', 'helped_someone_belong', 'spoke_up', 'came_back_stronger')
         and body is not null and body = btrim(body) and char_length(body) between 20 and 160)
        or (withdrawn_at is not null and body is null and category is null));`);
    check('...and the catalog is exact again once restored', catalogDiff(post0108, await snapshotCatalog(db)).length === 0, catalogDiff(post0108, await snapshotCatalog(db)));

    const pre2 = await verification(db, PRE);
    check('pre-check after applying reports both migrations present (guards false)', pre2.guard_0099_not_applied === false && pre2.guard_0108_not_applied === false, pre2);

    // Rollbacks.
    const r99first = await rollBack(db, RB0099, ACK_0099);
    check('0099 rollback refuses while 0108 is applied, changing nothing', r99first?.includes('0108') && r99first.includes('refused') && catalogDiff(post0108, await snapshotCatalog(db)).length === 0, r99first);
    const r108noack = await rollBack(db, RB0108, null);
    check('0108 rollback refuses without the acknowledgement', r108noack?.includes('0108 rollback refused') && catalogDiff(post0108, await snapshotCatalog(db)).length === 0, r108noack);
    const r108bad = await rollBack(db, RB0108, ['emblem.acknowledge_0108_rollback', 'yes']);
    check('0108 rollback refuses a wrong acknowledgement', r108bad?.includes('0108 rollback refused'), r108bad);
    const r108 = await rollBack(db, RB0108, ACK_0108);
    check('0108 rollback (with data) restores the exact post-0099 catalog', r108 === null && catalogDiff(post0099, await snapshotCatalog(db)).length === 0, r108 ?? catalogDiff(post0099, await snapshotCatalog(db)));
    const ackLeft = (await db.query(`select coalesce(current_setting('emblem.acknowledge_0108_rollback', true), '') a`)).rows[0].a;
    check('the 0108 acknowledgement does not persist', ackLeft === '', ackLeft);
    const r108again = await rollBack(db, RB0108, ACK_0108);
    check('0108 rollback refuses when 0108 is not applied', r108again?.includes('not (fully) applied'), r108again);
    const r99noack = await rollBack(db, RB0099, null);
    check('0099 rollback refuses without the acknowledgement', r99noack?.includes('0099 rollback refused'), r99noack);
    const r99 = await rollBack(db, RB0099, ACK_0099);
    check('0099 rollback restores the exact pre-0099 catalog', r99 === null && catalogDiff(pre0099, await snapshotCatalog(db)).length === 0, r99 ?? catalogDiff(pre0099, await snapshotCatalog(db)));
    // The staff fixture lives in the older tables; take it out before comparing them.
    await db.query(`delete from staff_accounts where profile_id = $1`, [staffUser]);
    await db.query(`delete from profiles where id = $1`, [staffUser]);
    await db.query(`delete from auth.users where id = $1`, [staffUser]);
    check('rollbacks leave every other table\'s data unchanged', (await dataHash(db)) === dataBefore);
    const ackLeft99 = (await db.query(`select coalesce(current_setting('emblem.acknowledge_0099_rollback', true), '') a`)).rows[0].a;
    check('the 0099 acknowledgement does not persist', ackLeft99 === '', ackLeft99);

    // Re-entry.
    const re99 = await apply(db, M0099), re108 = await apply(db, M0108);
    check('re-apply after rollback works and reaches the exact final catalog', re99 === null && re108 === null && catalogDiff(finalCatalog, await snapshotCatalog(db)).length === 0, [re99, re108]);
    const post3 = await verification(db, POST);
    check('after re-entry the flag is fail-closed again and tables are empty', post3.kill_switch_on === true && Number(post3.team_states_count) === 0 && Number(post3.focus_rows) === 0 && Number(post3.staff_removal_rows) === 0, post3);
    const leftovers = (await db.query(`select count(*) n from pg_class where relnamespace = 'public'::regnamespace and relname like 'my_season%' and relkind = 'r'`)).rows[0].n;
    check('after re-entry exactly the four My Season tables exist', Number(leftovers) === 4, leftovers);
  } catch (e) {
    check('apply / rollback', false, e.stack);
  }
  await db.close();
}

// --- preconditions --------------------------------------------------------------------------
{
  // 0099 needs 0089; 0108 needs 0097 and 0098.
  const db = await createDatabase();
  await applyMigrations(db, { through: '0087' });
  const r = await apply(db, M0099);
  check('0099 refuses before the 0088/0089 lockdown', r?.includes('0099 refused') && r.includes('0088'), r);
  await db.close();
}
{
  const db = await readyDatabase({ through: '0096' });
  check('0099 applies on a 0096 database (depends on nothing after 0089)', (await apply(db, M0099)) === null);
  const r = await apply(db, M0108);
  check('0108 refuses without 0097 and 0098, naming both', r?.includes('0108 refused') && r.includes('0097') && r.includes('0098'), r);
  await db.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 0099/0108 migration checks passed`);
process.exit(failed.length ? 1 : 0);
