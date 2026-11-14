// Migration 0098 (deletion-review suspension, staff refusal, verifier
// identity) and its rollback, on the production order 0001–0091, 0095,
// 0096, 0097, 0098.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Account deletion is reproduced as /api/os/account/delete runs it
// (delete_own_guardian_account in the person's session, then, only when it
// allows, the auth.users delete). Staff decisions run as service_role, as
// a staff route would.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK_0098 = fs.readFileSync(path.resolve(HERE, '../../rollback/0098_rollback.sql'), 'utf8');
const ROLLBACK_0097 = fs.readFileSync(path.resolve(HERE, '../../rollback/0097_rollback.sql'), 'utf8');
const ACK_0098 = ['emblem.acknowledge_0098_rollback', 'REOPEN-DELETION-REVIEW-ACCESS-AND-VERIFIER-NOMINATION'];
const ACK_0097 = ['emblem.acknowledge_0097_rollback', 'BREAK-COACH-ACCOUNT-DELETION'];

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();
const keysOf = (d) => [...d.added, ...d.removed, ...d.changed];

async function readyDatabase(through) {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [staff]);
  await db.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [staff]);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [staff]);
  await db.exec('commit;');
  await applyMigrations(db, { from: '0089', through });
  return db;
}

async function world({ through = '0098', db: existing } = {}) {
  const db = existing ?? (await readyDatabase(through));
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
  const people = { parent: id(), coParent: id(), staff: id(), stranger: id() };
  const season = id(), club = id(), player = id(), directPlayer = id(), otherTeam = id();
  await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await service(`insert into public.clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await service(`insert into public.teams (id, club_id, name, season_id) values ($1, $2, 'U12', $3)`, [otherTeam, club, season]);
  await db.query(`insert into public.players (id, name) values ($1, 'Fictional Player'), ($2, 'Fictional Direct')`, [player, directPlayer]);
  async function person(uid) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `p-${uid.slice(0, 8)}@example.test`]);
    await user(uid, `insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [uid]);
  }
  for (const uid of Object.values(people)) await person(uid);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [people.staff]);
  await service(`select public.ensure_profile_role($1, 'parent')`, [people.parent]);
  await service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $3, 'card_claim', $3), ($2, $3, 'card_claim', $3), ($1, $4, 'card_claim', $4)`,
    [player, directPlayer, people.parent, people.coParent]);
  const w = { db, as, service, user, people, season, club, player, directPlayer, otherTeam, person };
  // A coach with an active coach_team row on the player's team (staff-approved request).
  w.coach = async () => {
    const uid = id();
    await person(uid);
    const req = (await user(uid, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', $1) returning id`, [`U${Math.floor(Math.random() * 1e6)}`])).rows[0].id;
    if (!w.team) {
      w.team = (await service(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [req, people.staff, season])).rows[0].team_id;
      await service(`update public.players set team_id = $1 where id = $2`, [w.team, player]);
    } else {
      await service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [req, people.staff, w.team]);
    }
    return uid;
  };
  // A direct coach link to the direct player, from the parent's coach invite.
  w.directLink = async (coach) => {
    const code = `COACH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await user(people.parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, $2, $3)`, [directPlayer, code, people.parent]);
    await service(`select status from public.redeem_coach_invite($1, $2)`, [code, coach]);
  };
  // An ended assignment on another team (joined by invite, ended by staff).
  w.endedAssignment = async (coach) => {
    const code = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [otherTeam, code]);
    await service(`select status from public.redeem_team_invite($1, $2)`, [code, coach]);
    await service(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [otherTeam, coach, people.staff]);
  };
  w.recognise = async (coach, verifier = coach, playerId = player) => (await user(coach, `insert into public.moments (player_id, title, trust, note, uploaded_by, verified_by, verified_at, verification_status)
      values ($1, 'Award', 'coach', 'Well done', $2, $3, now(), 'coach_verified') returning id`, [playerId, coach, verifier])).rows[0].id;
  w.submit = async (status = 'pending_verification') => (await user(people.parent, `insert into public.moments (player_id, title, trust, uploaded_by, verification_status)
      values ($1, 'Submitted', 'parent', $2, $3) returning id`, [player, people.parent, status])).rows[0].id;
  w.verify = async (actor, momentId, verifier = actor) => (await user(actor, `update public.moments set verified_by = $2, verified_at = now(), verification_status = 'coach_verified'
      where id = $1 and verified_at is null returning id`, [momentId, verifier])).rows.length;
  w.assess = async (coach) => user(coach, `insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [player, coach]);
  return w;
}

async function deleteAccount(w, uid) {
  const rpc = await w.user(uid, `select public.delete_own_guardian_account() as result`);
  const result = rpc.rows[0].result;
  if (result.canDeleteIdentity) await w.db.query(`delete from auth.users where id = $1`, [uid]);
  return result;
}
const n = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].n);
const attempt = (fn) => fn().then(() => null).catch((e) => e.message);
const rowsOf = async (db, sql, params) => JSON.stringify((await db.query(sql, params)).rows);
const coachRows = (db, uid) => rowsOf(db, `select team_id, created_at, created_via, created_by, expires_at, ended_at, ended_by, end_reason from public.coach_team where profile_id = $1 order by team_id`, [uid]);
const linkRows = (db, uid) => rowsOf(db, `select player_id, connected_at, created_via, created_by from public.coach_players where profile_id = $1 order by player_id`, [uid]);
// What the uid can reach through RLS, and whether it can still write as a coach.
async function reach(w, uid) {
  const r = await w.as('authenticated', uid, async () => ({
    players: Number((await w.db.query(`select count(*)::int n from public.players`)).rows[0].n),
    moments: Number((await w.db.query(`select count(*)::int n from public.moments`)).rows[0].n),
    activeTeams: Number((await w.db.query(`select count(*)::int n from public.coach_team where ended_at is null`)).rows[0].n),
    links: Number((await w.db.query(`select count(*)::int n from public.coach_players`)).rows[0].n),
  }));
  r.canRecognise = (await attempt(() => w.recognise(uid))) === null;
  r.canRecogniseDirect = (await attempt(() => w.recognise(uid, uid, w.directPlayer))) === null;
  r.canAssess = (await attempt(() => w.assess(uid))) === null;
  return r;
}
const pendingOf = async (db, uid) => (await db.query(`select * from public.pending_profile_deletions where auth_user_id = $1`, [uid])).rows[0];
const restore = (w, pid, staff, reason = 'Deletion rejected after review') => w.service(`select public.restore_coach_access_after_deletion_rejection($1, $2, $3) as r`, [pid, staff, reason]).then((x) => x.rows[0].r);
// The explicit final step, in a signed-in staff session (0097).
const complete = (w, pid, actor = w.people.staff, reason = 'Blocking records dealt with; deletion approved') =>
  w.user(actor, `select public.complete_pending_profile_deletion($1, $2) as r`, [pid, reason]).then((x) => x.rows[0].r);
const reject = (w, pid, staff, reason = 'Coach asked to stay') => w.service(`select public.reject_pending_profile_deletion($1, $2, $3) as r`, [pid, staff, reason]).then((x) => x.rows[0].r);

console.log('\n=== 1. A coach whose deletion goes to staff review loses all access at once ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    await w.directLink(coach);
    await w.endedAssignment(coach);
    await w.assess(coach);
    const rec = await w.recognise(coach);
    const before = await reach(w, coach);
    check('1: setup — before the request the coach reads players and moments and can write on both paths',
      before.players === 2 && before.moments > 0 && before.activeTeams === 1 && before.links === 1 && before.canRecognise && before.canRecogniseDirect && before.canAssess, JSON.stringify(before));
    const teamsBefore = await coachRows(db, coach), linksBefore = await linkRows(db, coach);
    const auditBefore = await n(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1`, [coach]);
    const result = await deleteAccount(w, coach);
    check('1: the request goes to staff review and reports two suspended relationships', result.canDeleteIdentity === false && result.coachAccessSuspended === 2, JSON.stringify(result));
    // An assignment that has expired but was never ended is also suspended (ended for the review).
    const expiredCoach = await w.coach();
    await db.query(`update public.coach_team set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where profile_id = $1`, [expiredCoach]);
    await db.query(`insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [w.player, expiredCoach]);
    const re = await deleteAccount(w, expiredCoach);
    check('1: an expired but never-ended assignment is suspended too (snapshotted, ended for the review)',
      re.coachAccessSuspended === 1 && await n(db, `select count(*)::int n from public.coach_team where profile_id = $1 and end_reason = 'account_deletion_review'`, [expiredCoach]) === 1, JSON.stringify(re));
    const after = await reach(w, coach);
    check('1: immediately afterwards the coach reaches nothing and every coach write is refused',
      after.players === 0 && after.moments === 0 && after.activeTeams === 0 && after.links === 0 && !after.canRecognise && !after.canRecogniseDirect && !after.canAssess, JSON.stringify(after));
    check('1: …and cannot verify or change any moment (0 rows)', await w.as('authenticated', coach, async () => (await db.query(`update public.moments set visibility = 'family' where id = $1 returning id`, [rec])).rows.length) === 0);
    const ct = (await db.query(`select ended_at, ended_by, end_reason from public.coach_team where profile_id = $1 and team_id = $2`, [coach, w.team])).rows[0];
    check('1: the assignment is ended in the existing model (ended_at, ended_by = the account, reason account_deletion_review)', ct.ended_at !== null && ct.ended_by === coach && ct.end_reason === 'account_deletion_review', JSON.stringify(ct));
    check('1: the already-ended assignment is untouched and not snapshotted',
      (await db.query(`select end_reason from public.coach_team where profile_id = $1 and team_id = $2`, [coach, w.otherTeam])).rows[0].end_reason === 'Left the club' &&
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and team_id = $2`, [coach, w.otherTeam]) === 0);
    const audit = (await db.query(`select table_name, event, actor_profile_id, actor_source, operation, reason from public.relationship_audit_events where profile_id = $1 order by id desc limit 2`, [coach])).rows;
    check('1: two audit events, attributed to the account as trusted_function account_deletion_review',
      await n(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1`, [coach]) === auditBefore + 2 &&
      audit.every((a) => a.actor_profile_id === coach && a.actor_source === 'trusted_function' && a.operation === 'account_deletion_review' && a.reason === 'account_deletion_review') &&
      audit.some((a) => a.table_name === 'coach_team' && a.event === 'UPDATE') && audit.some((a) => a.table_name === 'coach_players' && a.event === 'DELETE'), JSON.stringify(audit));
    const pending = await pendingOf(db, coach);
    const snap = (await db.query(`select relationship, team_id, player_id, original_row, resolved_at from public.deletion_review_access_suspensions where pending_deletion_id = $1 order by relationship`, [pending.id])).rows;
    check('1: the snapshot holds exactly the assignment and the link as they were',
      snap.length === 2 && snap.every((s) => s.resolved_at === null) &&
      JSON.stringify([snap[1].original_row].map((r) => ({ team_id: r.team_id, created_via: r.created_via, created_by: r.created_by, expires_at: r.expires_at, ended_at: r.ended_at }))) ===
        JSON.stringify(JSON.parse(teamsBefore).filter((t) => t.team_id === w.team).map((t) => ({ team_id: t.team_id, created_via: t.created_via, created_by: t.created_by, expires_at: t.expires_at, ended_at: t.ended_at }))) &&
      snap[0].player_id === w.directPlayer && snap[0].original_row.created_by === JSON.parse(linksBefore)[0].created_by, JSON.stringify(snap));
    check('1: only service_role can read the snapshot; signed-in users cannot',
      (await attempt(() => w.user(coach, `select * from public.deletion_review_access_suspensions`)))?.includes('permission denied') &&
      (await w.service(`select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1`, [coach])).rows[0].n === 2);
    check('1: the recognition keeps its verifier while the deletion is only under review (no deleted-verifier marker; the account still exists)', await n(db, `select count(*)::int n from public.moments where id = $1 and verified_by = $2 and verifier_account_deleted_at is null and verification_status = 'coach_verified'`, [rec, coach]) === 1);
    check('1: a repeated request suspends nothing more and keeps one snapshot per relationship',
      (await deleteAccount(w, coach)).coachAccessSuspended === 0 && await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1`, [coach]) === 2);

    console.log('\n=== 2. Staff decide: reject, then restore exactly ===');
    check('2: restore is refused while the request is pending', (await attempt(() => restore(w, pending.id, people.staff)))?.includes('only after the deletion is rejected (it is pending)'));
    check('2: reject is refused for a non-staff actor and without a reason',
      (await attempt(() => reject(w, pending.id, people.parent)))?.includes('Not authorized: staff only') && (await attempt(() => reject(w, pending.id, people.staff, '  ')))?.includes('A reason'));
    check('2: signed-in users cannot call either staff function',
      (await attempt(() => w.user(coach, `select public.reject_pending_profile_deletion($1, $2, 'x')`, [pending.id, people.staff])))?.includes('permission denied') &&
      (await attempt(() => w.user(people.staff, `select public.restore_coach_access_after_deletion_rejection($1, $2, 'x')`, [pending.id, people.staff])))?.includes('permission denied'));
    check('2: staff reject the request; a repeat reports already_rejected', (await reject(w, pending.id, people.staff)) === 'rejected' && (await reject(w, pending.id, people.staff)) === 'already_rejected');
    const rejected = await pendingOf(db, coach);
    check('2: the rejection records who, when and why', rejected.status === 'rejected' && rejected.resolved_by === people.staff && rejected.resolved_at !== null && rejected.rejection_reason === 'Coach asked to stay');
    check('2: still no access after rejection alone (restoration is never automatic)', (await reach(w, coach)).players === 0);
    check('2: restore is refused for a non-staff actor', (await attempt(() => restore(w, pending.id, coach)))?.includes('Not authorized: staff only'));
    const auditPre = await n(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1`, [coach]);
    const r1 = await restore(w, pending.id, people.staff);
    check('2: restore brings back both relationships', r1.restored === 2 && r1.notRestorable === 0 && r1.nothingToRestore === false, JSON.stringify(r1));
    check('2: the assignment and the link are exactly as before the request', (await coachRows(db, coach)) === teamsBefore && (await linkRows(db, coach)) === linksBefore);
    const back = await reach(w, coach);
    check('2: the coach reads and writes again on both paths', back.players === 2 && back.activeTeams === 1 && back.links === 1 && back.canRecognise && back.canRecogniseDirect, JSON.stringify(back));
    const raudit = (await db.query(`select actor_profile_id, actor_source, operation, reason from public.relationship_audit_events where profile_id = $1 and id > (select max(id) - 2 from public.relationship_audit_events where profile_id = $1)`, [coach])).rows;
    check('2: restoration is audited and attributed to the staff member with their reason',
      await n(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1`, [coach]) === auditPre + 2 &&
      raudit.every((a) => a.actor_profile_id === people.staff && a.actor_source === 'trusted_function' && a.operation === 'restore_coach_access_after_deletion_rejection' && a.reason === 'Deletion rejected after review'), JSON.stringify(raudit));
    check('2: each snapshot row records the outcome, the staff member and the reason',
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where pending_deletion_id = $1 and resolution = 'restored' and resolved_by = $2 and resolution_reason = 'Deletion rejected after review'`, [pending.id, people.staff]) === 2);
    const r2 = await restore(w, pending.id, people.staff);
    check('2: a second restore changes nothing (idempotent)', r2.restored === 0 && r2.nothingToRestore === true &&
      await n(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1`, [coach]) === auditPre + 2 && (await coachRows(db, coach)) === teamsBefore, JSON.stringify(r2));

    console.log('\n=== 3. Requesting deletion again after a restore ===');
    const again = await deleteAccount(w, coach);
    const reopened = await pendingOf(db, coach);
    check('3: the same request reopens as pending, decision cleared, access suspended again',
      again.canDeleteIdentity === false && again.coachAccessSuspended === 2 && reopened.id === pending.id && reopened.status === 'pending' && reopened.rejection_reason === null && reopened.resolved_by === null &&
      (await reach(w, coach)).players === 0, JSON.stringify(again));
    check('3: the earlier round stays on record as restored; two new open rows',
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and resolution = 'restored'`, [coach]) === 2 &&
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and resolved_at is null`, [coach]) === 2);
    await reject(w, pending.id, people.staff);
    check('3: a second reject + restore works too', (await restore(w, pending.id, people.staff)).restored === 2 && (await coachRows(db, coach)) === teamsBefore);

    console.log('\n=== 4. Restore refused for a resolved (approved) request ===');
    await deleteAccount(w, coach);
    check('4: service_role can no longer write review records directly (0098)',
      (await attempt(() => w.service(`update public.pending_profile_deletions set status = 'resolved' where id = $1`, [pending.id])))?.includes('permission denied') &&
      (await attempt(() => w.service(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason) values ($1, 'coach_authored_player_records')`, [id()])))?.includes('permission denied') &&
      (await attempt(() => w.service(`delete from public.pending_profile_deletions where id = $1`, [pending.id])))?.includes('permission denied') &&
      (await w.service(`select count(*)::int n from public.pending_profile_deletions where id = $1`, [pending.id])).rows[0].n === 1);
    // A request resolved by hand (as the table owner, the SQL Editor role).
    await db.query(`update public.pending_profile_deletions set status = 'resolved', resolved_by = $2, resolved_at = now() where id = $1`, [pending.id, people.staff]);
    check('4: restore is refused for a resolved request', (await attempt(() => restore(w, pending.id, people.staff)))?.includes('(it is resolved)'));
    check('4: reject is refused for a resolved request', (await attempt(() => reject(w, pending.id, people.staff)))?.includes('already resolved'));
  } catch (e) {
    check('1–4: staff review lifecycle', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 5. Changes while under review: only still-restorable relationships come back ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    // A second team, to be deleted while under review.
    const team2 = id();
    await w.service(`insert into public.teams (id, club_id, name, season_id) values ($1, $2, 'U14', $3)`, [team2, w.club, w.season]);
    const code = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await w.service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [team2, code]);
    await w.service(`select status from public.redeem_team_invite($1, $2)`, [code, coach]);
    await w.directLink(coach);
    await w.assess(coach);
    const result = await deleteAccount(w, coach);
    const pid = (await pendingOf(db, coach)).id;
    check('5: setup — three relationships suspended', result.coachAccessSuspended === 3, JSON.stringify(result));
    // While under review the second team is deleted. Nothing can grant the
    // account access while it is pending (section 11), so the other changes
    // happen after staff reject and before they restore: staff reinstate then
    // end the main assignment for another reason, and the parent's direct
    // link is re-created by a fresh coach invite (so a link already exists).
    await db.query(`delete from public.teams where id = $1`, [team2]);
    await reject(w, pid, people.staff);
    const req = (await w.user(coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U10b') returning id`)).rows[0].id;
    await w.service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [req, people.staff, w.team]);
    await w.service(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [w.team, coach, people.staff]);
    await w.directLink(coach);
    const r = await restore(w, pid, people.staff);
    const notes = (await db.query(`select resolution, resolution_note from public.deletion_review_access_suspensions where pending_deletion_id = $1 order by resolution_note`, [pid])).rows;
    check('5: nothing is restored over a newer state; each row says why',
      r.restored === 0 && r.notRestorable === 3 &&
      JSON.stringify(notes.map((x) => x.resolution_note).sort()) === JSON.stringify(['assignment was ended again for another reason', 'link already exists', 'team no longer exists']) &&
      notes.every((x) => x.resolution === 'not_restorable'), JSON.stringify(notes));
    check('5: the staff ending stands (not reactivated)', (await db.query(`select end_reason from public.coach_team where profile_id = $1 and team_id = $2`, [coach, w.team])).rows[0].end_reason === 'Left the club');
  } catch (e) {
    check('5: changes while under review', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 6. Staff accounts cannot self-delete ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    await w.service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [w.directPlayer, people.staff]);
    const before = await rowsOf(db, `select (select count(*) from public.guardians where profile_id = $1) g, (select count(*) from public.staff_accounts where profile_id = $1) s, (select count(*) from public.profiles where id = $1) p, (select count(*) from public.pending_profile_deletions) d, (select count(*) from public.player_deletion_requests) r`, [people.staff]);
    const err = await attempt(() => deleteAccount(w, people.staff));
    check('6: delete_own_guardian_account refuses a staff account with a clear error', err?.includes('Staff accounts cannot be deleted from the app'), err);
    check('6: …changing nothing (profile, staff row, guardian link, no requests filed)', (await rowsOf(db, `select (select count(*) from public.guardians where profile_id = $1) g, (select count(*) from public.staff_accounts where profile_id = $1) s, (select count(*) from public.profiles where id = $1) p, (select count(*) from public.pending_profile_deletions) d, (select count(*) from public.player_deletion_requests) r`, [people.staff])) === before);
  } catch (e) {
    check('6: staff refusal', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 7. Nobody can name another person as verifier ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const coachA = await w.coach();
    const coachB = await w.coach();
    const ended = await w.coach();
    await w.service(`select public.end_coach_assignment($1, $2, $3, 'Season over')`, [w.team, ended, people.staff]);
    const rls = (e) => e?.includes('row-level security');
    check('7: an active coach cannot insert a recognition naming another coach', rls(await attempt(() => w.recognise(coachA, coachB))));
    check('7: …or naming a parent', rls(await attempt(() => w.recognise(coachA, people.parent))));
    check('7: an active coach\'s own recognition saves (celebrate path)', (await attempt(() => w.recognise(coachA))) === null);
    const m1 = await w.submit();
    check('7: an active coach cannot verify naming another coach', rls(await attempt(() => w.verify(coachA, m1, coachB))));
    check('7: …or naming a parent', rls(await attempt(() => w.verify(coachA, m1, people.parent))));
    check('7: an active coach verifies as themselves (verify path)', (await w.verify(coachA, m1)) === 1);
    const m2 = await w.submit();
    check('7: a parent cannot mark their own moment coach-verified as themselves', rls(await attempt(() => w.verify(people.parent, m2))));
    check('7: …nor name a coach as verifier', rls(await attempt(() => w.verify(people.parent, m2, coachA))));
    check('7: a parent can still change visibility on a coach-verified moment (verifier unchanged)',
      (await w.user(people.parent, `update public.moments set visibility = 'family' where id = $1 returning id`, [m1])).rows.length === 1);
    check('7: another active coach can change visibility on it too, and cannot re-attribute it',
      (await w.user(coachB, `update public.moments set visibility = 'club' where id = $1 returning id`, [m1])).rows.length === 1 &&
      rls(await attempt(() => w.user(coachB, `update public.moments set verified_by = $2 where id = $1`, [m1, coachB]))));
    check('7: an ended coach can neither recognise nor verify', !!(await attempt(() => w.recognise(ended))) && (await w.verify(ended, await w.submit())) === 0);
    check('7: a stranger can neither recognise nor verify', !!(await attempt(() => w.recognise(people.stranger))) && (await w.verify(people.stranger, await w.submit())) === 0);
    check('7: the recognition and verification rows name only the acting coach',
      await n(db, `select count(*)::int n from public.moments where verified_by is not null and verified_by <> $1`, [coachA]) === 0);
  } catch (e) {
    check('7: verifier identity', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 8. Ordinary deletions are unchanged at 0098 ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const recogniser = await w.coach();
    const rec = await w.recognise(recogniser);
    const plain = await w.coach();
    await w.directLink(plain);
    const r1 = await deleteAccount(w, recogniser), r2 = await deleteAccount(w, plain);
    check('8: a coach with recognitions, and a coach with a team and a direct link, delete fully (no staff review, nothing suspended)',
      r1.canDeleteIdentity && r2.canDeleteIdentity && r1.coachAccessSuspended === 0 && r2.coachAccessSuspended === 0 &&
      await n(db, `select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[recogniser, plain]]) === 0, JSON.stringify([r1, r2]));
    check('8: the recognition stays with the family (0097)', await n(db, `select count(*)::int n from public.moments where id = $1 and verification_status = 'coach_verified' and verifier_account_deleted_at is not null`, [rec]) === 1);
    const req = await w.user(people.coParent, `select 1`).then(() => db.query(`insert into public.player_deletion_requests (player_id, requested_by, status, cancelled_by, cancelled_at) values ($1, $2, 'cancelled', $2, now()) returning id`, [w.player, people.coParent]));
    const r3 = await deleteAccount(w, people.coParent);
    check('8: a parent who cancelled a deletion request deletes (0097)', r3.canDeleteIdentity === true && await n(db, `select count(*)::int n from public.player_deletion_requests where id = $1 and cancelled_by_account_deleted_at is not null`, [req.rows[0].id]) === 1);
    const card = id();
    await db.query(`insert into public.cards (id, player_id, claim_token, status) values ($1, $2, 'S8-CARD', 'claimed')`, [card, w.directPlayer]);
    const r4 = await deleteAccount(w, people.parent);
    check('8: a parent-only account deletes as before', r4.canDeleteIdentity === true && r4.playersDeletionRequested.length === 2, JSON.stringify(r4));
    check('8: …filing exactly one child deletion request per child and locking the card, audited to the parent (immediate path unchanged)',
      await n(db, `select count(*)::int n from public.player_deletion_requests where player_id = any($1::uuid[]) and status = 'pending' and notes like 'Automatic%'`, [[w.player, w.directPlayer]]) === 2 &&
      await n(db, `select count(*)::int n from public.cards where id = $1 and access_status = 'suspended'`, [card]) === 1 &&
      await n(db, `select count(*)::int n from public.card_access_audit_events where card_id = $1 and actor_role = 'guardian' and actor_profile_id = $2`, [card, people.parent]) === 1);
    check('8: no suspension or pending deletion was created by any of them', await n(db, `select (select count(*) from public.deletion_review_access_suspensions) + (select count(*) from public.pending_profile_deletions) as n`) === 0);
  } catch (e) {
    check('8: ordinary deletions', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 9. Applying 0098; re-run and precondition refusals ===');
const refusedApply = (db, from, through) => applyMigrations(db, { from, through }).then(() => null).catch(async (e) => { await db.exec('rollback;').catch(() => {}); return e.message; });
let db9, c97, c98;
{
  const at96 = await readyDatabase('0096');
  const r = await refusedApply(at96, '0098', '0098');
  check('9: 0098 is refused on a database without 0097', r?.includes('0098 refused: the expected 0097 state is not in place'), r);
  await at96.close();

  db9 = await readyDatabase('0097');
  const w = await world({ db: db9 });
  const coach = await w.coach();
  await w.recognise(coach);
  await w.assess(coach);
  w.coachUid = coach;
  globalThis.w9 = w;
  c97 = await snapshotCatalog(db9);
  const before = await rowsOf(db9, `select id, verified_by, verifier_account_deleted_at, verification_status from public.moments order by id`);
  const applied = await refusedApply(db9, '0098', '0098');
  check('9: 0098 applies on a 0097 database with data', applied === null, applied);
  c98 = await snapshotCatalog(db9);
  check('9: no existing moment changed', (await rowsOf(db9, `select id, verified_by, verifier_account_deleted_at, verification_status from public.moments order by id`)) === before);
  const d = diffCatalog(c97, c98);
  const added = d.added.filter((k) => !k.startsWith('column:deletion_review_access_suspensions.') && !k.startsWith('constraint:deletion_review_access_suspensions.') && !k.startsWith('index:deletion_review_access_suspensions'));
  check('9: the catalog change is exactly the 0098 objects',
    JSON.stringify(added.sort()) === JSON.stringify([
      'column:pending_profile_deletions.rejection_reason',
      'constraint:pending_profile_deletions.pending_profile_deletions_rejection_check',
      'function:moment_verifier_unchanged(p_moment_id uuid, p_verified_by uuid)',
      'function:close_deletion_review_suspensions()',
      'function:account_deletion_preview(p_pending_deletion_id uuid)',
      'function:my_account_deletion_review()',
      'trigger:profiles.profiles_close_deletion_review_suspensions',
      'function:profile_has_pending_deletion_review(p_profile_id uuid)',
      'function:refuse_coach_access_during_deletion_review()',
      'trigger:coach_players.deletion_review_access_guard',
      'trigger:coach_team.deletion_review_access_guard',
      'trigger:coach_team_requests.deletion_review_access_guard',
      'function:reject_pending_profile_deletion(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)',
      'function:restore_coach_access_after_deletion_rejection(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)',
      'policy:moments.moments: a signed-in user can only name themselves as verifier',
      'policy:moments.moments: a verifier change names only the calling coach',
      'relation:deletion_review_access_suspensions',
    ].sort()) && d.removed.length === 0 &&
    JSON.stringify(d.changed.sort()) === JSON.stringify([
      'relation:pending_profile_deletions',
      'constraint:pending_profile_deletions.pending_profile_deletions_status_check',
      'function:approve_coach_team_request(p_request_id uuid, p_staff_profile_id uuid, p_team_id uuid, p_expires_at timestamp with time zone, p_season_id uuid)',
      'function:delete_own_guardian_account()',
      'function:redeem_coach_invite(p_code text, p_coach_profile_id uuid, p_display_name text)',
      'function:redeem_team_invite(p_code text, p_coach_profile_id uuid, p_display_name text)',
    ].sort()), JSON.stringify(d));
  check('9: the redeem and approve functions keep SECURITY DEFINER, search_path, owner and EXECUTE for service_role only',
    ['approve_coach_team_request(p_request_id uuid, p_staff_profile_id uuid, p_team_id uuid, p_expires_at timestamp with time zone, p_season_id uuid)',
     'redeem_coach_invite(p_code text, p_coach_profile_id uuid, p_display_name text)', 'redeem_team_invite(p_code text, p_coach_profile_id uuid, p_display_name text)']
      .every((f) => c98.get(`function:${f}`).split(' | ').slice(0, 5).join(' | ') === c97.get(`function:${f}`).split(' | ').slice(0, 5).join(' | ')));
  check('9: the access guard helper and trigger function are executable by nobody but their owner',
    ['profile_has_pending_deletion_review(p_profile_id uuid)', 'refuse_coach_access_during_deletion_review()', 'close_deletion_review_suspensions()']
      .every((f) => { const acl = c98.get(`function:${f}`).split(' | ')[4]; return !acl.includes('service_role=') && !acl.includes('authenticated=') && !acl.includes('anon=') && !/(^|,)=X/.test(acl); }),
    ['profile_has_pending_deletion_review(p_profile_id uuid)', 'refuse_coach_access_during_deletion_review()'].map((f) => c98.get(`function:${f}`).split(' | ')[4]).join(' ; '));
  check('9: delete_own_guardian_account keeps SECURITY DEFINER, empty search_path, owner and EXECUTE for authenticated only',
    c98.get('function:delete_own_guardian_account()').split(' | ').slice(0, 5).join(' | ') === c97.get('function:delete_own_guardian_account()').split(' | ').slice(0, 5).join(' | '));
  check('9: the staff functions are executable by service_role only', ['reject_pending_profile_deletion(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)', 'restore_coach_access_after_deletion_rejection(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)']
    .every((f) => { const acl = c98.get(`function:${f}`).split(' | ')[4]; return acl.includes('service_role=X') && !acl.includes('authenticated=') && !acl.includes('anon=') && !/(^|,)=X/.test(acl); }));
  const rerun = await refusedApply(db9, '0098', '0098');
  check('9: re-running 0098 is refused, changing nothing', rerun?.includes('0098 already applied') && keysOf(diffCatalog(c98, await snapshotCatalog(db9))).length === 0, rerun);
}

console.log('\n=== 10. Rollback ===');
{
  const db = db9;
  const w = globalThis.w9;
  async function rollBack(sql, ack) {
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
  const noAck = async () => (await db.query(`select coalesce(current_setting($1, true), '') v`, [ACK_0098[0]])).rows[0].v === '';
  let r = await rollBack(ROLLBACK_0097, ACK_0097);
  check('10: the 0097 rollback is refused while 0098 is applied', r?.includes('0098 is still applied; roll back 0098 first') && keysOf(diffCatalog(c98, await snapshotCatalog(db))).length === 0, r);
  r = await rollBack(ROLLBACK_0098, null);
  check('10: the 0098 rollback is refused without the acknowledgement, changing nothing', r?.includes('0098 rollback refused') && keysOf(diffCatalog(c98, await snapshotCatalog(db))).length === 0, r);
  r = await rollBack(ROLLBACK_0098, ACK_0098);
  check('10: with the acknowledgement and nothing in use, it succeeds', r === null, r);
  let diff = keysOf(diffCatalog(c97, await snapshotCatalog(db)));
  check('10: …to the exact 0097 catalog, and no acknowledgement persists', diff.length === 0 && (await noAck()), diff.join(', '));
  r = await rollBack(ROLLBACK_0098, ACK_0098);
  check('10: a second rollback is refused (not applied)', r?.includes('0098 is not applied'), r);
  const again = await refusedApply(db, '0098', '0098');
  diff = keysOf(diffCatalog(c98, await snapshotCatalog(db)));
  check('10: 0098 re-applies to the exact 0098 catalog', again === null && diff.length === 0, again ?? diff.join(', '));
  // Use it: a staff-review deletion records a suspension, then rollback must refuse.
  const res = await deleteAccount(w, w.coachUid);
  check('10: after re-apply, the coach\'s request suspends access', res.canDeleteIdentity === false && res.coachAccessSuspended === 1, JSON.stringify(res));
  const before = await snapshotCatalog(db);
  r = await rollBack(ROLLBACK_0098, ACK_0098);
  check('10: rollback is refused once a suspension exists, naming the count, changing nothing',
    r?.includes('1 access suspension record(s) exist') && keysOf(diffCatalog(before, await snapshotCatalog(db))).length === 0 && (await noAck()), r);
  await db.close();
}
{
  // Rollback also refuses on a rejection alone (an account with no coach relationships).
  const db = await readyDatabase('0098');
  const w = await world({ db });
  const someone = await w.coach();
  await w.assess(someone);
  await w.service(`select public.end_coach_assignment($1, $2, $3, 'Season over')`, [w.team, someone, w.people.staff]);
  const res = await deleteAccount(w, someone);
  await reject(w, (await pendingOf(db, someone)).id, w.people.staff);
  await db.exec('begin;');
  await db.query(`select set_config($1, $2, true)`, ACK_0098);
  const r = await db.exec(ROLLBACK_0098).then(() => null).catch((e) => e.message);
  await db.exec('rollback;').catch(() => {});
  check('10: rollback is refused on a rejected deletion even with no suspension', res.coachAccessSuspended === 0 && r?.includes('1 rejected profile deletion(s) exist'), r);
  await db.close();
}

const PRECHECK = fs.readFileSync(path.resolve(HERE, '../../verification/0098_precheck_pending_deletion_reviews.sql'), 'utf8');
const errOf = (fn) => fn().then(() => null).catch((e) => `${e.code ?? ''}:${e.message}`);
const PAUSED = 'EMDRP:account_deletion_review_pending';
// Runs the pre-check exactly as the SQL Editor would (one script, one implicit
// transaction) and returns its single row.
async function precheck(db) {
  const res = await db.exec(PRECHECK);
  return res.at(-1).rows[0];
}

console.log('\n=== 11. While the deletion is pending, nothing grants the account coach access ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    await w.directLink(coach);
    await w.assess(coach);
    const teamsBefore = await coachRows(db, coach), linksBefore = await linkRows(db, coach);
    // A team request filed before the deletion, still waiting for staff.
    const reqBefore = (await w.user(coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U15') returning id`)).rows[0].id;
    // A fresh coach invite for the direct player.
    const coachCode = `COACH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await w.user(people.parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, $2, $3)`, [w.directPlayer, coachCode, people.parent]);
    const result = await deleteAccount(w, coach);
    const pid = (await pendingOf(db, coach)).id;
    check('11: setup — the deletion goes to staff review and suspends both relationships', result.canDeleteIdentity === false && result.coachAccessSuspended === 2, JSON.stringify(result));
    // Two fresh team invites: another team, and the suspended team.
    const teamCode = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, mainCode = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await w.service(`insert into public.team_invites (team_id, code) values ($1, $2), ($3, $4)`, [w.otherTeam, teamCode, w.team, mainCode]);
    const state = () => rowsOf(db, `select
        (select json_agg(c order by team_id) from public.coach_team c where profile_id = $1) ct,
        (select json_agg(c order by player_id) from public.coach_players c where profile_id = $1) cp,
        (select json_agg(r order by id) from public.coach_team_requests r where requester_profile_id = $1) req,
        (select json_agg(i order by code) from public.coach_invites i where code = $2) ci,
        (select json_agg(i order by code) from public.team_invites i where code in ($3, $4)) ti,
        (select role from public.profiles where id = $1) role,
        (select count(*) from public.clubs) clubs, (select count(*) from public.teams) teams,
        (select count(*) from public.relationship_audit_events where profile_id = $1) audit`, [coach, coachCode, teamCode, mainCode]);
    const frozen = await state();

    const rc = (await w.service(`select status, player_id from public.redeem_coach_invite($1, $2)`, [coachCode, coach])).rows[0];
    check('11: redeeming a direct coach invite returns account_deletion_review_pending', rc.status === 'account_deletion_review_pending' && rc.player_id === null, JSON.stringify(rc));
    const rt = (await w.service(`select status, team_id from public.redeem_team_invite($1, $2)`, [teamCode, coach])).rows[0];
    const rm = (await w.service(`select status, team_id from public.redeem_team_invite($1, $2)`, [mainCode, coach])).rows[0];
    check('11: redeeming a team invite (another team, or the suspended team) returns account_deletion_review_pending',
      rt.status === 'account_deletion_review_pending' && rt.team_id === null && rm.status === 'account_deletion_review_pending', JSON.stringify([rt, rm]));
    check('11: …and no invite was used, no link or assignment created, no role, request, club, team or audit change', (await state()) === frozen);

    const ap1 = await errOf(() => w.service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [reqBefore, people.staff, w.otherTeam]));
    const ap2 = await errOf(() => w.service(`select public.approve_coach_team_request($1, $2, null, null, $3)`, [reqBefore, people.staff, w.season]));
    check('11: staff approval of its team request (existing team, or a new club and team) is refused with EMDRP', ap1 === PAUSED && ap2 === PAUSED, `${ap1} / ${ap2}`);
    check('11: …the request stays pending and undecided; no club or team was created', (await state()) === frozen &&
      (await db.query(`select status, decided_by, decided_at, resulting_team_id from public.coach_team_requests where id = $1`, [reqBefore])).rows
        .every((r) => r.status === 'pending' && r.decided_by === null && r.decided_at === null && r.resulting_team_id === null));
    await w.user(coach, `select public.cancel_own_coach_team_request($1)`, [reqBefore]);
    const nr = await errOf(() => w.user(coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U16')`));
    check('11: the coach can cancel the old request but cannot file a new one (EMDRP)', nr === PAUSED, nr);
    const frozen2 = await state();

    const act1 = await errOf(() => w.service(`select public.activate_coach_assignment($1, $2, 'staff', $3)`, [w.otherTeam, coach, people.staff]));
    const act2 = await errOf(() => w.service(`select public.activate_coach_assignment($1, $2, 'team_invite', $2)`, [w.team, coach]));
    check('11: activate_coach_assignment (new team, or reactivating the suspended one) is refused with EMDRP', act1 === PAUSED && act2 === PAUSED, `${act1} / ${act2}`);
    const rawInsert = await errOf(() => db.query(`insert into public.coach_team (team_id, profile_id, created_via, created_by) values ($1, $2, 'staff', $3)`, [w.otherTeam, coach, people.staff]));
    const rawReactivate = await errOf(() => db.query(`update public.coach_team set ended_at = null, ended_by = null, end_reason = null where team_id = $1 and profile_id = $2`, [w.team, coach]));
    const rawLink = await errOf(() => db.query(`insert into public.coach_players (player_id, profile_id, created_via) values ($1, $2, 'guardian_invite')`, [w.directPlayer, coach]));
    check('11: as the table owner, a raw coach_team insert, a raw reactivation and a raw coach_players insert are all refused with EMDRP',
      rawInsert === PAUSED && rawReactivate === PAUSED && rawLink === PAUSED, `${rawInsert} / ${rawReactivate} / ${rawLink}`);
    const svcInsert = await errOf(() => w.service(`insert into public.coach_team (team_id, profile_id) values ($1, $2)`, [w.otherTeam, coach]));
    const svcLink = await errOf(() => w.service(`insert into public.coach_players (player_id, profile_id) values ($1, $2)`, [w.directPlayer, coach]));
    check('11: as service_role, raw inserts are refused too', !!svcInsert && !!svcLink, `${svcInsert} / ${svcLink}`);
    // Moving another coach's active assignment or link onto the account is a grant too.
    const other = await w.coach();
    await w.directLink(other);
    const moveTeam = await errOf(() => db.query(`update public.coach_team set profile_id = $1 where team_id = $2 and profile_id = $3`, [coach, w.team, other]));
    const moveLink = await errOf(() => db.query(`update public.coach_players set profile_id = $1 where player_id = $2 and profile_id = $3`, [coach, w.directPlayer, other]));
    check('11: re-keying another coach\'s active assignment or link onto the account is refused with EMDRP', moveTeam === PAUSED && moveLink === PAUSED, `${moveTeam} / ${moveLink}`);
    check('11: after every refused attempt the account\'s state is exactly as it was', (await state()) === frozen2);
    const writers = (await db.query(`select array_agg(p.proname::text order by p.proname) fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.prosrc ~* 'insert\\s+into\\s+public\\.coach_(team|players)\\M' or p.prosrc ~* 'update\\s+public\\.coach_(team|players)\\M')`)).rows[0].fns;
    check('11: the only functions that write coach_team / coach_players are the known ones (no squad-invite path creates coach access)',
      JSON.stringify(writers) === JSON.stringify(['activate_coach_assignment', 'approve_coach_team_request', 'delete_own_guardian_account', 'end_coach_assignment', 'redeem_coach_invite', 'redeem_team_invite', 'restore_coach_access_after_deletion_rejection']), JSON.stringify(writers));
    check('11: the guard helper is not callable by signed-in users or service_role',
      (await attempt(() => w.user(coach, `select public.profile_has_pending_deletion_review($1)`, [coach])))?.includes('permission denied') &&
      (await attempt(() => w.service(`select public.profile_has_pending_deletion_review($1)`, [coach])))?.includes('permission denied'));

    console.log('\n=== 12. Ordinary accounts are unaffected while another account is pending ===');
    const fresh = id();
    await w.person(fresh);
    const fc = `COACH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, ft = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await w.user(people.parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, $2, $3)`, [w.directPlayer, fc, people.parent]);
    await w.service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [w.otherTeam, ft]);
    const f1 = (await w.service(`select status from public.redeem_coach_invite($1, $2)`, [fc, fresh])).rows[0].status;
    const f2 = (await w.service(`select status from public.redeem_team_invite($1, $2)`, [ft, fresh])).rows[0].status;
    const freq = (await w.user(fresh, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U17') returning id`)).rows[0].id;
    const f3 = await errOf(() => w.service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [freq, people.staff, w.team]));
    check('12: another coach redeems both invites, files a request and is approved as normal', f1 === 'redeemed' && f2 === 'redeemed' && f3 === null, `${f1} / ${f2} / ${f3}`);
    // A deletion request staff resolved (not pending) does not block.
    const resolvedAcct = id();
    await w.person(resolvedAcct);
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason, status, resolved_by, resolved_at) values ($1, 'coach_authored_player_records', 'resolved', $2, now())`, [resolvedAcct, people.staff]);
    const rt2 = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await w.service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [w.otherTeam, rt2]);
    check('12: an account whose deletion request is resolved (not pending) is not blocked', (await w.service(`select status from public.redeem_team_invite($1, $2)`, [rt2, resolvedAcct])).rows[0].status === 'redeemed');

    console.log('\n=== 13. After staff reject: restore is exact, then the normal routes work again ===');
    await reject(w, pid, people.staff);
    const r = await restore(w, pid, people.staff);
    check('13: restore after rejection still restores exactly what was suspended', r.restored === 2 && r.notRestorable === 0 &&
      (await coachRows(db, coach)) === teamsBefore && (await linkRows(db, coach)) === linksBefore, JSON.stringify(r));
    // The direct link is back; remove it to show the same coach invite works again.
    await w.service(`select public.remove_direct_coach_link($1, $2, $3, 'Test: re-link by invite')`, [w.directPlayer, coach, people.parent]);
    const a1 = (await w.service(`select status from public.redeem_coach_invite($1, $2)`, [coachCode, coach])).rows[0].status;
    const a2 = (await w.service(`select status from public.redeem_team_invite($1, $2)`, [teamCode, coach])).rows[0].status;
    const req2 = (await w.user(coach, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U18') returning id`)).rows[0].id;
    const a3 = await errOf(() => w.service(`select public.approve_coach_team_request($1, $2, null, null, $3)`, [req2, people.staff, w.season]));
    check('13: the same coach invite, the same team invite, a new request and its approval all work again', a1 === 'redeemed' && a2 === 'redeemed' && a3 === null, `${a1} / ${a2} / ${a3}`);
  } catch (e) {
    check('11–13: no coach access while pending', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 14. A review pending before 0098: the read-only pre-check and the manual suspension ===');
{
  // A review filed under 0097 keeps its access when 0098 is applied (no
  // retroactive suspension). The pre-check counts it; staff end it with the
  // existing functions; the pre-check then reads 0.
  const db = await readyDatabase('0097');
  try {
    const w = await world({ db });
    const coach = await w.coach();
    await w.directLink(coach);
    await w.assess(coach);
    const before97 = await precheck(db);
    check('14: on 0097 the pre-check runs read-only and counts nothing before any review', before97.read_only_guard === 'on' && Number(before97.pending_reviews) === 0, JSON.stringify(before97));
    const res97 = await deleteAccount(w, coach);
    const p97 = await precheck(db);
    const nums = (row) => JSON.stringify(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, k === 'read_only_guard' ? v : Number(v)])));
    check('14: a 0097 review keeps its access, and the pre-check counts it (counts only, no identifiers)',
      res97.canDeleteIdentity === false && res97.coachAccessSuspended === undefined &&
      nums(p97) === JSON.stringify({ read_only_guard: 'on', pending_reviews: 1, pending_accounts_with_active_team: 1, active_team_assignments: 1, pending_accounts_with_open_team: 1, open_team_assignments: 1, pending_accounts_with_direct_links: 1, direct_links: 1, pending_accounts_with_team_requests: 0, pending_staff_accounts: 0 }), nums(p97));
    check('14: the pre-check\'s first statement makes the script unable to write',
      (await db.exec(`set transaction read only; insert into public.clubs (name) values ('Read-only probe');`).then(() => null).catch((e) => e.message))?.includes('read-only transaction'));
    const applied = await applyMigrations(db, { from: '0098', through: '0098' }).then(() => null).catch((e) => e.message);
    const p98 = await precheck(db);
    check('14: after 0098 is applied the earlier review still holds its access (not retroactive)', applied === null && Number(p98.active_team_assignments) === 1 && Number(p98.direct_links) === 1, applied ?? nums(p98));
    const tc = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await w.service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [w.otherTeam, tc]);
    check('14: …but it can gain nothing new', (await w.service(`select status from public.redeem_team_invite($1, $2)`, [tc, coach])).rows[0].status === 'account_deletion_review_pending');
    // The manual suspension as the private procedure runs it: one account, one transaction.
    await db.exec('begin;');
    await db.query(`select public.end_coach_assignment(ct.team_id, ct.profile_id, $2, 'account_deletion_review_manual')
      from public.coach_team ct where ct.profile_id = $1 and ct.ended_at is null`, [coach, w.people.staff]);
    await db.query(`select public.remove_direct_coach_link(cp.player_id, cp.profile_id, $2, 'account_deletion_review_manual')
      from public.coach_players cp where cp.profile_id = $1`, [coach, w.people.staff]);
    await db.exec('commit;');
    const after = await precheck(db);
    check('14: the manual suspension (end_coach_assignment, remove_direct_coach_link) is allowed while pending, and the pre-check then reads 0',
      Number(after.pending_reviews) === 1 && Number(after.open_team_assignments) === 0 && Number(after.direct_links) === 0 && Number(after.pending_accounts_with_open_team) === 0, nums(after));
    check('14: both changes are audited to the staff member with the manual reason',
      await n(db, `select count(*)::int n from public.relationship_audit_events where profile_id = $1 and actor_profile_id = $2 and reason = 'account_deletion_review_manual' and actor_source = 'trusted_function'`, [coach, w.people.staff]) === 2);
  } catch (e) {
    check('14: pre-check and manual suspension', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 15. Attribution through review, rejection, restore and final deletion ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    await w.directLink(coach);
    await w.assess(coach);
    const rec = await w.recognise(coach);
    // A child-deletion request this account cancelled (fixture row, as the 0097 suite does).
    const req = (await db.query(`insert into public.player_deletion_requests (player_id, requested_by, status, cancelled_by, cancelled_at) values ($1, $2, 'cancelled', $2, now() - interval '1 day') returning id`, [w.player, coach])).rows[0].id;
    const attribution = () => rowsOf(db, `select (select json_agg(json_build_object('s', verification_status, 'by', verified_by, 'at', verified_at, 'marker', verifier_account_deleted_at)) from public.moments where id = $1) m,
        (select json_agg(json_build_object('s', status, 'by', cancelled_by, 'at', cancelled_at, 'marker', cancelled_by_account_deleted_at)) from public.player_deletion_requests where id = $2) r`, [rec, req]);
    const original = await attribution();
    const parsed = JSON.parse(original)[0];
    check('15: setup — the recognition names the coach and the cancellation names the coach, no markers',
      parsed.m[0].by === coach && parsed.m[0].marker === null && parsed.r[0].by === coach && parsed.r[0].marker === null, original);
    const teamsBefore = await coachRows(db, coach), linksBefore = await linkRows(db, coach);

    const r1 = await deleteAccount(w, coach);
    check('15: pending review — access suspended (2), identity kept', r1.canDeleteIdentity === false && r1.coachAccessSuspended === 2, JSON.stringify(r1));
    check('15: pending review — verifier and canceller unchanged, no account-deleted marker on either', (await attribution()) === original);
    const pending = await pendingOf(db, coach);
    check('15: staff reject the deletion', (await reject(w, pending.id, people.staff)) === 'rejected');
    check('15: rejection — attribution unchanged', (await attribution()) === original);
    const rs = await restore(w, pending.id, people.staff);
    check('15: restore brings back exactly the suspended access', rs.restored === 2 && (await coachRows(db, coach)) === teamsBefore && (await linkRows(db, coach)) === linksBefore, JSON.stringify(rs));
    check('15: restore — attribution unchanged; nothing about moment history needed reconstructing', (await attribution()) === original);

    const r2 = await deleteAccount(w, coach);
    check('15: a later request goes to review again and suspends again; attribution still unchanged',
      r2.canDeleteIdentity === false && r2.coachAccessSuspended === 2 && (await attribution()) === original, JSON.stringify(r2));
    // Final deletion approved by staff: removing the login first is refused (it would skip the clean-up); staff deal
    // with the blocking record and complete; only now are both marked.
    const early = await attempt(() => db.query(`delete from auth.users where id = $1`, [coach]));
    check('15: removing the login while under review is refused; attribution unchanged', early?.includes('Profile deletion refused') && (await attribution()) === original, early);
    await db.query(`delete from public.player_assessments where created_by = $1`, [coach]);
    const fin = await complete(w, (await pendingOf(db, coach)).id);
    check('15: final deletion (staff completion) succeeds and deletes the profile', fin.status === 'completed' && await n(db, `select count(*)::int n from public.profiles where id = $1`, [coach]) === 0, JSON.stringify(fin));
    check('15: final deletion — both open suspensions are closed as account_deleted',
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and resolved_at is null`, [coach]) === 0 &&
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and resolution = 'account_deleted'`, [coach]) === 2);
    const after = JSON.parse(await attribution())[0];
    const o = parsed;
    check('15: final deletion — recognition still coach_verified, same verified_at, verifier NULL, deleted-verifier marker set',
      after.m[0].s === 'coach_verified' && after.m[0].at === o.m[0].at && after.m[0].by === null && after.m[0].marker !== null, JSON.stringify(after.m));
    check('15: final deletion — cancellation still cancelled, same cancelled_at, canceller NULL, marker set',
      after.r[0].s === 'cancelled' && after.r[0].at === o.r[0].at && after.r[0].by === null && after.r[0].marker !== null, JSON.stringify(after.r));
  } catch (e) {
    check('15: attribution lifecycle', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 16. 0098 and its rollback require the current 0097 (with the profile-deletion guard); squad cancellations ===');
{
  const DROP_TRIGGER = `drop trigger profiles_account_deletion_guard on public.profiles; drop function public.guard_profile_deletion();`;
  // (a) 0098 over a 0097 without the trigger (an earlier draft) is refused, changing nothing.
  const db97 = await readyDatabase('0097');
  try {
    await db97.exec(DROP_TRIGGER);
    const before = await snapshotCatalog(db97);
    const r = await refusedApply(db97, '0098', '0098');
    check('16: 0098 is refused over a 0097 without the attribution trigger, changing nothing',
      r?.includes('the 0097 account-deletion functions or profile-deletion guard are missing') && keysOf(diffCatalog(before, await snapshotCatalog(db97))).length === 0, r);
  } catch (e) {
    check('16: 0098 precondition requires the trigger', false, e.stack);
  }
  await db97.close();
  // (a2) …and over a 0097 whose trigger exists but is disabled.
  const db97d = await readyDatabase('0097');
  try {
    await db97d.exec(`alter table public.profiles disable trigger profiles_account_deletion_guard;`);
    const r = await refusedApply(db97d, '0098', '0098');
    check('16: 0098 is refused over a 0097 whose profile-deletion guard is disabled', r?.includes('the 0097 account-deletion functions or profile-deletion guard are missing'), r);
  } catch (e) {
    check('16: 0098 precondition requires an enabled trigger', false, e.stack);
  }
  await db97d.close();
  // (b) The 0098 rollback refuses when the 0097 underneath has no trigger, changing nothing.
  const db98 = await readyDatabase('0098');
  try {
    await db98.exec(DROP_TRIGGER);
    const before = await snapshotCatalog(db98);
    await db98.exec('begin;');
    let r = null;
    try {
      await db98.query(`select set_config($1, $2, true)`, ACK_0098);
      await db98.exec(ROLLBACK_0098);
    } catch (e) { r = e.message; await db98.exec('rollback;').catch(() => {}); }
    check('16: the 0098 rollback refuses over a 0097 without the attribution trigger, changing nothing',
      r?.includes('0098 rollback refused: the 0097 underneath is not the current version') && keysOf(diffCatalog(before, await snapshotCatalog(db98))).length === 0, r);
  } catch (e) {
    check('16: 0098 rollback requires the trigger', false, e.stack);
  }
  await db98.close();
  // (c) A Squad Invite participation deletion request the account cancelled: kept through review, marked only at final deletion.
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    await w.assess(coach);
    await db.exec(`set session_replication_role = replica;`);
    let sreq;
    try {
      const part = (await db.query(`insert into public.squad_invite_participations (campaign_id, guardian_profile_id, builder_token_hash) values ($1, $2, repeat('a', 64)) returning id`, [id(), coach])).rows[0].id;
      sreq = (await db.query(`insert into public.squad_invite_participation_deletion_requests (participation_id, requested_by, status, cancelled_by, cancelled_at) values ($1, $2, 'cancelled', $2, now() - interval '1 day') returning id`, [part, coach])).rows[0].id;
    } finally { await db.exec(`set session_replication_role = origin;`); }
    const row = () => rowsOf(db, `select status, cancelled_by, cancelled_at, cancelled_by_account_deleted_at m from public.squad_invite_participation_deletion_requests where id = $1`, [sreq]);
    const original = await row();
    const r1 = await deleteAccount(w, coach);
    check('16: squad cancellation — review keeps the canceller, no marker', r1.canDeleteIdentity === false && (await row()) === original, await row());
    const pending = await pendingOf(db, coach);
    await reject(w, pending.id, people.staff);
    await restore(w, pending.id, people.staff);
    check('16: squad cancellation — reject and restore keep it unchanged', (await row()) === original, await row());
    await deleteAccount(w, coach); // asks again: pending once more
    await db.query(`delete from public.player_assessments where created_by = $1`, [coach]);
    const fin = await attempt(() => complete(w, pending.id));
    const a = JSON.parse(await row())[0], o = JSON.parse(original)[0];
    check('16: squad cancellation — final deletion (staff completion) keeps it cancelled with its date, clears the canceller and sets the marker',
      fin === null && a.status === 'cancelled' && a.cancelled_at === o.cancelled_at && a.cancelled_by === null && a.m !== null, JSON.stringify([fin, a]));
  } catch (e) {
    check('16: squad cancellation lifecycle', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 17. A parent-coach under review keeps the whole family; staff completion erases once ===');
{
  const w = await world();
  const { db, people } = w;
  const parent = people.parent;
  try {
    // The parent is sole guardian of directPlayer and co-guardian (with coParent) of player.
    // They also coach the player's team (approved request), so a deletion reaches the review path
    // through a coach-authored record.
    const otherCoach = await w.coach(); // creates w.team
    const req = (await w.user(parent, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U12 parent') returning id`)).rows[0].id;
    await w.service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [req, people.staff, w.team]);
    const card1 = id(), card2 = id();
    await db.query(`insert into public.cards (id, player_id, claim_token, status) values ($1, $2, 'S17-CARD-1', 'claimed'), ($3, $4, 'S17-CARD-2', 'claimed')`, [card1, w.player, card2, w.directPlayer]);
    const rec = await w.recognise(parent);              // uploaded_by and verified_by = parent
    const sub = await w.submit('family_memory');         // uploaded_by = parent
    await w.user(parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, 'S17-COACH-1', $2)`, [w.directPlayer, parent]);
    // The co-parent invites the parent to coach their shared child directly: an invite the parent used (used_by).
    await w.user(people.coParent, `insert into public.coach_invites (player_id, code, created_by) values ($1, 'S17-COACH-2', $2)`, [w.player, people.coParent]);
    const redeemed = (await w.service(`select status from public.redeem_coach_invite('S17-COACH-2', $1)`, [parent])).rows[0].status;
    await w.service(`insert into public.team_invites (team_id, code, created_by) values ($1, 'S17-TEAM-1', $2)`, [w.team, parent]);
    await w.service(`insert into public.player_invites (player_id, code, created_by) values ($1, 'S17-PLAYER-1', $2)`, [w.player, parent]);
    await w.service(`insert into public.team_invites (team_id, code, used_by, used_at) values ($1, 'S17-TEAM-USED', $2, now())`, [w.team, parent]);
    await db.query(
      `insert into public.orders (id, order_ref, purchaser_email, source, payment_status, authority_status, currency, pricing_tier, paid_player_count,
         total_print_quantity, unit_price_pence, subtotal_pence, pricing_version, priced_at, approved_by)
       values ($1, 'S17-ORDER', 'p@example.test', 'standalone_order', 'order_intent', 'confirmed', 'GBP', 'single', 1, 1, 2499, 2499, 1, now(), $2)`, [id(), parent]);
    await db.query(`insert into public.active_viewers (profile_id, scope) values ($1, 'story')`, [parent]);
    await w.service(`insert into public.story_updates (recipient_profile_id, actor_profile_id, player_id, event_type, category, title, body, related_moment_id)
      values ($1, $2, $3, 'recognition', 'coach', 'Coach Recognition', 'Recognised', $4)`, [parent, otherCoach, w.player, rec]);
    const cancelled = (await db.query(`insert into public.player_deletion_requests (player_id, requested_by, status, cancelled_by, cancelled_at) values ($1, $2, 'cancelled', $2, now() - interval '1 day') returning id`, [w.directPlayer, parent])).rows[0].id;
    await w.user(parent, `insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [w.player, parent]);

    // Everything the 0076 clean-up would touch, and the child records themselves.
    const family = () => rowsOf(db, `select
        (select json_agg(g order by g.player_id, g.profile_id) from public.guardians g) guardians,
        (select json_agg(p order by p.id) from public.players p) players,
        (select json_agg(r order by r.id) from public.player_deletion_requests r) child_requests,
        (select json_agg(c order by c.id) from public.cards c) cards,
        (select count(*) from public.card_access_audit_events) card_audit,
        (select json_agg(m order by m.id) from public.moments m) moments,
        (select json_agg(i order by i.code) from public.coach_invites i) coach_invites,
        (select json_agg(i order by i.code) from public.team_invites i) team_invites,
        (select json_agg(i order by i.code) from public.player_invites i) player_invites,
        (select json_agg(a order by a.scope) from public.active_viewers a) active_viewers,
        (select json_agg(s order by s.id) from public.story_updates s) story_updates,
        (select json_agg(o.approved_by order by o.order_ref) from public.orders o) order_approvers,
        (select count(*) from public.profiles where id = $1) profile`, [parent]);
    const F0 = await family();
    const C0 = await coachRows(db, parent), L0 = await linkRows(db, parent);
    const guardianReach = () => w.as('authenticated', parent, async () => Number((await db.query(`select count(*)::int n from public.guardians where profile_id = $1`, [parent])).rows[0].n));

    // Every public table (plus auth.users) except the review's own records and the coaching it suspends.
    const REVIEW_TABLES = ['pending_profile_deletions', 'deletion_review_access_suspensions', 'coach_team', 'coach_players', 'relationship_audit_events'];
    const wholeDb = async () => {
      const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' and not (tablename = any($1::text[])) order by 1`, [REVIEW_TABLES])).rows.map((r) => r.tablename);
      const parts = [`auth.users:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from auth.users x`)).rows[0].h}`];
      for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
      return parts.join(',');
    };
    const D0 = await wholeDb();
    // --- Pending review ---
    const r1 = await deleteAccount(w, parent);
    check('17: pending review — every other table in the database is byte-for-byte unchanged (only the request, its suspension and the suspended coaching moved)',
      (await wholeDb()) === D0);
    check('17: pending review — identity kept, coach access suspended (team + direct link), nothing unlinked or filed',
      redeemed === 'redeemed' && r1.canDeleteIdentity === false && r1.coachAccessSuspended === 2 && r1.playersUnlinked.length === 0 && r1.playersDeletionRequested.length === 0, JSON.stringify(r1));
    check('17: pending review — guardian links, players, child deletion requests (statuses), cards and lock state, card audit, moments (uploader and verifier), invites, viewers, story updates and the profile are all exactly as before',
      (await family()) === F0);
    check('17: pending review — no child deletion request was filed and no card was locked',
      await n(db, `select count(*)::int n from public.player_deletion_requests where status = 'pending'`) === 0 &&
      await n(db, `select count(*)::int n from public.cards where access_status is not null`) === 0);
    check('17: pending review — the parent still sees both children (guardian access unchanged); only coaching is paused',
      (await guardianReach()) === 2 && await n(db, `select count(*)::int n from public.coach_team where profile_id = $1 and ended_at is null`, [parent]) === 0);
    check('17: pending review — no deletion marker anywhere', await n(db, `select (select count(*) from public.moments where verifier_account_deleted_at is not null) + (select count(*) from public.player_deletion_requests where cancelled_by_account_deleted_at is not null) as n`) === 0);
    const pid = (await pendingOf(db, parent)).id;
    const loginDelete = await attempt(() => db.query(`delete from auth.users where id = $1`, [parent]));
    check('17: removing the login while under review is refused, changing nothing', loginDelete?.includes('Profile deletion refused') && (await family()) === F0, loginDelete);
    const profileDelete = await attempt(() => db.query(`delete from public.profiles where id = $1`, [parent]));
    check('17: a direct profile delete is refused too', profileDelete?.includes('Profile deletion refused') && (await family()) === F0, profileDelete);

    // --- Rejection and restore ---
    check('17: staff reject', (await reject(w, pid, people.staff)) === 'rejected');
    check('17: rejection — the family and all attribution unchanged', (await family()) === F0);
    const rs = await restore(w, pid, people.staff);
    check('17: restore — exactly the prior coaching access, nothing else', rs.restored === 2 && (await coachRows(db, parent)) === C0 && (await linkRows(db, parent)) === L0 && (await family()) === F0, JSON.stringify(rs));
    check('17: completion is refused for a rejected request', (await attempt(() => complete(w, pid)))?.includes('Only a pending profile deletion can be completed (it is rejected)'));

    // --- Second request, then final staff completion ---
    const r2 = await deleteAccount(w, parent);
    check('17: a second request goes to review again; the family is still unchanged', r2.canDeleteIdentity === false && r2.coachAccessSuspended === 2 && (await family()) === F0, JSON.stringify(r2));
    const r2b = await deleteAccount(w, parent);
    check('17: each review round has its own reviewOpenedAt (staff are notified once per round); a repeat while pending keeps it',
      typeof r1.reviewOpenedAt === 'string' && r2.reviewOpenedAt !== r1.reviewOpenedAt && r2b.reviewOpenedAt === r2.reviewOpenedAt && r2b.coachAccessSuspended === 0 && (await family()) === F0,
      JSON.stringify([r1.reviewOpenedAt, r2.reviewOpenedAt, r2b.reviewOpenedAt]));
    const blocked = await attempt(() => complete(w, pid));
    check('17: completion is refused while the coach-authored record exists, changing nothing', blocked?.includes('(coach_authored_player_records)') && (await family()) === F0, blocked);
    check('17: completion by the account itself (not staff) is refused', (await attempt(() => complete(w, pid, parent)))?.includes('Not authorized: staff only'));
    await db.query(`delete from public.player_assessments where created_by = $1`, [parent]);
    const auditBefore = await n(db, `select count(*)::int n from public.card_access_audit_events`);
    const done = await complete(w, pid);
    check('17: final completion — completed; the shared child is unlinked and the sole-guardian child gets a deletion request',
      done.status === 'completed' && JSON.stringify(done.playersUnlinked) === JSON.stringify([w.player]) && JSON.stringify(done.playersDeletionRequested) === JSON.stringify([w.directPlayer]), JSON.stringify(done));
    const autoReq = (await db.query(`select status, execution_state, requested_by, notes from public.player_deletion_requests where player_id = $1 and status = 'pending'`, [w.directPlayer])).rows;
    check('17: final completion — exactly one automatic child deletion request, locked down for staff confirmation',
      autoReq.length === 1 && autoReq[0].execution_state === 'awaiting_staff_confirmation' && autoReq[0].notes.startsWith('Automatic'), JSON.stringify(autoReq));
    const cards = (await db.query(`select id, access_status, access_status_reason from public.cards order by claim_token`)).rows;
    const audit = (await db.query(`select card_id, event_type, actor_role, actor_profile_id, reason from public.card_access_audit_events where card_id = $1`, [card2])).rows;
    check('17: final completion — the sole-guardian child\'s card is suspended (deletion_request) and audited to the staff member; the shared child\'s card is untouched',
      cards.find((c) => c.id === card2).access_status === 'suspended' && cards.find((c) => c.id === card2).access_status_reason === 'deletion_request' &&
      cards.find((c) => c.id === card1).access_status === null && audit.length === 1 && audit[0].actor_role === 'staff' && audit[0].actor_profile_id === people.staff &&
      await n(db, `select count(*)::int n from public.card_access_audit_events`) === auditBefore + 1, JSON.stringify([cards, audit]));
    check('17: final completion — the account\'s parent links are gone; the co-parent keeps theirs',
      await n(db, `select count(*)::int n from public.guardians where profile_id = $1`, [parent]) === 0 &&
      await n(db, `select count(*)::int n from public.guardians where profile_id = $1 and player_id = $2`, [people.coParent, w.player]) === 1);
    const m = (await db.query(`select id, verification_status, verified_by, verifier_account_deleted_at, uploaded_by from public.moments where id = any($1::uuid[]) order by id`, [[rec, sub]])).rows;
    check('17: final completion — the moments stay with the child: uploader cleared, the verified one marked once',
      m.every((x) => x.uploaded_by === null) && m.find((x) => x.id === rec).verification_status === 'coach_verified' && m.find((x) => x.id === rec).verified_by === null &&
      m.find((x) => x.id === rec).verifier_account_deleted_at !== null && m.find((x) => x.id === sub).verification_status === 'family_memory', JSON.stringify(m));
    check('17: final completion — the cancellation keeps its status and date, canceller cleared, marker set',
      await n(db, `select count(*)::int n from public.player_deletion_requests where id = $1 and status = 'cancelled' and cancelled_by is null and cancelled_by_account_deleted_at is not null`, [cancelled]) === 1);
    check('17: final completion — invites, viewers and story updates are cleared as in 0076',
      await n(db, `select (select count(*) from public.coach_invites where created_by = $1) + (select count(*) from public.team_invites where created_by = $1)
        + (select count(*) from public.player_invites where created_by = $1) + (select count(*) from public.active_viewers where profile_id = $1)
        + (select count(*) from public.story_updates where recipient_profile_id = $1) + (select count(*) from public.team_invites where used_by = $1)
        + (select count(*) from public.orders where approved_by = $1) as n`, [parent]) === 0);
    const pd = (await db.query(`select status, resolved_by from public.pending_profile_deletions where id = $1`, [pid])).rows[0];
    check('17: final completion — the request is resolved by the staff member; the open suspension is closed as account_deleted',
      pd.status === 'resolved' && pd.resolved_by === people.staff &&
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and resolved_at is null`, [parent]) === 0 &&
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and resolution = 'account_deleted'`, [parent]) === 2, JSON.stringify(pd));
    check('17: final completion — the profile is gone and the sign-in identity is queued for staff', await n(db, `select (select count(*) from public.profiles where id = $1) as n`, [parent]) === 0 &&
      await n(db, `select count(*)::int n from public.pending_auth_deletions where auth_user_id = $1 and status = 'pending'`, [parent]) === 1);

    // --- Repeats: idempotent ---
    const F1 = await family();
    const again = await complete(w, pid);
    check('17: a repeated completion reports already_completed and changes nothing (no second request, lock or marker)', again.status === 'already_completed' && (await family()) === F1, JSON.stringify(again));
    check('17: reject and restore are refused after completion',
      (await attempt(() => reject(w, pid, people.staff)))?.includes('already resolved') && (await attempt(() => restore(w, pid, people.staff)))?.includes('(it is resolved)'));
    // The account's old session asks again (its login still exists until staff remove it): refused as erased,
    // so it can write no second audit event or record.
    const late = await errOf(() => w.user(parent, `select public.delete_own_guardian_account() as r`));
    check('17: a late self-service retry is refused as erased (EMERA account_erased) and changes nothing', late === 'EMERA:account_erased' && (await family()) === F1, late);
    const authDelete = await attempt(() => db.query(`delete from auth.users where id = $1`, [parent]));
    check('17: staff remove the sign-in identity; nothing references the account', authDelete === null &&
      await n(db, `select count(*)::int n from public.guardians where profile_id = $1 or created_by = $1`, [parent]) === 0, authDelete);
    check('17: the 0101 gift approval and the coach-access guard are untouched by any of this (their functions unchanged)',
      await n(db, `select count(*)::int n from pg_trigger where tgname = 'deletion_review_access_guard'`) === 3);
  } catch (e) {
    check('17: parent-coach lifecycle', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 18. Parent-only under review, staff targets, and completion edge cases ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    // A parent-only account (no coaching) whose deletion is blocked by an authored record.
    const card = id();
    await db.query(`insert into public.cards (id, player_id, claim_token, status) values ($1, $2, 'S18-CARD', 'claimed')`, [card, w.directPlayer]);
    await db.query(`insert into public.player_goals (player_id, created_by, label, target) values ($1, $2, 'Fictional goal', 3)`, [w.directPlayer, people.parent]);
    const snap = () => rowsOf(db, `select (select json_agg(g order by g.player_id, g.profile_id) from public.guardians g) g,
        (select json_agg(r order by r.id) from public.player_deletion_requests r) r, (select json_agg(c order by c.id) from public.cards c) c`);
    const S0 = await snap();
    const r = await deleteAccount(w, people.parent);
    check('18: parent-only under review — nothing suspended, nothing unlinked, no request filed, card not locked', r.canDeleteIdentity === false && r.coachAccessSuspended === 0 && (await snap()) === S0, JSON.stringify(r));
    const pid = (await pendingOf(db, people.parent)).id;
    await db.query(`delete from public.player_goals where created_by = $1`, [people.parent]);
    await db.query(`delete from public.player_assessments where created_by = $1`, [people.parent]);
    const done = await complete(w, pid);
    check('18: parent-only completion — one request filed for the sole-guardian child and its card locked',
      done.status === 'completed' && JSON.stringify(done.playersDeletionRequested) === JSON.stringify([w.directPlayer]) &&
      await n(db, `select count(*)::int n from public.player_deletion_requests where player_id = $1 and status = 'pending'`, [w.directPlayer]) === 1 &&
      await n(db, `select count(*)::int n from public.cards where id = $1 and access_status = 'suspended'`, [card]) === 1, JSON.stringify(done));

    // A request that already exists for the child is reused, not duplicated.
    const coach = await w.coach();
    await w.service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [w.player, people.stranger]);
    await db.query(`delete from public.guardians where player_id = $1 and profile_id = $2`, [w.player, people.coParent]);
    const existing = (await w.user(people.stranger, `select public.request_player_deletion($1, 'x@example.test', null) as id`, [w.player]).catch((e) => ({ rows: [{ id: e.message }] }))).rows[0].id;
    await db.query(`insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [w.player, people.stranger]);
    await deleteAccount(w, people.stranger);
    const pid2 = (await pendingOf(db, people.stranger)).id;
    await db.query(`delete from public.player_assessments where created_by = $1`, [people.stranger]);
    const done2 = await complete(w, pid2);
    check('18: an existing pending child request is reused at completion (still exactly one)',
      done2.status === 'completed' && await n(db, `select count(*)::int n from public.player_deletion_requests where player_id = $1 and status = 'pending'`, [w.player]) === 1, JSON.stringify([existing, done2]));

    // Staff accounts: a (pre-0098) pending row for a staff account cannot be completed here, by another staff
    // member or by the account itself.
    const staff2 = id();
    await w.person(staff2);
    await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff2]);
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason) values ($1, 'coach_authored_player_records'), ($2, 'coach_authored_player_records')`, [people.staff, staff2]);
    const spid = (await pendingOf(db, people.staff)).id, spid2 = (await pendingOf(db, staff2)).id;
    const s1 = await attempt(() => complete(w, spid));
    const s1b = await attempt(() => complete(w, spid2));
    check('18: completing a staff account\'s deletion (one\'s own, or another staff member\'s) is refused, changing nothing',
      s1?.includes('Staff accounts are removed by the manual staff procedure') && s1b?.includes('Staff accounts are removed by the manual staff procedure') &&
      await n(db, `select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[people.staff, staff2]]) === 2, `${s1} / ${s1b}`);
    // A request resolved by hand (before 0097) while the account still exists is not reported as completed.
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason, status, resolved_by, resolved_at) values ($1, 'coach_authored_player_records', 'resolved', $2, now())`, [people.coParent, people.staff]);
    const handId = (await pendingOf(db, people.coParent)).id;
    const hand = await attempt(() => complete(w, handId));
    check('18: a request marked resolved while the account still exists is refused (not reported as completed)',
      hand?.includes('marked resolved but a profile with this id exists') && await n(db, `select count(*)::int n from public.profiles where id = $1`, [people.coParent]) === 1, hand);
    // A pending request whose profile was deleted directly (before 0097) while the login remained: closed, and the
    // login is queued for staff.
    const orphan = id();
    await w.person(orphan);
    await db.query(`delete from public.profiles where id = $1`, [orphan]);
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason) values ($1, 'o@example.test', 'coach_authored_player_records')`, [orphan]);
    const orphanId = (await pendingOf(db, orphan)).id;
    // An older 0043-era retry row for the same login, still carrying the email.
    await db.query(`insert into public.pending_auth_deletions (auth_user_id, email, last_error) values ($1, 'o@example.test', 'older failure')`, [orphan]);
    const oc = await complete(w, orphanId);
    check('18: closing an already-deleted account clears the email from the review and from the retry record',
      (await pendingOf(db, orphan)).email === null
        && await n(db, `select count(*)::int n from public.pending_auth_deletions where auth_user_id = $1 and email is null`, [orphan]) === 1);
    check('18: a pending request whose profile is gone but whose login remains is closed and the login is queued for staff',
      oc.status === 'account_already_deleted' && (await pendingOf(db, orphan)).status === 'resolved' &&
      await n(db, `select count(*)::int n from public.pending_auth_deletions where auth_user_id = $1 and status = 'pending'`, [orphan]) === 1, JSON.stringify(oc));
    const s2 = await attempt(() => complete(w, id()));
    check('18: an unknown request is refused', s2?.includes('Pending profile deletion not found'), s2);
    // A coach-only account that requests while its blocker is already cleared deletes at once (no review).
    const r3 = await deleteAccount(w, coach);
    check('18: a coach-only account with nothing blocking deletes at once', r3.canDeleteIdentity === true && r3.coachAccessSuspended === 0, JSON.stringify(r3));
  } catch (e) {
    check('18: parent-only, staff targets and edge cases', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 19. Erased accounts stay out; staff decisions audited once; preview and own status ===');
{
  const w = await world();
  const { db, people } = w;
  const audit = (pid) => db.query(`select action, actor_profile_id, reason, outcome from public.account_deletion_staff_actions where pending_deletion_id = $1 order by created_at, action`, [pid]).then((r) => r.rows);
  const preview = (pid, actor = people.staff) => w.user(actor, `select public.account_deletion_preview($1) as p`, [pid]).then((r) => r.rows[0].p);
  const myReview = (uid) => w.user(uid, `select public.my_account_deletion_review() as r`).then((r) => r.rows[0].r);
  try {
    // Immediate deletion: the erased record is written; an old session cannot recreate the profile.
    const plain = await w.coach();
    await deleteAccount(w, plain); // also removes auth.users, as the route does
    check('19: immediate deletion records the account as erased (no staff, no request)',
      await n(db, `select count(*)::int n from public.erased_accounts where profile_id = $1 and completed_by is null`, [plain]) === 1);
    // An erased account whose login still exists (Auth deletion failed or not yet attempted).
    const lingering = await w.coach();
    await w.user(lingering, `select public.delete_own_guardian_account()`);
    const recreate = await errOf(() => w.user(lingering, `insert into public.profiles (id) values ($1)`, [lingering]));
    const recreateSvc = await errOf(() => w.service(`insert into public.profiles (id) values ($1)`, [lingering]));
    const recreateOwner = await errOf(() => db.query(`insert into public.profiles (id) values ($1)`, [lingering]));
    check('19: a still-valid session of an erased account cannot recreate its profile (signed-in and table owner: EMERA; service_role has no insert on profiles at all)',
      recreate === 'EMERA:account_erased' && recreateSvc?.startsWith('42501:') && recreateOwner === 'EMERA:account_erased', `${recreate} / ${recreateSvc} / ${recreateOwner}`);
    const reKey = await errOf(() => db.query(`update public.profiles set id = $1 where id = $2`, [lingering, people.stranger]));
    check('19: …nor move another profile onto that id', reKey === 'EMERA:account_erased', reKey);
    check('19: account_is_erased() is true for that session and false for a live account; anon cannot call it',
      (await w.user(lingering, `select public.account_is_erased() as e`)).rows[0].e === true &&
      (await w.user(people.parent, `select public.account_is_erased() as e`)).rows[0].e === false &&
      (await attempt(() => w.as('anon', null, () => db.query(`select public.account_is_erased()`))))?.includes('permission denied'));
    check('19: the erased-account record and the audit are readable by service_role only',
      (await attempt(() => w.user(people.staff, `select * from public.erased_accounts`)))?.includes('permission denied') &&
      (await attempt(() => w.user(people.staff, `select * from public.account_deletion_staff_actions`)))?.includes('permission denied') &&
      (await attempt(() => w.service(`insert into public.account_deletion_staff_actions (pending_deletion_id, profile_id, actor_profile_id, action, reason, outcome) values ($1, $1, $1, 'complete', 'x', 'x')`, [id()])))?.includes('permission denied'));

    // Parent-coach review: own status, preview counts, audited reject / restore / complete.
    const parent = people.parent;
    const card = id();
    await db.query(`insert into public.cards (id, player_id, claim_token, status) values ($1, $2, 'S19-CARD', 'claimed')`, [card, w.directPlayer]);
    const req = (await w.user(parent, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'S19') returning id`)).rows[0].id;
    await w.service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [req, people.staff, w.team]);
    const rec = await w.recognise(parent);
    await w.user(parent, `insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [w.player, parent]);
    check('19: before any request, own status is not under review', JSON.stringify(await myReview(parent)) === JSON.stringify({ underReview: false, coachAccessPaused: false }));
    await deleteAccount(w, parent);
    const pid = (await pendingOf(db, parent)).id;
    check('19: under review — own status says under review with coaching paused', JSON.stringify(await myReview(parent)) === JSON.stringify({ underReview: true, coachAccessPaused: true }));
    check('19: another account still reads "not under review" while this one is pending', JSON.stringify(await myReview(people.coParent)) === JSON.stringify({ underReview: false, coachAccessPaused: false }));
    check('19: anon cannot read a review status', (await attempt(() => w.as('anon', null, () => db.query(`select public.my_account_deletion_review()`))))?.includes('permission denied'));
    const p = await preview(pid);
    check('19: preview gives counts only: one blocker, one shared child, one child to deletion review, one card to lock, one verified moment, coaching suspended',
      p.status === 'pending' && p.blockingReason === 'coach_authored_player_records' && p.accountExists === true && p.isStaffAccount === false &&
      p.blockers.coachAuthoredRecords === 1 && p.blockers.squadInviteOrganiser === 0 && p.removes.parentLinksShared === 1 && p.removes.childrenToDeletionReview === 1 &&
      p.removes.cardsToLock === 1 && p.marks.verifiedMoments === 1 && p.coaching.suspendedForReview === 1 && p.coaching.activeAssignments === 0 &&
      !JSON.stringify(p).includes(w.player) && !JSON.stringify(p).includes('Fictional'), JSON.stringify(p));
    check('19: preview is refused for a non-staff caller and not callable by service_role or anon',
      (await attempt(() => preview(pid, parent)))?.includes('Not authorized: staff only') &&
      (await attempt(() => w.service(`select public.account_deletion_preview($1)`, [pid])))?.includes('permission denied') &&
      (await attempt(() => w.as('anon', null, () => db.query(`select public.account_deletion_preview($1)`, [pid]))))?.includes('permission denied'));

    await reject(w, pid, people.staff, 'Parent asked to stay');
    await reject(w, pid, people.staff, 'Parent asked to stay');
    await restore(w, pid, people.staff, 'Parent asked to stay');
    await restore(w, pid, people.staff, 'Parent asked to stay');
    const a1 = await audit(pid);
    check('19: reject and restore are each audited once (repeats write nothing), with actor, reason and outcome',
      a1.length === 2 && a1.every((r) => r.actor_profile_id === people.staff && r.reason === 'Parent asked to stay') &&
      a1.some((r) => r.action === 'reject' && r.outcome === 'rejected') && a1.some((r) => r.action === 'restore' && r.outcome === 'restored 1, not restorable 0'), JSON.stringify(a1));
    check('19: after reject + restore the own status is no longer under review', (await myReview(parent)).underReview === false);

    await deleteAccount(w, parent);
    check('19: a sign-in removal cannot be recorded for a request still pending (not completed and erased)',
      (await attempt(() => w.user(people.staff, `select public.record_account_sign_in_removal($1, 'early', 'removed')`, [pid])))?.includes('not a completed account deletion'));
    await db.query(`delete from public.player_assessments where created_by = $1`, [parent]);
    // A staff member whose staff access was removed can neither preview nor complete.
    const exStaff = id();
    await w.person(exStaff);
    await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [exStaff]);
    await db.query(`delete from public.staff_accounts where profile_id = $1`, [exStaff]);
    check('19: a removed staff account can neither preview nor complete',
      (await attempt(() => preview(pid, exStaff)))?.includes('Not authorized: staff only') && (await attempt(() => complete(w, pid, exStaff)))?.includes('Not authorized: staff only'));
    const done = await complete(w, pid, people.staff, 'Records reassigned; approved');
    const again = await complete(w, pid, people.staff, 'Records reassigned; approved');
    const a2 = (await audit(pid)).filter((r) => r.action === 'complete');
    check('19: completion returns the account id, is audited once (the repeat returns already_completed and writes no audit row)',
      done.status === 'completed' && done.profileId === parent && again.status === 'already_completed' && again.profileId === parent &&
      a2.length === 1 && a2[0].actor_profile_id === people.staff && a2[0].outcome === 'completed' && a2[0].reason === 'Records reassigned; approved', JSON.stringify([done, again, a2]));
    check('19: the completed account is recorded as erased by the staff member for this request',
      await n(db, `select count(*)::int n from public.erased_accounts where profile_id = $1 and completed_by = $2 and pending_deletion_id = $3`, [parent, people.staff, pid]) === 1);
    check('19: its login (not yet removed) cannot recreate the profile; it is reported erased',
      (await errOf(() => w.user(parent, `insert into public.profiles (id) values ($1)`, [parent]))) === 'EMERA:account_erased' &&
      (await w.user(parent, `select public.account_is_erased() as e`)).rows[0].e === true);
    const ownerUpd = await errOf(() => db.query(`update public.account_deletion_staff_actions set reason = 'changed'`));
    const ownerDel = await errOf(() => db.query(`delete from public.erased_accounts where profile_id = $1`, [parent]));
    const ownerTrunc = await errOf(() => db.query(`truncate public.account_deletion_staff_actions`));
    check('19: the audit and the erased record are append-only even for the table owner (update, delete, truncate refused)',
      ownerUpd?.includes('append-only') && ownerDel?.includes('append-only') && ownerTrunc?.includes('append-only'), `${ownerUpd} / ${ownerDel} / ${ownerTrunc}`);
    const recSignIn = (actor, reqId, outcome = 'removed') => w.user(actor, `select public.record_account_sign_in_removal($1, 'Sign-in removed', $2)`, [reqId, outcome]);
    await recSignIn(people.staff, pid, 'removal_pending');
    await recSignIn(people.staff, pid, 'removed');
    check('19: each sign-in removal attempt is audited (actor, reason, outcome)',
      JSON.stringify((await audit(pid)).filter((r) => r.action === 'remove_sign_in').map((r) => r.outcome).sort()) === JSON.stringify(['removal_pending', 'removed']));
    const e1 = await attempt(() => recSignIn(people.coParent, pid));
    const e2 = await attempt(() => recSignIn(people.staff, id()));
    const e3 = await attempt(() => recSignIn(people.staff, pid, 'whatever'));
    check('19: sign-in removal can be recorded only by staff, and only for a completed, erased request',
      e1?.includes('Not authorized: staff only') && e2?.includes('not a completed account deletion') && e3?.includes('Unknown sign-in removal outcome'), `${e1} / ${e2} / ${e3}`);
    check('19: one child deletion request and one card lock, however many completions were called',
      await n(db, `select count(*)::int n from public.player_deletion_requests where player_id = $1 and status = 'pending'`, [w.directPlayer]) === 1 &&
      await n(db, `select count(*)::int n from public.card_access_audit_events where card_id = $1`, [card]) === 1 &&
      await n(db, `select count(*)::int n from public.moments where id = $1 and verifier_account_deleted_at is not null`, [rec]) === 1);
  } catch (e) {
    check('19: erased accounts, audit, preview, own status', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 20. Earlier-draft (eb8f8d9) rollback files cannot half-revert this version; the staging replacement route ===');
{
  // The files staging was rehearsed with (the earlier draft of 0097/0098), read from git history.
  const { execFileSync } = await import('child_process');
  // EMBLEM_AUTHZ_GIT_DIR lets a copy of this tree (e.g. a mutation run) read the history of the real repository.
  const REPO = process.env.EMBLEM_AUTHZ_GIT_DIR ?? path.resolve(HERE, '../../..');
  const old = (f) => execFileSync('git', ['-C', REPO, 'show', `eb8f8d9:${f}`], { encoding: 'utf8' });
  let OLD = null;
  try {
    OLD = {
      m97: old('supabase/migrations/0097_coach_account_deletion_verified_moments.sql'),
      m98: old('supabase/migrations/0098_deletion_review_suspension_and_verifier_identity.sql'),
      rb97: old('supabase/rollback/0097_rollback.sql'),
      rb98: old('supabase/rollback/0098_rollback.sql'),
    };
  } catch (e) {
    check('20: the earlier-draft (eb8f8d9) files are readable from git history', false, e.message);
  }
  const NEW97 = fs.readFileSync(path.resolve(HERE, '../../migrations/0097_coach_account_deletion_verified_moments.sql'), 'utf8');
  const NEW98 = fs.readFileSync(path.resolve(HERE, '../../migrations/0098_deletion_review_suspension_and_verifier_identity.sql'), 'utf8');
  const M0101 = fs.readFileSync(path.resolve(HERE, '../../migrations/0101_gift_checkout_requires_guardian_approval.sql'), 'utf8');
  const run = async (db, sql, ack) => {
    await db.exec('begin;');
    try {
      if (ack) await db.query(`select set_config($1, $2, true)`, ack);
      await db.exec(sql);
      await db.exec('commit;').catch(() => {});
      return null;
    } catch (e) {
      await db.exec('rollback;').catch(() => {});
      return e.message;
    }
  };
  if (OLD) try {
    // (a) On the current pair, the earlier-draft rollbacks fail and change nothing.
    const cur = await readyDatabase('0098');
    const before = await snapshotCatalog(cur);
    const r98 = await run(cur, OLD.rb98, ACK_0098);
    check('20: the earlier-draft 0098 rollback fails on this version (renamed policy) and changes nothing',
      !!r98 && keysOf(diffCatalog(before, await snapshotCatalog(cur))).length === 0, r98);
    const r97 = await run(cur, OLD.rb97, ACK_0097);
    check('20: the earlier-draft 0097 rollback refuses on this version and changes nothing', !!r97 && keysOf(diffCatalog(before, await snapshotCatalog(cur))).length === 0, r97);
    await cur.close();
    const cur97 = await readyDatabase('0097');
    const b97 = await snapshotCatalog(cur97);
    const r97b = await run(cur97, OLD.rb97, ACK_0097);
    check('20: …also over this 0097 alone', !!r97b && keysOf(diffCatalog(b97, await snapshotCatalog(cur97))).length === 0, r97b);
    await cur97.close();

    // (b) The staging route: 0096 + 0101 + earlier-draft 0097/0098 -> their rollbacks -> this 0097/0098.
    const fresh = await readyDatabase('0096');
    await fresh.exec(M0101);
    await fresh.exec(NEW97);
    await fresh.exec(NEW98);
    const target = await snapshotCatalog(fresh);
    await fresh.close();
    const st = await readyDatabase('0096');
    await st.exec(M0101);
    const base = await snapshotCatalog(st);
    await st.exec(OLD.m97);
    await st.exec(OLD.m98);
    const w = await world({ db: st }); // Phase-1-like fixtures: parents, a team coach, a direct link, a verified moment; no review rows
    const c = await w.coach();
    await w.directLink(c);
    await w.recognise(c);
    const s1 = await run(st, OLD.rb98, ACK_0098);
    const s2 = await run(st, OLD.rb97, ACK_0097);
    check('20: staging route — the earlier-draft rollbacks succeed on the earlier-draft pair and return exactly 0096 + 0101',
      s1 === null && s2 === null && keysOf(diffCatalog(base, await snapshotCatalog(st))).length === 0, `${s1} / ${s2}`);
    const s3 = await run(st, NEW97), s4 = await run(st, NEW98);
    check('20: staging route — this 0097 and 0098 then apply, to exactly the catalog of a fresh build', s3 === null && s4 === null &&
      keysOf(diffCatalog(target, await snapshotCatalog(st))).length === 0, `${s3} / ${s4}`);
    const r = await deleteAccount(w, c);
    check('20: staging route — afterwards an ordinary coach deletion works (fixtures intact)', r.canDeleteIdentity === true, JSON.stringify(r));
    await st.close();
  } catch (e) {
    check('20: earlier-draft rollbacks and staging route', false, e.stack);
  }
}

console.log('\n=== 21. Erasure keeps no plaintext email; a later self-deletion is its own audit event; a stale token reaches nothing ===');
{
  const w = await world();
  const { db, people } = w;
  const emailOf = async (uid) => (await db.query(`select email from auth.users where id = $1`, [uid])).rows[0]?.email;
  // Every text, json and array column of every public table, searched as the owner (no RLS).
  async function emailHits(email) {
    const cols = (await db.query(`select c.table_name t, c.column_name c from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
         and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')`)).rows;
    const hits = [];
    for (const { t, c } of cols) {
      const k = await n(db, `select count(*)::int n from public."${t}" where position(lower($1) in lower("${c}"::text)) > 0`, [email]);
      if (k) hits.push(`${t}.${c}:${k}`);
    }
    return hits;
  }
  const auditOf = (pid) => db.query(`select action, actor_profile_id, outcome from public.account_deletion_staff_actions where pending_deletion_id = $1 order by created_at, action`, [pid]).then((r) => r.rows);
  const selfEvents = () => n(db, `select count(*)::int n from public.account_deletion_staff_actions where action = 'self_deleted'`);
  try {
    // --- A. Staff completion of a reviewed coach ---
    const coachA = await w.coach();
    const emailA = await emailOf(coachA);
    await w.assess(coachA);
    const rA = await deleteAccount(w, coachA);
    const pA = await pendingOf(db, coachA);
    check('21: a pending review keeps the email while staff may need it', rA.canDeleteIdentity === false && pA.email === emailA && emailA?.includes('@'), JSON.stringify(pA));
    // An older Auth-removal record for the same account that still carries an email (0043 era).
    await db.query(`insert into public.pending_auth_deletions (auth_user_id, email, status, last_error) values ($1, $2, 'resolved', 'older record')`, [coachA, emailA]);
    await db.query(`delete from public.player_assessments where created_by = $1`, [coachA]);
    const cA = await complete(w, pA.id);
    const hitsA = await emailHits(emailA);
    const afterA = await pendingOf(db, coachA);
    check('21: staff completion clears the review email, the retry record carries none (an older one loses its email), and no public column holds it',
      cA.status === 'completed' && afterA.email === null
        && await n(db, `select count(*)::int n from public.pending_auth_deletions where auth_user_id = $1 and email is null and status = 'pending'`, [coachA]) === 1
        && hitsA.length === 0, `${JSON.stringify(cA)} ${hitsA.join(', ')}`);
    check('21: what the completed review keeps: request id, erased account uuid, timestamps, staff actor, reason note, status',
      afterA.id === pA.id && afterA.auth_user_id === coachA && afterA.first_detected_at && afterA.resolved_at && afterA.resolved_by === people.staff
        && afterA.status === 'resolved' && afterA.notes?.includes('Completed by staff') && !afterA.notes.includes('@'), JSON.stringify(afterA));
    check('21: the audit for it holds actor, reason and outcome, and no email',
      JSON.stringify((await auditOf(pA.id)).map((a) => [a.action, a.actor_profile_id === people.staff, a.outcome])) === JSON.stringify([['complete', true, 'completed']])
        && await n(db, `select count(*)::int n from public.account_deletion_staff_actions where position('@' in reason || outcome) > 0`) === 0);
    const againA = await complete(w, pA.id);
    check('21: a repeat completion is already_completed and brings no email back', againA.status === 'already_completed' && (await pendingOf(db, coachA)).email === null && (await emailHits(emailA)).length === 0, JSON.stringify(againA));
    // The retry path: each sign-in removal attempt is audited without the email.
    await w.user(people.staff, `select public.record_account_sign_in_removal($1, 'Retry after an Auth outage', 'removal_pending')`, [pA.id]);
    await w.user(people.staff, `select public.record_account_sign_in_removal($1, 'Retry after an Auth outage', 'removed')`, [pA.id]);
    check('21: sign-in removal retries are audited and leave no plaintext email anywhere', (await auditOf(pA.id)).length === 3 && (await emailHits(emailA)).length === 0);

    // --- B. A sole guardian completed by staff: the 0076 child deletion request keeps its contact address ---
    const parent = people.parent;
    const emailP = await emailOf(parent);
    const req = (await w.user(parent, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U12 parent') returning id`)).rows[0].id;
    await w.service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [req, people.staff, w.team]);
    await w.assess(parent);
    await deleteAccount(w, parent);
    const pP = await pendingOf(db, parent);
    await db.query(`delete from public.player_assessments where created_by = $1`, [parent]);
    const cP = await complete(w, pP.id);
    const hitsP = await emailHits(emailP);
    check('21: a sole guardian completed by staff: the review keeps no email; the only copy left is the child deletion request filed for the sole-guardian child (0076 contact address, documented)',
      cP.status === 'completed' && (await pendingOf(db, parent)).email === null
        && JSON.stringify(hitsP) === JSON.stringify(['player_deletion_requests.requester_email:1']), `${JSON.stringify(cP)} ${hitsP.join(', ')}`);

    // --- C. Rejected, then the account deletes itself later ---
    const coachC = await w.coach();
    const emailC = await emailOf(coachC);
    await w.assess(coachC);
    await deleteAccount(w, coachC);
    const pC = await pendingOf(db, coachC);
    await reject(w, pC.id, people.staff);
    await restore(w, pC.id, people.staff);
    check('21: a rejected review keeps the email while the account exists', (await pendingOf(db, coachC)).email === emailC);
    await db.query(`delete from public.player_assessments where created_by = $1`, [coachC]);
    const sC = await deleteAccount(w, coachC);
    const afterC = await pendingOf(db, coachC);
    const auditC = await auditOf(pC.id);
    check('21: a rejected review stays historically rejected after a later self-deletion; erased_accounts records the erasure',
      sC.canDeleteIdentity === true && afterC.status === 'rejected'
        && await n(db, `select count(*)::int n from public.erased_accounts where profile_id = $1 and completed_by is null and pending_deletion_id = $2`, [coachC, pC.id]) === 1, JSON.stringify(afterC));
    check('21: …the later self-deletion is a separate append-only audit event (actor = the account itself, erased_after_rejection)',
      JSON.stringify(auditC.map((a) => [a.action, a.outcome])) === JSON.stringify([['reject', 'rejected'], ['restore', auditC[1]?.outcome], ['self_deleted', 'erased_after_rejection']])
        && auditC[2].actor_profile_id === coachC, JSON.stringify(auditC));
    check('21: …and the email is cleared from the review; no public column holds it', afterC.email === null && (await emailHits(emailC)).length === 0, (await emailHits(emailC)).join(', '));
    const upd = await errOf(() => db.query(`update public.account_deletion_staff_actions set outcome = 'x' where action = 'self_deleted'`));
    check('21: the self-deletion event is append-only (owner refused)', upd?.includes('append-only'), upd);

    // --- D. An ordinary immediate deletion with no review writes no self-deletion event ---
    const before = await selfEvents();
    const plain = await w.coach();
    const emailPlain = await emailOf(plain);
    await deleteAccount(w, plain);
    check('21: an immediate deletion with no review writes no self_deleted event and leaves no email', await selfEvents() === before && (await emailHits(emailPlain)).length === 0);

    // --- F. A review resolved by hand (before 0097), then the account deletes itself ---
    const coachF = await w.coach();
    await w.assess(coachF);
    await deleteAccount(w, coachF);
    const pF = await pendingOf(db, coachF);
    await db.query(`update public.pending_profile_deletions set status = 'resolved', resolved_at = now() where id = $1`, [pF.id]);
    await db.query(`delete from public.player_assessments where created_by = $1`, [coachF]);
    await deleteAccount(w, coachF);
    check('21: a hand-resolved review followed by self-deletion: one self_deleted event, erased_after_resolved_review, email cleared',
      JSON.stringify((await auditOf(pF.id)).map((a) => [a.action, a.outcome])) === JSON.stringify([['self_deleted', 'erased_after_resolved_review']])
        && (await pendingOf(db, coachF)).email === null);

    // --- G. An older Auth-retry row with the email, then a successful immediate self-deletion ---
    const coachG = await w.coach();
    const emailG = await emailOf(coachG);
    await db.query(`insert into public.pending_auth_deletions (auth_user_id, email, status, last_error) values ($1, $2, 'resolved', 'older failure')`, [coachG, emailG]);
    await deleteAccount(w, coachG);
    check('21: an immediate self-deletion clears the email from an older Auth-retry row too; no public column holds it',
      await n(db, `select count(*)::int n from public.pending_auth_deletions where auth_user_id = $1 and email is null`, [coachG]) === 1 && (await emailHits(emailG)).length === 0);

    // --- H. An email typed into a staff reason is refused (the audit is permanent) ---
    const coachH = await w.coach();
    await w.assess(coachH);
    await deleteAccount(w, coachH);
    const pH = await pendingOf(db, coachH);
    await db.query(`delete from public.player_assessments where created_by = $1`, [coachH]);
    const withEmail = await errOf(() => complete(w, pH.id, people.staff, 'Parent confirmed from someone@example.test'));
    const rejectEmail = await errOf(() => reject(w, pH.id, people.staff, 'Asked by someone@example.test to stay'));
    check('21: a staff reason holding an email address is refused (complete and reject), changing nothing',
      withEmail?.includes('account_deletion_staff_actions_reason_no_email') && rejectEmail?.includes('account_deletion_staff_actions_reason_no_email')
        && (await pendingOf(db, coachH)).status === 'pending' && await n(db, `select count(*)::int n from public.profiles where id = $1`, [coachH]) === 1, `${withEmail} / ${rejectEmail}`);

    // --- I. Retention outside the review record (Blake's decisions, 14 Nov): the account's own pending child
    //        deletion request keeps its contact while the request is open; an invite addressed to the account
    //        loses the address at erasure (section 22); once the request closes nothing keeps it. ---
    const acctI = id();
    await w.person(acctI);
    const emailI = await emailOf(acctI);
    const playerI = id();
    await db.query(`insert into public.players (id, name) values ($1, 'Fictional Shared')`, [playerI]);
    await db.query(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2), ($1, $3, 'card_claim', $3)`, [playerI, acctI, people.coParent]);
    await w.user(acctI, `select public.request_player_deletion($1, $2, null)`, [playerI, emailI]);
    await db.query(`insert into public.coach_invites (player_id, code, created_by, invited_email, used_by, used_at) values ($1, 'S21-INVITEE', $2, $3, $4, now())`, [playerI, people.coParent, emailI, acctI]);
    const rI = await deleteAccount(w, acctI);
    const hitsI = await emailHits(emailI);
    check('21: retention: after erasure the address remains only on the account\'s own still-pending child deletion request (the invite addressed to it is cleared)',
      rI.canDeleteIdentity === true && JSON.stringify(hitsI.sort()) === JSON.stringify(['player_deletion_requests.requester_email:1']), hitsI.join(', '));
    const reqI = (await db.query(`select id from public.player_deletion_requests where player_id = $1 and status = 'pending'`, [playerI])).rows[0].id;
    await w.user(people.staff, `select public.staff_reject_player_deletion_request($1, 'Fictional: the other guardian objected')`, [reqI]);
    check('21: …and once that request closes, no column anywhere holds the address', (await emailHits(emailI)).length === 0, (await emailHits(emailI)).join(', '));
  } catch (e) {
    check('21: email redaction and self-deletion audit', false, e.stack);
  }

  // --- E. A still-valid access token of an erased account, sent straight to the database ---
  try {
    const v = await world();
    const { db: vdb, people: vp } = v;
    const stale = vp.coParent; // co-guardian of v.player with vp.parent
    await v.coach(); // creates v.team; v.player joins it
    const card = id();
    await vdb.query(`insert into public.cards (id, player_id, claim_token, status) values ($1, $2, 'S21-CARD', 'claimed')`, [card, v.player]);
    const moment = await v.submit('family_memory');
    await v.user(vp.parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, 'S21-COACH', $2)`, [v.player, vp.parent]);
    await v.service(`insert into public.team_invites (team_id, code) values ($1, 'S21-TEAM')`, [v.team]);
    await v.user(vp.parent, `insert into public.player_invites (player_id, code, created_by) values ($1, 'S21-PLAYER', $2)`, [v.player, vp.parent]).catch(() => {});
    const readBefore = await v.as('authenticated', stale, async () => Number((await vdb.query(`select count(*)::int n from public.players`)).rows[0].n));
    // Erased through the app path; the auth.users row stays, as before the staff route removes it: the token is still valid.
    const erasedResult = (await v.user(stale, `select public.delete_own_guardian_account() as r`)).rows[0].r;
    const wholeDb = async () => {
      const tables = (await vdb.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
      const parts = [`auth.users:${(await vdb.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from auth.users x`)).rows[0].h}`];
      for (const t of tables) parts.push(`${t}:${(await vdb.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
      return parts.join(',');
    };
    const D0 = await wholeDb();
    const as = (sql, params) => errOf(() => v.user(stale, sql, params));
    const refused = {
      profile: await as(`insert into public.profiles (id) values ($1)`, [stale]),
      profileUpsert: await as(`insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [stale]),
      guardian: await as(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [v.player, stale]),
      coachTeam: await as(`insert into public.coach_team (team_id, profile_id) values ($1, $2)`, [v.team, stale]),
      coachTeamRequest: await as(`insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U12 stale')`),
      directCoach: await as(`insert into public.coach_players (player_id, profile_id) values ($1, $2)`, [v.player, stale]),
      coachInvite: await as(`insert into public.coach_invites (player_id, code, created_by) values ($1, 'S21-STALE', $2)`, [v.player, stale]),
      moment: await as(`insert into public.moments (player_id, title, trust, uploaded_by, verification_status) values ($1, 'Stale', 'parent', $2, 'family_memory')`, [v.player, stale]),
      deleteAgain: await as(`select public.delete_own_guardian_account()`),
      complete: await as(`select public.complete_pending_profile_deletion($1, 'x')`, [id()]),
      preview: await as(`select public.account_deletion_preview($1)`, [id()]),
      signInRecord: await as(`select public.record_account_sign_in_removal($1, 'x', 'removed')`, [id()]),
      requestChildDeletion: await as(`select public.request_player_deletion($1, 'stale@example.test', null)`, [v.player]),
    };
    const verifyRows = (await v.user(stale, `update public.moments set verified_by = $2, verified_at = now(), verification_status = 'coach_verified' where id = $1 returning id`, [moment, stale])).rows.length;
    check('21: stale token — the profile cannot be recreated (EMERA account_erased)', refused.profile === 'EMERA:account_erased' && refused.profileUpsert === 'EMERA:account_erased', `${refused.profile} / ${refused.profileUpsert}`);
    check('21: stale token — no guardian, coach-team, team-request, direct-coach link or invite can be created',
      ['guardian', 'coachTeam', 'coachTeamRequest', 'directCoach', 'coachInvite'].every((k) => refused[k] !== null), JSON.stringify(refused));
    check('21: stale token — no moment can be created or verified', refused.moment !== null && verifyRows === 0, `${refused.moment} / ${verifyRows}`);
    check('21: stale token — the deletion and staff functions refuse (a second self-deletion is EMERA account_erased: no second audit event)',
      refused.deleteAgain === 'EMERA:account_erased' && ['complete', 'preview', 'signInRecord'].every((k) => refused[k]?.includes('staff only') || refused[k]?.includes('Not authorized')), JSON.stringify(refused));
    check('21: stale token — filing a child deletion request is refused', refused.requestChildDeletion !== null, refused.requestChildDeletion);
    // The relationship functions (invite redemption, approval, reject/restore) are not callable with a user token at all.
    const relFns = ['public.redeem_coach_invite(text, uuid, text)', 'public.redeem_team_invite(text, uuid, text)', 'public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid)',
      'public.reject_pending_profile_deletion(uuid, uuid, text)', 'public.restore_coach_access_after_deletion_rejection(uuid, uuid, text)'];
    check('21: stale token — trusted relationship and review functions are not executable by authenticated',
      await n(vdb, `select count(*)::int n from unnest($1::text[]) f where has_function_privilege('authenticated', f::regprocedure, 'EXECUTE')`, [relFns]) === 0);
    // Even a server route acting with service_role cannot link the erased account: there is no profile and none can be made.
    const svcLink = await errOf(() => v.service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [v.player, stale]));
    const svcRedeem = await errOf(() => v.service(`select status from public.redeem_coach_invite('S21-COACH', $1)`, [stale]));
    const svcTeam = await errOf(() => v.service(`select status from public.redeem_team_invite('S21-TEAM', $1)`, [stale]));
    check('21: even service_role cannot link the erased account (no profile exists or can be created)',
      svcLink !== null && svcRedeem !== null && svcTeam !== null, `${svcLink} / ${svcRedeem} / ${svcTeam}`);
    const reads = {};
    for (const t of ['players', 'moments', 'guardians', 'cards', 'coach_team', 'coach_players', 'coach_invites', 'player_invites', 'team_invites',
      'player_deletion_requests', 'story_updates', 'player_assessments', 'pending_profile_deletions', 'erased_accounts', 'account_deletion_staff_actions',
      'deletion_review_access_suspensions', 'pending_auth_deletions']) {
      reads[t] = await v.as('authenticated', stale, () => vdb.query(`select count(*)::int n from public."${t}"`)).then((r) => r.rows[0].n).catch(() => 'denied');
    }
    check('21: stale token — reads no family or deletion data (it could read the family before)', readBefore > 0
      && Object.values(reads).every((x) => x === 0 || x === 'denied'), JSON.stringify(reads));
    // Every other function a signed-in user may execute, called with this family's real ids: nothing changes and nothing of the family comes back.
    const fns = (await vdb.query(`select p.proname, oidvectortypes(p.proargtypes) args from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'EXECUTE')
         and p.proname not in ('account_is_erased', 'my_account_deletion_review') order by 1`)).rows;
    const leaks = [];
    const outcomes = [];
    const harnessFaults = [];
    for (const f of fns) {
      const types = f.args ? f.args.split(', ') : [];
      const vals = types.map((t) => (t === 'uuid' ? (f.proname.includes('card') ? card : f.proname.includes('moment') ? moment : v.player)
        : t === 'boolean' ? true : t === 'integer' ? 1 : t.startsWith('timestamp') ? new Date().toISOString() : 'Fictional'));
      const sql = `select to_jsonb(x)::text j from public."${f.proname}"(${types.map((t, i) => `$${i + 1}::${t}`).join(', ')}) x`;
      try {
        const rows = (await v.user(stale, sql, vals)).rows.map((r) => r.j).join(' ');
        outcomes.push(`${f.proname}:ok`);
        if ([v.player, card, moment, 'Fictional Player', 'S21-'].some((s) => rows.includes(s))) leaks.push(`${f.proname} -> ${rows.slice(0, 120)}`);
        if (/(^|[:\s])true\b/.test(rows) && /is_|authorized|guardian|eligib/.test(f.proname) && f.proname !== 'coach_assignment_is_active') leaks.push(`${f.proname} -> ${rows.slice(0, 120)}`);
      } catch (e) {
        // A malformed call (wrong type, no such function, bad syntax) is a harness fault, not a refusal.
        if (['42883', '42804', '42601', '42P18'].includes(e.code)) harnessFaults.push(`${f.proname}:${e.code}:${e.message}`);
        outcomes.push(`${f.proname}:refused(${e.code ?? ''})`);
      }
    }
    check('21: (harness self-check: every function was really called; the pure helper coach_assignment_is_active returned a value)',
      harnessFaults.length === 0 && outcomes.includes('coach_assignment_is_active:ok'), harnessFaults.join(' | ') || outcomes.join(' '));
    check(`21: stale token — each of the ${fns.length} other functions executable by authenticated, called with the family's ids, returns nothing of the family`, leaks.length === 0, leaks.join(' | ') || outcomes.join(' '));
    check('21: stale token — after every attempt the whole database (every public table and auth.users) is byte-for-byte unchanged', (await wholeDb()) === D0);
    check('21: (the erasure itself went through the app path)', erasedResult?.canDeleteIdentity === true, JSON.stringify(erasedResult));
    // A normal account in the same family still works.
    const normal = await v.as('authenticated', vp.parent, async () => Number((await vdb.query(`select count(*)::int n from public.players`)).rows[0].n));
    const normalErased = (await v.user(vp.parent, `select public.account_is_erased() as e`)).rows[0].e;
    check('21: a normal, non-erased account still reads its family and is not erased', normal > 0 && normalErased === false, `${normal} ${normalErased}`);
    await vdb.close();
  } catch (e) {
    check('21: stale token probe', false, e.stack);
  }
  await db.close();
}

// Every text, json and array column of every public table, searched as the owner (no RLS).
async function emailHitsIn(db, email) {
  const cols = (await db.query(`select c.table_name t, c.column_name c from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')`)).rows;
  const hits = [];
  for (const { t, c } of cols) {
    const k = await n(db, `select count(*)::int n from public."${t}" where position(lower($1) in lower("${c}"::text)) > 0`, [email]);
    if (k) hits.push(`${t}.${c}:${k}`);
  }
  return hits;
}
const INVITE_TABLES = ['player_invites', 'coach_invites', 'team_invites'];
const inviteRows = async (db) => {
  const out = {};
  for (const t of INVITE_TABLES) out[t] = (await db.query(`select * from public.${t} order by id`)).rows;
  return JSON.stringify(out);
};

console.log('\n=== 22. Invites addressed to an erased account are revoked for good; their addresses go ===');
{
  const w = await world();
  const { db, people } = w;
  const emailOf = async (uid) => (await db.query(`select email from auth.users where id = $1`, [uid])).rows[0]?.email;
  const inv = (t, iid) => db.query(`select * from public.${t} where id = $1`, [iid]).then((r) => r.rows[0]);
  // Unused (live and expired) and used invites addressed to addr, on all three tables.
  async function addInvites(addr, tag) {
    const code = (k) => `S22-${tag}-${k}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const ids = {}, codes = {};
    const ins = async (key, sql, params) => { codes[key] = params[1]; ids[key] = (await db.query(sql, params)).rows[0].id; };
    // Upper case and padded: the match is case-insensitive and trimmed.
    await ins('piUnused', `insert into public.player_invites (player_id, code, created_by, invited_email, origin) values ($1, $2, $3, $4, 'second_guardian') returning id`, [w.player, code('PU'), people.coParent, `  ${addr.toUpperCase()} `]);
    await ins('piExpired', `insert into public.player_invites (player_id, code, created_by, invited_email, origin, created_at, expires_at) values ($1, $2, $3, $4, 'second_guardian', now() - interval '8 days', now() - interval '1 day') returning id`, [w.player, code('PE'), people.coParent, addr]);
    await ins('ciUnused', `insert into public.coach_invites (player_id, code, created_by, invited_email) values ($1, $2, $3, $4) returning id`, [w.directPlayer, code('CU'), people.parent, addr]);
    await ins('tiUnused', `insert into public.team_invites (team_id, code, invited_email) values ($1, $2, $3) returning id`, [w.otherTeam, code('TU'), addr]);
    await ins('piUsedByOther', `insert into public.player_invites (player_id, code, created_by, invited_email, origin, used_at, used_by) values ($1, $2, $3, $4, 'second_guardian', now(), $3) returning id`, [w.player, code('PO'), people.coParent, addr]);
    return { ids, codes };
  }
  const UNUSED = [['piUnused', 'player_invites'], ['piExpired', 'player_invites'], ['ciUnused', 'coach_invites'], ['tiUnused', 'team_invites']];
  const revokedOk = (r, orig) => r && r.revoked_at !== null && r.revoked_reason === 'recipient_account_erased' && r.invited_email === null && r.used_at === null
    && new Date(r.expires_at) <= new Date(r.revoked_at) && r.code.startsWith('revoked:') && r.code !== orig;
  const codeCount = (codes) => n(db, `select count(*)::int n from (select code from public.player_invites union all select code from public.coach_invites union all select code from public.team_invites) c where code = any($1) or code = any(array(select upper(x) from unnest($1::text[]) x))`, [codes]);
  try {
    // --- A. A coach whose deletion goes to staff review, then is completed by staff ---
    const x = await w.coach();
    const ex = await emailOf(x);
    const A = await addInvites(ex, 'A');
    const ciUsedByX = (await db.query(`insert into public.coach_invites (player_id, code, created_by, invited_email, used_at, used_by) values ($1, 'S22-A-USEDBYX', $2, 'Someone.Else@example.test', now(), $3) returning id`, [w.directPlayer, people.parent, x])).rows[0].id;
    const control = (await db.query(`insert into public.player_invites (player_id, code, created_by, invited_email, origin) values ($1, 'S22-CONTROL', $2, 'unrelated-person@example.test', 'second_guardian') returning id`, [w.player, people.coParent])).rows[0].id;
    const controlBefore = JSON.stringify(await inv('player_invites', control));
    await w.assess(x);
    const before = await inviteRows(db);
    const rX = await deleteAccount(w, x);
    check('22: while the deletion is under staff review no invite changes (addresses, codes, expiry all kept)', rX.canDeleteIdentity === false && (await inviteRows(db)) === before);
    await db.query(`delete from public.player_assessments where created_by = $1`, [x]);
    const cX = await complete(w, (await pendingOf(db, x)).id);
    const rows = Object.fromEntries(await Promise.all(UNUSED.map(async ([k, t]) => [k, await inv(t, A.ids[k])])));
    check('22: staff completion revokes every unused invite addressed to the account on all three tables (live and already expired; case and spaces ignored): revoked_at, reason, no address, expiry cut, new code',
      cX.status === 'completed' && UNUSED.every(([k]) => revokedOk(rows[k], A.codes[k])), JSON.stringify(rows));
    check('22: the code that was sent exists nowhere any more (exact or upper-cased, as the app normalises input)', await codeCount(UNUSED.map(([k]) => A.codes[k])) === 0);
    const redeemer = await w.coach();
    const coachTry = (await w.service(`select status from public.redeem_coach_invite($1, $2)`, [A.codes.ciUnused, redeemer])).rows[0].status;
    const teamTry = (await w.service(`select status from public.redeem_team_invite($1, $2)`, [A.codes.tiUnused, redeemer])).rows[0].status;
    const coachTryNew = (await w.service(`select status from public.redeem_coach_invite($1, $2)`, [rows.ciUnused.code, redeemer])).rows[0].status;
    const teamTryNew = (await w.service(`select status from public.redeem_team_invite($1, $2)`, [rows.tiUnused.code, redeemer])).rows[0].status;
    check('22: redeeming with the sent code, or even with the replacement code, is invalid on coach and team invites and grants nothing',
      [coachTry, teamTry, coachTryNew, teamTryNew].every((s) => s === 'invalid')
        && await n(db, `select count(*)::int n from public.coach_players where profile_id = $1`, [redeemer]) === 0
        && await n(db, `select count(*)::int n from public.coach_team where profile_id = $1 and team_id = $2`, [redeemer, w.otherTeam]) === 0, `${coachTry} ${teamTry} ${coachTryNew} ${teamTryNew}`);
    check('22: the app\'s guardian-invite lookup (code = upper-cased input) finds nothing for the sent or the replacement code',
      await n(db, `select count(*)::int n from public.player_invites where code = upper($1) or code = upper($2)`, [A.codes.piUnused, rows.piUnused.code]) === 0);
    const reopen = {
      extend: await errOf(() => db.query(`update public.player_invites set expires_at = now() + interval '7 days' where id = $1`, [A.ids.piUnused])),
      use: await errOf(() => db.query(`update public.player_invites set used_at = now(), used_by = $2 where id = $1`, [A.ids.piUnused, redeemer])),
      address: await errOf(() => db.query(`update public.coach_invites set invited_email = 'new@example.test' where id = $1`, [A.ids.ciUnused])),
      code: await errOf(() => db.query(`update public.team_invites set code = $2 where id = $1`, [A.ids.tiUnused, A.codes.tiUnused])),
      unrevoke: await errOf(() => db.query(`update public.player_invites set revoked_at = null, revoked_reason = null where id = $1`, [A.ids.piExpired])),
      serviceExtend: await errOf(() => w.service(`update public.coach_invites set expires_at = now() + interval '7 days' where id = $1`, [A.ids.ciUnused])),
      serviceUse: await errOf(() => w.service(`update public.team_invites set used_at = now(), used_by = $2 where id = $1`, [A.ids.tiUnused, redeemer])),
    };
    check('22: a revoked invite can never be reopened, by the owner or service_role (new expiry, use, address, old code, un-revoking: all EMRVK)',
      Object.values(reopen).every((e) => e === 'EMRVK:invite_revoked'), JSON.stringify(reopen));
    const allowed = {
      status: await errOf(() => w.service(`update public.player_invites set email_status = 'skipped_no_email' where id = $1`, [A.ids.piUnused])),
      creator: await errOf(() => db.query(`update public.coach_invites set created_by = null where id = $1`, [A.ids.ciUnused])),
      // A retirement (as the gift-order resend does) sets the expiry to now: still in the past, so harmless.
      expireNow: await errOf(() => w.service(`update public.player_invites set expires_at = now() where id = $1`, [A.ids.piUnused])),
    };
    check('22: …while delivery status, clearing the creator and an "expire it now" retirement still work on a revoked invite',
      Object.values(allowed).every((e) => e === null) && new Date((await inv('player_invites', A.ids.piUnused)).expires_at) <= new Date(), JSON.stringify(allowed));
    const usedOther = await inv('player_invites', A.ids.piUsedByOther), usedX = await inv('coach_invites', ciUsedByX);
    check('22: used invites lose the address and keep the record of the use (addressed to the account: user and code kept; redeemed by the account: user cleared as before)',
      usedOther.invited_email === null && usedOther.used_by === people.coParent && usedOther.used_at !== null && usedOther.code === A.codes.piUsedByOther && usedOther.revoked_at === null
        && usedX.invited_email === null && usedX.used_at !== null && usedX.used_by === null && usedX.revoked_at === null, JSON.stringify([usedOther, usedX]));
    check('22: an invite addressed to someone else is untouched', JSON.stringify(await inv('player_invites', control)) === controlBefore);
    const hitsX = await emailHitsIn(db, ex);
    check('22: after staff completion no column anywhere holds the account\'s address', hitsX.length === 0, hitsX.join(', '));

    // --- B. Immediate self-deletion (no review), then the same address registered again and erased again ---
    const y = id();
    await w.person(y);
    const ey = await emailOf(y);
    const B = await addInvites(ey, 'B');
    const rY = await deleteAccount(w, y);
    const rowsB = await Promise.all(UNUSED.map(([k, t]) => inv(t, B.ids[k])));
    check('22: an immediate self-deletion (the app path) revokes the same way', rY.canDeleteIdentity === true && UNUSED.every(([k], i) => revokedOk(rowsB[i], B.codes[k])), JSON.stringify(rowsB));
    const afterFirst = await inviteRows(db);
    const y2 = id();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [y2, ey]);
    await w.user(y2, `insert into public.profiles (id) values ($1)`, [y2]);
    const late = (await db.query(`insert into public.coach_invites (player_id, code, created_by, invited_email) values ($1, 'S22-B-LATER', $2, $3) returning id`, [w.directPlayer, people.parent, ey])).rows[0].id;
    await deleteAccount(w, y2);
    const lateRow = await inv('coach_invites', late);
    const afterFirstObj = JSON.parse(afterFirst), nowObj = JSON.parse(await inviteRows(db));
    const earlierRevokedSame = INVITE_TABLES.every((t) => afterFirstObj[t].filter((r) => r.revoked_at).every((r) => JSON.stringify(nowObj[t].find((q) => q.id === r.id)) === JSON.stringify(r)));
    check('22: repeat run — a new account on the same address, erased later: only its new invite is revoked; earlier revocations are not touched again',
      revokedOk(lateRow, 'S22-B-LATER') && earlierRevokedSame, JSON.stringify(lateRow));

    // --- C. Transactional: an erasure that fails after the invite step leaves every invite as it was ---
    const z = id();
    await w.person(z);
    const ez = await emailOf(z);
    const C = await addInvites(ez, 'C');
    const beforeC = await inviteRows(db);
    await db.exec(`create function public.s22_forced_failure() returns trigger language plpgsql as $f$ begin raise exception 'S22 forced failure'; end $f$;
                   create trigger s22_forced_failure before delete on public.profiles for each row execute function public.s22_forced_failure();`);
    const failed = await errOf(() => deleteAccount(w, z));
    await db.exec(`drop trigger s22_forced_failure on public.profiles; drop function public.s22_forced_failure();`);
    check('22: transactional — when the erasure fails at its last step, no invite is revoked or changed and nothing is recorded',
      failed?.includes('S22 forced failure') && (await inviteRows(db)) === beforeC
        && await n(db, `select count(*)::int n from public.erased_accounts where profile_id = $1`, [z]) === 0, failed);
    const rZ = await deleteAccount(w, z);
    const afterZ = await inviteRows(db);
    const again = await errOf(() => db.query(`select public.erase_account_for_deletion($1, $2, null)`, [z, ez]));
    check('22: idempotent — retried, it revokes; run again for the same account it is refused (EMERA) and changes nothing',
      rZ.canDeleteIdentity === true && revokedOk(await inv('coach_invites', C.ids.ciUnused), C.codes.ciUnused) && again === 'EMERA:account_erased' && (await inviteRows(db)) === afterZ, again);
    // --- D. A review whose account was already deleted another way (pre-0097, login and profile removed by hand) ---
    const d = id();
    const ed = `S22-gone-${d.slice(0, 8)}@example.test`;
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason) values ($1, $2, 'coach_authored_player_records')`, [d, ed]);
    const D = await addInvites(ed, 'D');
    const cD = await complete(w, (await pendingOf(db, d)).id);
    const rowsD = await Promise.all(UNUSED.map(([k, t]) => inv(t, D.ids[k])));
    check('22: staff closing a review whose account was already deleted another way (account_already_deleted) revokes the invites addressed to it, from the review\'s address, before clearing it',
      cD.status === 'account_already_deleted' && UNUSED.every(([k], i) => revokedOk(rowsD[i], D.codes[k])) && (await inv('player_invites', D.ids.piUsedByOther)).invited_email === null
        && (await pendingOf(db, d)).email === null && (await emailHitsIn(db, ed)).length === 0, JSON.stringify(cD));
    check('22: invite rows hold no address of any erased account in this world',
      (await emailHitsIn(db, ey)).length === 0 && (await emailHitsIn(db, ez)).length === 0, [...await emailHitsIn(db, ey), ...await emailHitsIn(db, ez)].join(', '));
  } catch (e) {
    check('22: invite revocation', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 23. A child-deletion request keeps its contact only while it is pending ===');
{
  const w = await world();
  const { db, people } = w;
  const contactOf = (rid, t = 'player_deletion_requests') => db.query(`select status, requester_email from public.${t} where id = $1`, [rid]).then((r) => r.rows[0]);
  const soleChild = async (name) => {
    const pid = id();
    await db.query(`insert into public.players (id, name) values ($1, $2)`, [pid, name]);
    await db.query(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [pid, people.parent]);
    return pid;
  };
  const MAIL = 'S23-parent@example.test';
  const fileRequest = async (pid) => (await w.user(people.parent, `select public.request_player_deletion($1, $2, null) as rid`, [pid, MAIL])).rows[0].rid;
  try {
    // Completed: confirm (erasure runs, still pending) then finalize.
    const r1 = await fileRequest(await soleChild('S23 Complete'));
    const pending1 = await contactOf(r1);
    await w.user(people.staff, `select public.confirm_player_deletion_erasure($1, 'Fictional: verified with the guardian')`, [r1]);
    const erasing1 = await contactOf(r1);
    const fin = (await w.user(people.staff, `select public.finalize_player_deletion_erasure($1) as r`, [r1])).rows[0].r;
    const done1 = await contactOf(r1);
    const fin2 = (await w.user(people.staff, `select public.finalize_player_deletion_erasure($1) as r`, [r1])).rows[0].r;
    check('23: kept while pending, and while the erasure runs (still pending, staff may need to reply)', pending1.requester_email === MAIL && erasing1.status === 'pending' && erasing1.requester_email === MAIL, JSON.stringify([pending1, erasing1]));
    check('23: cleared in the same write that completes the request; a repeat finalize changes nothing',
      fin.completed === true && done1.status === 'completed' && done1.requester_email === null && fin2.completed === true && (await contactOf(r1)).requester_email === null, JSON.stringify([fin, done1, fin2]));
    // Rejected (staff), repeated.
    const r2 = await fileRequest(await soleChild('S23 Reject'));
    await w.user(people.staff, `select public.staff_reject_player_deletion_request($1, 'Fictional: not the guardian')`, [r2]);
    const rej = await contactOf(r2);
    await w.user(people.staff, `select public.staff_reject_player_deletion_request($1, 'Fictional: not the guardian')`, [r2]);
    check('23: cleared when staff reject; a repeat rejection keeps it cleared', rej.status === 'rejected' && rej.requester_email === null && (await contactOf(r2)).requester_email === null, JSON.stringify(rej));
    // Cancelled (the guardian), repeated.
    const p3 = await soleChild('S23 Cancel');
    const r3 = await fileRequest(p3);
    await w.user(people.parent, `select public.cancel_own_player_deletion_request($1)`, [p3]);
    const can = await contactOf(r3);
    await w.user(people.parent, `select public.cancel_own_player_deletion_request($1)`, [p3]);
    check('23: cleared when the guardian cancels; a repeat cancel keeps it cleared', can.status === 'cancelled' && can.requester_email === null && (await contactOf(r3)).requester_email === null, JSON.stringify(can));
    // Any other path or role: inserted closed, or an address written back onto a closed row.
    const r4 = (await db.query(`insert into public.player_deletion_requests (player_id, requested_by, requester_email, status, cancelled_by, cancelled_at) values ($1, $2, $3, 'cancelled', $2, now()) returning id`, [w.player, people.parent, MAIL])).rows[0].id;
    await w.service(`update public.player_deletion_requests set requester_email = $2 where id = $1`, [r2, MAIL]);
    check('23: by any path or role — a row written closed, or an address written back onto a closed row, holds no address',
      (await contactOf(r4)).requester_email === null && (await contactOf(r2)).requester_email === null);
    // The CHECK backs the trigger: with triggers off, a closed row with an address is still refused.
    await db.exec(`set session_replication_role = replica;`);
    const viaCheck = await errOf(() => db.query(`insert into public.player_deletion_requests (player_id, requested_by, requester_email, status, cancelled_by, cancelled_at) values ($1, $2, $3, 'cancelled', $2, now())`, [w.player, people.parent, MAIL]));
    await db.exec(`set session_replication_role = origin;`);
    check('23: the CHECK refuses a closed request with an address even with triggers off', viaCheck?.includes('player_deletion_requests_closed_has_no_contact'), viaCheck);
    // Squad Invite participation deletion requests: the same rule.
    await db.exec(`set session_replication_role = replica;`);
    const part = (await db.query(`insert into public.squad_invite_participations (campaign_id, guardian_profile_id, builder_token_hash) values ($1, $2, repeat('c', 64)) returning id`, [id(), people.parent])).rows[0].id;
    await db.exec(`set session_replication_role = origin;`);
    const s1 = (await db.query(`insert into public.squad_invite_participation_deletion_requests (participation_id, requested_by, requester_email) values ($1, $2, $3) returning id`, [part, people.parent, MAIL])).rows[0].id;
    const sPending = await contactOf(s1, 'squad_invite_participation_deletion_requests');
    await w.user(people.staff, `select public.staff_reject_squad_invite_participation_deletion_request($1, 'Fictional: duplicate')`, [s1]);
    const sRej = await contactOf(s1, 'squad_invite_participation_deletion_requests');
    const s2 = (await db.query(`insert into public.squad_invite_participation_deletion_requests (participation_id, requested_by, requester_email) values ($1, $2, $3) returning id`, [part, people.parent, MAIL])).rows[0].id;
    await db.query(`update public.squad_invite_participation_deletion_requests set status = 'cancelled', cancelled_by = $2, cancelled_at = now() where id = $1`, [s2, people.parent]);
    const sCan = await contactOf(s2, 'squad_invite_participation_deletion_requests');
    check('23: Squad Invite participation requests: kept while pending, cleared on rejection and on cancellation',
      sPending.requester_email === MAIL && sRej.status === 'rejected' && sRej.requester_email === null && sCan.status === 'cancelled' && sCan.requester_email === null, JSON.stringify([sPending, sRej, sCan]));
    const hits = await emailHitsIn(db, MAIL);
    check('23: with every request closed, no column anywhere holds the contact address', hits.length === 0, hits.join(', '));
  } catch (e) {
    check('23: child-deletion contact lifecycle', false, e.stack);
  }
  await db.close();
}

console.log('\n=== 24. R0 legacy-row count and the service_role privilege pre-check (read-only) ===');
{
  const LEGACY = fs.readFileSync(path.resolve(HERE, '../../verification/0097_precheck_legacy_email_rows.sql'), 'utf8');
  const PRIVS = fs.readFileSync(path.resolve(HERE, '../../verification/0098_precheck_service_role_privileges.sql'), 'utf8');
  const runCheck = async (db, sql) => {
    const row = (await db.exec(sql)).at(-1).rows[0];
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]));
  };
  const STOP = ['auth_retry_rows_with_email', 'resolved_reviews_with_email', 'closed_child_requests_with_contact', 'closed_participation_requests_with_contact', 'used_invites_redeemer_gone_with_email', 'invites_to_deleted_accounts'];
  const w = await world({ through: '0096' });
  const { db, people } = w;
  try {
    const clean = await runCheck(db, LEGACY);
    check('24: legacy check on a clean 0096 database: read-only, every STOP figure 0', clean.read_only_guard === 'on' && STOP.every((k) => clean[k] === 0), JSON.stringify(clean));
    // Rows written under the pre-0097 rules (fictional).
    const gone = id();
    await db.query(`insert into public.pending_auth_deletions (auth_user_id, email, status, last_error) values ($1, 'legacy-a@example.test', 'resolved', 'older record')`, [gone]);
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason, status, resolved_at) values ($1, 'legacy-a@example.test', 'coach_authored_player_records', 'resolved', now())`, [gone]);
    await db.query(`insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason) values ($1, 'legacy-b@example.test', 'coach_authored_player_records')`, [id()]);
    const legacyReq = (await db.query(`insert into public.player_deletion_requests (player_id, requested_by, requester_email, status, cancelled_by, cancelled_at) values ($1, $2, 'legacy-c@example.test', 'cancelled', $2, now()) returning id`, [w.player, people.parent])).rows[0].id;
    await db.query(`insert into public.player_deletion_requests (player_id, requested_by, requester_email) values ($1, $2, 'legacy-c@example.test')`, [w.directPlayer, people.parent]);
    await db.exec(`set session_replication_role = replica;`);
    const part = (await db.query(`insert into public.squad_invite_participations (campaign_id, guardian_profile_id, builder_token_hash) values ($1, $2, repeat('d', 64)) returning id`, [id(), people.parent])).rows[0].id;
    await db.exec(`set session_replication_role = origin;`);
    await db.query(`insert into public.squad_invite_participation_deletion_requests (participation_id, requested_by, requester_email, status, cancelled_by, cancelled_at) values ($1, $2, 'legacy-c@example.test', 'cancelled', $2, now())`, [part, people.parent]);
    await db.query(`insert into public.player_invites (player_id, code, invited_email, origin, used_at) values ($1, 'S24-USED', 'legacy-d@example.test', 'second_guardian', now())`, [w.player]);
    await db.query(`insert into public.coach_invites (player_id, code, created_by, invited_email) values ($1, 'S24-UNUSED', $2, 'nobody-yet@example.test')`, [w.directPlayer, people.parent]);
    await db.query(`insert into public.team_invites (team_id, code, invited_email) values ($1, 'S24-TO-GONE', ' Legacy-A@example.test')`, [w.otherTeam]);
    const legacy = await runCheck(db, LEGACY);
    const expected = { auth_retry_rows_with_email: 1, resolved_reviews_with_email: 1, closed_child_requests_with_contact: 1, closed_participation_requests_with_contact: 1, used_invites_redeemer_gone_with_email: 1,
      invites_to_deleted_accounts: 1, pending_reviews_with_email: 1, open_child_requests_with_contact: 1, unused_invites_with_email_no_account: 2 };
    check('24: legacy check counts each kind of pre-0097 row (every STOP figure 1, so R0 stops) and the expected pending ones',
      legacy.read_only_guard === 'on' && Object.entries(expected).every(([k, v]) => legacy[k] === v), JSON.stringify(legacy));
    const snapshot = async () => rowsOf(db, `select (select json_agg(t order by t.auth_user_id) from public.pending_auth_deletions t) a,
        (select json_agg(t order by t.auth_user_id) from public.pending_profile_deletions t) b,
        (select json_agg(t order by t.id) from public.player_deletion_requests t) c,
        (select json_agg(t order by t.id) from public.squad_invite_participation_deletion_requests t) d,
        (select json_agg(t order by t.id) from public.player_invites t) e,
        (select json_agg(t order by t.id) from public.team_invites t) f`);
    const before = await snapshot();
    const applied97 = await applyMigrations(db, { from: '0097', through: '0097' }).then(() => null).catch((e) => e.message);
    const privs = await runCheck(db, PRIVS);
    check('24: privilege check before 0098: read-only, the four expected privileges present and granted directly (expected_four_present true)',
      applied97 === null && privs.read_only_guard === 'on' && privs.expected_four_present === true && privs.service_role_insert && privs.service_role_update && privs.service_role_delete && privs.service_role_truncate
        && ['DELETE', 'INSERT', 'TRUNCATE', 'UPDATE'].every((p) => privs.direct_grants.split(',').includes(p)), JSON.stringify(privs) + ' ' + applied97);
    const applied98 = await applyMigrations(db, { from: '0098', through: '0098' }).then(() => null).catch((e) => e.message);
    const after = await runCheck(db, LEGACY);
    const strip = (s) => JSON.parse(s);
    const b = strip(before)[0], a = strip(await snapshot())[0];
    // Every pre-existing column of every row is identical (the migrations only add columns, all NULL).
    const pick = (rows, keys) => rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
    const unchanged = (t) => JSON.stringify(b[t]) === JSON.stringify(pick(a[t], Object.keys(b[t][0])));
    const addedNull = (t) => a[t].every((r) => Object.keys(r).filter((k) => !(k in b[t][0])).every((k) => r[k] === null));
    const sameRows = ['a', 'b', 'c', 'd', 'e', 'f'].every((t) => unchanged(t) && addedNull(t));
    check('24: 0097 and 0098 apply over the legacy rows without changing any of them (no automatic clean-up); the counts are unchanged',
      applied98 === null && STOP.every((k) => after[k] === legacy[k]) && sameRows, `${applied98} ${JSON.stringify(after)}`);
    const privsAfter = await runCheck(db, PRIVS);
    check('24: after 0098 the same check shows the four revoked (select kept)', privsAfter.expected_four_present === false && privsAfter.service_role_select === true, JSON.stringify(privsAfter));
    // A mismatch stops before 0098: one privilege missing.
    const w2 = await world({ through: '0097' });
    await w2.db.query(`revoke truncate on public.pending_profile_deletions from service_role`);
    const mism = await runCheck(w2.db, PRIVS);
    const refused = await applyMigrations(w2.db, { from: '0098', through: '0098' }).then(() => null).catch((e) => e.message);
    await w2.db.exec('rollback;').catch(() => {});
    check('24: with one of the four missing the check reads false (STOP), and 0098 itself refuses, changing nothing',
      mism.expected_four_present === false && mism.service_role_truncate === false && refused?.includes('unexpected privileges') && (await n(w2.db, `select count(*)::int n from pg_proc where proname = 'account_deletion_preview'`)) === 0, `${JSON.stringify(mism)} ${refused}`);
    await w2.db.close();
    // Held only through PUBLIC (0098's revoke from service_role would not remove it): STOP too.
    const w3 = await world({ through: '0097' });
    await w3.db.exec(`revoke insert, update, delete, truncate on public.pending_profile_deletions from service_role; grant insert, update, delete, truncate on public.pending_profile_deletions to public;`);
    const viaPublic = await runCheck(w3.db, PRIVS);
    check('24: privileges held only through PUBLIC read as STOP (has_table_privilege true, but not granted directly)',
      viaPublic.service_role_insert === true && viaPublic.expected_four_present === false && viaPublic.public_grants > 0, JSON.stringify(viaPublic));
    await w3.db.close();
  } catch (e) {
    check('24: pre-checks', false, e.stack);
  }
  await db.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} migration 0098 checks passed`);
if (failed.length) process.exitCode = 1;
