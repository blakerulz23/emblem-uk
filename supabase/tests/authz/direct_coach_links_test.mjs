// Direct coach links (coach_players): an independent, audited lifecycle.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// A direct link is a guardian deliberately connecting one coach to one
// player. It never depends on a team assignment, grants access to that one
// player only, and ends only through remove_direct_coach_link (connected
// coach, a current guardian, or staff), which audits the actor and reason.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}

const db = await createDatabase();
async function as(role, uid, fn, { commit = true } = {}) {
  await db.exec('begin;');
  try {
    await db.exec(`set local role ${role};`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid ?? '']);
    const r = await fn();
    await db.exec(commit ? 'commit;' : 'rollback;');
    return r;
  } catch (e) {
    await db.exec('rollback;');
    throw e;
  }
}
async function expectOk(label, fn, verify) {
  try {
    const r = await fn();
    const ok = verify ? verify(r) : true;
    check(label, ok, ok ? '' : JSON.stringify(r?.rows ?? r));
    return r;
  } catch (e) {
    check(label, false, `unexpected error: ${e.message}`);
  }
}
async function expectError(label, fn, matchText) {
  try {
    await fn();
    check(label, false, 'expected an error, but it succeeded');
  } catch (e) {
    check(label, matchText ? e.message.includes(matchText) : true, e.message);
  }
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const service = (sql, params) => as('service_role', null, () => db.query(sql, params));
const remove = (player, coach, actor, reason) =>
  service(`select public.remove_direct_coach_link($1, $2, $3, $4) as result`, [player, coach, actor, reason]).then((r) => r.rows[0].result);
const sees = (uid, player) =>
  as('authenticated', uid, async () => {
    const helper = (await db.query(`select public.is_authorized_coach_for_player($1) as a`, [player])).rows[0].a;
    const row = (await db.query(`select id from public.players where id = $1`, [player])).rows.length === 1;
    const moments = (await db.query(`select id from public.moments where player_id = $1`, [player])).rows.length;
    return { helper, row, moments };
  }, { commit: false });
const auditFor = (player, coach) =>
  db.query(`select event, actor_profile_id, actor_source, operation, reason, auth_uid, db_role, player_id, profile_id
    from relationship_audit_events where table_name = 'coach_players' and player_id = $1 and profile_id = $2 order by id`, [player, coach]).then((r) => r.rows);

// ---------------------------------------------------------------------------
// 0087 state with a pre-existing direct link, then 0088
// ---------------------------------------------------------------------------
await applyMigrations(db, { through: '0087' });
const id = () => crypto.randomUUID();
const ids = {
  season: id(), club: id(), teamA: id(), teamB: id(),
  linked: id(), teammate: id(), otherTeamPlayer: id(),
  guardian: id(), coach: id(), staff: id(), strangerParent: id(), strangerCoach: id(), stranger: id(),
  coach2: id(), coach3: id(), coach4: id(),
};
const people = [ids.guardian, ids.coach, ids.staff, ids.strangerParent, ids.strangerCoach, ids.stranger, ids.coach2, ids.coach3, ids.coach4];
await db.query(`insert into auth.users (id, email) select u, 'p-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [people]);
await db.exec(`
  insert into profiles (id, role, display_name) values
    ('${ids.guardian}', 'parent', 'Fictional Parent'), ('${ids.coach}', 'coach', 'Fictional Coach'),
    ('${ids.staff}', null, 'Fictional Staff'), ('${ids.strangerParent}', 'parent', 'Other Parent'),
    ('${ids.strangerCoach}', 'coach', 'Other Coach'), ('${ids.stranger}', null, 'Someone Else'),
    ('${ids.coach2}', 'coach', 'Coach Two'), ('${ids.coach3}', 'coach', 'Coach Three'), ('${ids.coach4}', 'coach', 'Coach Four');
  insert into staff_accounts (profile_id) values ('${ids.staff}');
  insert into seasons (id, label, normalized_label) values ('${ids.season}', 'Test Season', 'test season');
  insert into clubs (id, name) values ('${ids.club}', 'Fictional FC');
  insert into teams (id, club_id, name, season_id) values
    ('${ids.teamA}', '${ids.club}', 'U10', '${ids.season}'), ('${ids.teamB}', '${ids.club}', 'U11', '${ids.season}');
  insert into players (id, team_id, name) values
    ('${ids.linked}', '${ids.teamA}', 'Fictional Linked'), ('${ids.teammate}', '${ids.teamA}', 'Fictional Teammate'),
    ('${ids.otherTeamPlayer}', '${ids.teamB}', 'Fictional Other');
  insert into moments (player_id, title, trust, verification_status) values ('${ids.linked}', 'First goal', 'parent', 'family_memory');
  insert into guardians (player_id, profile_id) values ('${ids.linked}', '${ids.guardian}'), ('${ids.otherTeamPlayer}', '${ids.strangerParent}');
  insert into coach_team (team_id, profile_id) values ('${ids.teamA}', '${ids.coach}'), ('${ids.teamB}', '${ids.strangerCoach}');
  insert into coach_players (player_id, profile_id, created_via, created_by) values ('${ids.linked}', '${ids.coach}', 'guardian_invite', '${ids.guardian}');
`);
const existingBefore = (await db.query(`select player_id, profile_id, connected_at, created_via, created_by from coach_players`)).rows;

await applyMigrations(db, { from: '0088', through: '0088' });
check('applying 0088 creates no audit event for the pre-existing direct link', (await one(`select count(*)::int n from relationship_audit_events`)).n === 0);
const existingAfter = (await db.query(`select player_id, profile_id, connected_at, created_via, created_by from coach_players`)).rows;
check('the pre-existing direct link is unchanged by 0088 (no new timestamp or actor)', JSON.stringify(existingAfter) === JSON.stringify(existingBefore));

// ---------------------------------------------------------------------------
// Independence from team assignments
// ---------------------------------------------------------------------------
await expectOk('baseline: the coach reaches the linked player', () => sees(ids.coach, ids.linked), (r) => r.helper && r.row && r.moments === 1);
await expectOk('staff end the coach’s team assignment', () => service(`select public.end_coach_assignment($1, $2, $3, 'Season over')`, [ids.teamA, ids.coach, ids.staff]));
check('ending the team assignment does not delete the direct link', (await one(`select count(*)::int n from coach_players where profile_id = $1`, [ids.coach])).n === 1);
await expectOk('after the team assignment ends, the direct link still authorises the linked player', () => sees(ids.coach, ids.linked), (r) => r.helper && r.row && r.moments === 1);
await db.query(`update players set team_id = $1 where id = $2`, [ids.teamB, ids.linked]);
await expectOk('after the player transfers teams, the direct link still authorises them', () => sees(ids.coach, ids.linked), (r) => r.helper && r.row && r.moments === 1);
await expectOk('the direct link reaches only the linked player, not a player on the same (new) team', () => sees(ids.coach, ids.otherTeamPlayer), (r) => !r.helper && !r.row && r.moments === 0);
await db.query(`update players set team_id = $1 where id = $2`, [ids.teamA, ids.linked]);

// ---------------------------------------------------------------------------
// No direct writes; the removal function is service_role only
// ---------------------------------------------------------------------------
for (const [op, sql] of [
  ['insert', `insert into public.coach_players (player_id, profile_id, created_via) values ('${ids.otherTeamPlayer}', '${ids.stranger}', 'guardian_invite')`],
  ['update', `update public.coach_players set created_by = null where profile_id = '${ids.coach}'`],
  ['delete', `delete from public.coach_players where profile_id = '${ids.coach}'`],
]) {
  await expectError(`a signed-in user cannot ${op} coach_players directly`, () => as('authenticated', ids.guardian, () => db.query(sql)), 'permission denied');
}
for (const [role, uid] of [['authenticated', ids.guardian], ['anon', null]]) {
  await expectError(`${role} cannot execute remove_direct_coach_link`, () =>
    as(role, uid, () => db.query(`select public.remove_direct_coach_link($1, $2, $3, 'x')`, [ids.linked, ids.coach, ids.guardian])), 'permission denied');
}

// ---------------------------------------------------------------------------
// Creation via the redemption path is audited
// ---------------------------------------------------------------------------
const link = (coach) =>
  service(`insert into public.coach_players (player_id, profile_id, created_via, created_by) values ($1, $2, 'guardian_invite', $3)`, [ids.linked, coach, ids.guardian]);
await expectOk('coach-invite redemption (service role) creates direct links', async () => {
  for (const c of [ids.coach2, ids.coach3, ids.coach4]) await link(c);
});
const created = await auditFor(ids.linked, ids.coach2);
check('creation writes one INSERT audit event naming the player, coach, inviting guardian and origin',
  created.length === 1 && created[0].event === 'INSERT' && created[0].actor_source === 'row_attribution' &&
  created[0].actor_profile_id === ids.guardian && created[0].operation === 'guardian_invite' && created[0].db_role === 'service_role' &&
  created[0].player_id === ids.linked && created[0].profile_id === ids.coach2, JSON.stringify(created));

// ---------------------------------------------------------------------------
// Who may remove
// ---------------------------------------------------------------------------
for (const [label, actor] of [['an unrelated parent', ids.strangerParent], ['an unrelated coach', ids.strangerCoach], ['an unrelated signed-in account', ids.stranger]]) {
  await expectError(`${label} cannot remove the link`, () => remove(ids.linked, ids.coach2, actor, 'Not mine'), 'Not authorized');
}
await expectError('a missing actor is refused', () => remove(ids.linked, ids.coach2, null, 'No actor'), 'actor is required');
await expectError('an empty reason is refused', () => remove(ids.linked, ids.coach2, ids.guardian, '   '), 'reason');
check('refused attempts remove nothing and write no audit event',
  (await one(`select count(*)::int n from coach_players where player_id = $1`, [ids.linked])).n === 4 &&
  (await auditFor(ids.linked, ids.coach2)).length === 1);

await expectOk('a current guardian removes a link', () => remove(ids.linked, ids.coach2, ids.guardian, 'No longer coaching them'), (r) => r === 'removed');
await expectOk('the connected coach removes their own link', () => remove(ids.linked, ids.coach3, ids.coach3, 'Stepping down'), (r) => r === 'removed');
await expectOk('staff remove a link with a reason', () => remove(ids.linked, ids.coach4, ids.staff, 'Safeguarding review'), (r) => r === 'removed');
await expectOk('removing an already-removed link is a safe, unambiguous retry', () => remove(ids.linked, ids.coach2, ids.guardian, 'Again'), (r) => r === 'not_found');

for (const [coach, actor, kind, reason] of [
  [ids.coach2, ids.guardian, 'guardian', 'No longer coaching them'],
  [ids.coach3, ids.coach3, 'coach', 'Stepping down'],
  [ids.coach4, ids.staff, 'staff', 'Safeguarding review'],
]) {
  const events = (await auditFor(ids.linked, coach)).filter((e) => e.event === 'DELETE');
  check(`removal by ${kind}: exactly one DELETE audit event with the real actor, operation and reason`,
    events.length === 1 && events[0].actor_source === 'trusted_function' && events[0].actor_profile_id === actor &&
    events[0].operation === `remove_direct_coach_link:${kind}` && events[0].reason === reason && events[0].db_role === 'service_role' &&
    events[0].player_id === ids.linked && events[0].profile_id === coach, JSON.stringify(events));
  check(`removal by ${kind}: the link is gone and the coach no longer reaches the player`,
    (await one(`select count(*)::int n from coach_players where player_id = $1 and profile_id = $2`, [ids.linked, coach])).n === 0 &&
    !(await sees(coach, ids.linked)).helper);
}
check('the retry wrote no extra audit event', (await auditFor(ids.linked, ids.coach2)).length === 2);
check('the original link (not removed) still authorises its coach', (await sees(ids.coach, ids.linked)).helper === true);
await expectOk('the trusted-operation markers are cleared after a removal', () =>
  as('service_role', null, async () => {
    await link(ids.coach2);
    await db.query(`select public.remove_direct_coach_link($1, $2, $3, 'Tidy up')`, [ids.linked, ids.coach2, ids.staff]);
    return db.query(`select current_setting('emblem.trusted_operation', true) op, current_setting('emblem.actor_profile_id', true) actor, current_setting('emblem.trusted_reason', true) reason`);
  }), (r) => !r.rows[0].op && !r.rows[0].actor && !r.rows[0].reason);

await db.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} direct coach link checks passed`);
if (failed.length) process.exitCode = 1;
