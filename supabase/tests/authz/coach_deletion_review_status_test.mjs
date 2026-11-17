// What Emblem OS can know about a coach-only account whose deletion is under
// staff review (0097 files the review, 0098 pauses coach access), on the
// final schema. Backs the /os status screen for that state.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// getOsAccount (src/lib/os-data.ts) resolves the view from guardians,
// active coach_team assignments and coach_players links, read in the
// person's own session. Under review a coach-only account has none of them,
// so it gets no view, and profiles.role is still 'coach'. The only signal
// that the account is under review is my_account_deletion_review(), which
// reads auth.uid()'s own request and nothing else.
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
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [staff]);
  await db.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [staff]);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [staff]);
  await db.exec('commit;');
}
await applyMigrations(db, { from: '0089', through: '0089' });
await applyMigrations(db, { from: '0090', through: '9999' });

async function as(role, uid, sql, params) {
  await db.exec('begin;');
  try {
    await db.exec(`set local role ${role};`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid ?? '']);
    const r = await db.query(sql, params);
    await db.exec('commit;');
    return r;
  } catch (e) {
    await db.exec('rollback;');
    throw e;
  }
}
const service = (sql, params) => as('service_role', null, sql, params);
const user = (uid, sql, params) => as('authenticated', uid, sql, params);

// What getOsAccount reads, in the person's own session.
async function osAccountFacts(uid) {
  const r = await user(uid, `select
      (select role from public.profiles where id = $1) as role,
      (select count(*) from public.guardians where profile_id = $1)::int as guardians,
      (select count(*) from public.coach_team where profile_id = $1 and ended_at is null and (expires_at is null or expires_at > now()))::int as active_teams,
      (select count(*) from public.coach_players where profile_id = $1)::int as direct_links,
      public.my_account_deletion_review() as review`, [uid]);
  return r.rows[0];
}

const people = { coach: id(), plainCoach: id(), parent: id(), staff: id() };
await db.query(`insert into auth.users (id, email) select u, 'p-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [Object.values(people)]);
for (const uid of Object.values(people)) await user(uid, `insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [uid]);
await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [people.staff]);
const season = id(), player = id();
await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
await db.query(`insert into public.players (id, name) values ($1, 'Fictional Player')`, [player]);

// Two coach-only accounts with an active team from an approved request.
const teams = {};
for (const who of ['coach', 'plainCoach']) {
  const req = (await user(people[who], `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', $1) returning id`, [`U10 ${who}`])).rows[0].id;
  teams[who] = (await service(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [req, people.staff, season])).rows[0].team_id;
}
await service(`update public.players set team_id = $1 where id = $2`, [teams.coach, player]);

try {
  const before = await osAccountFacts(people.coach);
  check('Before: coach-only account (role coach, no guardian links, one active team), not under review',
    before.role === 'coach' && before.guardians === 0 && before.active_teams === 1 && before.review.underReview === false && before.review.coachAccessPaused === false, JSON.stringify(before));

  // The coach wrote a player record, so a deletion request goes to staff review.
  await user(people.coach, `insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [player, people.coach]);
  const result = (await user(people.coach, `select public.delete_own_guardian_account() as r`)).rows[0].r;
  check('Deletion request goes to staff review with coach access paused', result.canDeleteIdentity === false && result.coachAccessSuspended === 1, JSON.stringify(result));

  const under = await osAccountFacts(people.coach);
  check('Under review: no guardian link, no active team, no direct link, so /os resolves no view',
    under.guardians === 0 && under.active_teams === 0 && under.direct_links === 0, JSON.stringify(under));
  check('Under review: profiles.role is still coach (why /os shows the coach team-request onboarding today)', under.role === 'coach');
  check('Under review: my_account_deletion_review() reports underReview and coachAccessPaused for the account itself',
    under.review.underReview === true && under.review.coachAccessPaused === true, JSON.stringify(under.review));

  const plain = await osAccountFacts(people.plainCoach);
  check('Another coach-only account is unaffected (not under review, still has its team)', plain.review.underReview === false && plain.active_teams === 1, JSON.stringify(plain));

  let anonError = null;
  try {
    await as('anon', null, `select public.my_account_deletion_review()`);
  } catch (e) {
    anonError = e.message;
  }
  check('my_account_deletion_review() is not callable signed out', anonError !== null && /permission denied/i.test(anonError), anonError ?? 'callable');

  // Staff reject and restore: the status clears and the view comes back.
  const pending = (await db.query(`select id from public.pending_profile_deletions where auth_user_id = $1`, [people.coach])).rows[0].id;
  await service(`select public.reject_pending_profile_deletion($1, $2, 'Coach asked to stay')`, [pending, people.staff]);
  await service(`select public.restore_coach_access_after_deletion_rejection($1, $2, 'Coach asked to stay')`, [pending, people.staff]);
  const after = await osAccountFacts(people.coach);
  check('After staff reject + restore: not under review, and the active team is back (the coach view returns)',
    after.review.underReview === false && after.review.coachAccessPaused === false && after.active_teams === 1, JSON.stringify(after));
} catch (e) {
  check('coach deletion review status', false, e.message);
}
await db.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} coach deletion review status checks passed`);
if (failed.length) process.exitCode = 1;
