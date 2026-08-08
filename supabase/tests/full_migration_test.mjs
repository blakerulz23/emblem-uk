import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// SCOPE NOTE (read before trusting any PASS below): this harness proves
// PostgreSQL-level behaviour only — real grants, real RLS, real SECURITY
// DEFINER functions, real CHECK constraints, running on real Postgres
// (pglite is PostgreSQL compiled to WASM, not a mock). It does NOT exercise
// Supabase Auth, PostgREST's request handling, or RLS as PostgREST actually
// evaluates it against a live hosted project — those remain unverified
// until run on a Supabase-hosted staging branch (see hosted_staging_verify.mjs
// and hosted_staging_runbook.md in this same directory tree). Every "PASS"
// in this file's output should be read as "proven at the Postgres layer",
// not "proven in production."
//
// RUN: node supabase/tests/full_migration_test.mjs
// REQUIRES (not a project dependency — install ad hoc before running):
//   npm install --no-save @electric-sql/pglite
// Fully disposable — creates an in-memory Postgres instance, never touches
// any real project, needs no credentials of any kind.
// ============================================================================

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
}

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec('create extension if not exists pgcrypto;');

// --- Minimal Supabase-compatible stubs (auth schema + roles) ---
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create or replace function auth.email() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
  create publication supabase_realtime;
  -- Matches real Supabase's own project-level default privileges (outside
  -- any migration file in this repo) — confirmed empirically to be the
  -- origin of authenticated's baseline SELECT/INSERT/UPDATE on every table.
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
`);
console.log('Stubbed auth schema + roles.\n');

// --- Apply every pre-existing migration (0001..0035), then stop before the
// new staged migrations so test data can be seeded into the pre-migration
// shape first (Stage 1's own backfill UPDATE needs "U9s" to already exist). ---
const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const pre0036 = files.filter((f) => !f.startsWith('0036') && !f.startsWith('0037') && !f.startsWith('0038') && !f.startsWith('0039'));
const migrationSecureExpand = files.find((f) => f.startsWith('0036')); // Stage 1
const migrationServiceRole = files.find((f) => f.startsWith('0037')); // Stage 1 (bundled, orthogonal)
const migrationPositionLock = files.find((f) => f.startsWith('0038')); // Stage 2.5
const migrationContract = files.find((f) => f.startsWith('0039')); // Stage 3 (optional/deferred)

for (const f of pre0036) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
  try {
    await db.exec(sql);
  } catch (e) {
    console.log(`MIGRATION FAILED: ${f} —`, e.message);
    process.exit(1);
  }
}
console.log(`Applied ${pre0036.length} pre-0036 migrations cleanly.\n`);

// ============================================================================
// Baseline — actual effective grants BEFORE Stage 1, exactly as a fresh
// Supabase project + this repo's own migration history would leave them.
// ============================================================================
const grantsBefore = await db.query(`
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_name = 'players' and grantee in ('anon','authenticated','service_role')
  order by grantee, privilege_type;
`);
console.log('=== Effective table-level grants on players BEFORE Stage 1 (fresh-project baseline) ===');
console.log(grantsBefore.rows);
check(
  'authenticated has table-level SELECT before Stage 1 (this is exactly what makes a column-level REVOKE alone ineffective)',
  grantsBefore.rows.some((r) => r.grantee === 'authenticated' && r.privilege_type === 'SELECT')
);
check(
  'authenticated has table-level UPDATE before Stage 1 (this is what would let a guardian PATCH coach-owned columns directly)',
  grantsBefore.rows.some((r) => r.grantee === 'authenticated' && r.privilege_type === 'UPDATE')
);
check(
  'authenticated has table-level INSERT before Stage 1 (this is what would let a coach set coach-owned columns at row creation)',
  grantsBefore.rows.some((r) => r.grantee === 'authenticated' && r.privilege_type === 'INSERT')
);

// ============================================================================
// Seed test data BEFORE Stage 1.
// ============================================================================
const ids = {
  club: '00000000-0000-0000-0000-000000000001',
  teamU9s: '00000000-0000-0000-0000-000000000002',
  teamTrafford: '00000000-0000-0000-0000-000000000003',
  season: '00000000-0000-0000-0000-000000000004',
  guardianUser: '00000000-0000-0000-0000-000000000010',
  authCoachUser: '00000000-0000-0000-0000-000000000011',
  unrelatedCoachUser: '00000000-0000-0000-0000-000000000012',
  directCoachUser: '00000000-0000-0000-0000-000000000013',
  player: '00000000-0000-0000-0000-000000000020',
  playerTrafford: '00000000-0000-0000-0000-000000000021',
};

await db.exec(`
  insert into auth.users (id, email) values
    ('${ids.guardianUser}', 'guardian@test.dev'),
    ('${ids.authCoachUser}', 'authcoach@test.dev'),
    ('${ids.unrelatedCoachUser}', 'unrelatedcoach@test.dev'),
    ('${ids.directCoachUser}', 'directcoach@test.dev');

  insert into profiles (id, role, display_name) values
    ('${ids.guardianUser}', 'parent', 'Test Guardian'),
    ('${ids.authCoachUser}', 'coach', 'Authorised Coach'),
    ('${ids.unrelatedCoachUser}', 'coach', 'Unrelated Coach'),
    ('${ids.directCoachUser}', 'coach', 'Direct Coach');

  insert into seasons (id, label, normalized_label, starts_on, ends_on) values
    ('${ids.season}', '2026/27', '2026/27-test', '2026-08-01', '2027-07-31');

  insert into clubs (id, name) values ('${ids.club}', 'Test FC');
  insert into teams (id, club_id, name, season, season_id) values
    ('${ids.teamU9s}', '${ids.club}', 'U9s', '2026/27', '${ids.season}');
  insert into teams (id, club_id, name, season, season_id) values
    ('${ids.teamTrafford}', '${ids.club}', 'Trafford FC', '2026/27', '${ids.season}');

  insert into coach_team (team_id, profile_id) values ('${ids.teamU9s}', '${ids.authCoachUser}');

  insert into players (id, team_id, name, "position") values
    ('${ids.player}', '${ids.teamU9s}', 'Casey Test', 'CDM');
  insert into players (id, team_id, name, "position") values
    ('${ids.playerTrafford}', '${ids.teamTrafford}', 'No Group Test', 'ST');

  insert into guardians (player_id, profile_id) values ('${ids.player}', '${ids.guardianUser}');
  insert into coach_players (player_id, profile_id, created_via) values ('${ids.player}', '${ids.directCoachUser}', 'guardian_invite');
`);
console.log('Seeded test data (guardian, 3 coaches, 2 teams incl. "U9s", 2 players).\n');

// ============================================================================
// STAGE 1 — secure expand: new columns, new functions, the backfill, AND
// the grant lockdown, all in this one migration. There must be no interval
// in which the new columns exist without their protective grants.
// ============================================================================
const sqlSecureExpand = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationSecureExpand), 'utf8');
try {
  await db.exec(sqlSecureExpand);
  console.log(`Applied Stage 1 (${migrationSecureExpand}) cleanly.\n`);
} catch (e) {
  console.log(`STAGE 1 (${migrationSecureExpand}) FAILED TO APPLY:`, e.message);
  process.exit(1);
}

// Bundled at Stage 1 alongside the file above — orthogonal, additive, safe
// to apply in the same window (see that migration's own header).
const sqlServiceRole = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationServiceRole), 'utf8');
try {
  await db.exec(sqlServiceRole);
  console.log(`Applied Stage 1 service-role fix (${migrationServiceRole}) cleanly.\n`);
} catch (e) {
  console.log(`STAGE 1 service-role fix (${migrationServiceRole}) FAILED TO APPLY:`, e.message);
  process.exit(1);
}

// ============================================================================
// U9s backfill resolution, and constraint-against-real-data audit.
// ============================================================================
const backfillCheck = await db.query(`select id, football_age_group from players where id in ('${ids.player}', '${ids.playerTrafford}');`);
const casey = backfillCheck.rows.find((r) => r.id === ids.player);
const noGroup = backfillCheck.rows.find((r) => r.id === ids.playerTrafford);
check('U9s team backfills to football_age_group = U9 (NOT left null)', casey?.football_age_group === 'U9', casey);
check('Trafford FC (no digit) correctly stays null', noGroup?.football_age_group === null, noGroup);

// ============================================================================
// ZERO-EXPOSURE-WINDOW CHECK — the central point of this revision: grants
// must already be locked down the instant Stage 1 finishes, not in some
// later migration. date_of_birth exists now (added by this same file) and
// must already be unreachable, in this same transaction-of-checks.
// ============================================================================
async function asRole(role, userId, fn) {
  await db.exec('begin;');
  try {
    await db.exec(`set local role ${role};`);
    if (userId) {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [userId]);
    }
    return await fn();
  } finally {
    await db.exec('rollback;');
  }
}
async function asRoleCommit(role, userId, fn) {
  await db.exec('begin;');
  await db.exec(`set local role ${role};`);
  if (userId) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [userId]);
  }
  const result = await fn();
  await db.exec('commit;');
  return result;
}
function dateStartsWith(value, expectedDatePrefix) {
  const iso = value instanceof Date ? value.toISOString() : String(value);
  return iso.startsWith(expectedDatePrefix);
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

await asRole('authenticated', ids.guardianUser, () =>
  expectError(() => db.query(`select date_of_birth from players where id = $1;`, [ids.player]), 'ZERO-WINDOW: guardian cannot SELECT date_of_birth immediately after Stage 1 (no gap)', 'permission denied')
);
await asRole('authenticated', ids.guardianUser, () =>
  expectError(() => db.query(`select * from players where id = $1;`, [ids.player]), "ZERO-WINDOW: an old select('*') fails immediately after Stage 1, not deferred to a later contract migration", 'permission denied')
);
await asRole('authenticated', ids.guardianUser, () =>
  expectError(() => db.query(`update players set date_of_birth = '2015-01-01' where id = $1;`, [ids.player]), 'ZERO-WINDOW: guardian cannot UPDATE date_of_birth immediately after Stage 1', 'permission denied')
);
await asRole('authenticated', ids.authCoachUser, () =>
  expectError(
    () => db.query(`insert into players (team_id, name, date_of_birth) values ($1, 'Sneaky Player', '2016-01-01');`, [ids.teamU9s]),
    'ZERO-WINDOW: coach cannot INSERT naming date_of_birth immediately after Stage 1',
    'permission denied'
  )
);

// Stage-0-compatibility check: age/height stay grantable through Stage 1
// (a not-yet-replaced Stage 0 app instance's explicit SELECT still names
// them) — only Stage 3's DROP COLUMN retires them, not a grant change.
await asRole('authenticated', ids.guardianUser, () =>
  expectOk(() => db.query(`select age, height from players where id = $1;`, [ids.player]), 'Stage-0-compat: authenticated can still SELECT age/height after Stage 1 (kept grantable for a not-yet-replaced Stage 0 instance)')
);

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed so far (zero-exposure-window)\n`);

// ============================================================================
// Role-impersonation verification, same disposable database.
// ============================================================================
console.log('\n=== Role-impersonation tests ===\n');

await asRole('authenticated', ids.unrelatedCoachUser, () =>
  expectError(() => db.query(`select date_of_birth from players where id = $1;`, [ids.player]), 'unrelated coach: direct SELECT date_of_birth rejected', 'permission denied')
);
await asRole('anon', null, () =>
  expectError(() => db.query(`select date_of_birth from players where id = $1;`, [ids.player]), 'anon: direct SELECT date_of_birth rejected', 'permission denied')
);

// --- Authorized coach obtains DOB only through the RPC ---
await asRole('authenticated', ids.authCoachUser, () =>
  expectError(() => db.query(`select date_of_birth from players where id = $1;`, [ids.player]), 'authorised coach: direct SELECT date_of_birth STILL rejected (must use the RPC)', 'permission denied')
);
// Seed a real DOB first (as db owner, bypassing RLS/grants entirely — just test setup).
await db.query(`update players set date_of_birth = '2016-03-20' where id = $1;`, [ids.player]);
await asRole('authenticated', ids.authCoachUser, () =>
  expectOk(() => db.query(`select public.get_player_date_of_birth($1) as dob;`, [ids.player]), 'authorised coach: get_player_date_of_birth RPC succeeds', (r) => dateStartsWith(r.rows[0].dob, '2016-03-20'))
);
await asRole('authenticated', ids.directCoachUser, () =>
  expectOk(() => db.query(`select public.get_player_date_of_birth($1) as dob;`, [ids.player]), 'directly-connected coach: get_player_date_of_birth RPC also succeeds (coach_players path)', (r) => dateStartsWith(r.rows[0].dob, '2016-03-20'))
);
await asRole('authenticated', ids.unrelatedCoachUser, () =>
  expectError(() => db.query(`select public.get_player_date_of_birth($1) as dob;`, [ids.player]), 'unrelated coach: get_player_date_of_birth RPC rejects', 'Not authorized')
);

// --- Guardian receives calculated age ---
await asRole('authenticated', ids.guardianUser, () =>
  expectOk(() => db.query(`select public.get_player_age($1) as age;`, [ids.player]), 'guardian: get_player_age RPC succeeds', (r) => typeof r.rows[0].age === 'number')
);

// --- Guardian cannot directly update any coach-owned field ---
for (const [col, val] of [
  ['date_of_birth', "'2015-01-01'"],
  ['football_age_group', "'U11'"],
  ['height_cm', '140'],
  ['preferred_foot', "'Left'"],
  ['secondary_position', "'ST'"],
]) {
  await asRole('authenticated', ids.guardianUser, () =>
    expectError(() => db.query(`update players set ${col} = ${val} where id = $1;`, [ids.player]), `guardian: direct UPDATE ${col} rejected`, 'permission denied')
  );
}

// --- Authorised coach can atomically update all five fields ---
await asRoleCommit('authenticated', ids.authCoachUser, () =>
  expectOk(
    () => db.query(`select public.update_player_coach_fields($1, '2016-03-20', 'U10', 138, 'Left', 'CM');`, [ids.player]),
    'authorised coach: update_player_coach_fields RPC succeeds'
  )
);
const afterCoachSave = await db.query(`select date_of_birth, football_age_group, height_cm, preferred_foot, secondary_position, coach_fields_updated_at from players where id = $1;`, [ids.player]);
check(
  'atomic save: all five fields (+ coach_fields_updated_at) persisted together',
  afterCoachSave.rows[0].football_age_group === 'U10' &&
    afterCoachSave.rows[0].height_cm === 138 &&
    afterCoachSave.rows[0].preferred_foot === 'Left' &&
    afterCoachSave.rows[0].secondary_position === 'CM' &&
    afterCoachSave.rows[0].coach_fields_updated_at !== null,
  afterCoachSave.rows[0]
);

// --- Unrelated coach cannot update them (via RPC or directly) ---
await asRole('authenticated', ids.unrelatedCoachUser, () =>
  expectError(
    () => db.query(`select public.update_player_coach_fields($1, '2015-01-01', 'U11', 140, 'Right', 'ST');`, [ids.player]),
    'unrelated coach: update_player_coach_fields RPC rejects',
    'Not authorized'
  )
);

// --- validation: server-side rejects bad input even from an authorised coach ---
await asRole('authenticated', ids.authCoachUser, () =>
  expectError(
    () => db.query(`select public.update_player_coach_fields($1, '2099-01-01', null, null, null, null);`, [ids.player]),
    'authorised coach: future date of birth rejected server-side',
    'future'
  )
);
await asRole('authenticated', ids.authCoachUser, () =>
  expectError(
    () => db.query(`select public.update_player_coach_fields($1, null, null, null, null, 'CDM');`, [ids.player]),
    "authorised coach: secondary position equal to primary ('CDM', still the seeded position — unchanged until the update_primary_position tests below) rejected server-side",
    'cannot match'
  )
);

// --- Public profile path (service_role) never exposes DOB ---
await asRole('service_role', null, () =>
  expectOk(
    () => db.query(`select id, name, "position", secondary_position, squad_number, photo_key, public_id_enabled from players where id = $1;`, [ids.player]),
    'service_role: public-profile\'s exact column list succeeds and (by inspection) never names date_of_birth'
  )
);

// --- Allowed guardian profile updates still work ---
await asRole('authenticated', ids.guardianUser, () =>
  expectOk(
    () => db.query(`update players set favourite_player = 'Seedorf', football_ambition = 'Play academy football' where id = $1;`, [ids.player]),
    'guardian: favourite_player/football_ambition update still works'
  )
);
await asRole('authenticated', ids.guardianUser, () =>
  expectOk(() => db.query(`update players set photo_key = 'os-players/test/photo.jpg' where id = $1;`, [ids.player]), 'guardian: photo_key update still works')
);

// ============================================================================
// update_primary_position — item 3's fix (atomic collision handling).
// Created in Stage 1, but Stage 1 deliberately does NOT yet revoke the raw
// table-level UPDATE grant on "position" — Stage 0's app instance is still
// assumed live at this point in the sequence and still calls a raw
// `.update()`. This section proves the FUNCTION's own behaviour is correct
// regardless of grants; the raw path itself is only closed later, after
// Stage 2.5 (0037_player_position_permission_lock.sql) applies — see that
// section below, not here.
// ============================================================================
console.log('\n=== update_primary_position (position/secondary-position collision fix) ===\n');

// Stage-0-compatibility check: the raw UPDATE grant on "position" is
// deliberately still present after Stage 1 alone (see this file's header
// for why) — a not-yet-replaced Stage 0 instance must keep working.
await asRoleCommit('authenticated', ids.guardianUser, () =>
  expectOk(() => db.query(`update players set "position" = 'CDM' where id = $1;`, [ids.player]), 'Stage-0-compat: authenticated can still raw-UPDATE "position" after Stage 1 alone (Stage 2.5 has not run yet)')
);

// Scenario A — primary position changes to something that does NOT collide
// with the current secondary_position (currently 'CM', set by the coach
// save above). Secondary must be preserved untouched, function returns false.
await asRoleCommit('authenticated', ids.guardianUser, () =>
  expectOk(
    () => db.query(`select public.update_primary_position($1, 'RB') as cleared;`, [ids.player]),
    'guardian: update_primary_position (no collision) succeeds and reports cleared=false',
    (r) => r.rows[0].cleared === false
  )
);
const afterNonCollision = await db.query(`select "position", secondary_position from players where id = $1;`, [ids.player]);
check(
  'no-collision case: primary position updated, secondary_position preserved',
  afterNonCollision.rows[0].position === 'RB' && afterNonCollision.rows[0].secondary_position === 'CM',
  afterNonCollision.rows[0]
);

// Scenario B — guardian changes primary position to exactly the current
// secondary_position ('CM'). Must not surface a raw constraint error: the
// function clears secondary_position atomically and reports cleared=true.
await asRoleCommit('authenticated', ids.guardianUser, () =>
  expectOk(
    () => db.query(`select public.update_primary_position($1, 'CM') as cleared;`, [ids.player]),
    'guardian: update_primary_position (collision with current secondary) succeeds — no raw constraint error surfaced',
    (r) => r.rows[0].cleared === true
  )
);
const afterCollision = await db.query(`select "position", secondary_position from players where id = $1;`, [ids.player]);
check(
  'collision case: primary position set to the colliding value, secondary_position atomically cleared to null',
  afterCollision.rows[0].position === 'CM' && afterCollision.rows[0].secondary_position === null,
  afterCollision.rows[0]
);

// Unrelated user (not this player's guardian) cannot call the RPC at all.
await asRole('authenticated', ids.unrelatedCoachUser, () =>
  expectError(() => db.query(`select public.update_primary_position($1, 'ST');`, [ids.player]), 'non-guardian: update_primary_position rejects', 'Not authorized')
);

// Empty position still rejected with a clear error, not a silent no-op.
await asRole('authenticated', ids.guardianUser, () =>
  expectError(() => db.query(`select public.update_primary_position($1, '   ');`, [ids.player]), 'guardian: update_primary_position rejects a blank position', 'required')
);

// ============================================================================
// preferred_foot INSERT rule (item 2) — a new roster player must be
// insertable, but never with preferred_foot set at creation time; only
// update_player_coach_fields may ever set it, from Stage 1 onward.
// ============================================================================
console.log('\n=== preferred_foot INSERT rule ===\n');

await asRole('authenticated', ids.authCoachUser, () =>
  expectOk(
    () => db.query(`insert into players (team_id, name, "position", squad_number) values ($1, 'New Player', 'ST', 99) returning id;`, [ids.teamU9s]),
    "coach: players/route.ts's corrected INSERT (team_id, name, position, squad_number — no preferred_foot) still works"
  )
);
await asRole('authenticated', ids.authCoachUser, () =>
  expectError(
    () => db.query(`insert into players (team_id, name, "position", preferred_foot) values ($1, 'Sneaky Foot Player', 'ST', 'Left');`, [ids.teamU9s]),
    'coach: direct INSERT naming preferred_foot is rejected (INSERT column grant excludes it — RPC is the only effective path)',
    'permission denied'
  )
);
await asRole('authenticated', ids.authCoachUser, () =>
  expectError(
    () => db.query(`insert into players (team_id, name, age) values ($1, 'Sneaky Age Player', 10);`, [ids.teamU9s]),
    'coach: direct INSERT naming age is rejected too (never in the INSERT grant)',
    'permission denied'
  )
);

// ============================================================================
// Existing (fixed) app queries still work against the Stage-1 schema.
// ============================================================================
await asRole('authenticated', ids.guardianUser, () =>
  expectOk(
    () =>
      db.query(
        `select id, name, "position", preferred_foot, height_cm, football_age_group, photo_key, squad_number, created_at, favourite_player, football_ambition, secondary_position, team_id from players where id = $1;`,
        [ids.player]
      ),
    "guardian: os-data.ts's corrected explicit-column parent query still works"
  )
);
await asRole('authenticated', ids.authCoachUser, () =>
  expectOk(
    () =>
      db.query(
        `select id, name, position, squad_number, team_id, secondary_position, football_age_group, height_cm, preferred_foot, coach_fields_updated_at from players where team_id = $1;`,
        [ids.teamU9s]
      ),
    "coach: os-data.ts's corrected SQUAD_COLUMNS query still works"
  )
);

// ============================================================================
// STAGE 2.5 — position permission lock (0037_player_position_permission_
// lock.sql). Modelling "Stage 2 (the app deploy that switches position/
// route.ts to the RPC) is confirmed fully rolled out" — apply this
// migration now and prove the raw grant is actually gone and the RPC is
// genuinely the only effective path from this point on.
// ============================================================================
console.log('\n=== STAGE 2.5 — position permission lock ===\n');

const grantsBeforePositionLock = await db.query(`
  select privilege_type, column_name
  from information_schema.role_column_grants
  where table_name = 'players' and grantee = 'authenticated' and privilege_type = 'UPDATE'
  order by column_name;
`);
check(
  '"position" still has a column-level UPDATE grant immediately before Stage 2.5',
  grantsBeforePositionLock.rows.some((r) => r.column_name === 'position'),
  grantsBeforePositionLock.rows
);

const sqlPositionLock = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationPositionLock), 'utf8');
try {
  await db.exec(sqlPositionLock);
  console.log(`Applied Stage 2.5 (${migrationPositionLock}) cleanly.\n`);
} catch (e) {
  console.log(`STAGE 2.5 (${migrationPositionLock}) FAILED TO APPLY:`, e.message);
  process.exit(1);
}

const grantsAfterPositionLock = await db.query(`
  select privilege_type, column_name
  from information_schema.role_column_grants
  where table_name = 'players' and grantee = 'authenticated' and privilege_type = 'UPDATE'
  order by column_name;
`);
check(
  'Stage 2.5 removes "position" from the UPDATE grant and changes nothing else',
  !grantsAfterPositionLock.rows.some((r) => r.column_name === 'position') &&
    grantsAfterPositionLock.rows.map((r) => r.column_name).sort().join(',') === ['favourite_player', 'football_ambition', 'photo_key'].sort().join(','),
  grantsAfterPositionLock.rows
);

await asRole('authenticated', ids.guardianUser, () =>
  expectError(() => db.query(`update players set "position" = 'CB' where id = $1;`, [ids.player]), 'POST-STAGE-2.5: guardian direct raw UPDATE on "position" is now rejected — update_primary_position is the only path', 'permission denied')
);
// The RPC itself is completely unaffected by this migration (it's
// SECURITY DEFINER, never depended on the caller's own grant) — confirm
// it still works exactly as before, now that it really is the only path.
await asRoleCommit('authenticated', ids.guardianUser, () =>
  expectOk(
    () => db.query(`select public.update_primary_position($1, 'LW') as cleared;`, [ids.player]),
    'POST-STAGE-2.5: update_primary_position RPC still works, now the sole effective path',
    (r) => r.rows[0].cleared === false
  )
);

// ============================================================================
// STAGE 3 (optional, deferred) — contract. Only drops players.age/height.
// Must change no grant on its own (Stage 1 + Stage 2.5 already carry the
// permanent, final grant model).
// ============================================================================
console.log('\n=== STAGE 3 (optional/deferred) — legacy column contract ===\n');

const grantsBeforeContract = await db.query(`
  select grantee, privilege_type, column_name
  from information_schema.role_column_grants
  where table_name = 'players' and grantee = 'authenticated'
  order by privilege_type, column_name;
`);

const sqlContract = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationContract), 'utf8');
try {
  await db.exec(sqlContract);
  console.log(`\nApplied Stage 3 (${migrationContract}) cleanly.\n`);
} catch (e) {
  console.log(`STAGE 3 (${migrationContract}) FAILED TO APPLY:`, e.message);
  process.exit(1);
}

const grantsAfterContract = await db.query(`
  select grantee, privilege_type, column_name
  from information_schema.role_column_grants
  where table_name = 'players' and grantee = 'authenticated'
  order by privilege_type, column_name;
`);
const beforeMinusAgeHeight = grantsBeforeContract.rows.filter((r) => r.column_name !== 'age' && r.column_name !== 'height');
check(
  'Stage 3 changes no grant other than the natural loss of the dropped age/height columns (Stage 1 + Stage 2.5 already carried the permanent grant model)',
  JSON.stringify(beforeMinusAgeHeight) === JSON.stringify(grantsAfterContract.rows),
  { before: grantsBeforeContract.rows.length, after: grantsAfterContract.rows.length }
);

const columnsAfterContract = await db.query(`
  select column_name from information_schema.columns where table_name = 'players' and column_name in ('age','height');
`);
check('age/height columns no longer exist after Stage 3', columnsAfterContract.rows.length === 0, columnsAfterContract.rows);

const dobColumnGrant = grantsAfterContract.rows.find((r) => r.column_name === 'date_of_birth');
check('authenticated has NO column-level grant of any kind on date_of_birth (unchanged since Stage 1)', !dobColumnGrant, dobColumnGrant);
check(
  'authenticated has column-level UPDATE on exactly the 3 guardian-editable columns (position is now RPC-only)',
  grantsAfterContract.rows.filter((r) => r.privilege_type === 'UPDATE').map((r) => r.column_name).sort().join(',') ===
    ['favourite_player', 'football_ambition', 'photo_key'].sort().join(','),
  grantsAfterContract.rows.filter((r) => r.privilege_type === 'UPDATE').map((r) => r.column_name)
);
check(
  'authenticated has column-level INSERT on exactly team_id/name/position/squad_number (preferred_foot excluded)',
  grantsAfterContract.rows.filter((r) => r.privilege_type === 'INSERT').map((r) => r.column_name).sort().join(',') ===
    ['team_id', 'name', 'position', 'squad_number'].sort().join(','),
  grantsAfterContract.rows.filter((r) => r.privilege_type === 'INSERT').map((r) => r.column_name)
);

const failed = results.filter((r) => !r.pass);
console.log(`\n\n${results.length - failed.length}/${results.length} TOTAL checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach((f) => console.log(' -', f.name, f.detail));
}
