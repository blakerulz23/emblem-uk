// Application flows against the real schema (Phase 3 compatibility).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Runs the same SQL the app's routes issue (sign-up, display name, order
// approval, card claim, guardian/coach/team invites, team requests, staff
// approve/end, and the account read behind the Parent/Coach views) twice:
//   1. after 0088;
//   2. after 0088 plus EXPECTED_0089: the grant and policy changes FIX-PLAN
//      §2.1/§2.2 assigns to 0089. This is a test-local expectation, not
//      0089 itself. Phase 4 replaces it with the real migration file.
// Every flow must work in both. View resolution uses the app's own
// src/lib/os-view.ts and src/lib/coach-assignment.ts (Node strips types).
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';
import { resolveOsView, parseOsView } from '../../../src/lib/os-view.ts';
import { activeCoachAssignments } from '../../../src/lib/coach-assignment.ts';

const EXPECTED_0089 = `
  drop policy "coach_team: a coach can attach themselves" on public.coach_team;
  drop policy "guardians: a parent can link themselves" on public.guardians;
  drop policy "clubs: coaches can create" on public.clubs;
  drop policy "teams: coaches can create" on public.teams;
  alter policy "profiles: insert own row on signup" on public.profiles with check (auth.uid() = id and role is null);
  alter policy "profiles: update own row" on public.profiles using (auth.uid() = id) with check (auth.uid() = id);
  revoke insert, update, delete on public.profiles from authenticated;
  grant insert (id, display_name) on public.profiles to authenticated;
  grant update (display_name) on public.profiles to authenticated;
  revoke insert, update, delete on public.coach_team, public.guardians, public.clubs, public.teams from authenticated;
`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}

async function runMode(mode) {
  console.log(`\n=== ${mode} ===`);
  const label = (s) => `[${mode}] ${s}`;
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  if (mode === 'after 0088 + expected 0089') await db.exec(EXPECTED_0089);

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
  const user = (uid, sql, params) => as('authenticated', uid, () => db.query(sql, params));
  async function ok(name, fn, verify) {
    try {
      const r = await fn();
      const pass = verify ? verify(r) : true;
      check(label(name), pass, pass ? '' : JSON.stringify(r?.rows ?? r));
      return r;
    } catch (e) {
      check(label(name), false, e.message);
    }
  }

  // The account read behind src/lib/os-data.ts getOsAccount(), as the person.
  async function account(uid, requested = null) {
    return as('authenticated', uid, async () => {
      const role = (await db.query(`select role from public.profiles where id = $1`, [uid])).rows[0]?.role ?? null;
      const guardians = (await db.query(`select count(*)::int n from public.guardians where profile_id = $1`, [uid])).rows[0].n;
      const teams = (await db.query(`select team_id, ended_at, expires_at from public.coach_team where profile_id = $1`, [uid])).rows;
      const direct = (await db.query(`select count(*)::int n from public.coach_players where profile_id = $1`, [uid])).rows[0].n;
      const request = (await db.query(`select status from public.coach_team_requests where requester_profile_id = $1 order by created_at desc limit 1`, [uid])).rows[0] ?? null;
      const toIso = (r) => ({ ...r, ended_at: r.ended_at && new Date(r.ended_at).toISOString(), expires_at: r.expires_at && new Date(r.expires_at).toISOString() });
      const isCoach = activeCoachAssignments(teams.map(toIso)).length > 0 || direct > 0;
      return { role, request: request?.status ?? null, ...resolveOsView({ isGuardian: guardians > 0, isCoach, profileRole: parseOsView(role), requested }) };
    }, { commit: false });
  }

  const id = () => crypto.randomUUID();
  const people = { parent: id(), coach: id(), neither: id(), coachFirst: id(), parentFirst: id(), parentThenTeam: id(), ended: id(), expired: id(), requester: id(), staff: id(), inviter: id() };
  await db.query(`insert into auth.users (id, email) select u, 'p-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [Object.values(people)]);
  const season = id();
  await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);

  // --- Sign-up and account settings (signed-in session) ---------------------
  for (const uid of Object.values(people)) {
    await ok(`sign-up creates a profile with no role (upsert, ignore duplicates)`, () => user(uid, `insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [uid]));
  }
  await ok('a repeated sign-up upsert is a no-op', () => user(people.parent, `insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [people.parent]));
  await ok('a person sets their display name on sign-up (upsert)', () =>
    user(people.parent, `insert into public.profiles (id, display_name) values ($1, 'Fictional Parent') on conflict (id) do update set display_name = excluded.display_name`, [people.parent]));
  await ok('a person edits their own display name', () =>
    user(people.parent, `update public.profiles set display_name = 'Fictional Parent B' where id = $1 returning id`, [people.parent]), (r) => r.rows.length === 1);
  if (mode === 'after 0088 + expected 0089') {
    // Proves this mode really runs under the expected grants.
    try {
      await user(people.neither, `update public.profiles set role = 'parent' where id = $1`, [people.neither]);
      check(label('the expected 0089 grants are in force (role is not writable by the person)'), false, 'update succeeded');
    } catch (e) {
      check(label('the expected 0089 grants are in force (role is not writable by the person)'), e.message.includes('permission denied'), e.message);
    }
  }
  await ok('staff account exists', () => db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [people.staff]));

  // --- Order approval (service role): club, team, player, card, team invite --
  const club = id(), team = id(), otherTeam = id(), player = id(), player2 = id(), player3 = id();
  await ok('order approval creates a club and teams', () =>
    service(`with c as (insert into public.clubs (id, name) values ($1, 'Fictional FC') returning id)
             insert into public.teams (id, club_id, name, season_id) values ($2, $1, 'U10', $4), ($3, $1, 'U12', $4)`, [club, team, otherTeam, season]));
  // Players exist from order placement (create_authoritative_order); seeded
  // here as fixtures. Approval then assigns them to the team.
  await db.query(`insert into public.players (id, name) values ($1, 'Fictional One'), ($2, 'Fictional Two'), ($3, 'Fictional Three')`, [player, player2, player3]);
  await ok('order approval assigns the players to their teams', async () => {
    await service(`update public.players set team_id = $1 where id = any($2::uuid[])`, [team, [player, player2]]);
    return service(`update public.players set team_id = $1 where id = $2 returning id`, [otherTeam, player3]);
  }, (r) => r.rows.length === 1);
  await ok('order approval creates a team invite', () =>
    service(`insert into public.team_invites (team_id, code) values ($1, 'TEAM-' || left(md5(random()::text), 8))`, [team]));

  // The SQL behind the claim / invite routes.
  const claimCard = (uid, playerId, via = 'card_claim') =>
    service(`select public.ensure_profile_role($1, 'parent') as role;`, [uid]).then(() =>
      service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, $3, $2)`, [playerId, uid, via]));
  const redeemTeamInvite = (uid, teamId) =>
    service(`select public.ensure_profile_role($1, 'coach')`, [uid]).then(() =>
      service(`select public.activate_coach_assignment($1, $2, 'team_invite', $2) as changed`, [teamId, uid]));
  // A current guardian of the player creates the coach invite (their own
  // session, as the app does); the coach redeems it through the atomic
  // redeem_coach_invite, exactly as the redeem route does.
  const redeemCoachInvite = async (uid, playerId, guardianId) => {
    const code = `COACH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await user(guardianId, `insert into public.coach_invites (player_id, code, created_by) values ($1, $2, $3)`, [playerId, code, guardianId]);
    const r = await service(`select status, player_id from public.redeem_coach_invite($1, $2)`, [code, uid]);
    if (r.rows[0]?.status !== 'redeemed') throw new Error(`coach invite not redeemed: ${JSON.stringify(r.rows)}`);
    return r;
  };

  // --- Parent only, coach only, neither ------------------------------------
  await ok('card claim links a parent', () => claimCard(people.parent, player));
  await ok('parent only: Parent view only', () => account(people.parent), (a) => a.view === 'parent' && a.availableViews.join() === 'parent' && a.role === 'parent');
  await ok('team invite redemption makes a coach', () => redeemTeamInvite(people.coach, team), (r) => r.rows[0].changed === true);
  await ok('coach only: Coach view only', () => account(people.coach), (a) => a.view === 'coach' && a.availableViews.join() === 'coach' && a.role === 'coach');
  await ok('neither: no view, onboarding decides', () => account(people.neither), (a) => a.view === null && a.availableViews.length === 0 && a.role === null);
  await ok('a coach reads their squad', () => user(people.coach, `select id from public.players where team_id = $1`, [team]), (r) => r.rows.length === 2);
  await ok('a parent reads their child', () => user(people.parent, `select id from public.players where id = $1`, [player]), (r) => r.rows.length === 1);

  // --- Dual role, both orders ----------------------------------------------
  await ok('coach first: team invite', () => redeemTeamInvite(people.coachFirst, otherTeam));
  await ok('…then claims their own child’s card', () => claimCard(people.coachFirst, player3));
  await ok('coach-then-parent keeps the coach role and has both views (default coach)', () => account(people.coachFirst),
    (a) => a.role === 'coach' && a.availableViews.join() === 'parent,coach' && a.view === 'coach');
  await ok('…switching to Parent keeps Coach available', () => account(people.coachFirst, 'parent'), (a) => a.view === 'parent' && a.availableViews.join() === 'parent,coach');
  await ok('…and both access paths still read', async () => {
    const squad = await user(people.coachFirst, `select id from public.players where team_id = $1`, [otherTeam]);
    const child = await user(people.coachFirst, `select id from public.players p where exists (select 1 from public.guardians g where g.player_id = p.id and g.profile_id = $1)`, [people.coachFirst]);
    return { squad: squad.rows.length, child: child.rows.length };
  }, (r) => r.squad === 1 && r.child === 1);

  await ok('parent first: claims a card', () => claimCard(people.parentFirst, player2));
  await ok('…then accepts a coach invite for a player', () => redeemCoachInvite(people.parentFirst, player, people.parent));
  await ok('parent-then-coach keeps the parent role and has both views (default parent)', () => account(people.parentFirst),
    (a) => a.role === 'parent' && a.availableViews.join() === 'parent,coach' && a.view === 'parent');
  await ok('…switching to Coach keeps Parent available', () => account(people.parentFirst, 'coach'), (a) => a.view === 'coach' && a.availableViews.join() === 'parent,coach');

  await ok('parent then team invite: claims via guardian invite', () => claimCard(people.parentThenTeam, player, 'guardian_invite'));
  await ok('…then redeems a team invite', () => redeemTeamInvite(people.parentThenTeam, team));
  await ok('…keeps parent, gains coach', () => account(people.parentThenTeam), (a) => a.role === 'parent' && a.availableViews.join() === 'parent,coach');

  // --- Ended and expired coaches are excluded ------------------------------
  await ok('ended: a coach joins', () => redeemTeamInvite(people.ended, team));
  await ok('staff end the assignment', () => service(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [team, people.ended, people.staff]));
  await ok('an ended coach has no Coach view', () => account(people.ended), (a) => a.view === null && a.availableViews.length === 0);
  await ok('a valid team invite reactivates the ended coach', () => redeemTeamInvite(people.ended, team), (r) => r.rows[0].changed === true);
  await ok('…who has the Coach view again', () => account(people.ended), (a) => a.view === 'coach');

  const expiringRequest = (await ok('expired: a coach requests a team', () =>
    user(people.expired, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U12') returning id`)))?.rows[0]?.id;
  await ok('staff approve with an access end date', () =>
    service(`select public.approve_coach_team_request($1, $2, $3, now() + interval '1 day')`, [expiringRequest, people.staff, otherTeam]));
  await ok('before the end date: Coach view', () => account(people.expired), (a) => a.view === 'coach');
  await db.query(`update public.coach_team set created_at = now() - interval '3 days', expires_at = now() - interval '1 hour' where profile_id = $1`, [people.expired]);
  await ok('after the end date: no Coach view', () => account(people.expired), (a) => a.view === null);

  // --- Team request lifecycle (signed-in session + staff) ------------------
  const first = (await ok('a signed-in person submits a team request', () =>
    user(people.requester, `insert into public.coach_team_requests (club_name, team_name, age_group) values ('Fictional Juniors', 'U9', 'U9') returning id`)))?.rows[0]?.id;
  await ok('…and sees it as pending', () => account(people.requester), (a) => a.request === 'pending' && a.view === null);
  await ok('…and cancels it', () => user(people.requester, `select public.cancel_own_coach_team_request($1)`, [first]));
  const second = (await ok('…and submits again', () =>
    user(people.requester, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional Juniors', 'U9') returning id`)))?.rows[0]?.id;
  await ok('staff approve it into a new team', () => service(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [second, people.staff, season]));
  await ok('the requester now has the Coach view and the coach role', () => account(people.requester), (a) => a.view === 'coach' && a.role === 'coach' && a.request === 'approved');

  await db.close();
}

await runMode('after 0088');
await runMode('after 0088 + expected 0089');

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} application-flow checks passed`);
if (failed.length) process.exitCode = 1;
