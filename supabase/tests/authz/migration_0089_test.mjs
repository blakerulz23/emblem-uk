// Migration 0089 (relationship authorization lockdown) and its rollback.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Proves, on fresh databases at the 0088 state:
//   - the readiness precondition refuses (as a complete no-op) for every
//     missing or invalid 0088 object or release-readiness confirmation;
//   - with valid readiness, 0089 changes exactly the expected catalog
//     entries and no data;
//   - the access matrix after lockdown (anon, unrelated, parent, active /
//     ended / expired team coach, direct coach, former coach with a direct
//     link, dual parent-coach, role-only account);
//   - signed-in accounts can no longer give themselves roles or
//     relationships, while every approved flow still works;
//   - the rollback refuses without its acknowledgement and, with it,
//     restores the exact 0088 catalog with data intact; 0089 re-applies.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const ROLLBACK_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../rollback/0089_rollback.sql');
const ACK = `select set_config('emblem.acknowledge_0089_rollback', 'REOPEN-AUTHORIZATION-VULNERABILITY', true)`;
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

// --- Fixture at 0088 -----------------------------------------------------------
async function seeded() {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const ids = {
    season: id(), club: id(), teamA: id(), teamB: id(),
    p1: id(), p2: id(), p3: id(), p4: id(), moment1: id(), moment3: id(), moment4: id(),
    parent: id(), activeCoach: id(), endedCoach: id(), expiredCoach: id(), directCoach: id(), formerWithDirect: id(),
    dual: id(), roleOnly: id(), stranger: id(), staff: id(), newbie: id(),
  };
  const people = ['parent', 'activeCoach', 'endedCoach', 'expiredCoach', 'directCoach', 'formerWithDirect', 'dual', 'roleOnly', 'stranger', 'staff', 'newbie'];
  for (const p of people) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ids[p], `${p.toLowerCase()}@example.test`]);
  const role = { parent: 'parent', activeCoach: 'coach', endedCoach: 'coach', expiredCoach: 'coach', directCoach: 'coach', formerWithDirect: 'coach', dual: 'parent', roleOnly: 'coach' };
  for (const p of people.filter((x) => x !== 'newbie')) {
    await db.query(`insert into profiles (id, role, display_name) values ($1, $2, $3)`, [ids[p], role[p] ?? null, `Fictional ${p}`]);
  }
  await db.exec(`
    insert into staff_accounts (profile_id) values ('${ids.staff}');
    insert into seasons (id, label, normalized_label) values ('${ids.season}', 'Test Season', 'test season');
    insert into clubs (id, name) values ('${ids.club}', 'Fictional FC');
    insert into teams (id, club_id, name, season_id) values ('${ids.teamA}', '${ids.club}', 'U10', '${ids.season}'), ('${ids.teamB}', '${ids.club}', 'U12', '${ids.season}');
    insert into players (id, team_id, name) values
      ('${ids.p1}', '${ids.teamA}', 'Fictional One'), ('${ids.p3}', '${ids.teamA}', 'Fictional Three'),
      ('${ids.p2}', '${ids.teamB}', 'Fictional Two'), ('${ids.p4}', '${ids.teamB}', 'Fictional Four');
    insert into guardians (player_id, profile_id, relationship) values ('${ids.p1}', '${ids.parent}', 'parent'), ('${ids.p2}', '${ids.dual}', 'parent');
    insert into coach_team (team_id, profile_id) values
      ('${ids.teamA}', '${ids.activeCoach}'), ('${ids.teamA}', '${ids.endedCoach}'), ('${ids.teamA}', '${ids.expiredCoach}'),
      ('${ids.teamA}', '${ids.formerWithDirect}'), ('${ids.teamB}', '${ids.dual}');
    insert into coach_players (player_id, profile_id, created_via, created_by) values
      ('${ids.p1}', '${ids.directCoach}', 'guardian_invite', '${ids.parent}'), ('${ids.p1}', '${ids.formerWithDirect}', 'guardian_invite', '${ids.parent}');
    insert into moments (id, player_id, title, trust, verification_status) values
      ('${ids.moment1}', '${ids.p1}', 'First goal', 'parent', 'family_memory'),
      ('${ids.moment3}', '${ids.p3}', 'Clean sheet', 'parent', 'family_memory'),
      ('${ids.moment4}', '${ids.p4}', 'Hat-trick', 'parent', 'family_memory');
    insert into moment_media (moment_id, s3_key, kind) values ('${ids.moment1}', 'fictional/key.jpg', 'photo');
    insert into player_assessments (player_id, created_by, body) values ('${ids.p1}', '${ids.activeCoach}', 'Fictional note');
    insert into player_strengths (player_id, created_by, label) values ('${ids.p1}', '${ids.activeCoach}', 'Passing');
    insert into player_goals (player_id, created_by, label, target) values ('${ids.p1}', '${ids.activeCoach}', 'Assists', 5);
    insert into player_season_focus (player_id, created_by, author_role, label) values ('${ids.p1}', '${ids.activeCoach}', 'coach', 'Weak foot');
    insert into coach_invites (player_id, code, created_by) values ('${ids.p1}', 'COACH-FIXTURE1', '${ids.parent}');
  `);
  // Ended and expired team assignments, as staff and time leave them.
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [ids.teamA, ids.endedCoach, ids.staff]);
  await db.query(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [ids.teamA, ids.formerWithDirect, ids.staff]);
  await db.exec('commit;');
  await db.query(`update coach_team set created_at = now() - interval '30 days', expires_at = now() - interval '1 day' where profile_id = $1`, [ids.expiredCoach]);
  return { db, ids };
}
async function confirmReadiness(db, staff) {
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, staff]);
  await db.exec('commit;');
}
async function tryApply0089(db) {
  try {
    await applyMigrations(db, { from: '0089', through: '0089' });
    return null;
  } catch (e) {
    await db.exec('rollback;').catch(() => {});
    return e.message;
  }
}
const DATA_TABLES = ['profiles', 'guardians', 'coach_team', 'coach_players', 'players', 'clubs', 'teams', 'coach_invites', 'coach_team_requests', 'release_readiness_confirmations', 'relationship_audit_events', 'moments', 'staff_accounts'];
async function dataSnapshot(db) {
  const out = {};
  for (const t of DATA_TABLES) out[t] = (await db.query(`select to_jsonb(x) j from public.${t} x order by 1`)).rows.map((r) => JSON.stringify(r.j)).sort();
  return JSON.stringify(out);
}

// --- 1. Readiness precondition ---------------------------------------------------
console.log('\n=== readiness precondition ===');
const BREAKAGES = [
  ['no release-readiness confirmation', async () => {}, 'found 0'],
  ['a confirmation for another contract only', async (db) => {
    await db.exec(`alter table release_readiness_confirmations drop constraint release_readiness_confirmations_contract_check;`);
    await db.query(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
      select 'authorization_relationships_v0', $1, profile_id, true, true, true, true, true, true from staff_accounts limit 1`, [COMMIT]);
  }, 'found 0'],
  ['a smoke check recorded as false', async (db) => {
    await db.exec(`alter table release_readiness_confirmations drop constraint release_readiness_all_checks_passed;`);
    await db.query(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
      select 'authorization_relationships_v1', $1, profile_id, true, true, true, true, false, true from staff_accounts limit 1`, [COMMIT]);
  }, 'six smoke checks'],
  ['an invalid application commit', async (db) => {
    await db.exec(`alter table release_readiness_confirmations drop constraint release_readiness_confirmations_app_commit_check;`);
    await db.query(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
      select 'authorization_relationships_v1', 'main', profile_id, true, true, true, true, true, true from staff_accounts limit 1`);
  }, 'no valid application commit'],
  ['the confirming account is no longer staff', async (db, ids) => {
    await confirmReadiness(db, ids.staff);
    await db.query(`delete from staff_accounts where profile_id = $1`, [ids.staff]);
  }, 'no longer staff'],
  ['two confirmations (ambiguous)', async (db, ids) => {
    await db.exec(`alter table release_readiness_confirmations drop constraint release_readiness_confirmations_contract_key;`);
    await confirmReadiness(db, ids.staff);
    await db.query(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
      values ('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, ids.staff]);
  }, 'found 2'],
  ['a required 0088 function is missing', async (db, ids) => {
    await confirmReadiness(db, ids.staff);
    await db.exec(`drop function public.redeem_coach_invite(text, uuid, text);`);
  }, 'missing function public.redeem_coach_invite'],
  ['a required 0088 function has weaker security', async (db, ids) => {
    await confirmReadiness(db, ids.staff);
    await db.exec(`grant execute on function public.ensure_profile_role(uuid, text, text) to authenticated;`);
  }, 'unexpected security properties: public.ensure_profile_role'],
  ['a required 0088 column is missing', async (db, ids) => {
    await confirmReadiness(db, ids.staff);
    await db.exec(`alter table public.guardians drop column created_via;`);
  }, 'missing column guardians.created_via'],
  ['the direct-link audit trigger is missing', async (db, ids) => {
    await confirmReadiness(db, ids.staff);
    await db.exec(`drop trigger relationship_audit on public.coach_players;`);
  }, 'relationship_audit on coach_players'],
  ['the readiness append-only trigger is disabled', async (db, ids) => {
    await confirmReadiness(db, ids.staff);
    await db.exec(`alter table public.release_readiness_confirmations disable trigger release_readiness_append_only;`);
  }, 'release_readiness_append_only'],
];
for (const [label, breakIt, expected] of BREAKAGES) {
  const { db, ids } = await seeded();
  await breakIt(db, ids);
  const catalogBefore = await snapshotCatalog(db);
  const dataBefore = await dataSnapshot(db);
  const refusal = await tryApply0089(db);
  check(`refuses with ${label}`, refusal !== null && refusal.includes('0089 refused') && refusal.includes(expected), refusal);
  const d = diffCatalog(catalogBefore, await snapshotCatalog(db));
  check(`…and changed nothing (catalog and data identical)`,
    d.added.length + d.removed.length + d.changed.length === 0 && (await dataSnapshot(db)) === dataBefore);
  await db.close();
}

// --- 2. Valid readiness: exact catalog change, no data change ------------------
console.log('\n=== 0089 applied with valid readiness ===');
const { db, ids } = await seeded();
await confirmReadiness(db, ids.staff);

async function as(role, uid, fn, { commit = false } = {}) {
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
async function view(uid, role = 'authenticated') {
  return as(role, uid, async () => {
    const rows = async (sql, params) => (await db.query(sql, params)).rows;
    const name = (pid) => Object.entries(ids).find(([, v]) => v === pid)?.[0];
    return {
      players: (await rows(`select id from public.players order by name`)).map((r) => name(r.id)).sort().join(','),
      moments: (await rows(`select id from public.moments`)).length,
      media: (await rows(`select id from public.moment_media`)).length,
      assessments: (await rows(`select id from public.player_assessments`)).length,
      strengths: (await rows(`select id from public.player_strengths`)).length,
      goals: (await rows(`select id from public.player_goals`)).length,
      focus: (await rows(`select id from public.player_season_focus`)).length,
      guardianProfile: (await rows(`select id from public.profiles where id = $1`, [ids.parent])).length,
      helperP1: (await rows(`select public.is_authorized_coach_for_player($1) a`, [ids.p1]))[0].a,
      helperP3: (await rows(`select public.is_authorized_coach_for_player($1) a`, [ids.p3]))[0].a,
    };
  });
}
const before = {
  endedCoach: await view(ids.endedCoach),
  expiredCoach: await view(ids.expiredCoach),
};
check('before 0089 (documented baseline): the ended team coach still reached the team’s players', before.endedCoach.players === 'p1,p3', before.endedCoach.players);
check('before 0089 (documented baseline): the expired team coach still reached the team’s players', before.expiredCoach.players === 'p1,p3', before.expiredCoach.players);

const catalog0088 = await snapshotCatalog(db);
const data0088 = await dataSnapshot(db);
const applyError = await tryApply0089(db);
check('0089 applies when 0088 is complete and readiness is valid', applyError === null, applyError);
const catalog0089 = await snapshotCatalog(db);
check('0089 changes no data: no row added, changed or removed in any relationship, profile, club, team, invite, audit or readiness table',
  (await dataSnapshot(db)) === data0088);

const TTR_TABLES = ['active_viewers', 'card_definitions', 'cards', 'claim_attempts', 'clubs', 'coach_invites', 'coach_players', 'coach_team', 'guardians',
  'moment_media', 'moment_visibility_changes', 'moments', 'orders', 'player_assessments', 'player_deletion_requests', 'player_goals', 'player_invites',
  'player_season_focus', 'player_skill_snapshots', 'player_strengths', 'players', 'profiles', 'seasons', 'staff_accounts', 'story_updates', 'team_invites', 'teams'];
const COACH_POLICIES = [
  "card_definitions.card_definitions: visible to coaches of the linked player's tea", "cards.cards: visible to coaches of the player's team",
  "moment_media.moment_media: follows parent moment's visibility", 'moments.moments: coaches can create recognitions for their team',
  "moments.moments: coaches can delete their team's pending moments", 'moments.moments: coaches can verify/update for their team',
  'moments.moments: visible to assigned coaches', 'player_assessments.player_assessments: coaches can add for their team',
  "player_assessments.player_assessments: visible to coaches of the player's team", 'player_goals.player_goals: coaches can create for their team',
  "player_goals.player_goals: visible to coaches of the player's team", 'player_invites.player_invites: coaches can create for their team',
  'player_invites.player_invites: coaches can view/create for their team', "player_season_focus.player_season_focus: visible to coaches of the player's team",
  'player_skill_snapshots.skill snapshots: coaches can write', 'player_skill_snapshots.skill snapshots: visible to assigned coaches',
  'player_strengths.player_strengths: coaches can add for their team', "player_strengths.player_strengths: visible to coaches of the player's team",
  'players.players: coaches can add roster players to their team', 'players.players: visible to assigned coaches',
  'profiles.profiles: coaches can view co-coaches of a shared team', 'profiles.profiles: coaches can view guardians of their players',
  "profiles.profiles: guardians can view coaches of their player's team", "team_invites.team_invites: coaches can view their team's invites",
];
const EXPECTED_CHANGED = [
  ...TTR_TABLES.map((t) => `relation:${t}`),
  ...COACH_POLICIES.map((p) => `policy:${p}`),
  'policy:coach_team.coach_team: a coach can see their own assignments', 'policy:coach_team.coach_team: guardians of a player on this team can view',
  'policy:profiles.profiles: insert own row on signup', 'policy:profiles.profiles: update own row',
  'function:coach_assignment_is_active(p_ended_at timestamp with time zone, p_expires_at timestamp with time zone)',
  'function:create_season_focus(p_player_id uuid, p_label text)', 'function:is_authorized_coach_for_player(check_player_id uuid)',
  'function:is_guardian_of_team_player(check_team_id uuid)',
  'function:update_player_coach_fields(p_player_id uuid, p_football_age_group text, p_height_cm integer, p_preferred_foot text, p_secondary_position text)',
  'function:update_secondary_position(p_player_id uuid, p_secondary_position text)',
  'column:profiles.id', 'column:profiles.display_name',
  'column:coach_invites.player_id', 'column:coach_invites.code', 'column:coach_invites.created_by', 'column:coach_invites.invited_email',
].sort();
const EXPECTED_REMOVED = [
  'policy:clubs.clubs: coaches can create', 'policy:teams.teams: coaches can create',
  'policy:coach_team.coach_team: a coach can attach themselves', 'policy:guardians.guardians: a parent can link themselves',
].sort();
const fwd = diffCatalog(catalog0088, catalog0089);
check('0089 adds no catalog entry', fwd.added.length === 0, fwd.added.join(', '));
check('0089 removes exactly the four self-attach / self-link / coach-create policies', JSON.stringify(fwd.removed.sort()) === JSON.stringify(EXPECTED_REMOVED), fwd.removed.join(', '));
check(`0089 changes exactly the ${EXPECTED_CHANGED.length} expected entries (27 table ACLs, 28 policies, 6 functions, 6 column grants)`,
  JSON.stringify(fwd.changed.sort()) === JSON.stringify(EXPECTED_CHANGED),
  `unexpected: ${fwd.changed.filter((k) => !EXPECTED_CHANGED.includes(k)).join(', ')} | missing: ${EXPECTED_CHANGED.filter((k) => !fwd.changed.includes(k)).join(', ')}`);
const policyText = (k) => catalog0089.get(k) ?? '';
check('every rewritten coach policy now requires an active assignment', COACH_POLICIES.every((p) => policyText(`policy:${p}`).includes('coach_assignment_is_active')));
check('no direct-link (coach_players) branch is given the active-assignment condition',
  [...catalog0089].filter(([k]) => k.startsWith('policy:')).every(([, v]) => !/coach_players cp[\s\S]{0,200}coach_assignment_is_active\(cp\./.test(v)));

const acl = async (t) => (await db.query(`select relacl::text a from pg_class where oid = $1::regclass`, [`public.${t}`])).rows[0].a;
for (const t of TTR_TABLES) {
  const a = await acl(t);
  const anon = a.match(/anon=([a-zA-Z]*)\//)?.[1] ?? '';
  const auth = a.match(/authenticated=([a-zA-Z]*)\//)?.[1] ?? '';
  if (anon || /[Dxtm]/.test(auth)) check(`${t}: anon has no privileges and authenticated has no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN`, false, a);
}
check('all 27 tables: anon holds no privilege; authenticated holds no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN', true);
for (const t of ['coach_team', 'guardians', 'clubs', 'teams']) {
  const auth = (await acl(t)).match(/authenticated=([a-zA-Z]*)\//)?.[1] ?? '';
  check(`${t}: authenticated may only SELECT`, auth === 'r', auth);
}
const cols = async (t, priv) => (await db.query(`select string_agg(column_name, ',' order by column_name) c from information_schema.column_privileges
  where table_schema = 'public' and table_name = $1 and grantee = 'authenticated' and privilege_type = $2`, [t, priv])).rows[0].c;
check('profiles: authenticated may INSERT only id, display_name', (await cols('profiles', 'INSERT')) === 'display_name,id');
check('profiles: authenticated may UPDATE only display_name', (await cols('profiles', 'UPDATE')) === 'display_name');
check('profiles: authenticated may not DELETE', !((await acl('profiles')).match(/authenticated=([a-zA-Z]*)\//)?.[1] ?? '').includes('d'));
check('coach_invites: authenticated may INSERT only code, created_by, invited_email, player_id', (await cols('coach_invites', 'INSERT')) === 'code,created_by,invited_email,player_id');
const fexec = async (sig) => (await db.query(`select has_function_privilege('anon', $1::regprocedure, 'execute') an, has_function_privilege('authenticated', $1::regprocedure, 'execute') au`, [sig])).rows[0];
for (const sig of ['public.is_authorized_coach_for_player(uuid)', 'public.is_guardian_of_team_player(uuid)']) {
  const f = await fexec(sig);
  check(`${sig}: not executable by anon, executable by authenticated (its RLS callers)`, f.an === false && f.au === true, JSON.stringify(f));
}
const helper = await fexec('public.coach_assignment_is_active(timestamptz,timestamptz)');
check('coach_assignment_is_active: executable by authenticated (policies call it), not anon', helper.au === true && helper.an === false);

// --- 3. Access matrix after lockdown --------------------------------------------
console.log('\n=== access matrix after 0089 ===');
const NONE = { players: '', moments: 0, media: 0, assessments: 0, strengths: 0, goals: 0, focus: 0, guardianProfile: 0, helperP1: false, helperP3: false };
const MATRIX = [
  ['an unrelated signed-in account', 'stranger', NONE],
  ['an account whose stored role is coach but has no relationship', 'roleOnly', NONE],
  ['the parent (guardian of p1)', 'parent', { players: 'p1', moments: 1, media: 1, assessments: 1, strengths: 1, goals: 1, focus: 1, guardianProfile: 1, helperP1: false, helperP3: false }],
  ['an active team coach (team A: p1, p3)', 'activeCoach', { players: 'p1,p3', moments: 2, media: 1, assessments: 1, strengths: 1, goals: 1, focus: 1, guardianProfile: 1, helperP1: true, helperP3: true }],
  ['an ended team coach', 'endedCoach', NONE],
  ['an expired team coach', 'expiredCoach', NONE],
  ['a direct coach of p1 only', 'directCoach', { players: 'p1', moments: 1, media: 1, assessments: 1, strengths: 1, goals: 0, focus: 1, guardianProfile: 1, helperP1: true, helperP3: false }],
  ['a former team coach whose separate direct link to p1 still exists', 'formerWithDirect', { players: 'p1', moments: 1, media: 1, assessments: 1, strengths: 1, goals: 0, focus: 1, guardianProfile: 1, helperP1: true, helperP3: false }],
  ['a dual parent (of p2) and active coach (team B: p2, p4)', 'dual', { players: 'p2,p4', moments: 1, media: 0, assessments: 0, strengths: 0, goals: 0, focus: 0, guardianProfile: 0, helperP1: false, helperP3: false }],
];
for (const [label, who, expected] of MATRIX) {
  const got = await view(ids[who]);
  check(`${label}: ${JSON.stringify(expected)}`, JSON.stringify(got) === JSON.stringify(expected), JSON.stringify(got));
}
let anonError = null;
try {
  await as('anon', null, () => db.query(`select id from public.players`));
} catch (e) {
  anonError = e.message;
}
check('anon: no access to players (permission denied)', anonError?.includes('permission denied'), anonError);
for (const t of ['guardians', 'coach_team', 'coach_players', 'moments', 'profiles']) {
  let err = null;
  try {
    await as('anon', null, () => db.query(`select 1 from public.${t} limit 1`));
  } catch (e) {
    err = e.message;
  }
  check(`anon: no access to ${t}`, err?.includes('permission denied'), err);
}
async function coachWrite(uid, player) {
  try {
    await as('authenticated', uid, () => db.query(`select public.update_secondary_position($1, 'ST')`, [player]));
    return 'allowed';
  } catch (e) {
    return e.message.includes('Not authorized') ? 'refused' : e.message;
  }
}
check('elevated coach function: an active team coach may use it', (await coachWrite(ids.activeCoach, ids.p3)) === 'allowed');
check('elevated coach function: an ended team coach is refused', (await coachWrite(ids.endedCoach, ids.p3)) === 'refused');
check('elevated coach function: an expired team coach is refused', (await coachWrite(ids.expiredCoach, ids.p3)) === 'refused');
check('elevated coach function: a former coach is refused for the team player, allowed for their direct-link player',
  (await coachWrite(ids.formerWithDirect, ids.p3)) === 'refused' && (await coachWrite(ids.formerWithDirect, ids.p1)) === 'allowed');
check('elevated coach function: a role-only account is refused', (await coachWrite(ids.roleOnly, ids.p1)) === 'refused');
async function coachMoment(uid, player) {
  try {
    await as('authenticated', uid, () => db.query(`insert into public.moments (player_id, title, trust, verification_status, verified_at, verified_by) values ($1, 'Recognition', 'coach', 'coach_verified', now(), $2)`, [player, uid]));
    return 'allowed';
  } catch (e) {
    return e.message.includes('row-level security') ? 'refused' : e.message;
  }
}
check('coach recognitions: an active team coach may create one', (await coachMoment(ids.activeCoach, ids.p3)) === 'allowed');
check('coach recognitions: an ended or expired team coach may not', (await coachMoment(ids.endedCoach, ids.p3)) === 'refused' && (await coachMoment(ids.expiredCoach, ids.p3)) === 'refused');

// --- 4. Signed-in accounts cannot give themselves a role or relationship ----------
console.log('\n=== denials after 0089 ===');
async function denied(label, uid, sql, params, match = 'permission denied') {
  try {
    const r = await as('authenticated', uid, () => db.query(sql, params));
    check(label, match === 'no rows' && (r.affectedRows ?? r.rows.length) === 0, `succeeded: ${r.affectedRows}`);
  } catch (e) {
    check(label, match !== 'no rows' && e.message.includes(match), e.message);
  }
}
await denied('cannot create a profile with a role', ids.newbie, `insert into public.profiles (id, role) values ($1, 'coach')`, [ids.newbie]);
await denied('cannot change their own role', ids.stranger, `update public.profiles set role = 'coach' where id = $1`, [ids.stranger]);
await denied('cannot set their own profile id or creation time', ids.stranger, `update public.profiles set created_at = now() where id = $1`, [ids.stranger]);
await denied('cannot modify another profile', ids.stranger, `update public.profiles set display_name = 'Changed' where id = $1`, [ids.parent], 'no rows');
await denied('cannot delete a profile', ids.stranger, `delete from public.profiles where id = $1`, [ids.stranger]);
await denied('cannot attach themselves to a team', ids.stranger, `insert into public.coach_team (team_id, profile_id) values ($1, $2)`, [ids.teamA, ids.stranger]);
await denied('cannot reactivate or alter a coach assignment', ids.endedCoach, `update public.coach_team set ended_at = null where profile_id = $1`, [ids.endedCoach]);
await denied('cannot delete a coach assignment', ids.activeCoach, `delete from public.coach_team where profile_id = $1`, [ids.activeCoach]);
await denied('cannot link themselves as guardian of a player', ids.stranger, `insert into public.guardians (player_id, profile_id) values ($1, $2)`, [ids.p1, ids.stranger]);
await denied('cannot alter a guardian link', ids.parent, `update public.guardians set relationship = 'other' where profile_id = $1`, [ids.parent]);
await denied('cannot delete a guardian link', ids.parent, `delete from public.guardians where profile_id = $1`, [ids.parent]);
await denied('cannot create a club', ids.roleOnly, `insert into public.clubs (name) values ('Fictional New FC')`, []);
await denied('cannot update a club', ids.activeCoach, `update public.clubs set name = 'Renamed' where id = $1`, [ids.club]);
await denied('cannot delete a club', ids.activeCoach, `delete from public.clubs where id = $1`, [ids.club]);
await denied('cannot create a team', ids.roleOnly, `insert into public.teams (club_id, name, season_id) values ($1, 'U9', $2)`, [ids.club, ids.season]);
await denied('cannot update a team', ids.activeCoach, `update public.teams set name = 'Renamed' where id = $1`, [ids.teamA]);
await denied('cannot delete a team', ids.activeCoach, `delete from public.teams where id = $1`, [ids.teamA]);
await denied('cannot create a direct coach link', ids.stranger, `insert into public.coach_players (player_id, profile_id, created_via) values ($1, $2, 'guardian_invite')`, [ids.p1, ids.stranger]);
await denied('cannot alter a direct coach link', ids.directCoach, `update public.coach_players set created_by = null where profile_id = $1`, [ids.directCoach]);
await denied('cannot delete a direct coach link directly', ids.parent, `delete from public.coach_players where profile_id = $1`, [ids.directCoach]);
await denied('a guardian cannot create a coach invite already consumed', ids.parent,
  `insert into public.coach_invites (player_id, code, created_by, used_at, used_by) values ($1, 'COACH-FORGED1', $2, now(), $2)`, [ids.p1, ids.parent]);
await denied('a guardian cannot set an invite’s expiry or creation time', ids.parent,
  `insert into public.coach_invites (player_id, code, created_by, expires_at) values ($1, 'COACH-FORGED2', $2, now() + interval '10 years')`, [ids.p1, ids.parent]);
await denied('a guardian cannot create an invite in someone else’s name', ids.parent,
  `insert into public.coach_invites (player_id, code, created_by) values ($1, 'COACH-FORGED3', $2)`, [ids.p1, ids.staff], 'row-level security');
await denied('cannot truncate a table', ids.parent, `truncate public.moments`, []);
for (const [sig, args] of [
  ['ensure_profile_role', `($1, 'coach')`], ['activate_coach_assignment', `('${ids.teamA}', $1, 'staff', $1)`],
  ['end_coach_assignment', `('${ids.teamA}', '${ids.activeCoach}', $1, 'x')`], ['remove_direct_coach_link', `('${ids.p1}', '${ids.directCoach}', $1, 'x')`],
  ['redeem_coach_invite', `('COACH-FIXTURE1', $1)`], ['approve_coach_team_request', `('${id()}', $1)`],
  ['confirm_release_readiness', `('authorization_relationships_v1', '${COMMIT}', $1, true, true, true, true, true, true)`],
]) {
  await denied(`cannot call the trusted-only ${sig}`, ids.stranger, `select public.${sig}${args}`, [ids.stranger]);
}

// --- 5. Approved flows still work after 0089 ---------------------------------------
console.log('\n=== approved flows after 0089 ===');
const service = (sql, params) => as('service_role', null, () => db.query(sql, params), { commit: true });
const user = (uid, sql, params) => as('authenticated', uid, () => db.query(sql, params), { commit: true });
async function works(label, fn, verify) {
  try {
    const r = await fn();
    const ok = verify ? await verify(r) : true;
    check(label, ok, ok ? '' : JSON.stringify(r?.rows ?? r));
  } catch (e) {
    check(label, false, e.message);
  }
}
await works('a new account creates its own profile with no role', () => user(ids.newbie, `insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [ids.newbie]),
  async () => (await db.query(`select role from profiles where id = $1`, [ids.newbie])).rows[0].role === null);
await works('…and sets its own display name', () => user(ids.newbie, `update public.profiles set display_name = 'Fictional Newbie' where id = $1 returning id`, [ids.newbie]), (r) => r.rows.length === 1);
await works('card claim / recovery: the trusted path sets parent (role empty) and links the guardian', async () => {
  await service(`select public.ensure_profile_role($1, 'parent')`, [ids.newbie]);
  return service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [ids.p3, ids.newbie]);
}, async () => (await view(ids.newbie)).players === 'p3');
await works('a guardian creates a coach invite with only the allowed columns', () =>
  user(ids.parent, `insert into public.coach_invites (player_id, code, created_by, invited_email) values ($1, 'COACH-AFTER01', $2, 'coach@example.test') returning id`, [ids.p1, ids.parent]), (r) => r.rows.length === 1);
await works('a coach redeems it atomically and gains a direct link', () => service(`select status from public.redeem_coach_invite('COACH-AFTER01', $1)`, [ids.stranger]),
  async (r) => r.rows[0].status === 'redeemed' && (await view(ids.stranger)).players === 'p1');
await works('a guardian removes a direct link', () => service(`select public.remove_direct_coach_link($1, $2, $3, 'Family decision') r`, [ids.p1, ids.stranger, ids.parent]), (r) => r.rows[0].r === 'removed');
await works('a coach removes their own direct link', () => service(`select public.remove_direct_coach_link($1, $2, $2, 'Stepping down') r`, [ids.p1, ids.directCoach]), (r) => r.rows[0].r === 'removed');
await works('staff remove a direct link', () => service(`select public.remove_direct_coach_link($1, $2, $3, 'Safeguarding') r`, [ids.p1, ids.formerWithDirect, ids.staff]), (r) => r.rows[0].r === 'removed');
const req = await works('a signed-in coach submits a team request', () => user(ids.roleOnly, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional Juniors', 'U8') returning id`), (r) => r.rows.length === 1);
const reqId = (await db.query(`select id from coach_team_requests where requester_profile_id = $1`, [ids.roleOnly])).rows[0].id;
await works('staff reject it with a reason', () => service(`select public.reject_coach_team_request($1, $2, 'Use your club invite')`, [reqId, ids.staff]),
  async () => (await db.query(`select status from coach_team_requests where id = $1`, [reqId])).rows[0].status === 'rejected');
await works('staff approve a new request into an existing team', async () => {
  const r = (await user(ids.roleOnly, `insert into public.coach_team_requests (club_name, team_name) values ('Fictional FC', 'U12') returning id`)).rows[0].id;
  return service(`select public.approve_coach_team_request($1, $2, $3)`, [r, ids.staff, ids.teamB]);
}, async () => (await view(ids.roleOnly)).players === 'p2,p4');
await works('staff end that assignment, and the coach loses team access at once', () => service(`select public.end_coach_assignment($1, $2, $3, 'Season over')`, [ids.teamB, ids.roleOnly, ids.staff]),
  async () => (await view(ids.roleOnly)).players === '');
await works('a team invite reactivates an ended coach', () => service(`select public.activate_coach_assignment($1, $2, 'team_invite', $2) c`, [ids.teamA, ids.endedCoach]),
  async () => (await view(ids.endedCoach)).players === 'p1,p3');
await works('order approval (service role) still creates clubs and teams', () => service(`with c as (insert into public.clubs (name) values ('Ordered FC') returning id) insert into public.teams (club_id, name, season_id) select id, 'U11', $1 from c returning id`, [ids.season]),
  (r) => r.rows.length === 1);
await works('release readiness stays protected: a second confirmation is refused', async () => {
  try {
    await service(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, ids.staff]);
    return false;
  } catch (e) {
    return e.message.includes('already confirmed');
  }
}, (r) => r === true);
await works('account deletion still works for a guardian', () => user(ids.newbie, `select public.delete_own_guardian_account() r`), (r) => r.rows[0].r.canDeleteIdentity === true);

await db.close();

// --- 6. Rollback ----------------------------------------------------------------
console.log('\n=== rollback ===');
{
  const { db: rdb, ids: rids } = await seeded();
  await confirmReadiness(rdb, rids.staff);
  const c88 = await snapshotCatalog(rdb);
  await applyMigrations(rdb, { from: '0089', through: '0089' });
  const c89 = await snapshotCatalog(rdb);
  const d89 = await dataSnapshot(rdb);
  let refusal = null;
  try {
    await rdb.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  } catch (e) {
    refusal = e.message;
    await rdb.exec('rollback;').catch(() => {});
  }
  check('rollback without the acknowledgement is refused, naming the reopened vulnerability', refusal?.includes('0089 rollback refused') && refusal.includes('reopens the confirmed authorization vulnerability'), refusal);
  const still = diffCatalog(c89, await snapshotCatalog(rdb));
  check('the refused rollback changed nothing', still.added.length + still.removed.length + still.changed.length === 0 && (await dataSnapshot(rdb)) === d89);
  await rdb.exec('begin;');
  await rdb.query(ACK);
  await rdb.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  const back = diffCatalog(c88, await snapshotCatalog(rdb));
  check('with the acknowledgement, the rollback restores the exact 0088 catalog', back.added.length + back.removed.length + back.changed.length === 0,
    [...back.added, ...back.removed, ...back.changed].join(', '));
  check('the rollback changes no data', (await dataSnapshot(rdb)) === d89);
  check('the acknowledgement does not outlive the rollback transaction', (await rdb.query(`select coalesce(current_setting('emblem.acknowledge_0089_rollback', true), '') v`)).rows[0].v === '');
  const again = await tryApply0089(rdb);
  check('0089 re-applies after the rollback (readiness still valid)', again === null, again);
  const re = diffCatalog(c89, await snapshotCatalog(rdb));
  check('…to exactly the same 0089 catalog', re.added.length + re.removed.length + re.changed.length === 0, [...re.added, ...re.removed, ...re.changed].join(', '));
  await rdb.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} migration 0089 checks passed`);
if (failed.length) process.exitCode = 1;
