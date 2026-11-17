// A coach-only account deletes itself (Coach Profile → Account → Delete
// account → /api/os/account/delete) on the final schema, which includes
// 0097 and 0098 (both live in production since 17 Nov 2026).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// The route makes two calls, both reproduced here:
//   1. delete_own_guardian_account(), in the person's own session
//      (role authenticated, request.jwt.claim.sub = the coach);
//   2. only when that returns canDeleteIdentity = true, the Auth admin
//      deleteUser(), i.e. a delete from auth.users (cascading to profiles).
// The coach has every lockdown-era relationship row a real pilot coach can
// have: an active coach_team row from an approved team request, an ended
// one, a direct coach_players link, an open team request, a redeemed team
// invite, a moment they uploaded (pending verification), and a Story
// Update naming them as actor — so every foreign key and the append-only
// relationship_audit_events trigger are exercised.
//
// Scenario C: a coach who wrote a player record goes to staff review
// (0097 decides first; 0098 pauses coach access). Nothing is deleted; every
// active assignment is ended and every direct link removed, both
// snapshotted; no new access can be gained while the review is pending; a
// staff rejection followed by the restore gives back exactly that access.
// Scenario D: a coach who sent a recognition (verification_status
// 'coach_verified', verified_by = the coach). Before 0097 this deletion
// failed on moments_verification_status_consistency (found here,
// 2026-11-11). From 0097 it succeeds, and the child's moment stays
// coach_verified, with verifier_account_deleted_at recording why
// verified_by is empty.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

async function lockedDownDatabase() {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [staff]);
  await db.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [staff]);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [staff]);
  await db.exec('commit;');
  await applyMigrations(db, { from: '0089', through: '0089' });
  await applyMigrations(db, { from: '0090', through: '9999' });
  return db;
}

async function world() {
  const db = await lockedDownDatabase();
  async function as(role, uid, fn) {
    await db.exec('begin;');
    try {
      await db.exec(`set local role ${role};`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid ?? '']);
      const r = await fn();
      await db.exec('commit;');
      return r;
    } catch (e) {
      await db.exec('rollback;');
      throw e;
    }
  }
  const service = (sql, params) => as('service_role', null, () => db.query(sql, params));
  const user = (uid, sql, params) => as('authenticated', uid, () => db.query(sql, params));

  const people = { coach: id(), parent: id(), staff: id() };
  await db.query(`insert into auth.users (id, email) select u, 'p-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [Object.values(people)]);
  for (const uid of Object.values(people)) await user(uid, `insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [uid]);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [people.staff]);
  const season = id(), club = id(), otherTeam = id(), player = id(), directPlayer = id();
  await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await service(`insert into public.clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await service(`insert into public.teams (id, club_id, name, season_id) values ($1, $2, 'U12', $3)`, [otherTeam, club, season]);
  await db.query(`insert into public.players (id, name) values ($1, 'Fictional Player'), ($2, 'Fictional Direct')`, [player, directPlayer]);
  await service(`select public.ensure_profile_role($1, 'parent')`, [people.parent]);
  await service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $3, 'card_claim', $3), ($2, $3, 'card_claim', $3)`, [player, directPlayer, people.parent]);
  return { db, as, service, user, people, season, club, otherTeam, player, directPlayer };
}

// The route's two steps, as the coach.
async function deleteAccount(w, uid) {
  const rpc = await w.user(uid, `select public.delete_own_guardian_account() as result`);
  const result = rpc.rows[0].result;
  if (result.canDeleteIdentity) await w.db.query(`delete from auth.users where id = $1`, [uid]); // admin.deleteUser
  return result;
}
const count = async (db, sql, params) => (await db.query(sql, params)).rows[0].n;

// --- Scenario A: coach-only with a full set of lockdown-era rows ------------
{
  const w = await world();
  const { db, people, service, user } = w;
  try {
    // Team request → staff approval (new team) → active coach_team.
    const req = (await user(people.coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U10') returning id`)).rows[0].id;
    const team = (await service(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [req, people.staff, w.season])).rows[0].team_id;
    await service(`update public.players set team_id = $1 where id = $2`, [team, w.player]);
    // An ended assignment on another team (joined by invite, then ended by staff).
    const code = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [w.otherTeam, code]);
    await service(`select status from public.redeem_team_invite($1, $2)`, [code, people.coach]);
    await service(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [w.otherTeam, people.coach, people.staff]);
    // A direct link from a guardian's coach invite.
    const coachCode = `COACH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await user(people.parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, $2, $3)`, [w.directPlayer, coachCode, people.parent]);
    await service(`select status from public.redeem_coach_invite($1, $2)`, [coachCode, people.coach]);
    // A second, still-open team request.
    await user(people.coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U11')`);
    // A moment the coach uploaded (pending verification) and a Story Update naming them.
    const moment = (await user(people.coach, `insert into public.moments (player_id, title, trust, uploaded_by, verification_status)
      values ($1, 'Training photo', 'coach', $2, 'pending_verification') returning id`, [w.player, people.coach])).rows[0].id;
    await service(`insert into public.story_updates (recipient_profile_id, actor_profile_id, player_id, event_type, category, title, body, related_moment_id)
      values ($1, $2, $3, 'recognition', 'coach', 'Coach Recognition', 'Recognised', $4)`, [people.parent, people.coach, w.player, moment]);

    check('A: setup — coach has an active and an ended coach_team row, a direct link, and two team requests', await count(db,
      `select (select count(*) from public.coach_team where profile_id = $1) + (select count(*) from public.coach_players where profile_id = $1) + (select count(*) from public.coach_team_requests where requester_profile_id = $1) as n`,
      [people.coach]) == 5);
    const auditBefore = await count(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1`, [people.coach]);

    const result = await deleteAccount(w, people.coach);
    check('A: delete_own_guardian_account succeeds for a coach-only account and allows identity deletion', result.canDeleteIdentity === true, JSON.stringify(result));
    check('A: the Auth identity and profile are gone', await count(db, `select (select count(*) from auth.users where id = $1) + (select count(*) from public.profiles where id = $1) as n`, [people.coach]) == 0);
    check('A: every coach_team row (active and ended) is removed — no coach access remains', await count(db, `select count(*)::int n from public.coach_team where profile_id = $1`, [people.coach]) === 0);
    check('A: the direct coach link is removed', await count(db, `select count(*)::int n from public.coach_players where profile_id = $1`, [people.coach]) === 0);
    check('A: both team requests are removed', await count(db, `select count(*)::int n from public.coach_team_requests where requester_profile_id = $1`, [people.coach]) === 0);
    check('A: relationship_audit_events keeps its history and records the removals',
      await count(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1 and event = 'DELETE'`, [people.coach]) === 3 &&
      await count(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1`, [people.coach]) === auditBefore + 3);
    const m = (await db.query(`select uploaded_by, verified_by, note from public.moments where id = $1`, [moment])).rows[0];
    check('A: the coach-uploaded moment stays with the family, no longer pointing at the deleted account', m && m.uploaded_by === null && m.verified_by === null, JSON.stringify(m));
    check('A: the family keeps the Story Update (actor cleared)', await count(db, `select count(*)::int n from public.story_updates where recipient_profile_id = $1 and actor_profile_id is null`, [people.parent]) === 1);
    check('A: the parent, their guardian links, the team and the players are untouched', await count(db,
      `select (select count(*) from public.guardians where profile_id = $1) + (select count(*) from public.teams where id = $2) + (select count(*) from public.players where id = any($3::uuid[])) as n`,
      [people.parent, team, [w.player, w.directPlayer]]) == 5);
  } catch (e) {
    check('A: coach-only deletion', false, e.message);
  }
  await db.close();
}

// --- Scenario B: coach with no team, only a pending request (F2 case) -------
{
  const w = await world();
  const { db, people, user } = w;
  try {
    await user(people.coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U9')`);
    const result = await deleteAccount(w, people.coach);
    check('B: a coach with only a pending team request deletes cleanly', result.canDeleteIdentity === true &&
      await count(db, `select (select count(*) from public.profiles where id = $1) + (select count(*) from public.coach_team_requests where requester_profile_id = $1) as n`, [people.coach]) == 0,
      JSON.stringify(result));
  } catch (e) {
    check('B: no-team coach deletion', false, e.message);
  }
  await db.close();
}

// --- Scenario C: coach who wrote a player assessment → staff review --------
{
  const w = await world();
  const { db, people, service, user } = w;
  try {
    const req = (await user(people.coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U10') returning id`)).rows[0].id;
    const team = (await service(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [req, people.staff, w.season])).rows[0].team_id;
    await service(`update public.players set team_id = $1 where id = $2`, [team, w.player]);
    const coachCode = `COACH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await user(people.parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, $2, $3)`, [w.directPlayer, coachCode, people.parent]);
    await service(`select status from public.redeem_coach_invite($1, $2)`, [coachCode, people.coach]);
    await user(people.coach, `insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [w.player, people.coach]);

    const result = await deleteAccount(w, people.coach);
    check('C: with a coach-authored assessment the RPC files a staff review and withholds identity deletion', result.canDeleteIdentity === false && typeof result.reviewOpenedAt === 'string', JSON.stringify(result));
    check('C: both coach accesses (team assignment and direct link) are reported as paused', result.coachAccessSuspended === 2, JSON.stringify(result));
    const pending = (await db.query(`select id, status from public.pending_profile_deletions where auth_user_id = $1 and blocking_reason = 'coach_authored_player_records'`, [people.coach])).rows;
    check('C: staff get one pending review (coach_authored_player_records)', pending.length === 1 && pending[0].status === 'pending', JSON.stringify(pending));
    const kept = (await db.query(`select (select count(*) from auth.users where id = $1)::int as identity, (select count(*) from public.profiles where id = $1)::int as profile,
      (select count(*) from public.player_assessments where created_by = $1)::int as assessments, (select count(*) from public.coach_team_requests where requester_profile_id = $1)::int as requests`, [people.coach])).rows[0];
    check('C: nothing is deleted: the identity, profile, assessment and the coach\'s own team request all remain',
      kept.identity === 1 && kept.profile === 1 && kept.assessments === 1 && kept.requests === 1, JSON.stringify(kept));
    check('C: coaching access is paused: no active assignment (ended for the review) and no direct link', await count(db,
      `select (select count(*) from public.coach_team where profile_id = $1 and ended_at is null) + (select count(*) from public.coach_players where profile_id = $1) as n`, [people.coach]) == 0 &&
      await count(db, `select count(*)::int n from public.coach_team where profile_id = $1 and team_id = $2 and end_reason = 'account_deletion_review'`, [people.coach, team]) === 1);
    check('C: exactly the paused access is snapshotted for restoration', await count(db,
      `select count(*)::int n from public.deletion_review_access_suspensions where pending_deletion_id = $1 and resolved_at is null`, [pending[0]?.id]) === 2);

    // While the review is pending, no new coach access.
    let requestError = null;
    try {
      await user(people.coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U13')`);
    } catch (e) {
      requestError = e.message;
    }
    check('C: a new team request is refused while the review is pending', requestError !== null && requestError.includes('account_deletion_review_pending'), requestError ?? 'the request was saved');
    const code = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [w.otherTeam, code]);
    const redeem = (await service(`select status from public.redeem_team_invite($1, $2)`, [code, people.coach])).rows[0];
    check('C: a team invite is refused without granting access while the review is pending', redeem?.status === 'account_deletion_review_pending' &&
      await count(db, `select count(*)::int n from public.coach_team where profile_id = $1 and ended_at is null`, [people.coach]) === 0, JSON.stringify(redeem));

    // Staff reject the deletion, then restore (what "Reject & restore access" does).
    await service(`select public.reject_pending_profile_deletion($1, $2, 'Coach asked to stay')`, [pending[0].id, people.staff]);
    const restored = (await service(`select public.restore_coach_access_after_deletion_rejection($1, $2, 'Coach asked to stay') as r`, [pending[0].id, people.staff])).rows[0].r;
    const back = (await db.query(`select (select count(*) from public.coach_team where profile_id = $1 and team_id = $2 and ended_at is null)::int as team_active,
      (select count(*) from public.coach_players where profile_id = $1 and player_id = $3)::int as direct_link,
      (select count(*) from public.coach_team where profile_id = $1 and ended_at is null)::int as all_active`, [people.coach, team, w.directPlayer])).rows[0];
    check('C: after staff rejection the restore gives back exactly the paused access', restored.restored === 2 && restored.notRestorable === 0 &&
      back.team_active === 1 && back.direct_link === 1 && back.all_active === 1, JSON.stringify({ restored, back }));
    check('C: the request is recorded as rejected and the account is untouched', await count(db,
      `select (select count(*) from public.pending_profile_deletions where id = $1 and status = 'rejected') + (select count(*) from public.profiles where id = $2) as n`, [pending[0].id, people.coach]) == 2);
  } catch (e) {
    check('C: coach with authored records', false, e.message);
  }
  await db.close();
}

// --- Scenario D: coach who sent a recognition (fixed by 0097) ---------------
{
  const w = await world();
  const { db, people, service, user } = w;
  try {
    const req = (await user(people.coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U10') returning id`)).rows[0].id;
    const team = (await service(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [req, people.staff, w.season])).rows[0].team_id;
    await service(`update public.players set team_id = $1 where id = $2`, [team, w.player]);
    // Exactly what /api/os/celebrate inserts.
    const moment = (await user(people.coach, `insert into public.moments (player_id, title, trust, note, uploaded_by, verified_by, verified_at, verification_status)
      values ($1, 'Man of the Match', 'coach', 'Brilliant', $2, $2, now(), 'coach_verified') returning id, verified_at`, [w.player, people.coach])).rows[0];
    const result = await deleteAccount(w, people.coach);
    check('D: a coach who sent a recognition deletes cleanly, with no staff review', result.canDeleteIdentity === true && result.coachAccessSuspended === 0, JSON.stringify(result));
    check('D: the identity, profile and coach access are gone', await count(db,
      `select (select count(*) from auth.users where id = $1) + (select count(*) from public.profiles where id = $1) + (select count(*) from public.coach_team where profile_id = $1) as n`, [people.coach]) == 0);
    const m = (await db.query(`select title, verification_status, verified_by, verified_at, verifier_account_deleted_at from public.moments where id = $1`, [moment.id])).rows[0];
    check('D: the child keeps the recognition, still coach_verified, marked as verified by a since-deleted account',
      !!m && m.title === 'Man of the Match' && m.verification_status === 'coach_verified' && m.verified_by === null &&
      m.verifier_account_deleted_at !== null && new Date(m.verified_at).getTime() === new Date(moment.verified_at).getTime(), JSON.stringify(m));
    check('D: no staff review is filed', await count(db, `select count(*)::int n from public.pending_profile_deletions where auth_user_id = $1`, [people.coach]) === 0);
  } catch (e) {
    check('D: coach with a recognition', false, e.message);
  }
  await db.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} coach account deletion checks passed`);
if (failed.length) process.exitCode = 1;
