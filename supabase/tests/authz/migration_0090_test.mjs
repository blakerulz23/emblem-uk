// Migration 0090 (guardian-invite write lockdown) and its rollback.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Proves, on a fresh 0089 database (0088, a readiness record, then 0089):
//   - at 0089 an authorised guardian or active coach can still insert a
//     guardian invite with forged status and attribution fields;
//   - after 0090 the legitimate five-column insert (the exact column list
//     createGuardianInvite sends for a signed-in user) still works, every
//     forged column, update and delete is refused with no partial write,
//     service-role redemption and single use are unchanged, and applying
//     0090 changes exactly the player_invites grants and no data;
//   - the rollback refuses without its transaction-local acknowledgement,
//     restores the exact 0089 catalog with it, never lets the
//     acknowledgement persist, and 0090 re-applies to the same catalog.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK_FILE = path.resolve(HERE, '../../rollback/0090_rollback.sql');
const INVITE_SOURCE = path.resolve(HERE, '../../../src/lib/create-guardian-invite.ts');
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const ACK_LOCAL = `select set_config('emblem.acknowledge_0090_rollback', 'REOPEN-GUARDIAN-INVITE-FORGERY', true)`;
const FIVE = ['player_id', 'code', 'created_by', 'invited_email', 'origin'];

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();
const code = () => 'SYNTH-' + crypto.randomBytes(6).toString('hex').toUpperCase();

// The column list createGuardianInvite inserts for a signed-in caller (no
// order): the literal keys of its insert object, without the conditional
// order_id spread.
function appSignedInColumns() {
  const src = fs.readFileSync(INVITE_SOURCE, 'utf8');
  const body = src.match(/\.from\('player_invites'\)\s*\.insert\(\{([\s\S]*?)\}\)\s*\.select\(/)?.[1] ?? '';
  const keys = [...body.matchAll(/^\s*([a-z_]+)(?=[:,])/gm)].map((m) => m[1]);
  const conditionalOrder = /\.\.\.\(orderId \? \{ order_id: orderId \} : \{\}\)/.test(body);
  return { keys, conditionalOrder };
}

// --- Fixture --------------------------------------------------------------------------
async function seeded() {
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });
  const ids = { season: id(), club: id(), team: id(), otherTeam: id(), p1: id(), p2: id(), order: id(),
    staff: id(), parent: id(), activeCoach: id(), endedCoach: id(), stranger: id(), newbie: id() };
  for (const p of ['staff', 'parent', 'activeCoach', 'endedCoach', 'stranger', 'newbie']) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ids[p], `synthetic-${p.toLowerCase()}@example.test`]);
  }
  for (const [p, role] of [['staff', null], ['parent', 'parent'], ['activeCoach', 'coach'], ['endedCoach', 'coach'], ['stranger', null]]) {
    await db.query(`insert into profiles (id, role, display_name) values ($1, $2, $3)`, [ids[p], role, `Synthetic ${p}`]);
  }
  await db.exec(`
    insert into staff_accounts (profile_id) values ('${ids.staff}');
    insert into seasons (id, label, normalized_label) values ('${ids.season}', 'Synthetic Season', 'synthetic season');
    insert into clubs (id, name) values ('${ids.club}', 'Synthetic FC');
    insert into teams (id, club_id, name, season_id) values ('${ids.team}', '${ids.club}', 'Synthetic U10', '${ids.season}'), ('${ids.otherTeam}', '${ids.club}', 'Synthetic U12', '${ids.season}');
    insert into players (id, team_id, name) values ('${ids.p1}', '${ids.team}', 'Synthetic One'), ('${ids.p2}', '${ids.otherTeam}', 'Synthetic Two');
    insert into guardians (player_id, profile_id, relationship) values ('${ids.p1}', '${ids.parent}', 'parent');
    insert into coach_team (team_id, profile_id) values ('${ids.team}', '${ids.activeCoach}');
    insert into coach_team (team_id, profile_id, ended_at, ended_by, end_reason) values ('${ids.team}', '${ids.endedCoach}', now() - interval '1 day', '${ids.staff}', 'Synthetic ending');
  `);
  // A real fictional order, so a refused order_id is a privilege refusal on a
  // valid value, not a foreign-key failure.
  await db.query(`insert into orders (id, order_ref, purchaser_email, source) values ($1, 'SYNTH-ORDER-1', 'synthetic-purchaser@example.test', 'standalone_order')`, [ids.order]);
  await db.exec('begin; set local role service_role;');
  await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, ids.staff]);
  await db.exec('commit;');
  await applyMigrations(db, { from: '0089', through: '0089' });
  return { db, ids };
}

// Every public table plus auth.users, as one md5 per table.
async function dataSnapshot(db) {
  const tables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows.map((r) => r.relname);
  const parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select count(*)::int n, coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  parts.push(`auth.users:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from auth.users x`)).rows[0].h}`);
  return parts.join(',');
}

// Runs one statement as a role in its own transaction. Success commits;
// failure rolls back. Returns 'ok' or the SQLSTATE.
async function as(db, role, uid, sql, params = []) {
  await db.exec('begin;');
  try {
    if (role === 'service_role') await db.exec('set local role service_role;');
    else await db.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [role, uid ?? '']);
    const r = await db.query(sql, params);
    await db.exec('commit;');
    return { status: 'ok', rows: r.rows, affected: r.affectedRows ?? r.rows.length };
  } catch (e) {
    await db.exec('rollback;');
    return { status: e.code ?? 'error', message: e.message };
  }
}
const insertSql = (cols) => `insert into public.player_invites (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`;

// A refused attempt: refused (not ok), and no table changed.
async function refused(db, label, role, uid, sql, params) {
  const before = await dataSnapshot(db);
  const r = await as(db, role, uid, sql, params);
  const after = await dataSnapshot(db);
  check(`${label}: refused, nothing written`, r.status !== 'ok' && before === after, r.status === 'ok' ? 'ALLOWED' : r.status);
}

const app = appSignedInColumns();
check('createGuardianInvite (source) inserts exactly the five approved columns for a signed-in caller, with order_id only behind the order condition',
  JSON.stringify([...app.keys].sort()) === JSON.stringify([...FIVE].sort()) && app.conditionalOrder, JSON.stringify(app));

// --- 1. At 0089: the forgery is possible -----------------------------------------------------
console.log('\n=== at 0089 (before 0090) ===');
const { db, ids } = await seeded();
{
  const forged = await as(db, 'authenticated', ids.parent, `${insertSql(['player_id', 'code', 'created_by', 'used_at', 'used_by', 'created_at', 'expires_at'])}`,
    [ids.p1, code(), ids.parent, new Date('2025-01-01T00:00:00Z'), ids.stranger, new Date('2024-12-31T00:00:00Z'), new Date('2099-01-01T00:00:00Z')]);
  check('at 0089 a guardian CAN insert a guardian invite pre-marked used by another account, backdated and never expiring (the gap 0090 closes)', forged.status === 'ok', forged.status);
  const forgedCoach = await as(db, 'authenticated', ids.activeCoach, insertSql(['player_id', 'code', 'created_by', 'used_at', 'used_by', 'email_status']), [ids.p1, code(), ids.activeCoach, new Date(), ids.parent, 'sent']);
  check('at 0089 an active coach CAN insert a forged consumed invite with a forged email status', forgedCoach.status === 'ok', forgedCoach.status);
  // Remove the reproduction rows (owner), so the 0090 checks start from clean fixture data.
  await db.query(`delete from public.player_invites`);
}

// --- 2. Apply 0090 -------------------------------------------------------------------------------
console.log('\n=== apply 0090 ===');
const c89 = await snapshotCatalog(db);
const d89 = await dataSnapshot(db);
const acl = async () => (await db.query(`select relacl::text a from pg_class where oid = 'public.player_invites'::regclass`)).rows[0].a;
const acl89 = await acl();
const applied = await applyMigrations(db, { from: '0090', through: '0090' }).then(() => null).catch((e) => e.message);
check('0090 applies on a 0089 database', applied === null, applied);
const c90 = await snapshotCatalog(db);
const step = diffCatalog(c89, c90);
const expected = ['relation:player_invites', ...FIVE.map((c) => `column:player_invites.${c}`)].sort();
check('the 0089 → 0090 catalog change is exactly the player_invites table ACL and the five column ACLs (0 added, 0 removed, 6 changed)',
  step.added.length === 0 && step.removed.length === 0 && JSON.stringify([...step.changed].sort()) === JSON.stringify(expected), JSON.stringify(step));
check('17. applying 0090 changes no data (every table and auth.users identical; no audit event)', (await dataSnapshot(db)) === d89);
const acl90 = await acl();
const svc = (a) => (a.match(/service_role=[a-zA-Z]*/) ?? [''])[0];
check('service_role privileges on player_invites are unchanged', svc(acl89) === svc(acl90) && svc(acl90) !== '', `${svc(acl89)} → ${svc(acl90)}`);
const priv = (await db.query(`select
  has_table_privilege('authenticated', 'public.player_invites', 'insert') auth_tbl_ins, has_table_privilege('authenticated', 'public.player_invites', 'update') auth_upd,
  has_table_privilege('authenticated', 'public.player_invites', 'delete') auth_del, has_any_column_privilege('authenticated', 'public.player_invites', 'update') auth_col_upd,
  has_table_privilege('authenticated', 'public.player_invites', 'select') auth_sel,
  has_table_privilege('anon', 'public.player_invites', 'insert') anon_ins, has_any_column_privilege('anon', 'public.player_invites', 'insert') anon_col_ins,
  has_table_privilege('anon', 'public.player_invites', 'update') anon_upd, has_table_privilege('anon', 'public.player_invites', 'delete') anon_del,
  (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid = 'public.player_invites'::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', 'public.player_invites', a.attname, 'insert')) auth_ins_cols,
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'player_invites') policies`)).rows[0];
check('authenticated: no table-level INSERT, no UPDATE (table or any column), no DELETE; SELECT kept', !priv.auth_tbl_ins && !priv.auth_upd && !priv.auth_col_upd && !priv.auth_del && priv.auth_sel, JSON.stringify(priv));
check('authenticated may INSERT exactly the five columns', JSON.stringify(priv.auth_ins_cols) === JSON.stringify([...FIVE].sort()), JSON.stringify(priv.auth_ins_cols));
check('anon: no INSERT (table or any column), UPDATE or DELETE', !priv.anon_ins && !priv.anon_col_ins && !priv.anon_upd && !priv.anon_del);
check('the four existing player_invites policies are still in place', priv.policies === 4, String(priv.policies));

// --- 3. Legitimate inserts and denials after 0090 -----------------------------------------------------
console.log('\n=== after 0090 ===');
const legit = code();
const r1 = await as(db, 'authenticated', ids.parent, insertSql(FIVE), [ids.p1, legit, ids.parent, 'synthetic-newbie@example.test', 'second_guardian']);
const row = (await db.query(`select used_at, used_by, order_id, email_status, created_at > now() - interval '1 minute' fresh, expires_at > now() + interval '6 days' default_expiry from public.player_invites where code = $1`, [legit])).rows[0];
check('1. a guardian creates a guardian invite with the five columns', r1.status === 'ok', r1.status);
check('…and every other field keeps its default (unused, no order, no email status, created now, 7-day expiry)', row && row.used_at === null && row.used_by === null && row.order_id === null && row.email_status === null && row.fresh && row.default_expiry, JSON.stringify(row));
const r1c = await as(db, 'authenticated', ids.activeCoach, insertSql(FIVE), [ids.p1, code(), ids.activeCoach, null, 'coach_added_player']);
check('1. an active coach creates a guardian invite for a player on their team (link-only)', r1c.status === 'ok', r1c.status);
const appCode = code();
const appCols = app.keys;
const appVals = { player_id: ids.p1, code: appCode, created_by: ids.parent, invited_email: 'synthetic-second@example.test', origin: 'second_guardian' };
const r2 = await as(db, 'authenticated', ids.parent, insertSql(appCols), appCols.map((c) => appVals[c]));
check('2. the application route\'s exact signed-in insert (columns read from createGuardianInvite) succeeds', r2.status === 'ok', r2.status);
const r2o = await as(db, 'authenticated', ids.parent, insertSql(FIVE), [ids.p1, code(), ids.parent, null, 'order_approval']);
check('2. a signed-in inviter reusing a pending order invite\'s origin (order_approval, no order id) still succeeds', r2o.status === 'ok', r2o.status);
await refused(db, '2. the old payload with order_id: null (what the app sent before this change)', 'authenticated', ids.parent, insertSql([...FIVE, 'order_id']), [ids.p1, code(), ids.parent, null, 'second_guardian', null]);

await refused(db, '3. an unrelated account invites a guardian for another child', 'authenticated', ids.stranger, insertSql(FIVE), [ids.p1, code(), ids.stranger, null, 'second_guardian']);
await refused(db, '3. a guardian invites for a child that is not theirs', 'authenticated', ids.parent, insertSql(FIVE), [ids.p2, code(), ids.parent, null, 'second_guardian']);
await refused(db, '3. an ended coach invites for a player on the team', 'authenticated', ids.endedCoach, insertSql(FIVE), [ids.p1, code(), ids.endedCoach, null, 'coach_added_player']);
await refused(db, '3. a guardian attributes the invite to someone else', 'authenticated', ids.parent, insertSql(FIVE), [ids.p1, code(), ids.stranger, null, 'second_guardian']);
await refused(db, '4. anon inserts', 'anon', null, insertSql(FIVE), [ids.p1, code(), null, null, 'second_guardian']);
const forgedCols = {
  '5. used_at': ['used_at', new Date()], '6. used_by': ['used_by', ids.stranger], '7. created_at': ['created_at', new Date('2024-01-01T00:00:00Z')],
  '8. expires_at': ['expires_at', new Date('2099-01-01T00:00:00Z')], '9. order_id': ['order_id', ids.order],
  '10. id (default-managed)': ['id', id()], '10. email_status': ['email_status', 'sent'], '10. email_sent_at': ['email_sent_at', new Date()],
};
for (const [label, [col, val]] of Object.entries(forgedCols)) {
  await refused(db, `${label}: a guardian sets it directly`, 'authenticated', ids.parent, insertSql([...FIVE, col]), [ids.p1, code(), ids.parent, null, 'second_guardian', val]);
}
await refused(db, '5–6. an active coach inserts a pre-consumed invite', 'authenticated', ids.activeCoach, insertSql([...FIVE, 'used_at', 'used_by']), [ids.p1, code(), ids.activeCoach, null, 'coach_added_player', new Date(), ids.parent]);
await refused(db, '11. the creator updates an invite to appear consumed', 'authenticated', ids.parent, `update public.player_invites set used_at = now(), used_by = $2 where code = $1`, [legit, ids.stranger]);
await refused(db, '12. the creator changes attribution (created_by)', 'authenticated', ids.parent, `update public.player_invites set created_by = $2 where code = $1`, [legit, ids.stranger]);
await refused(db, '12. the creator changes the invited email', 'authenticated', ids.parent, `update public.player_invites set invited_email = 'synthetic-other@example.test' where code = $1`, [legit]);
await refused(db, '12. the creator writes an email status (the app\'s best-effort update stays a no-op, as at 0089)', 'authenticated', ids.parent, `update public.player_invites set email_status = 'sent' where code = $1`, [legit]);
await refused(db, '13. the creator deletes an invite', 'authenticated', ids.parent, `delete from public.player_invites where code = $1`, [legit]);
await refused(db, '13. anon deletes an invite', 'anon', null, `delete from public.player_invites where code = $1`, [legit]);

// --- 4. Trusted redemption, single use and replay -----------------------------------------------------
// The redeem route (service role) reads the invite, refuses a used or
// expired one, links the guardian and marks the invite used.
async function redeem(c, who) {
  return as(db, 'service_role', null, `with inv as (select id, player_id from public.player_invites where code = $1 and used_at is null and expires_at > now()),
      g as (insert into public.guardians (player_id, profile_id, relationship, created_via, created_by) select player_id, $2, 'parent', 'guardian_invite', $2 from inv returning player_id)
    update public.player_invites p set used_at = now(), used_by = $2 from inv where p.id = inv.id returning p.used_by`, [c, who]);
}
await db.query(`insert into public.profiles (id, display_name) values ($1, 'Synthetic newbie')`, [ids.newbie]);
const red = await redeem(legit, ids.newbie);
const used = (await db.query(`select used_at is not null used, used_by = $2 by_newbie from public.player_invites where code = $1`, [legit, ids.newbie])).rows[0];
const linked = (await db.query(`select count(*)::int n from public.guardians where player_id = $1 and profile_id = $2`, [ids.p1, ids.newbie])).rows[0].n;
check('14. service-role redemption marks the invite used, by the redeemer, and links the guardian', red.status === 'ok' && red.rows.length === 1 && used.used && used.by_newbie && linked === 1, JSON.stringify({ status: red.status, used, linked }));
const before = await dataSnapshot(db);
const replay = await redeem(legit, ids.stranger);
check('15. a replay of the used invite (another account) consumes nothing and links no one', replay.status === 'ok' && replay.rows.length === 0 && (await dataSnapshot(db)) === before, replay.status);
const expired = code();
await as(db, 'service_role', null, `insert into public.player_invites (player_id, code, created_by, expires_at) values ($1, $2, $3, now() - interval '1 minute')`, [ids.p1, expired, ids.parent]);
const before2 = await dataSnapshot(db);
const exp = await redeem(expired, ids.stranger);
check('15. an expired invite is not redeemable', exp.status === 'ok' && exp.rows.length === 0 && (await dataSnapshot(db)) === before2);
const svcIns = await as(db, 'service_role', null, `insert into public.player_invites (player_id, code, created_by, invited_email, origin, order_id) values ($1, $2, null, null, 'order_approval', null) returning id`, [ids.p1, code()]);
check('service role still inserts with any column (order approval path unchanged)', svcIns.status === 'ok', svcIns.status);

// --- 5. Rollback ----------------------------------------------------------------------------------------
console.log('\n=== rollback ===');
const dBefore = await dataSnapshot(db);
let refusal = null;
try {
  await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
} catch (e) {
  refusal = e.message;
  await db.exec('rollback;').catch(() => {});
}
check('18. without the acknowledgement the rollback is refused, naming the reopened forgery', refusal?.includes('0090 rollback refused') && refusal.includes('reopens guardian-invite forgery'), refusal);
const still = diffCatalog(c90, await snapshotCatalog(db));
check('18. …and changes nothing (catalog and data)', still.added.length + still.removed.length + still.changed.length === 0 && (await dataSnapshot(db)) === dBefore);
const ackAfterRefusal = (await db.query(`select coalesce(current_setting('emblem.acknowledge_0090_rollback', true), '') v`)).rows[0].v;
check('18. no acknowledgement persists after the refusal', ackAfterRefusal === '');
// The documented procedure: one transaction, the acknowledgement set
// transaction-local, then the file (its own begin is a no-op, its commit commits).
await db.exec('begin;');
await db.query(ACK_LOCAL);
const ackInside = (await db.query(`select current_setting('emblem.acknowledge_0090_rollback', true) v`)).rows[0].v;
await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
const ackAfter = (await db.query(`select coalesce(current_setting('emblem.acknowledge_0090_rollback', true), '') v`)).rows[0].v;
check('19. the acknowledgement was set transaction-local inside the rollback transaction', ackInside === 'REOPEN-GUARDIAN-INVITE-FORGERY');
check('19. it does not persist after the transaction', ackAfter === '');
const back = diffCatalog(c89, await snapshotCatalog(db));
check('19. with the acknowledgement the rollback restores the exact 0089 catalog', back.added.length + back.removed.length + back.changed.length === 0, [...back.added, ...back.removed, ...back.changed].join(', '));
check('19. …with the exact 0089 table ACL', (await acl()) === acl89, await acl());
check('19. …and changes no data', (await dataSnapshot(db)) === dBefore);
const reopenedCode = code();
const reopened = await as(db, 'authenticated', ids.parent, insertSql([...FIVE, 'used_at', 'used_by']), [ids.p1, reopenedCode, ids.parent, null, 'second_guardian', new Date(), ids.stranger]);
check('19. after the rollback the forgery is possible again (proving it genuinely reopens)', reopened.status === 'ok', reopened.status);
await db.query(`delete from public.player_invites where code = $1`, [reopenedCode]); // owner removes the proof row
check('19. (the proof row is removed, so data is back to the pre-rollback state)', (await dataSnapshot(db)) === dBefore);

const reapplied = await applyMigrations(db, { from: '0090', through: '0090' }).then(() => null).catch((e) => e.message);
check('20. 0090 re-applies after the rollback', reapplied === null, reapplied);
const re = diffCatalog(c90, await snapshotCatalog(db));
check('20. …to exactly the same 0090 catalog', re.added.length + re.removed.length + re.changed.length === 0, [...re.added, ...re.removed, ...re.changed].join(', '));
check('20. …with the same table ACL', (await acl()) === acl90);
check('20. …and the same data', (await dataSnapshot(db)) === dBefore);
await refused(db, '20. after re-applying, a forged used_by is refused again', 'authenticated', ids.parent, insertSql([...FIVE, 'used_by']), [ids.p1, code(), ids.parent, null, 'second_guardian', ids.stranger]);
const again = await as(db, 'authenticated', ids.parent, insertSql(FIVE), [ids.p1, code(), ids.parent, null, 'second_guardian']);
check('20. …and the legitimate five-column insert still works', again.status === 'ok', again.status);

// Defence in depth: even if an operator wrongly sets the acknowledgement
// session-wide, the rollback clears it before committing.
await db.query(`select set_config('emblem.acknowledge_0090_rollback', 'REOPEN-GUARDIAN-INVITE-FORGERY', false)`);
await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
const ackSession = (await db.query(`select coalesce(current_setting('emblem.acknowledge_0090_rollback', true), '') v`)).rows[0].v;
check('a session-wide acknowledgement does not survive the rollback either', ackSession === '');
const cycle = await applyMigrations(db, { from: '0090', through: '0090' }).then(() => null).catch((e) => e.message);
const re2 = diffCatalog(c90, await snapshotCatalog(db));
check('…and 0090 re-applies again to the same catalog', cycle === null && re2.added.length + re2.removed.length + re2.changed.length === 0, cycle);
await db.close();

// --- 6. 0090 refuses (as a no-op) on a database without 0089 -------------------------------------------
console.log('\n=== precondition ===');
{
  const pre = await createDatabase();
  await applyMigrations(pre, { through: '0088' });
  const cBefore = await snapshotCatalog(pre);
  const res = await applyMigrations(pre, { from: '0090', through: '0090' }).then(() => null).catch((e) => e.message);
  await pre.exec('rollback;').catch(() => {});
  const d = diffCatalog(cBefore, await snapshotCatalog(pre));
  check('0090 refuses on a database where 0089 is not in place, changing nothing', res?.includes('0090 refused: migration 0089 is not in place') && d.added.length + d.removed.length + d.changed.length === 0, res);
  await pre.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} migration 0090 checks passed`);
if (failed.length) process.exitCode = 1;
