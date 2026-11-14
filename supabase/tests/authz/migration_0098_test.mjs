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
      (await w.service(`select count(*)::int n from public.deletion_review_access_suspensions`)).rows[0].n === 2);
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
    await w.service(`update public.pending_profile_deletions set status = 'resolved', resolved_by = $2, resolved_at = now() where id = $1`, [pending.id, people.staff]);
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
      'trigger:profiles.profiles_close_deletion_review_suspensions',
      'function:profile_has_pending_deletion_review(p_profile_id uuid)',
      'function:refuse_coach_access_during_deletion_review()',
      'trigger:coach_players.deletion_review_access_guard',
      'trigger:coach_team.deletion_review_access_guard',
      'trigger:coach_team_requests.deletion_review_access_guard',
      'function:reject_pending_profile_deletion(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)',
      'function:restore_coach_access_after_deletion_rejection(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)',
      'policy:moments.moments: a signed-in user can only name themselves as verifier',
      'policy:moments.moments: a verifier change can only name the caller as coach',
      'relation:deletion_review_access_suspensions',
    ].sort()) && d.removed.length === 0 &&
    JSON.stringify(d.changed.sort()) === JSON.stringify([
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
    await w.service(`insert into public.pending_profile_deletions (auth_user_id, blocking_reason, status, resolved_by, resolved_at) values ($1, 'coach_authored_player_records', 'resolved', $2, now())`, [resolvedAcct, people.staff]);
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
    const C0 = await coachRows(db, parent);
    const guardianReach = () => w.as('authenticated', parent, async () => Number((await db.query(`select count(*)::int n from public.guardians where profile_id = $1`, [parent])).rows[0].n));

    // --- Pending review ---
    const r1 = await deleteAccount(w, parent);
    check('17: pending review — identity kept, coach access suspended (1), nothing unlinked or filed',
      r1.canDeleteIdentity === false && r1.coachAccessSuspended === 1 && r1.playersUnlinked.length === 0 && r1.playersDeletionRequested.length === 0, JSON.stringify(r1));
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
    check('17: restore — exactly the prior coaching access, nothing else', rs.restored === 1 && (await coachRows(db, parent)) === C0 && (await family()) === F0, JSON.stringify(rs));
    check('17: completion is refused for a rejected request', (await attempt(() => complete(w, pid)))?.includes('Only a pending profile deletion can be completed (it is rejected)'));

    // --- Second request, then final staff completion ---
    const r2 = await deleteAccount(w, parent);
    check('17: a second request goes to review again; the family is still unchanged', r2.canDeleteIdentity === false && r2.coachAccessSuspended === 1 && (await family()) === F0, JSON.stringify(r2));
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
      await n(db, `select count(*)::int n from public.deletion_review_access_suspensions where profile_id = $1 and resolution = 'account_deleted'`, [parent]) === 1, JSON.stringify(pd));
    check('17: final completion — the profile is gone and the sign-in identity is queued for staff', await n(db, `select (select count(*) from public.profiles where id = $1) as n`, [parent]) === 0 &&
      await n(db, `select count(*)::int n from public.pending_auth_deletions where auth_user_id = $1 and status = 'pending'`, [parent]) === 1);

    // --- Repeats: idempotent ---
    const F1 = await family();
    const again = await complete(w, pid);
    check('17: a repeated completion reports already_completed and changes nothing (no second request, lock or marker)', again.status === 'already_completed' && (await family()) === F1, JSON.stringify(again));
    check('17: reject and restore are refused after completion',
      (await attempt(() => reject(w, pid, people.staff)))?.includes('already resolved') && (await attempt(() => restore(w, pid, people.staff)))?.includes('(it is resolved)'));
    // The account's old session asks again (its login still exists until staff remove it): nothing left to do.
    const late = await w.user(parent, `select public.delete_own_guardian_account() as r`).then((x) => x.rows[0].r);
    check('17: a late self-service retry finds nothing to erase and changes nothing', late.canDeleteIdentity === true && late.playersDeletionRequested.length === 0 && (await family()) === F1, JSON.stringify(late));
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
    const oc = await complete(w, orphanId);
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

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} migration 0098 checks passed`);
if (failed.length) process.exitCode = 1;
