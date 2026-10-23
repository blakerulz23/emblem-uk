// Migration 0091 (guardian-invite code confidentiality) and its rollback.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Proves, on a fresh 0090 database (0088, a readiness record, 0089, 0090):
//   - at 0090 an active coach can read the code of a guardian-created, an
//     order-created and a recovery-handoff invite for players on their team;
//   - after 0091 a coach reads only invites they created, and only while
//     their assignment is active; ended, expired, direct-only and other-team
//     coaches, unrelated accounts and anon read nothing; guardians keep
//     reading their own child's invites only; service_role is unchanged;
//     the legitimate guardian and coach inserts (with RETURNING) still work;
//     applying 0091 changes exactly one policy and no data;
//   - 0091 refuses, changing nothing, without the 0090 state, and refuses to
//     apply twice;
//   - the rollback refuses without its transaction-local acknowledgement,
//     restores the exact 0090 catalog with it (and the disclosure is back),
//     never lets the acknowledgement persist, and 0091 re-applies exactly.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.resolve(HERE, '../../migrations/0091_guardian_invite_code_confidentiality.sql');
const ROLLBACK_FILE = path.resolve(HERE, '../../rollback/0091_rollback.sql');
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const ACK_LOCAL = `select set_config('emblem.acknowledge_0091_rollback', 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE', true)`;
const COACH_POLICY = 'player_invites: coaches can view/create for their team';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();
const code = () => 'SYNTH-' + crypto.randomBytes(6).toString('hex').toUpperCase();
const sameCatalog = (a, b) => { const d = diffCatalog(a, b); return d.added.length + d.removed.length + d.changed.length === 0; };
const keysOf = (d) => [...d.added, ...d.removed, ...d.changed];

async function readyDatabase(through) {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const staff = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'synthetic-readiness@example.test')`, [staff]);
  await db.query(`insert into profiles (id, display_name) values ($1, 'Synthetic readiness')`, [staff]);
  await db.query(`insert into staff_accounts (profile_id) values ($1)`, [staff]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, staff]);
  await db.exec('commit;');
  await applyMigrations(db, { from: '0089', through });
  return { db, staff };
}

// Every public table plus auth.users, as one md5 per table.
async function dataSnapshot(db) {
  const tables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows.map((r) => r.relname);
  const parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  parts.push(`auth.users:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from auth.users x`)).rows[0].h}`);
  return parts.join(',');
}

// Runs one statement as a role in its own transaction. Returns 'ok' or the SQLSTATE.
async function as(db, role, uid, sql, params = []) {
  await db.exec('begin;');
  try {
    if (role === 'service_role') await db.exec('set local role service_role;');
    else await db.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [role, uid ?? '']);
    const r = await db.query(sql, params);
    await db.exec('commit;');
    return { status: 'ok', rows: r.rows };
  } catch (e) {
    await db.exec('rollback;');
    return { status: e.code ?? 'error', message: e.message };
  }
}

// --- Fixture at 0090 ------------------------------------------------------------------------
const { db, staff } = await readyDatabase('0090');
const P = { parent: id(), otherParent: id(), activeCoach: id(), endedCoach: id(), expiredCoach: id(), directCoach: id(), otherTeamCoach: id(), stranger: id(), purchaser: id(), redeemer: id() };
for (const [k, v] of Object.entries(P)) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [v, `synthetic-${k.toLowerCase()}@example.test`]);
  await db.query(`insert into profiles (id, display_name) values ($1, $2)`, [v, `Synthetic ${k}`]);
}
const T = { season: id(), club: id(), team: id(), otherTeam: id(), p1: id(), p2: id(), pOther: id(), order: id() };
await db.exec(`
  insert into seasons (id, label, normalized_label) values ('${T.season}', 'Synthetic Season', 'synthetic season');
  insert into clubs (id, name) values ('${T.club}', 'Synthetic FC');
  insert into teams (id, club_id, name, season_id) values ('${T.team}', '${T.club}', 'Synthetic U10', '${T.season}'), ('${T.otherTeam}', '${T.club}', 'Synthetic U12', '${T.season}');
  insert into players (id, team_id, name) values ('${T.p1}', '${T.team}', 'Synthetic Parented'), ('${T.p2}', '${T.team}', 'Synthetic Unclaimed'), ('${T.pOther}', '${T.otherTeam}', 'Synthetic Other');
  insert into guardians (player_id, profile_id, relationship) values ('${T.p1}', '${P.parent}', 'parent'), ('${T.pOther}', '${P.otherParent}', 'parent');
  insert into coach_team (team_id, profile_id) values ('${T.team}', '${P.activeCoach}'), ('${T.otherTeam}', '${P.otherTeamCoach}');
  insert into coach_team (team_id, profile_id, ended_at, ended_by, end_reason) values ('${T.team}', '${P.endedCoach}', now() - interval '1 day', '${staff}', 'Synthetic ending');
  insert into coach_team (team_id, profile_id, created_at, expires_at) values ('${T.team}', '${P.expiredCoach}', now() - interval '30 days', now() - interval '1 day');
  insert into coach_players (player_id, profile_id, created_via, created_by) values ('${T.p1}', '${P.directCoach}', 'guardian_invite', '${P.parent}');
`);
await db.query(`insert into orders (id, order_ref, purchaser_email, source, payment_status) values ($1, 'SYNTH-ORDER-91', 'synthetic-purchaser@example.test', 'standalone_order', 'fulfilled')`, [T.order]);

const FIVE = `insert into public.player_invites (player_id, code, created_by, invited_email, origin) values ($1, $2, $3, $4, $5) returning id, code`;
const inv = { guardian: code(), order: code(), handoff: code(), coach: code(), endedCoach: code(), other: code(), consumed: code() };
const created = [
  await as(db, 'authenticated', P.parent, FIVE, [T.p1, inv.guardian, P.parent, 'synthetic-second@example.test', 'second_guardian']),
  await as(db, 'authenticated', P.activeCoach, FIVE, [T.p2, inv.coach, P.activeCoach, 'synthetic-family@example.test', 'coach_added_player']),
  await as(db, 'authenticated', P.otherParent, FIVE, [T.pOther, inv.other, P.otherParent, null, 'second_guardian']),
  await as(db, 'service_role', null, `insert into public.player_invites (player_id, code, created_by, invited_email, origin, order_id) values ($1, $2, null, 'synthetic-purchaser@example.test', 'order_approval', $3) returning id`, [T.p2, inv.order, T.order]),
  await as(db, 'service_role', null, `insert into public.player_invites (player_id, code, created_by, invited_email, origin) values ($1, $2, $3, 'synthetic-right-parent@example.test', 'second_guardian') returning id`, [T.p2, inv.handoff, P.purchaser]),
  // Created while the ended coach was still active (before the ending).
  await as(db, 'service_role', null, `insert into public.player_invites (player_id, code, created_by, invited_email, origin) values ($1, $2, $3, null, 'coach_added_player') returning id`, [T.p1, inv.endedCoach, P.endedCoach]),
  await as(db, 'service_role', null, `insert into public.player_invites (player_id, code, created_by, used_at, used_by) values ($1, $2, $3, now(), $4) returning id`, [T.p1, inv.consumed, P.parent, P.redeemer]),
];
check('setup: every fixture invite was created through its real path (guardian and coach signed in with 0090\'s five columns; order, handoff and history by service role)', created.every((r) => r.status === 'ok'), created.map((r) => r.status).join(','));

const ALL = Object.values(inv);
async function visible(role, uid) {
  const r = await as(db, role, uid, `select code from public.player_invites`);
  return r.status === 'ok' ? new Set(r.rows.map((x) => x.code)) : r.status;
}
const only = (set, expected) => set instanceof Set && set.size === expected.length && expected.every((c) => set.has(c));
const fmt = (set) => (set instanceof Set ? [...set].map((c) => Object.keys(inv).find((k) => inv[k] === c)).sort().join(',') || '(none)' : set);

// --- 1. At 0090: the disclosure ----------------------------------------------------------------
console.log('\n=== at 0090 ===');
const c90 = await snapshotCatalog(db);
const at90 = await visible('authenticated', P.activeCoach);
check('1. at 0090 an active coach can read the guardian-created invite code', at90 instanceof Set && at90.has(inv.guardian), fmt(at90));
check('1. …the order-created invite code', at90 instanceof Set && at90.has(inv.order));
check('1. …and the recovery-handoff invite code', at90 instanceof Set && at90.has(inv.handoff));

// --- 2. Precondition ---------------------------------------------------------------------------
console.log('\n=== precondition ===');
{
  const { db: db89 } = await readyDatabase('0089');
  const before = await snapshotCatalog(db89);
  let refusal = null;
  try { await db89.exec(fs.readFileSync(MIGRATION_FILE, 'utf8')); } catch (e) { refusal = e.message; await db89.exec('rollback;').catch(() => {}); }
  check('2. 0091 refuses on 0089 (0090 not in place)', refusal?.includes('0091 refused') && refusal.includes('0090 player_invites write lockdown is not in place'), refusal);
  check('2. …and changes nothing', sameCatalog(before, await snapshotCatalog(db89)));
  await db89.close();
}
{
  const { db: dbExtra } = await readyDatabase('0090');
  await dbExtra.exec(`create policy "synthetic extra read" on public.player_invites for select using (true);`);
  const before = await snapshotCatalog(dbExtra);
  let refusal = null;
  try { await dbExtra.exec(fs.readFileSync(MIGRATION_FILE, 'utf8')); } catch (e) { refusal = e.message; await dbExtra.exec('rollback;').catch(() => {}); }
  check('2. 0091 refuses when an unexpected extra SELECT policy exists', refusal?.includes('exactly the two expected SELECT policies'), refusal);
  check('2. …and changes nothing', sameCatalog(before, await snapshotCatalog(dbExtra)));
  await dbExtra.close();
}

// --- 3. Apply 0091 -----------------------------------------------------------------------------
console.log('\n=== apply 0091 ===');
const dBefore = await dataSnapshot(db);
await applyMigrations(db, { from: '0091', through: '0091' });
const c91 = await snapshotCatalog(db);
const delta = diffCatalog(c90, c91);
check('3. 0090 → 0091 changes exactly one catalog entry: the coach SELECT policy', delta.added.length === 0 && delta.removed.length === 0 && delta.changed.length === 1 && delta.changed[0].includes(COACH_POLICY), keysOf(delta).join(', '));
const coachQual = (await db.query(`select qual from pg_policies where tablename = 'player_invites' and policyname = $1`, [COACH_POLICY])).rows[0].qual;
check('3. …which now requires created_by = auth.uid() and an active assignment', /created_by = auth\.uid\(\)/.test(coachQual) && coachQual.includes('coach_assignment_is_active'), coachQual.replace(/\s+/g, ' '));
check('3. applying 0091 changes no data (rows and consumption state identical)', (await dataSnapshot(db)) === dBefore);
let twice = null;
try { await db.exec(fs.readFileSync(MIGRATION_FILE, 'utf8')); } catch (e) { twice = e.message; await db.exec('rollback;').catch(() => {}); }
check('3. 0091 refuses to apply twice, changing nothing', twice?.includes('already requires created_by') && sameCatalog(c91, await snapshotCatalog(db)), twice);

// --- 4. Who reads what after 0091 ------------------------------------------------------------------
console.log('\n=== after 0091 ===');
const dReads = await dataSnapshot(db);
const coach = await visible('authenticated', P.activeCoach);
check('4. an active coach reads only the invite they created', only(coach, [inv.coach]), fmt(coach));
for (const k of ['guardian', 'order', 'handoff']) {
  const r = await as(db, 'authenticated', P.activeCoach, `select code from public.player_invites where code = $1`, [inv[k]]);
  check(`4. an active coach cannot select the ${k}-created invite (or its code) by code`, r.status === 'ok' && r.rows.length === 0, `${r.status} rows=${r.rows?.length}`);
}
check('4. an ended coach reads nothing (not even an invite they created while active)', only(await visible('authenticated', P.endedCoach), []), fmt(await visible('authenticated', P.endedCoach)));
check('4. an expired coach reads nothing', only(await visible('authenticated', P.expiredCoach), []), fmt(await visible('authenticated', P.expiredCoach)));
check('4. a direct-only coach reads nothing', only(await visible('authenticated', P.directCoach), []), fmt(await visible('authenticated', P.directCoach)));
check('4. an active coach of another team reads nothing', only(await visible('authenticated', P.otherTeamCoach), []), fmt(await visible('authenticated', P.otherTeamCoach)));
const parent = await visible('authenticated', P.parent);
check('4. a guardian reads their own child\'s invites (all of them) and nothing else', only(parent, [inv.guardian, inv.endedCoach, inv.consumed]), fmt(parent));
check('4. another child\'s guardian reads only their own child\'s invite', only(await visible('authenticated', P.otherParent), [inv.other]), fmt(await visible('authenticated', P.otherParent)));
check('4. the purchaser (no relationship) reads nothing, not even their own handoff', only(await visible('authenticated', P.purchaser), []), fmt(await visible('authenticated', P.purchaser)));
check('4. an unrelated signed-in account reads nothing', only(await visible('authenticated', P.stranger), []), fmt(await visible('authenticated', P.stranger)));
const anon = await visible('anon', null);
check('4. anon is refused outright', anon === '42501', String(anon));
check('4. service_role still reads every invite (trusted server flows unchanged)', only(await visible('service_role', null), ALL), fmt(await visible('service_role', null)));
check('4. none of these reads changed any data', (await dataSnapshot(db)) === dReads);
const coachInsert = await as(db, 'authenticated', P.activeCoach, FIVE, [T.p2, code(), P.activeCoach, null, 'coach_added_player']);
check('4. a coach\'s legitimate insert with RETURNING still works (createGuardianInvite)', coachInsert.status === 'ok' && coachInsert.rows.length === 1, coachInsert.status);
const parentInsert = await as(db, 'authenticated', P.parent, FIVE, [T.p1, code(), P.parent, null, 'second_guardian']);
check('4. a guardian\'s legitimate insert with RETURNING still works', parentInsert.status === 'ok' && parentInsert.rows.length === 1, parentInsert.status);
const redeemed = await as(db, 'service_role', null, `update public.player_invites set used_at = now(), used_by = $2 where code = $1 and used_at is null returning used_by`, [inv.handoff, P.redeemer]);
check('4. service-role redemption still consumes an invite', redeemed.status === 'ok' && redeemed.rows.length === 1, redeemed.status);
await db.query(`delete from public.player_invites where id = any($1)`, [[coachInsert.rows[0].id, parentInsert.rows[0].id]]);
await db.query(`update public.player_invites set used_at = null, used_by = null where code = $1`, [inv.handoff]);
check('4. (the proof rows are removed, so data is back to the pre-read state)', (await dataSnapshot(db)) === dReads);

// --- 5. Rollback ---------------------------------------------------------------------------------
console.log('\n=== rollback ===');
const dRb = await dataSnapshot(db);
let refusal = null;
try { await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8')); } catch (e) { refusal = e.message; await db.exec('rollback;').catch(() => {}); }
check('5. without the acknowledgement the rollback is refused, naming the reopened disclosure', refusal?.includes('0091 rollback refused') && refusal.includes('reopens guardian-invite code disclosure'), refusal);
check('5. …and changes nothing (catalog and data)', sameCatalog(c91, await snapshotCatalog(db)) && (await dataSnapshot(db)) === dRb);
check('5. no acknowledgement persists after the refusal', (await db.query(`select coalesce(current_setting('emblem.acknowledge_0091_rollback', true), '') v`)).rows[0].v === '');
await db.exec('begin;');
await db.query(ACK_LOCAL);
const ackInside = (await db.query(`select current_setting('emblem.acknowledge_0091_rollback', true) v`)).rows[0].v;
await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
const ackAfter = (await db.query(`select coalesce(current_setting('emblem.acknowledge_0091_rollback', true), '') v`)).rows[0].v;
check('6. the acknowledgement was set transaction-local inside the rollback transaction', ackInside === 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE');
check('6. it does not persist after the transaction', ackAfter === '');
const back = diffCatalog(c90, await snapshotCatalog(db));
check('6. with the acknowledgement the rollback restores the exact 0090 catalog', keysOf(back).length === 0, keysOf(back).join(', '));
check('6. …and changes no data', (await dataSnapshot(db)) === dRb);
const reopened = await visible('authenticated', P.activeCoach);
check('6. after the rollback the disclosure is genuinely back (the coach reads the guardian-, order- and handoff-created codes)', reopened instanceof Set && [inv.guardian, inv.order, inv.handoff].every((c) => reopened.has(c)), fmt(reopened));

const reapplied = await applyMigrations(db, { from: '0091', through: '0091' }).then(() => null).catch((e) => e.message);
check('7. 0091 re-applies after the rollback', reapplied === null, reapplied);
check('7. …to exactly the same 0091 catalog', sameCatalog(c91, await snapshotCatalog(db)));
check('7. …with the same data', (await dataSnapshot(db)) === dRb);
check('7. …and the coach again reads only their own invite', only(await visible('authenticated', P.activeCoach), [inv.coach]));

// Defence in depth: even a wrongly session-wide acknowledgement is cleared by the file.
await db.query(`select set_config('emblem.acknowledge_0091_rollback', 'REOPEN-GUARDIAN-INVITE-CODE-DISCLOSURE', false)`);
await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
check('a session-wide acknowledgement does not survive the rollback either', (await db.query(`select coalesce(current_setting('emblem.acknowledge_0091_rollback', true), '') v`)).rows[0].v === '');
const cycle = await applyMigrations(db, { from: '0091', through: '0091' }).then(() => null).catch((e) => e.message);
check('…and 0091 re-applies again to the same catalog', cycle === null && sameCatalog(c91, await snapshotCatalog(db)), cycle);
await db.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} migration 0091 checks passed`);
process.exit(passed === results.length ? 0 : 1);
