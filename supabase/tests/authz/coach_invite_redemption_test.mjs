// Atomic coach-invite redemption: redeem_coach_invite (0088).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Concurrency note: PGlite is a single embedded connection, so two truly
// simultaneous transactions can't be run here. This file proves the
// sequential consequences (one invite yields one link; a replay by anyone
// finds it consumed), and the structural contract test proves the claim is
// a single conditional UPDATE (used_at IS NULL in its WHERE), which
// PostgreSQL row locking serialises under real concurrency.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

// --- Applying 0088 consumes nothing and creates no links -------------------
{
  const db = await createDatabase();
  await applyMigrations(db, { through: '0087' });
  const g = id(), p = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'g@example.test')`, [g]);
  await db.query(`insert into profiles (id, role) values ($1, 'parent')`, [g]);
  await db.query(`insert into players (id, name) values ($1, 'Fictional Player')`, [p]);
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [p, g]);
  await db.query(`insert into coach_invites (player_id, code, created_by) values ($1, 'COACH-PRE0088', $2)`, [p, g]);
  await applyMigrations(db, { from: '0088', through: '0088' });
  const r = (await db.query(`select (select count(*)::int from coach_invites where used_at is not null) consumed, (select count(*)::int from coach_players) links`)).rows[0];
  check('applying 0088 consumes no invitation and creates no direct link', r.consumed === 0 && r.links === 0, JSON.stringify(r));
  await db.close();
}

// --- Fixture ------------------------------------------------------------------
const db = await createDatabase();
await applyMigrations(db, { through: '0088' });

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
const redeem = (code, coach, name = null) =>
  as('service_role', null, () => db.query(`select status, player_id from public.redeem_coach_invite($1, $2, $3)`, [code, coach, name])).then((r) => r.rows);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

const ids = {
  player: id(), player2: id(), guardian: id(), formerGuardian: id(),
  newCoach: id(), parentCoach: id(), rival: id(), late: id(), failing: id(),
};
// Accounts that exist in auth only (no profile yet): a brand-new coach.
await db.query(`insert into auth.users (id, email) select u, 'p-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [Object.values(ids).filter((v) => v !== ids.player && v !== ids.player2)]);
await db.query(`insert into profiles (id, role, display_name) values ($1, 'parent', 'Fictional Parent'), ($2, 'parent', 'Former Parent'), ($3, 'parent', 'Parent Who Coaches'), ($4, null, 'Rival Coach'), ($5, null, 'Late Coach')`,
  [ids.guardian, ids.formerGuardian, ids.parentCoach, ids.rival, ids.late]);
await db.query(`insert into players (id, name) values ($1, 'Fictional Player'), ($2, 'Second Player')`, [ids.player, ids.player2]);
await db.query(`insert into guardians (player_id, profile_id) values ($1, $2), ($3, $2)`, [ids.player, ids.guardian, ids.player2]);

const invite = (code, { player = ids.player, createdBy = ids.guardian, expires = "now() + interval '7 days'", usedAt = 'null', usedBy = null } = {}) =>
  db.query(`insert into coach_invites (player_id, code, created_by, expires_at, used_at, used_by) values ($1, $2, $3, ${expires}, ${usedAt}, $4)`, [player, code, createdBy, usedBy]);
const state = async (code, coach) => ({
  invite: await one(`select used_at, used_by from coach_invites where code = $1`, [code]),
  links: (await one(`select count(*)::int n from coach_players where profile_id = $1`, [coach])).n,
  profile: await one(`select role, display_name from profiles where id = $1`, [coach]),
  audit: (await one(`select count(*)::int n from relationship_audit_events where table_name = 'coach_players' and profile_id = $1`, [coach])).n,
});

// --- Normal redemption ----------------------------------------------------
await invite('COACH-VALID01');
const r1 = await redeem('COACH-VALID01', ids.newCoach, 'Fictional Coach');
check('a valid, unused, unexpired invite from a current guardian is redeemed', r1.length === 1 && r1[0].status === 'redeemed' && r1[0].player_id === ids.player, JSON.stringify(r1));
const s1 = await state('COACH-VALID01', ids.newCoach);
check('exactly one direct link is created', s1.links === 1);
check('used_at (database clock) and used_by (the redeeming coach) are set', s1.invite.used_at !== null && s1.invite.used_by === ids.newCoach, JSON.stringify(s1.invite));
check('a brand-new coach gets a profile with the coach role and their name', s1.profile?.role === 'coach' && s1.profile?.display_name === 'Fictional Coach', JSON.stringify(s1.profile));
const link1 = await one(`select created_via, created_by, connected_at from coach_players where profile_id = $1`, [ids.newCoach]);
check('the link keeps its established meaning: guardian_invite, created by the inviting guardian, connected now',
  link1.created_via === 'guardian_invite' && link1.created_by === ids.guardian && link1.connected_at !== null, JSON.stringify(link1));
const audit1 = (await db.query(`select event, actor_source, actor_profile_id, operation, db_role from relationship_audit_events where table_name = 'coach_players' and profile_id = $1`, [ids.newCoach])).rows;
check('exactly one creation audit event, attributed to the inviting guardian',
  audit1.length === 1 && audit1[0].event === 'INSERT' && audit1[0].actor_source === 'row_attribution' && audit1[0].actor_profile_id === ids.guardian &&
  audit1[0].operation === 'guardian_invite' && audit1[0].db_role === 'service_role', JSON.stringify(audit1));

await invite('COACH-PARENT1');
const r2 = await redeem('COACH-PARENT1', ids.parentCoach);
check('a parent redeeming a coach invite keeps the parent role and gains the link',
  r2[0].status === 'redeemed' && (await state('COACH-PARENT1', ids.parentCoach)).profile.role === 'parent' && (await state('COACH-PARENT1', ids.parentCoach)).links === 1);

// --- Invalid invitations: refused, nothing written --------------------------
async function expectInvalid(label, code, coach) {
  const before = await state(code, coach);
  const r = await redeem(code, coach);
  const after = await state(code, coach);
  check(`${label}: refused as 'invalid' with no player id`, r.length === 1 && r[0].status === 'invalid' && r[0].player_id === null, JSON.stringify(r));
  check(`${label}: no link, role, profile, invite or audit change`, JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
}
await invite('COACH-EXPIRED', { expires: "now() - interval '1 minute'" });
await expectInvalid('an expired invite', 'COACH-EXPIRED', ids.late);
await invite('COACH-USEDBYX', { usedAt: "now() - interval '1 day'", usedBy: ids.rival });
await expectInvalid('an invite consumed by another coach', 'COACH-USEDBYX', ids.late);
await invite('COACH-NOTGUARD', { createdBy: ids.formerGuardian });
await expectInvalid('an invite whose creator is no longer a guardian', 'COACH-NOTGUARD', ids.late);
await invite('COACH-GONEUSER', { usedAt: "now() - interval '1 day'" });
await expectInvalid('a consumed invite whose redeemer was deleted (used_by NULL)', 'COACH-GONEUSER', ids.late);
await expectInvalid('an unknown code', 'COACH-NOSUCHCODE', ids.late);

// --- Two coaches, one invite (sequential replay) ---------------------------
await invite('COACH-ONEWIN', { player: ids.player2 });
const first = await redeem('COACH-ONEWIN', ids.rival);
const second = await redeem('COACH-ONEWIN', ids.late);
check('two coaches redeeming one invite: exactly one wins', first[0].status === 'redeemed' && second[0].status === 'invalid', `${first[0].status} / ${second[0].status}`);
const winner = await state('COACH-ONEWIN', ids.rival);
const loser = await state('COACH-ONEWIN', ids.late);
check('only the winner has a direct link; the invite records only the winner', winner.links === 1 && loser.links === 0 && winner.invite.used_by === ids.rival);
check('the losing coach’s role is unchanged', loser.profile.role === null);
check('exactly one creation audit event exists for that invite’s link',
  (await one(`select count(*)::int n from relationship_audit_events where table_name = 'coach_players' and player_id = $1`, [ids.player2])).n === 1);

// --- Retries --------------------------------------------------------------
const before = await state('COACH-VALID01', ids.newCoach);
const retry = await redeem('COACH-VALID01', ids.newCoach);
const after = await state('COACH-VALID01', ids.newCoach);
check('a retry by the coach who redeemed it is idempotent', retry[0].status === 'already_redeemed_by_you' && retry[0].player_id === ids.player, JSON.stringify(retry));
check('…and writes nothing (same used_at, link count, role and audit count)', JSON.stringify(after) === JSON.stringify(before));
const other = await redeem('COACH-VALID01', ids.late);
check('a retry by any other coach is generic and invalid', other[0].status === 'invalid' && other[0].player_id === null);

// A consumed invite never recreates a link that was later removed.
await as('service_role', null, () => db.query(`select public.remove_direct_coach_link($1, $2, $3, 'Test removal')`, [ids.player, ids.newCoach, ids.guardian]));
const recreate = await redeem('COACH-VALID01', ids.newCoach);
check('after the link is removed, replaying the consumed invite does not recreate access',
  recreate[0].status === 'invalid' && (await state('COACH-VALID01', ids.newCoach)).links === 0, JSON.stringify(recreate));

// A coach already directly connected: the invite is left unused.
await invite('COACH-SECOND01');
const dup = await redeem('COACH-SECOND01', ids.parentCoach);
const dupState = await state('COACH-SECOND01', ids.parentCoach);
check('an already-connected coach gets already_connected; the second invite stays unused and no link is added',
  dup[0].status === 'already_connected' && dup[0].player_id === null && dupState.invite.used_at === null && dupState.invite.used_by === null && dupState.links === 1,
  JSON.stringify({ dup, dupState }));

// --- Failure after the claim rolls everything back ---------------------------
// A synthetic, test-only failure inside the link insert.
await db.exec(`
  create function public.zz_test_fail_link() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure after claim'; end; $$;
  create trigger zz_test_fail_link before insert on public.coach_players for each row execute function public.zz_test_fail_link();
`);
await invite('COACH-ROLLBACK');
let failure = null;
try {
  await redeem('COACH-ROLLBACK', ids.failing, 'Should Not Exist');
} catch (e) {
  failure = e.message;
}
const rolled = await state('COACH-ROLLBACK', ids.failing);
check('a failure after the claim surfaces as an error', failure?.includes('synthetic failure after claim'), failure);
check('the invite is still unused after the rollback', rolled.invite.used_at === null && rolled.invite.used_by === null, JSON.stringify(rolled.invite));
check('no link, no profile/role and no audit event remain', rolled.links === 0 && rolled.profile === undefined && rolled.audit === 0, JSON.stringify(rolled));
await db.exec(`drop trigger zz_test_fail_link on public.coach_players; drop function public.zz_test_fail_link();`);
const recovered = await redeem('COACH-ROLLBACK', ids.failing);
check('once the failure is gone the same invite redeems normally', recovered[0].status === 'redeemed');

// --- Permissions ------------------------------------------------------------
for (const [role, uid] of [['authenticated', ids.guardian], ['anon', null]]) {
  let error = null;
  try {
    await as(role, uid, () => db.query(`select * from public.redeem_coach_invite('COACH-SECOND01', $1)`, [ids.late]));
  } catch (e) {
    error = e.message;
  }
  check(`${role} cannot execute redeem_coach_invite`, error?.includes('permission denied'), error);
}
const acl = (await one(`select proacl::text acl from pg_proc where oid = 'public.redeem_coach_invite(text,uuid,text)'::regprocedure`)).acl;
check('PUBLIC has no execute right; only the owner and service_role do', acl === '{postgres=X/postgres,service_role=X/postgres}', acl);

await db.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} coach-invite redemption checks passed`);
if (failed.length) process.exitCode = 1;
