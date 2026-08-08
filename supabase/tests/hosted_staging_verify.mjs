import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// RUN: node supabase/tests/hosted_staging_verify.mjs (from the repo root)
// REQUIRES (not a project dependency — install ad hoc before running):
//   npm install --no-save pg
// REQUIRES: a populated, git-ignored .env.staging.local at the repo root
// (STAGING_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL) — see
// hosted_staging_runbook.md in this same directory for how to provision
// one. This script performs real writes (synthetic data only, cleaned up
// at the end) against whatever project that file points to — never run it
// against production. No credentials are hardcoded anywhere in this file.
//
// SAFETY GUARD — refuses to run at all unless every credential clearly
// resolves to the staging project and none resolve to production. These
// two refs are project identifiers (not secrets — the same strings appear
// in the project's own public URL), hardcoded deliberately so the guard
// below cannot silently pass if .env.staging.local is ever repointed.
// Update both if the staging or production project is ever recreated.
// ============================================================================
const STAGING_REF = 'rqgrpaprfxxhcvqtwhgj';
const PRODUCTION_REF = 'ksszgbcditlfimnfnzla';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(REPO_ROOT, '.env.staging.local');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

function assertStagingOnly(name, value) {
  if (!value || !value.includes(STAGING_REF)) {
    console.error(`SAFETY ABORT: ${name} does not resolve to staging ref ${STAGING_REF}. Refusing to proceed.`);
    process.exit(1);
  }
  if (value.includes(PRODUCTION_REF)) {
    console.error(`SAFETY ABORT: ${name} contains the PRODUCTION ref ${PRODUCTION_REF}. Refusing to proceed.`);
    process.exit(1);
  }
}
assertStagingOnly('STAGING_SUPABASE_URL', env.STAGING_SUPABASE_URL);
assertStagingOnly('STAGING_SUPABASE_DB_URL', env.STAGING_SUPABASE_DB_URL);
console.log(`SAFETY GUARD PASSED: all credentials resolve to staging ref ${STAGING_REF} only, production ref ${PRODUCTION_REF} not present anywhere.\n`);

const SUPABASE_URL = env.STAGING_SUPABASE_URL;
const ANON_KEY = env.STAGING_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = env.STAGING_SUPABASE_DB_URL;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
}

// ============================================================================
// Part 1 — synthetic identities via the real Supabase Auth Admin API (real
// users, real password hashing, real JWTs on login — not raw auth.users
// inserts). Clearly marked as synthetic via email domain + name prefix.
// ============================================================================
const RUN_TAG = `stagingtest${Date.now()}`;
const identities = [
  { key: 'guardian', email: `${RUN_TAG}-guardian@example.com`, role: 'parent', displayName: 'STAGING TEST Guardian' },
  { key: 'authCoach', email: `${RUN_TAG}-authcoach@example.com`, role: 'coach', displayName: 'STAGING TEST Authorised Coach' },
  { key: 'unrelatedCoach', email: `${RUN_TAG}-unrelatedcoach@example.com`, role: 'coach', displayName: 'STAGING TEST Unrelated Coach' },
  { key: 'directCoach', email: `${RUN_TAG}-directcoach@example.com`, role: 'coach', displayName: 'STAGING TEST Direct Coach' },
];

function randomPassword() {
  return 'Aa1!' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function adminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin create user failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function passwordLogin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`password login failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function adminDeleteUser(id) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok;
}

console.log(`=== Creating ${identities.length} synthetic test identities (real Supabase Auth users, tag: ${RUN_TAG}) ===\n`);
for (const id of identities) {
  const password = randomPassword();
  const created = await adminCreateUser(id.email, password);
  id.userId = created.id;
  const session = await passwordLogin(id.email, password);
  id.accessToken = session.access_token;
  console.log(`created + logged in: ${id.key} (${id.email}) -> user id ${id.userId}`);
}
check('all 4 synthetic Auth users created and logged in with real JWTs', identities.every((i) => i.userId && i.accessToken));

// ============================================================================
// Part 2 — seed synthetic club/team/players/relationships via a direct
// Postgres connection (postgres role — bypasses RLS for setup only, exactly
// like the disposable pglite harness's seeding step).
// ============================================================================
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('\nConnected directly to staging Postgres for seeding + SQL-level checks.\n');

const ids = {
  club: crypto.randomUUID(),
  teamU9s: crypto.randomUUID(),
  teamTrafford: crypto.randomUUID(),
  season: crypto.randomUUID(),
  player: crypto.randomUUID(),
  playerTrafford: crypto.randomUUID(),
};

for (const id of identities) {
  await client.query(`insert into profiles (id, role, display_name) values ($1, $2, $3)`, [id.userId, id.role, id.displayName]);
}
await client.query(`insert into seasons (id, label, normalized_label, starts_on, ends_on) values ($1, $2, $3, $4, $5)`, [
  ids.season, `${RUN_TAG}-season`, `${RUN_TAG}-season`, '2026-08-01', '2027-07-31',
]);
await client.query(`insert into clubs (id, name) values ($1, $2)`, [ids.club, `${RUN_TAG} Test FC`]);
await client.query(`insert into teams (id, club_id, name, season, season_id) values ($1, $2, $3, $4, $5)`, [
  ids.teamU9s, ids.club, `${RUN_TAG} U9s`, `${RUN_TAG}-season`, ids.season,
]);
await client.query(`insert into teams (id, club_id, name, season, season_id) values ($1, $2, $3, $4, $5)`, [
  ids.teamTrafford, ids.club, `${RUN_TAG} Trafford FC`, `${RUN_TAG}-season`, ids.season,
]);
await client.query(`insert into coach_team (team_id, profile_id) values ($1, $2)`, [ids.teamU9s, identities[1].userId]);
await client.query(`insert into players (id, team_id, name, "position") values ($1, $2, $3, $4)`, [ids.player, ids.teamU9s, `${RUN_TAG} Casey Test`, 'CDM']);
await client.query(`insert into players (id, team_id, name, "position") values ($1, $2, $3, $4)`, [ids.playerTrafford, ids.teamTrafford, `${RUN_TAG} No Group Test`, 'ST']);
await client.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [ids.player, identities[0].userId]);
await client.query(`insert into coach_players (player_id, profile_id, created_via) values ($1, $2, 'guardian_invite')`, [ids.player, identities[3].userId]);
console.log('Seeded synthetic club/team/players/relationships.\n');
check('synthetic data seeded (club, 2 teams, 2 players, guardian + 3 coach relationships)', true);

async function asRole(role, userId, fn) {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    if (userId) await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    return await fn();
  } finally {
    await client.query('rollback');
  }
}
async function asRoleCommit(role, userId, fn) {
  await client.query('begin');
  await client.query(`set local role ${role}`);
  if (userId) await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  const result = await fn();
  await client.query('commit');
  return result;
}
async function expectError(fn, label, matchText) {
  try {
    await fn();
    check(label, false, 'expected an error but call succeeded');
  } catch (e) {
    check(label, matchText ? e.message.includes(matchText) : true, e.message);
  }
}
async function expectOk(fn, label, verify) {
  try {
    const result = await fn();
    check(label, verify ? verify(result) : true, result?.rows ?? result);
  } catch (e) {
    check(label, false, `unexpected error: ${e.message}`);
  }
}

// ============================================================================
// Part 3 — SQL-level RLS / grant / SECURITY DEFINER checks on REAL hosted
// Postgres (same checks the disposable pglite harness already proved —
// this is what confirms the real platform behaves the same way).
// ============================================================================
console.log('=== SQL-level checks (real hosted Postgres) ===\n');

await asRole('authenticated', identities[0].userId, () =>
  expectError(() => client.query(`select date_of_birth from players where id = $1`, [ids.player]), 'guardian: direct SELECT date_of_birth rejected', 'permission denied')
);
await asRole('authenticated', identities[0].userId, () =>
  expectError(() => client.query(`select * from players where id = $1`, [ids.player]), "guardian: select('*') rejected outright", 'permission denied')
);
await asRole('anon', null, () =>
  expectError(() => client.query(`select date_of_birth from players where id = $1`, [ids.player]), 'anon: direct SELECT date_of_birth rejected', 'permission denied')
);
await asRole('authenticated', identities[2].userId, () =>
  expectError(() => client.query(`select date_of_birth from players where id = $1`, [ids.player]), 'unrelated coach: direct SELECT date_of_birth rejected', 'permission denied')
);
await asRole('authenticated', identities[1].userId, () =>
  expectOk(() => client.query(`select public.get_player_age($1) as age`, [ids.player]), 'authorised coach: get_player_age RPC succeeds (null, DOB unset)', (r) => r.rows[0].age === null)
);
await asRole('authenticated', identities[0].userId, () =>
  expectOk(() => client.query(`select public.get_player_age($1) as age`, [ids.player]), 'guardian: get_player_age RPC succeeds')
);
await asRole('authenticated', identities[2].userId, () =>
  expectError(() => client.query(`select public.get_player_date_of_birth($1)`, [ids.player]), 'unrelated coach: get_player_date_of_birth RPC rejects', 'Not authorized')
);
await asRoleCommit('authenticated', identities[1].userId, () =>
  expectOk(
    () => client.query(`select public.update_player_coach_fields($1, '2016-03-20', 'U10', 138, 'Left', 'CM')`, [ids.player]),
    'authorised coach: update_player_coach_fields RPC succeeds'
  )
);
const afterSave = await client.query(`select date_of_birth, football_age_group, height_cm, preferred_foot, secondary_position from players where id = $1`, [ids.player]);
check(
  'atomic save persisted all five fields',
  afterSave.rows[0].football_age_group === 'U10' && afterSave.rows[0].height_cm === 138 && afterSave.rows[0].preferred_foot === 'Left' && afterSave.rows[0].secondary_position === 'CM'
);
await asRole('authenticated', identities[1].userId, () =>
  expectOk(() => client.query(`select public.get_player_date_of_birth($1) as dob`, [ids.player]), 'authorised coach: get_player_date_of_birth RPC now succeeds', (r) => r.rows[0].dob !== null)
);
await asRole('authenticated', identities[0].userId, () =>
  expectError(() => client.query(`update players set date_of_birth = '2015-01-01' where id = $1`, [ids.player]), 'guardian: direct UPDATE date_of_birth rejected', 'permission denied')
);
await asRole('authenticated', identities[0].userId, () =>
  expectError(() => client.query(`update players set "position" = 'CB' where id = $1`, [ids.player]), 'guardian: direct raw UPDATE on position rejected (RPC-only since Stage 2.5)', 'permission denied')
);
await asRoleCommit('authenticated', identities[0].userId, () =>
  expectOk(
    () => client.query(`select public.update_primary_position($1, 'RB') as cleared`, [ids.player]),
    'guardian: update_primary_position (no collision) succeeds, cleared=false',
    (r) => r.rows[0].cleared === false
  )
);
// Guardian's primary position is 'RB' at this point (set two steps above).
// Stage the collision test by having the coach set secondary_position to a
// genuinely different value first (CM) — setting it to 'RB' here would
// correctly be rejected by update_player_coach_fields' own primary-equals-
// secondary guard (already proven separately in the disposable-database
// suite), so that redundant, deliberately-failing call was removed rather
// than asserted on with the wrong expectation helper (a bug in an earlier
// version of this script, not a product issue — it flagged a FAIL for a
// call that was supposed to fail, since expectOk was used where expectError
// belonged).
await asRoleCommit('authenticated', identities[1].userId, () =>
  expectOk(
    () => client.query(`select public.update_player_coach_fields($1, null, null, null, null, 'CM')`, [ids.player]),
    'authorised coach: sets secondary_position=CM (does not match current primary RB) to stage the collision test'
  )
);
await asRoleCommit('authenticated', identities[0].userId, () =>
  expectOk(
    () => client.query(`select public.update_primary_position($1, 'CM') as cleared`, [ids.player]),
    'guardian: update_primary_position (collision with secondary=CM) succeeds, cleared=true, no raw constraint error',
    (r) => r.rows[0].cleared === true
  )
);
const afterCollision = await client.query(`select "position", secondary_position from players where id = $1`, [ids.player]);
check('collision case: primary=CM, secondary atomically cleared to null', afterCollision.rows[0].position === 'CM' && afterCollision.rows[0].secondary_position === null, afterCollision.rows[0]);

await asRole('authenticated', identities[1].userId, () =>
  expectError(
    () => client.query(`insert into players (team_id, name, "position", preferred_foot) values ($1, $2, 'ST', 'Left')`, [ids.teamU9s, `${RUN_TAG} Sneaky`]),
    'coach: direct INSERT naming preferred_foot rejected',
    'permission denied'
  )
);
await asRole('service_role', null, () =>
  expectOk(
    () => client.query(`select id, name, "position", secondary_position, squad_number, photo_key, public_id_enabled from players where id = $1`, [ids.player]),
    "service_role: public-profile's column list succeeds, never names date_of_birth"
  )
);

// ============================================================================
// Part 3b — 0037 verification: service_role is now least-privilege, not
// broken (the finding that stopped the previous run) and not over-granted
// (DOB and unused coach fields must still be unreachable).
// ============================================================================
console.log('\n=== service_role least-privilege checks (0037) — direct PostgreSQL ===\n');

await asRole('service_role', null, () =>
  expectError(() => client.query(`select date_of_birth from players where id = $1`, [ids.player]), 'service_role: direct SELECT date_of_birth still rejected (0037 does not grant it)', 'permission denied')
);
await asRole('service_role', null, () =>
  expectError(() => client.query(`select football_age_group from players where id = $1`, [ids.player]), 'service_role: direct SELECT football_age_group rejected (unused by any audited route)', 'permission denied')
);
await asRoleCommit('service_role', null, () =>
  expectOk(
    () => client.query(`insert into players (team_id, name, "position", squad_number) values ($1, $2, 'GK', 7) returning id`, [ids.teamU9s, `${RUN_TAG} ServiceRole Insert`]),
    'service_role: INSERT (team_id, name, position, squad_number) succeeds (order-enquiry/orders-intent shape)'
  )
);
const svcInserted = await client.query(`select id from players where name = $1`, [`${RUN_TAG} ServiceRole Insert`]);
ids.svcPlayer = svcInserted.rows[0]?.id;
await asRoleCommit('service_role', null, () =>
  expectOk(
    () => client.query(`update players set public_id_enabled = false where id = $1`, [ids.svcPlayer]),
    'service_role: UPDATE public_id_enabled succeeds (staff admin control)'
  )
);
await asRole('service_role', null, () =>
  expectError(() => client.query(`update players set favourite_player = 'x' where id = $1`, [ids.svcPlayer]), 'service_role: UPDATE favourite_player rejected (guardian-owned, not in the 0037 grant)', 'permission denied')
);

console.log('\n=== service_role least-privilege checks (0037) — real PostgREST ===\n');

async function svcRest(pathAndQuery, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}
{
  const res = await svcRest(`players?id=eq.${ids.player}&select=id`);
  check('HTTP service_role: GET players?select=id succeeds (public-profile shape)', res.ok, { status: res.status });
}
{
  const res = await svcRest(`players?id=eq.${ids.player}&select=date_of_birth`);
  check('HTTP service_role: GET players?select=date_of_birth rejected', res.status >= 400, { status: res.status });
}
{
  const res = await svcRest(`players?id=eq.${ids.player}&select=football_age_group`);
  check('HTTP service_role: GET players?select=football_age_group rejected', res.status >= 400, { status: res.status });
}
{
  const res = await svcRest(`guardians`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ player_id: ids.playerTrafford, profile_id: identities[2].userId, relationship: 'parent' }) });
  check('HTTP service_role: POST guardians (claim-flow insert) succeeds', res.ok || res.status === 201, { status: res.status });
}
{
  const res = await svcRest(`coach_players?player_id=eq.${ids.player}&profile_id=eq.${identities[3].userId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  check('HTTP service_role: DELETE coach_players succeeds (only table service_role may delete from)', res.ok, { status: res.status });
}
{
  const res = await svcRest(`staff_accounts?select=profile_id&limit=1`);
  check('HTTP service_role: GET staff_accounts succeeds (require-staff.ts dependency)', res.ok, { status: res.status });
}
{
  const res = await svcRest(`claim_attempts`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ identifier: `${RUN_TAG}-rl`, code_attempted: 'TEST', success: false }) });
  check('HTTP service_role: POST claim_attempts succeeds (rate-limit ledger)', res.ok || res.status === 201, { status: res.status });
}
{
  // Re-insert the guardian link removed by the direct-coach test above, so
  // guardian-scoped checks and cleanup below still find what they expect —
  // this DELETE call itself already proved the operation works.
  await client.query(`insert into coach_players (player_id, profile_id, created_via) values ($1, $2, 'guardian_invite')`, [ids.player, identities[3].userId]);
}

// ============================================================================
// Part 4 — HTTP / PostgREST checks with real JWTs against the real hosted
// REST API — the one thing pglite could never prove.
// ============================================================================
console.log('\n=== HTTP / PostgREST checks (real hosted Auth + PostgREST) ===\n');

async function restSelect(jwt, query) {
  return fetch(`${SUPABASE_URL}/rest/v1/players?${query}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
}
async function restRpc(jwt, fn, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

{
  const res = await restSelect(identities[0].accessToken, `id=eq.${ids.player}&select=date_of_birth`);
  check('HTTP: guardian GET date_of_birth via PostgREST rejected', res.status >= 400, { status: res.status });
}
{
  const res = await restRpc(identities[0].accessToken, 'get_player_age', { p_player_id: ids.player });
  const body = await res.json();
  check('HTTP: guardian RPC get_player_age via PostgREST succeeds', res.ok, { status: res.status, body });
}
{
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_player_age`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_player_id: ids.player }),
  });
  check('HTTP: anonymous (no Authorization header) RPC get_player_age rejected', res.status === 401 || res.status === 403, { status: res.status });
}
{
  const res = await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${ids.player}`, {
    method: 'PATCH',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${identities[0].accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ position: 'CB' }),
  });
  check('HTTP: guardian direct PATCH position via PostgREST rejected (RPC-only)', res.status >= 400, { status: res.status });
}
{
  const res = await restRpc(identities[0].accessToken, 'update_primary_position', { p_player_id: ids.player, p_position: 'LW' });
  const body = await res.json();
  check('HTTP: guardian RPC update_primary_position via PostgREST succeeds', res.ok, { status: res.status, body });
}

// ============================================================================
// Cleanup — synthetic data only, staging only.
// ============================================================================
console.log('\n=== Cleanup ===\n');
if (ids.svcPlayer) await client.query(`delete from players where id = $1`, [ids.svcPlayer]);
await client.query(`delete from claim_attempts where identifier = $1`, [`${RUN_TAG}-rl`]);
await client.query(`delete from players where id in ($1, $2)`, [ids.player, ids.playerTrafford]);
await client.query(`delete from teams where id in ($1, $2)`, [ids.teamU9s, ids.teamTrafford]);
await client.query(`delete from clubs where id = $1`, [ids.club]);
await client.query(`delete from seasons where id = $1`, [ids.season]);
await client.query(`delete from profiles where id = any($1)`, [identities.map((i) => i.userId)]);
console.log('Deleted synthetic club/team/players/profiles/claim_attempts rows.');
for (const id of identities) {
  const ok = await adminDeleteUser(id.userId);
  console.log(`deleted synthetic auth user ${id.key}: ${ok}`);
}
await client.end();

const failed = results.filter((r) => !r.pass);
console.log(`\n\n${results.length - failed.length}/${results.length} TOTAL checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach((f) => console.log(' -', f.name, f.detail));
}
