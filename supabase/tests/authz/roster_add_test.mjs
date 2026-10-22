// Adding a roster player after 0089, as each kind of account.
//
// RUN: node --no-warnings supabase/tests/authz/roster_add_test.mjs (needs
// EMBLEM_AUTHZ_PGLITE_DIR; see README.md). Disposable in-memory PGlite,
// fictional rows only.
//
// POST /api/os/players first reads the caller's own coach_team row for the
// team, then inserts the player as the signed-in user. This runs both
// statements, exactly as the route issues them, on the real 0089, so it
// proves that RLS refuses every account the route answers 403 for, with the
// SQLSTATE (42501) the route maps to that 403.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';
import { isActiveCoachAssignment } from '../../../src/lib/coach-assignment.ts';

const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

const db = await createDatabase();
await applyMigrations(db, { through: '0088' });
const ids = {
  season: id(), club: id(), teamA: id(), teamB: id(), player: id(),
  active: id(), ended: id(), expired: id(), direct: id(), roleOnly: id(), stranger: id(), dual: id(), staff: id(),
};
const people = ['active', 'ended', 'expired', 'direct', 'roleOnly', 'stranger', 'dual', 'staff'];
for (const p of people) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ids[p], `${p.toLowerCase()}@example.test`]);
const role = { active: 'coach', ended: 'coach', expired: 'coach', direct: 'coach', roleOnly: 'coach', dual: 'parent' };
for (const p of people) await db.query(`insert into profiles (id, role, display_name) values ($1, $2, $3)`, [ids[p], role[p] ?? null, `Fictional ${p}`]);
await db.exec(`
  insert into staff_accounts (profile_id) values ('${ids.staff}');
  insert into seasons (id, label, normalized_label) values ('${ids.season}', 'Test Season', 'test season');
  insert into clubs (id, name) values ('${ids.club}', 'Fictional FC');
  insert into teams (id, club_id, name, season_id) values ('${ids.teamA}', '${ids.club}', 'U10', '${ids.season}'), ('${ids.teamB}', '${ids.club}', 'U12', '${ids.season}');
  insert into players (id, team_id, name) values ('${ids.player}', '${ids.teamA}', 'Fictional One');
  insert into coach_team (team_id, profile_id) values
    ('${ids.teamA}', '${ids.active}'), ('${ids.teamA}', '${ids.ended}'), ('${ids.teamA}', '${ids.expired}'), ('${ids.teamB}', '${ids.dual}');
  insert into guardians (player_id, profile_id, relationship) values ('${ids.player}', '${ids.dual}', 'parent');
  insert into coach_players (player_id, profile_id, created_via, created_by) values ('${ids.player}', '${ids.direct}', 'guardian_invite', '${ids.dual}');
`);
await db.exec('begin; set local role service_role;');
await db.query(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [ids.teamA, ids.ended, ids.staff]);
await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, ids.staff]);
await db.exec('commit;');
await db.query(`update coach_team set created_at = now() - interval '30 days', expires_at = now() - interval '1 day' where profile_id = $1`, [ids.expired]);
await applyMigrations(db, { from: '0089', through: '0089' });

// Runs as a signed-in user, always rolled back.
async function asUser(uid, fn) {
  await db.exec('begin;');
  try {
    await db.exec('set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid]);
    return await fn();
  } finally {
    await db.exec('rollback;');
  }
}
// The route's two statements, in order.
async function addRosterPlayer(uid, teamId) {
  return asUser(uid, async () => {
    const lookup = (await db.query(`select team_id, ended_at, expires_at from public.coach_team where team_id = $1 and profile_id = $2`, [teamId, uid])).rows[0] ?? null;
    const routeAllows = !!lookup && isActiveCoachAssignment(lookup);
    try {
      await db.query(`insert into public.players (team_id, name, position, squad_number) values ($1, 'Fictional New Player', null, null) returning id`, [teamId]);
      return { routeAllows, inserted: true, code: null };
    } catch (e) {
      return { routeAllows, inserted: false, code: e.code ?? null };
    }
  });
}

const cases = [
  ['active team coach', ids.active, ids.teamA, true],
  ['ended coach', ids.ended, ids.teamA, false],
  ['expired coach', ids.expired, ids.teamA, false],
  ['direct-link-only coach (to a player on that team)', ids.direct, ids.teamA, false],
  ['role-only coach', ids.roleOnly, ids.teamA, false],
  ['unrelated signed-in user', ids.stranger, ids.teamA, false],
  ['dual account, on the team it actively coaches', ids.dual, ids.teamB, true],
  ['dual account, on the team where it is only a guardian', ids.dual, ids.teamA, false],
  ['forged request: active coach of team A adding to team B', ids.active, ids.teamB, false],
];
for (const [label, uid, teamId, allowed] of cases) {
  const r = await addRosterPlayer(uid, teamId);
  if (allowed) {
    check(`${label}: the route's assignment check allows it and the insert succeeds`, r.routeAllows && r.inserted, JSON.stringify(r));
  } else {
    check(`${label}: the route's assignment check refuses it (403), and RLS refuses the insert with 42501`, !r.routeAllows && !r.inserted && r.code === '42501', JSON.stringify(r));
  }
}

const count = (await db.query(`select count(*)::int as c from players where name = 'Fictional New Player'`)).rows[0].c;
check('nothing was left behind (every attempt was rolled back)', count === 0, `${count}`);

await db.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} roster-add checks passed`);
if (failed.length) process.exitCode = 1;
