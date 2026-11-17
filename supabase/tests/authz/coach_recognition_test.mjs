// A coach's "Send Recognition" (src/app/api/os/celebrate/route.ts) under the
// lockdown (0089–0091).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Runs the exact statements the route issues, in the signed-in coach's own
// session (role authenticated, no service role): the duplicate check, the
// insert ... returning, and the three follow-up reads. Only a coach with an
// ACTIVE coach_team row for the player's team (or a direct coach_players
// link) may save; an ended assignment, an expired one, and an unrelated
// account are refused by RLS and leave nothing behind.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

const db = await createDatabase();
await applyMigrations(db, { through: '0088' });
{
  // Release readiness, then the real 0089 and 0090–0091 (same as app_flows_test).
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [staff]);
  await db.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [staff]);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [staff]);
  await db.exec('commit;');
  await applyMigrations(db, { from: '0089', through: '0089' });
  await applyMigrations(db, { from: '0090', through: '9999' });
}

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
const service = (sql, params) => as('service_role', null, () => db.query(sql, params));

const people = { active: id(), ended: id(), expired: id(), stranger: id(), parent: id(), staff: id() };
await db.query(`insert into auth.users (id, email) select u, 'p-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [Object.values(people)]);
await db.query(`insert into public.profiles (id, display_name) select u, 'Fictional ' || left(u::text, 4) from unnest($1::uuid[]) u`, [Object.values(people)]);
await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [people.staff]);
const season = id(), club = id(), team = id(), player = id();
await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
await service(`insert into public.clubs (id, name) values ($1, 'Fictional FC')`, [club]);
await service(`insert into public.teams (id, club_id, name, season_id) values ($1, $2, 'U10', $3)`, [team, club, season]);
await db.query(`insert into public.players (id, name, team_id) values ($1, 'Fictional Player', $2)`, [player, team]);
await service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [player, people.parent]);

const redeemTeamInvite = async (uid) => {
  const code = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [team, code]);
  return service(`select status from public.redeem_team_invite($1, $2)`, [code, uid]);
};
for (const who of ['active', 'ended', 'expired']) await redeemTeamInvite(people[who]);
await service(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [team, people.ended, people.staff]);
await db.query(`update public.coach_team set created_at = now() - interval '3 days', expires_at = now() - interval '1 hour' where profile_id = $1`, [people.expired]);

// The route's statements, as the coach.
const AWARD = 'Man of the Match';
const NOTE = 'Brilliant today';
const duplicateCheck = (uid) => as('authenticated', uid, () => db.query(
  `select id from public.moments where player_id = $1 and uploaded_by = $2 and trust = 'coach' and title = $3 and created_at >= now() - interval '10 minutes' and note = $4 order by created_at desc limit 1`,
  [player, uid, AWARD, NOTE]));
const insert = (uid) => as('authenticated', uid, () => db.query(
  `insert into public.moments (player_id, title, trust, note, uploaded_by, verified_by, verified_at, verification_status)
   values ($1, $2, 'coach', $3, $4, $4, now(), 'coach_verified') returning *`,
  [player, AWARD, NOTE, uid]));
const momentCount = async () => (await db.query(`select count(*)::int n from public.moments where player_id = $1`, [player])).rows[0].n;

try {
  const first = await duplicateCheck(people.active);
  check('active coach: the duplicate check runs and finds nothing yet', first.rows.length === 0);
  const inserted = await insert(people.active);
  check('active coach: saves the recognition and gets its id back (insert ... returning)', inserted.rows.length === 1 && !!inserted.rows[0].id);
  const retry = await duplicateCheck(people.active);
  check('active coach: an identical retry finds the saved moment (no second insert needed)', retry.rows.length === 1 && retry.rows[0].id === inserted.rows[0].id);
  const followUps = await as('authenticated', people.active, async () => ({
    guardians: (await db.query(`select profile_id from public.guardians where player_id = $1`, [player])).rows,
    player: (await db.query(`select name from public.players where id = $1`, [player])).rows,
    actor: (await db.query(`select display_name from public.profiles where id = $1`, [people.active])).rows,
  }));
  check('active coach: reads the family recipients, player name and own display name for the Story Update',
    followUps.guardians.length === 1 && followUps.guardians[0].profile_id === people.parent && followUps.player.length === 1 && followUps.actor.length === 1,
    JSON.stringify(followUps));
} catch (e) {
  check('active coach flow', false, e.message);
}

for (const who of ['ended', 'expired', 'stranger']) {
  const before = await momentCount();
  try {
    await insert(people[who]);
    check(`${who} coach: refused`, false, 'insert succeeded');
  } catch (e) {
    check(`${who} account: refused by RLS`, /row-level security/.test(e.message), e.message);
  }
  check(`${who} account: nothing saved`, (await momentCount()) === before);
  const dup = await duplicateCheck(people[who]);
  check(`${who} account: the duplicate check matches nothing for them`, dup.rows.length === 0);
}

await db.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} coach recognition checks passed`);
if (failed.length) process.exitCode = 1;
