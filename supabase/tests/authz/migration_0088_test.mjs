// Migration 0088 (additive relationship-authorization foundation).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Proves, on a fresh database built to production's 0087 state:
//   - 0088 applies, and only ADDS catalog entries (no policy, grant, column,
//     constraint or function definition is removed or narrowed; the two
//     helpers change search_path only, keeping their ACLs);
//   - every expected new object exists with the intended grants;
//   - pre-existing coach/guardian rows survive unchanged, with NULL history;
//   - the active-assignment rule, team-request rules and audit attribution;
//   - the rollback returns the whole public catalog to its exact 0087 state.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const ROLLBACK_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../rollback/0088_rollback.sql');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}

const db = await createDatabase();

// Runs fn as `role` with the given auth.uid(); commits only when asked.
// Role and request settings are transaction-local, so nothing leaks.
async function as(role, uid, fn, { commit = false } = {}) {
  await db.exec('begin;');
  try {
    await db.exec(`set local role ${role};`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid ?? '']);
    const result = await fn();
    await db.exec(commit ? 'commit;' : 'rollback;');
    return result;
  } catch (e) {
    await db.exec('rollback;');
    throw e;
  }
}
async function expectOk(label, fn, verify) {
  try {
    const r = await fn();
    const ok = verify ? verify(r) : true;
    check(label, ok, ok ? '' : `unexpected result ${JSON.stringify(r?.rows ?? r)}`);
    return r;
  } catch (e) {
    check(label, false, `unexpected error: ${e.message}`);
  }
}
async function expectError(label, fn, matchText) {
  try {
    await fn();
    check(label, false, 'expected an error, but it succeeded');
  } catch (e) {
    check(label, matchText ? e.message.includes(matchText) : true, e.message);
  }
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// ---------------------------------------------------------------------------
// 0087 baseline plus fictional pre-existing relationships (seeded as owner)
// ---------------------------------------------------------------------------
await applyMigrations(db, { through: '0087' });
const catalog0087 = await snapshotCatalog(db);

const id = () => crypto.randomUUID();
const ids = {
  season: id(), club: id(), team: id(), otherTeam: id(), player: id(),
  legacyCoach: id(), legacyGuardian: id(), staff: id(),
  requester: id(), parentRequester: id(), bystander: id(), claimant: id(),
};
await db.query(`insert into auth.users (id, email) select u, 'user-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`,
  [[ids.legacyCoach, ids.legacyGuardian, ids.staff, ids.requester, ids.parentRequester, ids.bystander, ids.claimant]]);
await db.exec(`
  insert into profiles (id, role, display_name) values
    ('${ids.legacyCoach}', 'coach', 'Fictional Coach'),
    ('${ids.legacyGuardian}', 'parent', 'Fictional Parent'),
    ('${ids.staff}', null, 'Fictional Staff'),
    ('${ids.requester}', null, 'Fictional Requester'),
    ('${ids.parentRequester}', 'parent', 'Fictional Parent Requester'),
    ('${ids.bystander}', null, 'Fictional Bystander'),
    ('${ids.claimant}', null, 'Fictional Claimant');
  insert into staff_accounts (profile_id) values ('${ids.staff}');
  insert into seasons (id, label, normalized_label) values ('${ids.season}', 'Test Season', 'test season');
  insert into clubs (id, name) values ('${ids.club}', 'Fictional FC');
  insert into teams (id, club_id, name, season_id) values
    ('${ids.team}', '${ids.club}', 'Fictional U10', '${ids.season}'),
    ('${ids.otherTeam}', '${ids.club}', 'Fictional U12', '${ids.season}');
  insert into players (id, team_id, name) values ('${ids.player}', '${ids.team}', 'Fictional Player');
  insert into coach_team (team_id, profile_id) values ('${ids.team}', '${ids.legacyCoach}');
  insert into guardians (player_id, profile_id, relationship) values ('${ids.player}', '${ids.legacyGuardian}', 'parent');
`);
const legacyRows = async () => ({
  coach: (await db.query(`select team_id, profile_id from coach_team order by 1, 2`)).rows,
  guardian: (await db.query(`select player_id, profile_id, relationship from guardians order by 1, 2`)).rows,
});
const legacyBefore = await legacyRows();

// ---------------------------------------------------------------------------
// Apply 0088
// ---------------------------------------------------------------------------
const applied = await applyMigrations(db, { from: '0088', through: '0088' }).catch((e) => e);
if (applied instanceof Error || applied.length !== 1) {
  check('0088 applies to the 0087 database', false, applied instanceof Error ? applied.message : `${applied.length} applied`);
  process.exit(1);
}
check('0088 applies to the 0087 database', true, applied[0].file);
const catalog0088 = await snapshotCatalog(db);

// ---------------------------------------------------------------------------
// Additive only: nothing that existed at 0087 is removed or redefined
// ---------------------------------------------------------------------------
const HELPERS = ['function:is_authorized_coach_for_player(check_player_id uuid)', 'function:is_guardian_of_team_player(check_team_id uuid)'];
const OUTBOX_CHECK = 'constraint:staff_notification_outbox.staff_notification_outbox_event_type_check';
const forward = diffCatalog(catalog0087, catalog0088);
check('0088 removes no catalog entry (policy, grant, column, constraint, index, function, trigger)', forward.removed.length === 0, forward.removed.join(', '));
const CREATOR_FK = 'constraint:coach_players.coach_players_created_by_fkey';
const INVITE_CREATOR = 'column:coach_invites.created_by';
const INVITE_REDEEMER_FK = 'constraint:coach_invites.coach_invites_used_by_fkey';
check(
  'the only redefined 0087 entries are the two helpers, the outbox event-type check and the three creator/redeemer references',
  forward.changed.length === HELPERS.length + 4 && [...HELPERS, OUTBOX_CHECK, CREATOR_FK, INVITE_CREATOR, INVITE_REDEEMER_FK].every((h) => forward.changed.includes(h)),
  forward.changed.join(', ')
);
check('coach_invites.used_by now becomes NULL when the redeemer’s profile is deleted (nothing else about the key changes)',
  catalog0087.get(INVITE_REDEEMER_FK) === 'FOREIGN KEY (used_by) REFERENCES profiles(id)' &&
  catalog0088.get(INVITE_REDEEMER_FK) === 'FOREIGN KEY (used_by) REFERENCES profiles(id) ON DELETE SET NULL', catalog0088.get(INVITE_REDEEMER_FK));
check('coach_players.created_by now becomes NULL when the creator’s profile is deleted (nothing else about the key changes)',
  catalog0087.get(CREATOR_FK) === 'FOREIGN KEY (created_by) REFERENCES profiles(id)' &&
  catalog0088.get(CREATOR_FK) === 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL', catalog0088.get(CREATOR_FK));
check('coach_invites.created_by only loses NOT NULL (type, default and grants unchanged)',
  catalog0087.get(INVITE_CREATOR) === 'uuid | t | no-default |  | no-column-acl' &&
  catalog0088.get(INVITE_CREATOR) === 'uuid | f | no-default |  | no-column-acl', catalog0088.get(INVITE_CREATOR));
const eventTypes = (def) => [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
const typesBefore = eventTypes(catalog0087.get(OUTBOX_CHECK));
const typesAfter = eventTypes(catalog0088.get(OUTBOX_CHECK));
check('outbox event-type check only widens: every 0087 type kept, plus new_coach_team_request',
  typesBefore.length === 12 && typesBefore.every((t) => typesAfter.includes(t)) &&
  JSON.stringify(typesAfter.filter((t) => !typesBefore.includes(t))) === '["new_coach_team_request"]', typesAfter.join(','));
for (const h of HELPERS) {
  const [secdefB, volB, ownerB, configB, aclB] = catalog0087.get(h).split(' | ');
  const [secdefA, volA, ownerA, configA, aclA] = catalog0088.get(h).split(' | ');
  check(`${h}: same SECURITY DEFINER, volatility, owner and ACL; search_path public -> ''`,
    secdefA === secdefB && volA === volB && ownerA === ownerB && aclA === aclB && configB === 'search_path=public' && configA === 'search_path=""',
    `acl ${aclA}`);
}
const changedPolicies = forward.changed.filter((k) => k.startsWith('policy:'));
check('every 0087 policy is byte-identical after 0088', changedPolicies.length === 0);

// ---------------------------------------------------------------------------
// Expected new objects
// ---------------------------------------------------------------------------
const expectedAdded = [
  ...['created_at', 'created_via', 'created_by', 'expires_at', 'ended_at', 'ended_by', 'end_reason'].map((c) => `column:coach_team.${c}`),
  ...['created_at', 'created_via', 'created_by'].map((c) => `column:guardians.${c}`),
  'constraint:coach_team.coach_team_created_via_check',
  'constraint:coach_team.coach_team_expiry_after_creation_check',
  'constraint:coach_team.coach_team_ended_fields_check',
  'constraint:coach_team.coach_team_end_reason_length_check',
  'constraint:coach_team.coach_team_created_by_fkey',
  'constraint:coach_team.coach_team_ended_by_fkey',
  'constraint:guardians.guardians_created_via_check',
  'constraint:guardians.guardians_created_by_fkey',
  'relation:coach_team_requests',
  'relation:relationship_audit_events',
  'relation:relationship_audit_events_id_seq',
  'index:coach_team_requests_pkey',
  'index:coach_team_requests_one_pending_per_requester',
  'index:coach_team_requests_status_created_idx',
  'index:relationship_audit_events_pkey',
  'index:relationship_audit_events_profile_idx',
  'policy:coach_team_requests.coach_team_requests: requester can view own',
  'policy:coach_team_requests.coach_team_requests: requester can submit own pending',
  'trigger:coach_team.relationship_audit',
  'trigger:guardians.relationship_audit',
  'trigger:coach_players.relationship_audit',
  'function:remove_direct_coach_link(p_player_id uuid, p_coach_profile_id uuid, p_actor_profile_id uuid, p_reason text)',
  'trigger:coach_team_requests.coach_team_requests_transition',
  'trigger:relationship_audit_events.relationship_audit_events_append_only',
  'trigger:relationship_audit_events.relationship_audit_events_no_truncate',
  'function:coach_assignment_is_active(p_ended_at timestamp with time zone, p_expires_at timestamp with time zone)',
  'function:enforce_coach_team_request_transition()',
  'function:reject_relationship_audit_mutation()',
  'function:record_relationship_audit_event()',
  'function:approve_coach_team_request(p_request_id uuid, p_staff_profile_id uuid, p_team_id uuid, p_expires_at timestamp with time zone, p_season_id uuid)',
  'function:reject_coach_team_request(p_request_id uuid, p_staff_profile_id uuid, p_reason text)',
  'function:cancel_own_coach_team_request(p_request_id uuid)',
  'function:end_coach_assignment(p_team_id uuid, p_profile_id uuid, p_staff_profile_id uuid, p_reason text)',
  'function:ensure_profile_role(p_profile_id uuid, p_role text, p_display_name text)',
  'function:activate_coach_assignment(p_team_id uuid, p_profile_id uuid, p_created_via text, p_actor_profile_id uuid)',
  'relation:release_readiness_confirmations',
  'relation:release_readiness_confirmations_id_seq',
  'index:release_readiness_confirmations_pkey',
  'index:release_readiness_confirmations_contract_key',
  'trigger:release_readiness_confirmations.release_readiness_stamp',
  'trigger:release_readiness_confirmations.release_readiness_append_only',
  'trigger:release_readiness_confirmations.release_readiness_no_truncate',
  'function:stamp_release_readiness_confirmation()',
  'function:reject_release_readiness_mutation()',
  'function:confirm_release_readiness(p_contract text, p_app_commit text, p_confirmed_by uuid, p_card_claim boolean, p_guardian_invite boolean, p_team_invite boolean, p_coach_invite boolean, p_dual_view boolean, p_team_request_flow boolean)',
];
const missingNew = expectedAdded.filter((k) => !catalog0088.has(k));
check('every expected new column, constraint, index, policy, trigger and function exists', missingNew.length === 0, missingNew.join(', '));
const unexpectedNew = forward.added.filter((k) => !expectedAdded.includes(k) &&
  !/^(column|constraint):(coach_team_requests|relationship_audit_events|release_readiness_confirmations)[._]/.test(k));
check('0088 adds nothing beyond the expected objects', unexpectedNew.length === 0, unexpectedNew.join(', '));

const tableAcl = async (t) => (await one(`select relrowsecurity as rls, relacl::text as acl from pg_class where oid = $1::regclass`, [`public.${t}`]));
const requestsAcl = await tableAcl('coach_team_requests');
check('coach_team_requests: RLS on; authenticated SELECT only at table level; service_role select/insert/update/delete; no anon',
  requestsAcl.rls && /authenticated=r\//.test(requestsAcl.acl) && /service_role=arwd\//.test(requestsAcl.acl) && !/anon=/.test(requestsAcl.acl), requestsAcl.acl);
const insertCols = (await db.query(`select string_agg(column_name, ',' order by column_name) c from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'coach_team_requests' and grantee = 'authenticated' and privilege_type = 'INSERT'`)).rows[0].c;
check('coach_team_requests: authenticated may INSERT only age_group, club_name, note, team_name', insertCols === 'age_group,club_name,note,team_name', insertCols);
const readinessAcl = await tableAcl('release_readiness_confirmations');
check('release_readiness_confirmations: RLS on; only service_role, SELECT only (writes go through confirm_release_readiness)',
  readinessAcl.rls && readinessAcl.acl === '{postgres=arwdDxtm/postgres,service_role=r/postgres}', readinessAcl.acl);
const auditAcl = await tableAcl('relationship_audit_events');
check('relationship_audit_events: RLS on; only service_role, SELECT only', auditAcl.rls && auditAcl.acl === '{postgres=arwdDxtm/postgres,service_role=r/postgres}', auditAcl.acl);

const fnAccess = async (sig) => one(`select p.prosecdef as secdef, array_to_string(p.proconfig, ',') as config,
    has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
    has_function_privilege('service_role', p.oid, 'execute') as service from pg_proc p where p.oid = $1::regprocedure`, [sig]);
for (const [sig, secdef, auth, service] of [
  ['public.approve_coach_team_request(uuid,uuid,uuid,timestamptz,uuid)', true, false, true],
  ['public.reject_coach_team_request(uuid,uuid,text)', true, false, true],
  ['public.end_coach_assignment(uuid,uuid,uuid,text)', true, false, true],
  ['public.cancel_own_coach_team_request(uuid)', true, true, true],
  ['public.ensure_profile_role(uuid,text,text)', true, false, true],
  ['public.remove_direct_coach_link(uuid,uuid,uuid,text)', true, false, true],
  ['public.activate_coach_assignment(uuid,uuid,text,uuid)', true, false, true],
  ['public.confirm_release_readiness(text,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean)', true, false, true],
  ['public.stamp_release_readiness_confirmation()', false, false, false],
  ['public.reject_release_readiness_mutation()', false, false, false],
  ['public.coach_assignment_is_active(timestamptz,timestamptz)', false, false, true],
  ['public.record_relationship_audit_event()', true, false, false],
  ['public.enforce_coach_team_request_transition()', false, false, false],
  ['public.reject_relationship_audit_mutation()', false, false, false],
]) {
  const f = await fnAccess(sig);
  check(`${sig}: security definer=${secdef}, search_path='', anon=false, authenticated=${auth}, service_role=${service}`,
    f.secdef === secdef && f.config === 'search_path=""' && f.anon === false && f.auth === auth && f.service === service, JSON.stringify(f));
}

// ---------------------------------------------------------------------------
// Pre-existing relationships: unchanged, no invented history, still active
// ---------------------------------------------------------------------------
const legacyAfter = await legacyRows();
check('pre-existing coach_team and guardians rows are unchanged', JSON.stringify(legacyAfter) === JSON.stringify(legacyBefore));
const legacyCoach = await one(`select created_at, created_via, created_by, expires_at, ended_at, ended_by, end_reason,
    public.coach_assignment_is_active(ended_at, expires_at) as active from coach_team where profile_id = $1`, [ids.legacyCoach]);
check('legacy coach_team row: every new attribution, expiry and end column is NULL',
  ['created_at', 'created_via', 'created_by', 'expires_at', 'ended_at', 'ended_by', 'end_reason'].every((c) => legacyCoach[c] === null));
check('legacy coach_team row (no end, no expiry) is active', legacyCoach.active === true);
const legacyGuardian = await one(`select created_at, created_via, created_by from guardians where profile_id = $1`, [ids.legacyGuardian]);
check('legacy guardians row: every new attribution column is NULL', Object.values(legacyGuardian).every((v) => v === null));
check('0088 writes no audit events for existing rows', (await one(`select count(*)::int n from relationship_audit_events`)).n === 0);

// ---------------------------------------------------------------------------
// Active-assignment rule
// ---------------------------------------------------------------------------
const rule = (await db.query(`select
    public.coach_assignment_is_active(null, null) as legacy,
    public.coach_assignment_is_active(null, now() + interval '1 day') as future_expiry,
    public.coach_assignment_is_active(null, now() - interval '1 second') as expired,
    public.coach_assignment_is_active(now(), null) as ended,
    public.coach_assignment_is_active(now(), now() + interval '1 day') as ended_before_expiry`)).rows[0];
check('active rule: no end + no expiry = active', rule.legacy === true);
check('active rule: no end + future expiry = active', rule.future_expiry === true);
check('active rule: past expiry = not active', rule.expired === false);
check('active rule: ended = not active', rule.ended === false);
check('active rule: ended before its expiry = not active', rule.ended_before_expiry === false);
check('no 0087 policy or helper body refers to ended_at, expires_at or the active rule (access unchanged until 0089)',
  [...catalog0088].filter(([k, v]) => catalog0087.has(k) && /ended_at|expires_at|coach_assignment_is_active/.test(v) && (k.startsWith('policy:') || HELPERS.includes(k))).length === 0);
await expectError('coach_team: ended_by without ended_at is rejected', () =>
  db.query(`update coach_team set ended_by = $1 where profile_id = $2`, [ids.staff, ids.legacyCoach]), 'coach_team_ended_fields_check');
await expectError('coach_team: unknown created_via is rejected', () =>
  db.query(`update coach_team set created_via = 'self' where profile_id = $1`, [ids.legacyCoach]), 'coach_team_created_via_check');
await expectError('guardians: unknown created_via is rejected', () =>
  db.query(`update guardians set created_via = 'self' where profile_id = $1`, [ids.legacyGuardian]), 'guardians_created_via_check');

// ---------------------------------------------------------------------------
// Team requests: submission, uniqueness, visibility, transitions
// ---------------------------------------------------------------------------
const submit = (uid, club = 'Fictional Juniors', team = 'Fictional U9') =>
  as('authenticated', uid, () => db.query(`insert into coach_team_requests (club_name, team_name) values ($1, $2) returning id, requester_profile_id, status`, [club, team]), { commit: true });

const firstRequest = (await expectOk('requester submits a team request; requester and status come from the defaults',
  () => submit(ids.requester), (r) => r.rows[0].requester_profile_id === ids.requester && r.rows[0].status === 'pending')).rows[0];
await expectError('a second pending request by the same person is rejected', () => submit(ids.requester), 'coach_team_requests_one_pending_per_requester');
await expectError('a request cannot name another person as requester', () =>
  as('authenticated', ids.requester, () => db.query(`insert into coach_team_requests (requester_profile_id, club_name, team_name) values ($1, 'X FC', 'X')`, [ids.bystander])), 'permission denied');
await expectError('a request cannot be submitted as already approved', () =>
  as('authenticated', ids.bystander, () => db.query(`insert into coach_team_requests (club_name, team_name, status) values ('X FC', 'X', 'approved')`)), 'permission denied');
await expectError('a requester cannot update their request directly', () =>
  as('authenticated', ids.requester, () => db.query(`update coach_team_requests set status = 'approved' where id = $1`, [firstRequest.id])), 'permission denied');
await expectError('club name length is checked', () => submit(ids.bystander, 'X', 'Y'), 'check constraint');
await expectOk('requester sees their own request', () =>
  as('authenticated', ids.requester, () => db.query(`select id from coach_team_requests`)), (r) => r.rows.length === 1 && r.rows[0].id === firstRequest.id);
await expectOk('another signed-in person sees no requests', () =>
  as('authenticated', ids.bystander, () => db.query(`select id from coach_team_requests`)), (r) => r.rows.length === 0);
await expectError('signed-out (anon) cannot read requests', () =>
  as('anon', null, () => db.query(`select id from coach_team_requests`)), 'permission denied');
await expectError('another person cannot cancel the request', () =>
  as('authenticated', ids.bystander, () => db.query(`select public.cancel_own_coach_team_request($1)`, [firstRequest.id])), 'No pending team request of yours');
await expectOk('requester cancels their own pending request', () =>
  as('authenticated', ids.requester, () => db.query(`select public.cancel_own_coach_team_request($1)`, [firstRequest.id]), { commit: true }));
check('cancelled request is recorded as cancelled by the requester',
  (await one(`select status, decided_by from coach_team_requests where id = $1`, [firstRequest.id])).status === 'cancelled');
await expectError('a cancelled request cannot be cancelled again', () =>
  as('authenticated', ids.requester, () => db.query(`select public.cancel_own_coach_team_request($1)`, [firstRequest.id])), 'No pending team request of yours');
await expectError('a cancelled request cannot be reopened, even by the owner role', () =>
  db.query(`update coach_team_requests set status = 'pending', decided_at = null, decided_by = null where id = $1`, [firstRequest.id]), 'already cancelled');
const secondRequest = (await expectOk('after cancelling, the requester can submit a new pending request', () => submit(ids.requester))).rows[0];
await expectError('submitted details of a pending request cannot change', () =>
  db.query(`update coach_team_requests set club_name = 'Other FC' where id = $1`, [secondRequest.id]), 'cannot change');
await expectError('a decided status needs a decision time', () =>
  db.query(`update coach_team_requests set status = 'rejected' where id = $1`, [secondRequest.id]), 'coach_team_requests_decision_time_check');

// ---------------------------------------------------------------------------
// Staff functions and audit attribution
// ---------------------------------------------------------------------------
const asService = (sql, params) => as('service_role', null, () => db.query(sql, params), { commit: true });
const auditFor = (profileId) => db.query(`select table_name, event, actor_profile_id, actor_source, operation, auth_uid, db_role
  from relationship_audit_events where profile_id = $1 order by id`, [profileId]);

await expectError('staff functions are not executable by a signed-in user', () =>
  as('authenticated', ids.requester, () => db.query(`select public.approve_coach_team_request($1, $2)`, [secondRequest.id, ids.requester])), 'permission denied');
await expectError('approval names a staff account, or is refused', () =>
  asService(`select public.approve_coach_team_request($1, $2, null, null, $3)`, [secondRequest.id, ids.bystander, ids.season]), 'staff only');
await expectError('approval into a new team needs a season', () =>
  asService(`select public.approve_coach_team_request($1, $2)`, [secondRequest.id, ids.staff]), 'season is required');
await expectError('approval rejects an expiry in the past', () =>
  asService(`select public.approve_coach_team_request($1, $2, $3, now() - interval '1 day')`, [secondRequest.id, ids.staff, ids.otherTeam]), 'future');

const newTeamId = (await expectOk('staff approve a request into a new team', () =>
  asService(`select public.approve_coach_team_request($1, $2, null, null, $3) as team_id`, [secondRequest.id, ids.staff, ids.season]))).rows[0].team_id;
const approved = await one(`select r.status, r.decided_by, r.resulting_team_id, t.name as team, c.name as club, t.season_id
  from coach_team_requests r join teams t on t.id = r.resulting_team_id join clubs c on c.id = t.club_id where r.id = $1`, [secondRequest.id]);
check('approved request records staff, decision and the created club/team in the given season',
  approved.status === 'approved' && approved.decided_by === ids.staff && approved.resulting_team_id === newTeamId &&
  approved.team === 'Fictional U9' && approved.club === 'Fictional Juniors' && approved.season_id === ids.season);
const assignment = await one(`select created_at, created_via, created_by, expires_at, public.coach_assignment_is_active(ended_at, expires_at) as active
  from coach_team where team_id = $1 and profile_id = $2`, [newTeamId, ids.requester]);
check('the new assignment carries its creation time, staff_team_request and the approving staff member',
  assignment.created_at !== null && assignment.created_via === 'staff_team_request' && assignment.created_by === ids.staff && assignment.active === true);
check('approval gives a person with no role the coach role', (await one(`select role from profiles where id = $1`, [ids.requester])).role === 'coach');
await expectError('an approved request cannot be approved again', () =>
  asService(`select public.approve_coach_team_request($1, $2, $3)`, [secondRequest.id, ids.staff, ids.otherTeam]), 'already approved');
await expectError('an approved request cannot be rejected', () =>
  asService(`select public.reject_coach_team_request($1, $2, 'late')`, [secondRequest.id, ids.staff]), 'already approved');

const approveAudit = (await auditFor(ids.requester)).rows;
check('audit: staff approval is attributed to the named staff member as a trusted operation, not just the database role',
  approveAudit.length === 1 && approveAudit[0].event === 'INSERT' && approveAudit[0].actor_source === 'trusted_function' &&
  approveAudit[0].actor_profile_id === ids.staff && approveAudit[0].operation === 'approve_coach_team_request' &&
  approveAudit[0].db_role === 'service_role' && approveAudit[0].auth_uid === null, JSON.stringify(approveAudit));

// A parent asks to coach an existing team, with an expiry.
const parentRequest = (await submit(ids.parentRequester, 'Fictional FC', 'Fictional U12')).rows[0];
await expectOk('staff approve a request into an existing team with an expiry', () =>
  asService(`select public.approve_coach_team_request($1, $2, $3, now() + interval '30 days')`, [parentRequest.id, ids.staff, ids.otherTeam]));
check('approval never overwrites an existing role (a parent stays parent)', (await one(`select role from profiles where id = $1`, [ids.parentRequester])).role === 'parent');
check('the expiring assignment is active before its expiry', (await one(`select public.coach_assignment_is_active(ended_at, expires_at) a, expires_at from coach_team where profile_id = $1`, [ids.parentRequester])).a === true);
check('the expiring assignment is not active once its expiry has passed',
  (await one(`select public.coach_assignment_is_active(ended_at, now() - interval '1 second') a from coach_team where profile_id = $1`, [ids.parentRequester])).a === false);

const rejectRequest = (await submit(ids.bystander)).rows[0];
await expectError('rejection needs a reason', () => asService(`select public.reject_coach_team_request($1, $2, '  ')`, [rejectRequest.id, ids.staff]), 'reason is required');
await expectOk('staff reject a request with a reason', () => asService(`select public.reject_coach_team_request($1, $2, 'Team not found')`, [rejectRequest.id, ids.staff]));
const rejected = await one(`select status, decided_by, decision_note, resulting_team_id from coach_team_requests where id = $1`, [rejectRequest.id]);
check('rejected request records staff and reason, and creates no team', rejected.status === 'rejected' && rejected.decided_by === ids.staff && rejected.decision_note === 'Team not found' && rejected.resulting_team_id === null);
check('rejection gives no role', (await one(`select role from profiles where id = $1`, [ids.bystander])).role === null);

// Ending an assignment keeps the row and records who ended it.
await expectError('ending needs a reason', () => asService(`select public.end_coach_assignment($1, $2, $3, '')`, [ids.team, ids.legacyCoach, ids.staff]), 'reason is required');
await expectOk('staff end a legacy assignment', () => asService(`select public.end_coach_assignment($1, $2, $3, 'Left the club')`, [ids.team, ids.legacyCoach, ids.staff]));
const ended = await one(`select ended_at, ended_by, end_reason, created_at, public.coach_assignment_is_active(ended_at, expires_at) as active from coach_team where profile_id = $1`, [ids.legacyCoach]);
check('ended assignment is kept, marked ended by staff with the reason, and no longer active',
  ended.ended_at !== null && ended.ended_by === ids.staff && ended.end_reason === 'Left the club' && ended.active === false);
check('ending a legacy row does not invent its creation time', ended.created_at === null);
await expectError('an ended assignment cannot be ended again', () => asService(`select public.end_coach_assignment($1, $2, $3, 'again')`, [ids.team, ids.legacyCoach, ids.staff]), 'already ended');
const endAudit = (await auditFor(ids.legacyCoach)).rows;
check('audit: ending is attributed to the staff member as end_coach_assignment',
  endAudit.length === 1 && endAudit[0].event === 'UPDATE' && endAudit[0].actor_source === 'trusted_function' &&
  endAudit[0].actor_profile_id === ids.staff && endAudit[0].operation === 'end_coach_assignment', JSON.stringify(endAudit));

// Re-approval reactivates an ended assignment instead of colliding.
const reRequest = (await submit(ids.legacyCoach)).rows[0];
await expectOk('re-approval into the same team reactivates the ended assignment', () =>
  asService(`select public.approve_coach_team_request($1, $2, $3)`, [reRequest.id, ids.staff, ids.team]));
const reactivated = await one(`select ended_at, ended_by, end_reason, created_at, public.coach_assignment_is_active(ended_at, expires_at) as active from coach_team where profile_id = $1`, [ids.legacyCoach]);
check('reactivated assignment is active, its end cleared, its unknown creation time still NULL',
  reactivated.active === true && reactivated.ended_at === null && reactivated.ended_by === null && reactivated.end_reason === null && reactivated.created_at === null);

// Trusted operation settings don't outlive the function that set them.
await expectOk('the trusted-operation marker is cleared before the function returns', () =>
  as('service_role', null, async () => {
    const r = (await db.query(`insert into coach_team_requests (requester_profile_id, club_name, team_name) values ($1, 'Fictional FC', 'Fictional U14') returning id`, [ids.claimant])).rows[0];
    await db.query(`select public.approve_coach_team_request($1, $2, $3)`, [r.id, ids.staff, ids.otherTeam]);
    return db.query(`select current_setting('emblem.trusted_operation', true) as op, current_setting('emblem.actor_profile_id', true) as actor`);
  }), (r) => !r.rows[0].op && !r.rows[0].actor);

// Service-role writes that carry the real account, as card claim will (Phase 3).
await expectOk('a service-role guardian insert carrying created_by/created_via is accepted', () =>
  asService(`insert into guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [ids.player, ids.claimant]));
const claimAudit = (await auditFor(ids.claimant)).rows.filter((r) => r.table_name === 'guardians');
check('audit: a service-role write is attributed to the account named on the row, with its operation',
  claimAudit.length === 1 && claimAudit[0].actor_source === 'row_attribution' && claimAudit[0].actor_profile_id === ids.claimant &&
  claimAudit[0].operation === 'card_claim' && claimAudit[0].db_role === 'service_role', JSON.stringify(claimAudit));
check('the new guardian row gets a real creation time', (await one(`select created_at from guardians where profile_id = $1`, [ids.claimant])).created_at !== null);

await expectOk('a service-role write with no attribution is still accepted', () =>
  asService(`insert into coach_team (team_id, profile_id) values ($1, $2)`, [ids.otherTeam, ids.bystander]));
const bareAudit = (await auditFor(ids.bystander)).rows.filter((r) => r.table_name === 'coach_team');
check('audit: an unattributed write is recorded as unattributed, never guessed',
  bareAudit.length === 1 && bareAudit[0].actor_source === 'unattributed' && bareAudit[0].actor_profile_id === null && bareAudit[0].db_role === 'service_role', JSON.stringify(bareAudit));

await expectOk('a write in a request carrying a signed-in identity is attributed to that account', () =>
  as('service_role', ids.claimant, () => db.query(`insert into coach_team (team_id, profile_id) values ($1, $2)`, [ids.team, ids.bystander]), { commit: true }));
const sessionAudit = (await auditFor(ids.bystander)).rows.filter((r) => r.table_name === 'coach_team' && r.actor_source !== 'unattributed');
check('audit: the initiating account (auth.uid) is distinguished from a trusted operation',
  sessionAudit.length === 1 && sessionAudit[0].actor_source === 'session' && sessionAudit[0].actor_profile_id === ids.claimant && sessionAudit[0].auth_uid === ids.claimant, JSON.stringify(sessionAudit));

// ensure_profile_role: create if missing, set only when empty, never overwrite.
const newcomer = id();
await db.query(`insert into auth.users (id, email) values ($1, 'newcomer@example.test')`, [newcomer]);
await expectError('ensure_profile_role is not executable by a signed-in user', () =>
  as('authenticated', newcomer, () => db.query(`select public.ensure_profile_role($1, 'coach')`, [newcomer])), 'permission denied');
await expectOk('ensure_profile_role creates a missing profile with the role and display name', () =>
  asService(`select public.ensure_profile_role($1, 'parent', '  Fictional Newcomer ') as role`, [newcomer]), (r) => r.rows[0].role === 'parent');
check('the created profile has the trimmed display name', (await one(`select display_name from profiles where id = $1`, [newcomer])).display_name === 'Fictional Newcomer');
await expectOk('ensure_profile_role keeps the display name when none is given', () =>
  asService(`select public.ensure_profile_role($1, 'parent')`, [newcomer]));
check('display name unchanged without a new one', (await one(`select display_name from profiles where id = $1`, [newcomer])).display_name === 'Fictional Newcomer');
await expectOk('ensure_profile_role fills an empty role', () =>
  asService(`select public.ensure_profile_role($1, 'parent') as role`, [ids.bystander]), (r) => r.rows[0].role === 'parent');
await expectOk('ensure_profile_role never turns a coach into a parent', () =>
  asService(`select public.ensure_profile_role($1, 'parent', 'Renamed Coach') as role`, [ids.legacyCoach]), (r) => r.rows[0].role === 'coach');
check('…but still applies a given display name', (await one(`select display_name from profiles where id = $1`, [ids.legacyCoach])).display_name === 'Renamed Coach');
await expectOk('ensure_profile_role never turns a parent into a coach', () =>
  asService(`select public.ensure_profile_role($1, 'coach') as role`, [ids.legacyGuardian]), (r) => r.rows[0].role === 'parent');
await expectError('ensure_profile_role rejects an unsupported role', () => asService(`select public.ensure_profile_role($1, 'staff')`, [newcomer]), 'Unsupported role');

// activate_coach_assignment: insert, no-op when active, reactivate when not.
await expectError('activate_coach_assignment is not executable by a signed-in user', () =>
  as('authenticated', ids.legacyGuardian, () => db.query(`select public.activate_coach_assignment($1, $2, 'team_invite', $2)`, [ids.otherTeam, ids.legacyGuardian])), 'permission denied');
await expectError('activate_coach_assignment rejects an unsupported created_via', () =>
  asService(`select public.activate_coach_assignment($1, $2, 'self', $2)`, [ids.otherTeam, ids.legacyGuardian]), 'Unsupported created_via');
await expectOk('activate_coach_assignment creates a new assignment (a parent redeeming a team invite)', () =>
  asService(`select public.activate_coach_assignment($1, $2, 'team_invite', $2) as changed`, [ids.otherTeam, ids.legacyGuardian]), (r) => r.rows[0].changed === true);
const invited = await one(`select created_at, created_via, created_by, public.coach_assignment_is_active(ended_at, expires_at) as active
  from coach_team where team_id = $1 and profile_id = $2`, [ids.otherTeam, ids.legacyGuardian]);
check('the invited assignment records team_invite, the redeeming account and a creation time',
  invited.created_via === 'team_invite' && invited.created_by === ids.legacyGuardian && invited.created_at !== null && invited.active === true);
const inviteAudit = (await auditFor(ids.legacyGuardian)).rows.filter((r) => r.table_name === 'coach_team');
check('audit: invite redemption is attributed to the redeeming account as a named trusted operation',
  inviteAudit.length === 1 && inviteAudit[0].actor_source === 'trusted_function' && inviteAudit[0].actor_profile_id === ids.legacyGuardian &&
  inviteAudit[0].operation === 'activate_coach_assignment:team_invite', JSON.stringify(inviteAudit));
await expectOk('activate_coach_assignment leaves an already-active assignment untouched', () =>
  asService(`select public.activate_coach_assignment($1, $2, 'team_invite', $2) as changed`, [ids.otherTeam, ids.legacyGuardian]), (r) => r.rows[0].changed === false);
check('…and writes no audit event for it', (await auditFor(ids.legacyGuardian)).rows.filter((r) => r.table_name === 'coach_team').length === 1);
await asService(`select public.end_coach_assignment($1, $2, $3, 'Season over')`, [ids.otherTeam, ids.legacyGuardian, ids.staff]);
await expectOk('activate_coach_assignment reactivates an ended assignment', () =>
  asService(`select public.activate_coach_assignment($1, $2, 'team_invite', $2) as changed`, [ids.otherTeam, ids.legacyGuardian]), (r) => r.rows[0].changed === true);
const reinvited = await one(`select ended_at, end_reason, created_via, public.coach_assignment_is_active(ended_at, expires_at) as active
  from coach_team where team_id = $1 and profile_id = $2`, [ids.otherTeam, ids.legacyGuardian]);
check('the reactivated assignment is active with its end cleared and its creation details kept',
  reinvited.active === true && reinvited.ended_at === null && reinvited.end_reason === null && reinvited.created_via === 'team_invite');
await db.query(`update coach_team set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where team_id = $1 and profile_id = $2`, [ids.otherTeam, ids.legacyGuardian]);
await expectOk('activate_coach_assignment reactivates an expired assignment', () =>
  asService(`select public.activate_coach_assignment($1, $2, 'team_invite', $2) as changed`, [ids.otherTeam, ids.legacyGuardian]), (r) => r.rows[0].changed === true);
check('the reactivated expired assignment has no expiry and is active',
  (await one(`select expires_at, public.coach_assignment_is_active(ended_at, expires_at) as active from coach_team where team_id = $1 and profile_id = $2`,
    [ids.otherTeam, ids.legacyGuardian])).active === true);

// The team-request notification type is accepted by the outbox.
await expectOk('the outbox accepts a new_coach_team_request notification', () =>
  asService(`select public.enqueue_staff_notification('new_coach_team_request', 'new_coach_team_request:test', null, 'all_staff', '{}'::jsonb, '/staff/team-requests') as id`),
  (r) => r.rows[0].id !== null);

// ---------------------------------------------------------------------------
// Release readiness (the precondition 0089 will check)
// ---------------------------------------------------------------------------
const CONTRACT = 'authorization_relationships_v1';
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const confirm = (by, { commit = COMMIT, contract = CONTRACT, checks = [true, true, true, true, true, true] } = {}) =>
  asService(`select public.confirm_release_readiness($1, $2, $3, $4, $5, $6, $7, $8, $9) as confirmed_at`, [contract, commit, by, ...checks]);

for (const [role, uid] of [['authenticated', ids.requester], ['anon', null]]) {
  await expectError(`${role}: cannot read readiness records`, () =>
    as(role, uid, () => db.query(`select * from release_readiness_confirmations`)), 'permission denied');
  await expectError(`${role}: cannot insert a readiness record directly`, () =>
    as(role, uid, () => db.query(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
      values ($1, $2, $3, true, true, true, true, true, true)`, [CONTRACT, COMMIT, ids.staff])), 'permission denied');
  await expectError(`${role}: cannot call confirm_release_readiness`, () =>
    as(role, uid, () => db.query(`select public.confirm_release_readiness($1, $2, $3, true, true, true, true, true, true)`, [CONTRACT, COMMIT, ids.staff])), 'permission denied');
}
await expectError('service_role cannot insert a readiness record directly (only through the function)', () =>
  asService(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
    values ($1, $2, $3, true, true, true, true, true, true)`, [CONTRACT, COMMIT, ids.staff]), 'permission denied');
await expectError('a non-staff account cannot confirm readiness', () => confirm(ids.bystander), 'staff only');
for (let i = 0; i < 6; i++) {
  const checks = [true, true, true, true, true, true];
  checks[i] = false;
  await expectError(`smoke check #${i + 1} false is refused`, () => confirm(ids.staff, { checks }), 'Every smoke check');
  checks[i] = null;
  await expectError(`smoke check #${i + 1} missing is refused`, () => confirm(ids.staff, { checks }), 'Every smoke check');
}
await expectError('an empty application commit is refused', () => confirm(ids.staff, { commit: '   ' }), 'commit is required');
await expectError('a non-commit value is refused', () => confirm(ids.staff, { commit: 'main' }), 'git commit id');
await expectError('an unknown contract is refused', () => confirm(ids.staff, { contract: 'something_else' }), 'Unknown release contract');
check('no readiness record exists after refused attempts', (await one(`select count(*)::int n from release_readiness_confirmations`)).n === 0);

await expectOk('a staff member confirms readiness once', () => confirm(ids.staff, { commit: `  ${COMMIT.toUpperCase()} ` }), (r) => r.rows[0].confirmed_at !== null);
const readiness = await asService(`select contract, app_commit, confirmed_by, confirmed_at,
    check_card_claim and check_guardian_invite and check_team_invite and check_coach_invite and check_dual_view and check_team_request_flow as all_checks
  from release_readiness_confirmations`);
check('the record holds the contract, normalised commit, confirming staff account, a time and all six checks',
  readiness.rows.length === 1 && readiness.rows[0].contract === CONTRACT && readiness.rows[0].app_commit === COMMIT &&
  readiness.rows[0].confirmed_by === ids.staff && readiness.rows[0].confirmed_at !== null && readiness.rows[0].all_checks === true,
  JSON.stringify(readiness.rows));
await expectError('a second confirmation is refused (no replacement)', () => confirm(ids.staff, { commit: 'ffffffffffffffffffffffffffffffffffffffff' }), 'already confirmed');
await expectError('the record cannot be updated, even by the owner', () => db.query(`update release_readiness_confirmations set app_commit = 'ffffffff'`), 'append-only');
await expectError('the record cannot be deleted, even by the owner', () => db.query(`delete from release_readiness_confirmations`), 'append-only');
await expectError('the record cannot be truncated, even by the owner', () => db.query(`truncate release_readiness_confirmations`), 'append-only');
await expectError('service_role cannot update or delete it', () => asService(`delete from release_readiness_confirmations`), 'permission denied');
await expectError('a second row for the contract is impossible even for the owner (unique contract)', () =>
  db.query(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, confirmed_at, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
    values ($1, $2, $3, '2000-01-01', true, true, true, true, true, true)`, [CONTRACT, COMMIT, ids.staff]), 'release_readiness_confirmations_contract_key');
check('still exactly one readiness record', (await one(`select count(*)::int n from release_readiness_confirmations`)).n === 1);
check('the confirmation time is the database clock at insert (a supplied time is overwritten)', await (async () => {
  await db.exec('begin;');
  try {
    await db.exec(`alter table release_readiness_confirmations drop constraint release_readiness_confirmations_contract_key;`);
    const r = await db.query(`insert into release_readiness_confirmations (contract, app_commit, confirmed_by, confirmed_at, check_card_claim, check_guardian_invite, check_team_invite, check_coach_invite, check_dual_view, check_team_request_flow)
      values ($1, $2, $3, '2000-01-01', true, true, true, true, true, true) returning confirmed_at > now() - interval '1 minute' as stamped_now`, [CONTRACT, COMMIT, ids.staff]);
    return r.rows[0].stamped_now === true;
  } finally {
    await db.exec('rollback;');
  }
})());

// Append-only.
await expectError('audit events cannot be updated, even by the owner', () => db.query(`update relationship_audit_events set operation = 'x'`), 'append-only');
await expectError('audit events cannot be deleted, even by the owner', () => db.query(`delete from relationship_audit_events`), 'append-only');
await expectError('audit events cannot be truncated, even by the owner', () => db.query(`truncate relationship_audit_events`), 'append-only');
await expectError('service_role cannot delete audit events', () => asService(`delete from relationship_audit_events`), 'permission denied');
await expectError('a signed-in user cannot read audit events', () =>
  as('authenticated', ids.requester, () => db.query(`select 1 from relationship_audit_events`)), 'permission denied');

// ---------------------------------------------------------------------------
// Rollback: back to the exact 0087 catalog, pre-existing rows intact
// ---------------------------------------------------------------------------
await db.exec(`delete from coach_team where profile_id <> '${ids.legacyCoach}' or team_id <> '${ids.team}'; delete from guardians where profile_id <> '${ids.legacyGuardian}';
  delete from staff_notification_outbox where event_type = 'new_coach_team_request';`);
// A consumed coach invite whose redeemer has gone (used_at set, used_by NULL):
// an ordinary 0087 state too, so the rollback must not refuse because of it.
await db.query(`insert into coach_invites (player_id, code, created_by, used_at, used_by) values ($1, 'COACH-RBK00001', $2, now() - interval '1 day', null)`,
  [ids.player, ids.legacyGuardian]);
const consumedBefore = await one(`select used_at from coach_invites where code = 'COACH-RBK00001'`);
await expectOk('0088 rollback applies', () => db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8')));
const afterRollback = diffCatalog(catalog0087, await snapshotCatalog(db));
check('after rollback the public catalog equals 0087 exactly (no entry added, removed or changed)',
  afterRollback.added.length + afterRollback.removed.length + afterRollback.changed.length === 0,
  [...afterRollback.added.map((k) => `+${k}`), ...afterRollback.removed.map((k) => `-${k}`), ...afterRollback.changed.map((k) => `~${k}`)].join(', '));
check('after rollback the pre-existing coach_team and guardians rows are intact', JSON.stringify(await legacyRows()) === JSON.stringify(legacyBefore));
const consumedAfter = await one(`select used_at, used_by from coach_invites where code = 'COACH-RBK00001'`);
check('rollback succeeds with a consumed invite whose redeemer is gone, keeping used_at and used_by = NULL',
  consumedAfter.used_by === null && consumedAfter.used_at?.getTime() === consumedBefore.used_at?.getTime(), JSON.stringify(consumedAfter));
await expectOk('0088 re-applies cleanly after its rollback', () => applyMigrations(db, { from: '0088', through: '0088' }), (r) => r.length === 1);

await db.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} migration 0088 checks passed`);
if (failed.length) process.exitCode = 1;
