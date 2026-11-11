// Migration 0097 (coach account deletion keeps the child's coach-verified
// moments) and its rollback, on the production order 0001–0091, 0095, 0096,
// 0097.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Account deletion is reproduced exactly as /api/os/account/delete runs it:
//   1. delete_own_guardian_account() in the person's own session (role
//      authenticated, request.jwt.claim.sub = the person);
//   2. only when that returns canDeleteIdentity = true, the Auth admin
//      deleteUser(), i.e. a delete from auth.users (cascading to profiles).
// Recognitions are inserted with /api/os/celebrate's exact column set, and
// verification uses /api/os/moments/verify's update (with the
// verified_at IS NULL filter this branch adds).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = fs.readFileSync(path.resolve(HERE, '../../rollback/0097_rollback.sql'), 'utf8');
const ACK = ['emblem.acknowledge_0097_rollback', 'BREAK-COACH-ACCOUNT-DELETION'];

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

// A fictional world: a staff member, a parent guarding two players, a
// second parent co-guarding the first player, and coach accounts.
async function world({ through = '9999', db: existing } = {}) {
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
  const people = { parent: id(), coParent: id(), staff: id() };
  const season = id(), club = id(), player = id(), directPlayer = id();
  await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await service(`insert into public.clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await db.query(`insert into public.players (id, name) values ($1, 'Fictional Player'), ($2, 'Fictional Direct')`, [player, directPlayer]);
  async function person(uid) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `p-${uid.slice(0, 8)}@example.test`]);
    await user(uid, `insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [uid]);
  }
  for (const uid of Object.values(people)) await person(uid);
  await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [people.staff]);
  await service(`select public.ensure_profile_role($1, 'parent')`, [people.parent]);
  await service(`select public.ensure_profile_role($1, 'parent')`, [people.coParent]);
  await service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $3, 'card_claim', $3), ($2, $3, 'card_claim', $3), ($1, $4, 'card_claim', $4)`,
    [player, directPlayer, people.parent, people.coParent]);
  const w = { db, as, service, user, people, season, club, player, directPlayer };
  // A coach with an active coach_team row (approved team request) on the
  // first player's team; the team is created once and shared.
  w.coach = async () => {
    const uid = id();
    await person(uid);
    const req = (await user(uid, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', $1) returning id`, [`U${Math.floor(Math.random() * 1e6)}`])).rows[0].id;
    if (!w.team) {
      w.team = (await service(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [req, people.staff, season])).rows[0].team_id;
      await service(`update public.players set team_id = $1 where id = $2`, [w.team, player]);
    } else {
      await service(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [req, people.staff, w.team]).catch(async () => {
        // Fallback: join the existing team by a team invite.
        const code = `TEAM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        await service(`insert into public.team_invites (team_id, code) values ($1, $2)`, [w.team, code]);
        await service(`select status from public.redeem_team_invite($1, $2)`, [code, uid]);
      });
    }
    return uid;
  };
  // /api/os/celebrate's insert, as the coach.
  w.recognise = async (coach, title = 'Man of the Match') => (await user(coach, `insert into public.moments (player_id, title, trust, note, uploaded_by, verified_by, verified_at, verification_status)
      values ($1, $2, 'coach', 'Brilliant', $3, $3, now(), 'coach_verified') returning id`, [player, title, coach])).rows[0].id;
  // A guardian's submission (/api/os/moments), as the parent.
  w.submit = async (status, title) => (await user(people.parent, `insert into public.moments (player_id, title, trust, uploaded_by, verification_status)
      values ($1, $2, 'parent', $3, $4) returning id`, [player, title, people.parent, status])).rows[0].id;
  // /api/os/moments/verify approve, as the coach (with this branch's filter).
  w.verify = async (coach, momentId) => (await user(coach, `update public.moments set verified_by = $2, verified_at = now(), verification_status = 'coach_verified'
      where id = $1 and verified_at is null returning id`, [momentId, coach])).rows.length;
  return w;
}

// The route's two steps.
async function deleteAccount(w, uid) {
  const rpc = await w.user(uid, `select public.delete_own_guardian_account() as result`);
  const result = rpc.rows[0].result;
  if (result.canDeleteIdentity) await w.db.query(`delete from auth.users where id = $1`, [uid]); // admin.deleteUser
  return result;
}
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const n = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].n);
const moment = (db, mid) => one(db, `select verification_status, verified_at, verified_by, verifier_account_deleted_at, uploaded_by, title, note, trust, player_id from public.moments where id = $1`, [mid]);

// Every column in public that references profiles or auth.users, and how
// many rows still point at uid.
async function danglingReferences(db, uid) {
  const fks = (await db.query(`select c.conrelid::regclass::text tbl, a.attname col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)`)).rows;
  let total = 0;
  for (const f of fks) total += await n(db, `select count(*)::int n from ${f.tbl} where ${f.col} = $1`, [uid]);
  return total;
}

// What the deleted uid can still reach through RLS.
async function reach(w, uid) {
  return w.as('authenticated', uid, async () => ({
    players: Number((await w.db.query(`select count(*)::int n from public.players`)).rows[0].n),
    moments: Number((await w.db.query(`select count(*)::int n from public.moments`)).rows[0].n),
    coachTeam: Number((await w.db.query(`select count(*)::int n from public.coach_team`)).rows[0].n),
    coachPlayers: Number((await w.db.query(`select count(*)::int n from public.coach_players`)).rows[0].n),
    guardians: Number((await w.db.query(`select count(*)::int n from public.guardians`)).rows[0].n),
  }));
}
async function canRecognise(w, uid) {
  try {
    await w.recognise(uid, 'After deletion');
    return true;
  } catch {
    return false;
  }
}
// The child's and guardians' data that no coach deletion may change.
async function familyState(db, w) {
  return JSON.stringify((await db.query(`select
    (select json_agg(g order by g.player_id, g.profile_id) from (select player_id, profile_id, created_by from public.guardians) g) g,
    (select json_agg(p order by p.id) from (select id, name, team_id from public.players) p) p,
    (select json_agg(m order by m.id) from (select id, title, trust, verification_status, verified_at from public.moments where uploaded_by = $1) m) m`, [w.people.parent])).rows[0]);
}

console.log('\n=== 1. Coach who sent recognitions (Celebrate) ===');
{
  const w = await world();
  const { db } = w;
  try {
    const coach = await w.coach();
    const r1 = await w.recognise(coach);
    const r2 = await w.recognise(coach, 'Best Effort');
    const before = await moment(db, r1);
    const family = await familyState(db, w);
    const result = await deleteAccount(w, coach);
    check('1: deletion succeeds and allows identity deletion (was: constraint violation, rolled back)', result.canDeleteIdentity === true, JSON.stringify(result));
    check('1: Auth identity and profile are gone', await n(db, `select (select count(*) from auth.users where id = $1) + (select count(*) from public.profiles where id = $1) as n`, [coach]) === 0);
    const after = await moment(db, r1);
    check('1: the recognition is kept, still coach_verified, same verified_at, title, note and trust',
      after.verification_status === 'coach_verified' && +after.verified_at === +before.verified_at && after.title === before.title && after.note === before.note && after.trust === 'coach', JSON.stringify(after));
    check('1: …attributed to no one: verified_by and uploaded_by NULL, verifier_account_deleted_at set',
      after.verified_by === null && after.uploaded_by === null && after.verifier_account_deleted_at !== null);
    check('1: both recognitions are marked', await n(db, `select count(*)::int n from public.moments where id = any($1::uuid[]) and verifier_account_deleted_at is not null and verification_status = 'coach_verified'`, [[r1, r2]]) === 2);
    check('1: no row anywhere still references the deleted account', (await danglingReferences(db, coach)) === 0);
    check('1: guardians, players and the parent\'s own moments are untouched', (await familyState(db, w)) === family);
    const r = await reach(w, coach);
    check('1: the deleted uid reaches nothing through RLS (players, moments, coach_team, coach_players, guardians)', Object.values(r).every((v) => v === 0), JSON.stringify(r));
    check('1: …and cannot send a recognition', !(await canRecognise(w, coach)));
    check('1: the parent still sees both recognitions', await w.user(w.people.parent, `select count(*)::int n from public.moments where id = any($1::uuid[])`, [[r1, r2]]).then((x) => x.rows[0].n) === 2);
  } catch (e) {
    check('1: recogniser deletion', false, e.message);
  }
  await db.close();
}

console.log('\n=== 2. Coach who verified moments (pending and family memory) ===');
{
  const w = await world();
  const { db } = w;
  try {
    const coach = await w.coach();
    const pending = await w.submit('pending_verification', 'Hat-trick');
    const memory = await w.submit('family_memory', 'First boots');
    check('2: setup — the coach verified a pending moment and a family memory', (await w.verify(coach, pending)) === 1 && (await w.verify(coach, memory)) === 1);
    const before = await moment(db, pending);
    const result = await deleteAccount(w, coach);
    check('2: deletion succeeds', result.canDeleteIdentity === true, JSON.stringify(result));
    const a = await moment(db, pending), b = await moment(db, memory);
    check('2: both verified moments stay coach_verified with their verified_at, verifier anonymised',
      [a, b].every((m) => m.verification_status === 'coach_verified' && m.verified_at !== null && m.verified_by === null && m.verifier_account_deleted_at !== null) && +a.verified_at === +before.verified_at, JSON.stringify([a, b]));
    check('2: the parent remains their uploader', a.uploaded_by === w.people.parent && b.uploaded_by === w.people.parent);
    check('2: no row anywhere still references the deleted account', (await danglingReferences(db, coach)) === 0);
    // Re-approving an already-verified moment: the route's filter matches
    // nothing, so it can never re-attribute (or trip the constraint).
    const other = await w.coach();
    check('2: another coach\'s approve on an anonymised moment matches zero rows (route returns 403)', (await w.verify(other, pending)) === 0);
    let err = null;
    await w.user(other, `update public.moments set verified_by = $2, verified_at = now(), verification_status = 'coach_verified' where id = $1`, [pending, other]).catch((e) => { err = e.message; });
    check('2: …without the filter (the pre-branch route) the database refuses it rather than mis-attributing', err?.includes('moments_verification_status_consistency'), err ?? 'no error');
  } catch (e) {
    check('2: verifier deletion', false, e.message);
  }
  await db.close();
}

console.log('\n=== 3. Coach with both, plus a direct link, a story update and a co-coach ===');
{
  const w = await world();
  const { db } = w;
  try {
    const coach = await w.coach();
    const coCoach = await w.coach();
    const rec = await w.recognise(coach);
    const ver = await w.submit('pending_verification', 'Clean sheet');
    await w.verify(coach, ver);
    const coRec = await w.recognise(coCoach, 'Co-coach award');
    const coachCode = `COACH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await w.user(w.people.parent, `insert into public.coach_invites (player_id, code, created_by) values ($1, $2, $3)`, [w.directPlayer, coachCode, w.people.parent]);
    await w.service(`select status from public.redeem_coach_invite($1, $2)`, [coachCode, coach]);
    await w.service(`insert into public.story_updates (recipient_profile_id, actor_profile_id, player_id, event_type, category, title, body, related_moment_id)
      values ($1, $2, $3, 'recognition', 'coach', 'Coach Recognition', 'Recognised', $4)`, [w.people.parent, coach, w.player, rec]);
    const family = await familyState(db, w);
    check('3: setup — active coach_team and a direct link', await n(db, `select (select count(*) from public.coach_team where profile_id = $1 and ended_at is null) + (select count(*) from public.coach_players where profile_id = $1) as n`, [coach]) === 2);
    const result = await deleteAccount(w, coach);
    check('3: deletion succeeds', result.canDeleteIdentity === true, JSON.stringify(result));
    check('3: both of the coach\'s moments are kept and anonymised', await n(db, `select count(*)::int n from public.moments where id = any($1::uuid[]) and verification_status = 'coach_verified' and verified_by is null and verifier_account_deleted_at is not null`, [[rec, ver]]) === 2);
    const co = await moment(db, coRec);
    check('3: the co-coach\'s recognition still names the co-coach (untouched)', co.verified_by === coCoach && co.verifier_account_deleted_at === null);
    check('3: coach_team and coach_players rows are gone', await n(db, `select (select count(*) from public.coach_team where profile_id = $1) + (select count(*) from public.coach_players where profile_id = $1) as n`, [coach]) === 0);
    check('3: the co-coach keeps their access', await n(db, `select count(*)::int n from public.coach_team where profile_id = $1 and ended_at is null`, [coCoach]) === 1);
    check('3: the family keeps the Story Update (actor cleared)', await n(db, `select count(*)::int n from public.story_updates where related_moment_id = $1 and actor_profile_id is null`, [rec]) === 1);
    check('3: guardians, players and the parent\'s own moments are untouched', (await familyState(db, w)) === family);
    check('3: no row anywhere still references the deleted account', (await danglingReferences(db, coach)) === 0);
    const r = await reach(w, coach);
    check('3: the deleted uid reaches nothing through RLS', Object.values(r).every((v) => v === 0), JSON.stringify(r));
  } catch (e) {
    check('3: coach with both', false, e.message);
  }
  await db.close();
}

console.log('\n=== 4. Ordinary coach with neither ===');
{
  const w = await world();
  const { db } = w;
  try {
    const coach = await w.coach();
    const pending = await w.submit('pending_verification', 'Unreviewed');
    const result = await deleteAccount(w, coach);
    check('4: deletion succeeds and the account is gone', result.canDeleteIdentity === true && await n(db, `select count(*)::int n from public.profiles where id = $1`, [coach]) === 0, JSON.stringify(result));
    check('4: no moment is marked; the pending moment is unchanged', await n(db, `select count(*)::int n from public.moments where verifier_account_deleted_at is not null`) === 0 && (await moment(db, pending)).verification_status === 'pending_verification');
  } catch (e) {
    check('4: ordinary coach deletion', false, e.message);
  }
  await db.close();
}

console.log('\n=== 5. Parent-only accounts delete as before ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    const mem = await w.submit('family_memory', 'Kit day');
    const ver = await w.submit('pending_verification', 'Goal');
    await w.verify(coach, ver);
    const result = await deleteAccount(w, people.parent);
    check('5: a parent co-guarding one child and sole guardian of another deletes as before',
      result.canDeleteIdentity === true && result.playersUnlinked.includes(w.player) && result.playersDeletionRequested.includes(w.directPlayer), JSON.stringify(result));
    const m = await moment(db, mem), v = await moment(db, ver);
    check('5: the parent\'s family memory stays family_memory, uploader cleared, no marker', m.verification_status === 'family_memory' && m.uploaded_by === null && m.verifier_account_deleted_at === null);
    check('5: the coach-verified moment still names the (living) coach as verifier', v.verified_by === coach && v.verifier_account_deleted_at === null && v.uploaded_by === null);
    check('5: the co-parent keeps their guardianship', await n(db, `select count(*)::int n from public.guardians where profile_id = $1`, [people.coParent]) === 1);
    check('5: no row anywhere still references the deleted parent', (await danglingReferences(db, people.parent)) === 0);
  } catch (e) {
    check('5: parent deletion', false, e.message);
  }
  await db.close();
}

console.log('\n=== 6. Coach with authored records and recognitions (staff-review path) ===');
{
  const w = await world();
  const { db } = w;
  try {
    const coach = await w.coach();
    const rec = await w.recognise(coach);
    await w.user(coach, `insert into public.player_assessments (player_id, created_by, body) values ($1, $2, 'Fictional assessment')`, [w.player, coach]);
    const result = await deleteAccount(w, coach);
    check('6: the RPC now succeeds (was: constraint violation) and withholds identity deletion', result.canDeleteIdentity === false, JSON.stringify(result));
    check('6: staff get one pending_profile_deletions record', await n(db, `select count(*)::int n from public.pending_profile_deletions where auth_user_id = $1 and blocking_reason = 'coach_authored_player_records'`, [coach]) === 1);
    const m1 = await moment(db, rec);
    check('6: the recognition is already anonymised, so it cannot block staff completing the deletion', m1.verification_status === 'coach_verified' && m1.verified_by === null && m1.verifier_account_deleted_at !== null);
    check('6: CURRENT BEHAVIOUR (unchanged by 0097, see the suspension proposal) — profile and active coach_team remain until staff act',
      await n(db, `select (select count(*) from public.profiles where id = $1) + (select count(*) from public.coach_team where profile_id = $1 and ended_at is null) as n`, [coach]) === 2);
    // Idempotency: repeating the request changes nothing further.
    const again = await deleteAccount(w, coach);
    const m2 = await moment(db, rec);
    check('6: a repeated request is harmless — same answer, still one staff record, marker timestamp unchanged',
      again.canDeleteIdentity === false && await n(db, `select count(*)::int n from public.pending_profile_deletions where auth_user_id = $1`, [coach]) === 1 && +m2.verifier_account_deleted_at === +m1.verifier_account_deleted_at);
  } catch (e) {
    check('6: staff-review path', false, e.message);
  }
  await db.close();
}

console.log('\n=== 7. Atomicity, and a separate defect found while testing ===');
// A dual-role account (coach and guardian) who once cancelled a child
// deletion request: deleting the profile sets player_deletion_requests.
// cancelled_by to NULL (ON DELETE SET NULL), which the
// player_deletion_requests_cancellation_requires_actor check forbids. That
// is NOT fixed by 0097 (it affects parents too; see the evidence file). It
// is used here to prove that when deletion fails, 0097's anonymisation
// rolls back with it.
{
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    const rec = await w.recognise(coach);
    await w.service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [w.directPlayer, coach]);
    await db.query(`insert into public.player_deletion_requests (player_id, requested_by, status, cancelled_by, cancelled_at) values ($1, $2, 'cancelled', $2, now())`, [w.directPlayer, coach]);
    let err = null;
    await deleteAccount(w, coach).catch((e) => { err = e.message; });
    check('7: KNOWN SEPARATE DEFECT — deletion fails when the account cancelled a child-deletion request (cancellation_requires_actor)',
      err?.includes('player_deletion_requests_cancellation_requires_actor'), err ?? 'deletion succeeded — the separate defect is fixed; update this scenario');
    const m = await moment(db, rec);
    check('7: …and the failure changes nothing: recognition still names the coach, no marker, profile and guardian link intact',
      m.verified_by === coach && m.verifier_account_deleted_at === null &&
      await n(db, `select (select count(*) from public.profiles where id = $1) + (select count(*) from public.guardians where profile_id = $1) as n`, [coach]) === 2);
    check('7: (control) the other parent is unaffected', await n(db, `select count(*)::int n from public.guardians where profile_id = $1`, [people.parent]) === 2);
  } catch (e) {
    check('7: atomicity', false, e.message);
  }
  await db.close();
}

console.log('\n=== 8. The consistency rule and who can set the marker ===');
{
  const w = await world();
  const { db, people } = w;
  try {
    const coach = await w.coach();
    const p = w.player;
    const attempt = async (fn) => fn().then(() => null).catch((e) => e.message);
    const raw = (status, at, by, marker) => attempt(() => db.query(`insert into public.moments (player_id, title, trust, verification_status, verified_at, verified_by, verifier_account_deleted_at) values ($1, 'x', 'coach', $2, $3, $4, $5)`, [p, status, at, by, marker]));
    const now = new Date();
    const violates = (e) => e?.includes('moments_verification_status_consistency');
    check('8: still rejects coach_verified with verified_at NULL', violates(await raw('coach_verified', null, coach, null)));
    check('8: still rejects coach_verified with verified_at NULL even with the marker', violates(await raw('coach_verified', null, null, now)));
    check('8: still rejects family_memory with verified_by set', violates(await raw('family_memory', null, coach, null)));
    check('8: rejects family_memory / pending_verification carrying the marker', violates(await raw('family_memory', null, null, now)) && violates(await raw('pending_verification', null, null, now)));
    check('8: rejects coach_verified with neither verifier nor marker', violates(await raw('coach_verified', now, null, null)));
    check('8: rejects coach_verified with both verifier and marker', violates(await raw('coach_verified', now, coach, now)));
    check('8: accepts the two valid coach_verified shapes (owner role)', (await raw('coach_verified', now, coach, null)) === null && (await raw('coach_verified', now, null, now)) === null);
    const asCoach = (sql, params) => attempt(() => w.user(coach, sql, params));
    const rls = (e) => e?.includes('row-level security');
    check('8: an active coach cannot insert a moment with the marker (restrictive policy)', rls(await asCoach(`insert into public.moments (player_id, title, trust, verification_status, verified_at, verifier_account_deleted_at) values ($1, 'forged', 'coach', 'coach_verified', now(), now())`, [p])));
    check('8: …nor alongside their own verified_by', rls(await asCoach(`insert into public.moments (player_id, title, trust, verification_status, verified_at, verified_by, verifier_account_deleted_at) values ($1, 'forged', 'coach', 'coach_verified', now(), $2, now())`, [p, coach])));
    check('8: a guardian cannot insert the marker either', rls(await attempt(() => w.user(people.parent, `insert into public.moments (player_id, title, trust, uploaded_by, verification_status, verifier_account_deleted_at) values ($1, 'x', 'parent', $2, 'family_memory', now())`, [p, people.parent]))));
    const rec = await w.recognise(coach);
    check('8: no signed-in user can update the marker (no column privilege)', (await asCoach(`update public.moments set verifier_account_deleted_at = now() where id = $1`, [rec]))?.includes('permission denied'));
    check('8: an ordinary recognition and guardian submission still save', !!rec && !!(await w.submit('pending_verification', 'still works')));
  } catch (e) {
    check('8: constraint and marker', false, e.message);
  }
  await db.close();
}

console.log('\n=== 9. Applying 0097 to existing data; re-run refused ===');
let c96, c97, db9, w9, data96;
{
  db9 = await readyDatabase('0096');
  w9 = await world({ db: db9 });
  const coach = await w9.coach();
  await w9.recognise(coach);
  const v = await w9.submit('pending_verification', 'Existing verified');
  await w9.verify(coach, v);
  await w9.submit('family_memory', 'Existing memory');
  await w9.submit('pending_verification', 'Existing pending');
  w9.coachUid = coach;
  // Before 0097: the defect, exactly as production has it.
  let err = null;
  await deleteAccount(w9, coach).catch((e) => { err = e.message; });
  check('9: at 0096 the defect reproduces (moments_verification_status_consistency) and changes nothing',
    err?.includes('moments_verification_status_consistency') && await n(db9, `select count(*)::int n from public.moments where verified_by = $1`, [coach]) === 2, err);
  const momentsRows = async () => JSON.stringify((await db9.query(`select id, player_id, title, trust, note, uploaded_by, verified_by, verified_at, verification_status, visibility, source from public.moments order by id`)).rows);
  data96 = await momentsRows();
  c96 = await snapshotCatalog(db9);
  const applied = await applyMigrations(db9, { from: '0097', through: '0097' }).then(() => null).catch((e) => e.message);
  check('9: 0097 applies on a 0096 database holding coach_verified, pending and family-memory rows', applied === null, applied);
  c97 = await snapshotCatalog(db9);
  check('9: no existing row changed; every row has the marker NULL', (await momentsRows()) === data96 && await n(db9, `select count(*)::int n from public.moments where verifier_account_deleted_at is not null`) === 0);
  check('9: the constraint is validated', (await one(db9, `select convalidated from pg_constraint where conname = 'moments_verification_status_consistency'`)).convalidated === true);
  const d = diffCatalog(c96, c97);
  const expected = {
    added: ['column:moments.verifier_account_deleted_at', 'policy:moments.moments: only account deletion marks a verifier as deleted'],
    changed: ['constraint:moments.moments_verification_status_consistency', 'function:delete_own_guardian_account()'],
  };
  check('9: the catalog change is exactly: one column, one restrictive policy, the constraint, the function',
    JSON.stringify(d.added.sort()) === JSON.stringify(expected.added) && JSON.stringify(d.changed.sort()) === JSON.stringify(expected.changed) && d.removed.length === 0, JSON.stringify(d));
  check('9: delete_own_guardian_account keeps SECURITY DEFINER, empty search_path, owner postgres, and EXECUTE for authenticated only',
    c97.get('function:delete_own_guardian_account()').split(' | ').slice(0, 5).join(' | ') === c96.get('function:delete_own_guardian_account()').split(' | ').slice(0, 5).join(' | '));
  const policy = c97.get('policy:moments.moments: only account deletion marks a verifier as deleted');
  check('9: the new policy is RESTRICTIVE, INSERT, authenticated only', policy.startsWith('RESTRICTIVE | {authenticated} | INSERT'), policy);
  // A refused migration leaves its own transaction aborted; end it as the
  // SQL Editor would.
  const refusedApply = (db) => applyMigrations(db, { from: '0097', through: '0097' }).then(() => null).catch(async (e) => { await db.exec('rollback;').catch(() => {}); return e.message; });
  const rerun = await refusedApply(db9);
  check('9: re-running 0097 is refused, changing nothing', rerun?.includes('0097 refused') && rerun.includes('already applied') && keysOf(diffCatalog(c97, await snapshotCatalog(db9))).length === 0, rerun);
  // A database whose function was changed since 0076 is refused too.
  const other = await readyDatabase('0096');
  await other.exec(`create or replace function public.delete_own_guardian_account() returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;`);
  const refused = await refusedApply(other);
  check('9: refused when delete_own_guardian_account is not the 0076 definition', refused?.includes('is not the 0076 definition'), refused);
  await other.close();
}

console.log('\n=== 10. Rollback ===');
{
  const db = db9;
  async function rollBack(ack) {
    await db.exec('begin;');
    try {
      if (ack) await db.query(`select set_config($1, $2, true)`, ack);
      await db.exec(ROLLBACK);
      return null;
    } catch (e) {
      await db.exec('rollback;').catch(() => {});
      return e.message;
    }
  }
  const noAck = async () => (await one(db, `select coalesce(current_setting($1, true), '') v`, [ACK[0]])).v === '';
  let r = await rollBack(null);
  check('10: refused without the acknowledgement, changing nothing', r?.includes('0097 rollback refused: it breaks account deletion for coaches again') && keysOf(diffCatalog(c97, await snapshotCatalog(db))).length === 0, r);
  r = await rollBack([ACK[0], 'yes']);
  check('10: refused with a wrong acknowledgement', r?.includes('0097 rollback refused'), r);
  r = await rollBack(ACK);
  check('10: with the acknowledgement and no marked moment, it succeeds', r === null, r);
  let diff = keysOf(diffCatalog(c96, await snapshotCatalog(db)));
  check('10: …to the exact 0096 catalog', diff.length === 0, diff.join(', '));
  check('10: …with every moment row unchanged', JSON.stringify((await db.query(`select id, player_id, title, trust, note, uploaded_by, verified_by, verified_at, verification_status, visibility, source from public.moments order by id`)).rows) === data96);
  check('10: …and no acknowledgement persists', await noAck());
  r = await rollBack(ACK);
  check('10: a second rollback is refused (0097 is not applied)', r?.includes('0097 is not applied'), r);
  const again = await applyMigrations(db, { from: '0097', through: '0097' }).then(() => null).catch((e) => e.message);
  diff = keysOf(diffCatalog(c97, await snapshotCatalog(db)));
  check('10: 0097 re-applies to the exact 0097 catalog', again === null && diff.length === 0, again ?? diff.join(', '));
  // Once an account deletion has used the new state, rollback must refuse.
  const result = await deleteAccount(w9, w9.coachUid);
  check('10: after re-apply the 0096-era coach now deletes', result.canDeleteIdentity === true, JSON.stringify(result));
  const marked = await n(db, `select count(*)::int n from public.moments where verifier_account_deleted_at is not null`);
  const before = await snapshotCatalog(db);
  r = await rollBack(ACK);
  check('10: rollback is refused once any moment is marked, naming the count, changing nothing',
    r?.includes(`${marked} moment(s) were verified by a coach whose account has since been deleted`) && keysOf(diffCatalog(before, await snapshotCatalog(db))).length === 0 && marked === 2, r);
  check('10: …and no acknowledgement persists', await noAck());
  await db.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} migration 0097 checks passed`);
if (failed.length) process.exitCode = 1;
