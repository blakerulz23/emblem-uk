// Guardian account-control functions on the final schema (0088, 0089, 0090):
// suspend_card, unsuspend_card, request_player_deletion and
// cancel_own_player_deletion_request.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// The routes in src/app/api/os/cards/[id]/status and
// src/app/api/os/players/[id]/deletion-request(/cancel) map each function's
// raised refusal to a fixed response (Gate 3.5). This proves, against real
// PostgreSQL, that every refusal those routes report leaves no state behind
// (no row, status or audit change anywhere), that each success makes exactly
// its intended change, that the idempotent repeats stay no-ops, and that
// anon cannot call the functions.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';

const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

const db = await createDatabase();
await applyMigrations(db, { through: '0088' });
const ids = { staff: id(), guardian: id(), stranger: id(), season: id(), club: id(), team: id(), p1: id(), p2: id(), c1: id(), c2: id() };
for (const p of ['staff', 'guardian', 'stranger']) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ids[p], `synthetic-${p}@example.test`]);
  await db.query(`insert into public.profiles (id, role, display_name) values ($1, $2, $3)`, [ids[p], p === 'guardian' ? 'parent' : null, `Synthetic ${p}`]);
}
await db.exec(`
  insert into public.staff_accounts (profile_id) values ('${ids.staff}');
  insert into public.seasons (id, label, normalized_label) values ('${ids.season}', 'Synthetic Season', 'synthetic season');
  insert into public.clubs (id, name) values ('${ids.club}', 'Synthetic FC');
  insert into public.teams (id, club_id, name, season_id) values ('${ids.team}', '${ids.club}', 'Synthetic U10', '${ids.season}');
  insert into public.players (id, team_id, name) values ('${ids.p1}', '${ids.team}', 'Synthetic One'), ('${ids.p2}', '${ids.team}', 'Synthetic Two');
  insert into public.guardians (player_id, profile_id, relationship) values ('${ids.p1}', '${ids.guardian}', 'parent'), ('${ids.p2}', '${ids.guardian}', 'parent');
  insert into public.cards (id, player_id, claim_token, status) values ('${ids.c1}', '${ids.p1}', 'SYNTH-CARD-1', 'claimed');
  insert into public.cards (id, player_id, claim_token, status, access_status, access_status_reason, access_status_changed_at)
    values ('${ids.c2}', '${ids.p2}', 'SYNTH-CARD-2', 'claimed', 'revoked', 'compromised', now());
`);
await db.exec('begin; set local role service_role;');
await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, ids.staff]);
await db.exec('commit;');
await applyMigrations(db, { from: '0089', through: '0090' });

async function snapshot() {
  const tables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows.map((r) => r.relname);
  const parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  return parts.join(',');
}
// Calls a function as a role in its own transaction; success commits.
async function call(role, uid, sql, params) {
  await db.exec('begin;');
  try {
    await db.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [role, uid ?? '']);
    const r = await db.query(sql, params);
    await db.exec('commit;');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await db.exec('rollback;');
    return { ok: false, message: e.message, code: e.code };
  }
}
async function refused(label, role, uid, sql, params, fragment) {
  const before = await snapshot();
  const r = await call(role, uid, sql, params);
  const after = await snapshot();
  check(`${label}: refused (${fragment}), and no table changed`, !r.ok && (r.message ?? '').includes(fragment) && before === after, r.ok ? 'ALLOWED' : r.code);
}
const card = async (cid) => (await db.query(`select access_status, access_status_reason from public.cards where id = $1`, [cid])).rows[0];
const audits = async (cid) => (await db.query(`select count(*)::int n from public.card_access_audit_events where card_id = $1`, [cid])).rows[0].n;
const requests = async (pid) => (await db.query(`select status from public.player_deletion_requests where player_id = $1 order by requested_at`, [pid])).rows.map((r) => r.status);

console.log('\n=== card suspend / unsuspend ===');
await refused('anon suspends a card', 'anon', null, `select public.suspend_card($1, 'lost')`, [ids.c1], 'permission denied');
await refused('a non-guardian suspends a card', 'authenticated', ids.stranger, `select public.suspend_card($1, 'lost')`, [ids.c1], 'Not authorized');
await refused('a guardian suspends a card that does not exist (reported as not authorized)', 'authenticated', ids.guardian, `select public.suspend_card($1, 'lost')`, [id()], 'Not authorized');
await refused('a guardian suspends with an unsupported reason', 'authenticated', ids.guardian, `select public.suspend_card($1, 'SYNTHETIC-FREE-TEXT')`, [ids.c1], 'Unsupported reason');
await refused('a guardian suspends a permanently revoked card', 'authenticated', ids.guardian, `select public.suspend_card($1, 'lost')`, [ids.c2], 'permanently revoked');
await refused('a guardian unsuspends a permanently revoked card', 'authenticated', ids.guardian, `select public.unsuspend_card($1)`, [ids.c2], 'permanently revoked');
const s = await call('authenticated', ids.guardian, `select public.suspend_card($1, 'lost')`, [ids.c1]);
check('the guardian suspends their child\'s card: suspended with the reason, one audit event', s.ok && (await card(ids.c1)).access_status === 'suspended' && (await card(ids.c1)).access_status_reason === 'lost' && (await audits(ids.c1)) === 1, s.message);
const before1 = await snapshot();
const s2 = await call('authenticated', ids.guardian, `select public.suspend_card($1, 'stolen')`, [ids.c1]);
check('suspending again is an idempotent no-op (nothing changed)', s2.ok && (await snapshot()) === before1);
await refused('a non-guardian unsuspends the card', 'authenticated', ids.stranger, `select public.unsuspend_card($1)`, [ids.c1], 'Not authorized');
const u = await call('authenticated', ids.guardian, `select public.unsuspend_card($1)`, [ids.c1]);
check('the guardian unsuspends: active again, a second audit event', u.ok && (await card(ids.c1)).access_status === null && (await audits(ids.c1)) === 2, u.message);

console.log('\n=== child-deletion request ===');
await refused('anon requests deletion', 'anon', null, `select public.request_player_deletion($1, null, null)`, [ids.p1], 'permission denied');
await refused('a non-guardian requests deletion', 'authenticated', ids.stranger, `select public.request_player_deletion($1, null, null)`, [ids.p1], 'Not authorized');
await refused('a non-guardian cancels (nothing to cancel yet)', 'authenticated', ids.stranger, `select public.cancel_own_player_deletion_request($1)`, [ids.p1], 'Not authorized');
await refused('the guardian cancels when no request exists', 'authenticated', ids.guardian, `select public.cancel_own_player_deletion_request($1)`, [ids.p1], 'No cancellable deletion request found');
const r1 = await call('authenticated', ids.guardian, `select public.request_player_deletion($1, 'synthetic-guardian@example.test', null) id`, [ids.p1]);
check('the guardian files a deletion request: one pending request', r1.ok && JSON.stringify(await requests(ids.p1)) === '["pending"]', r1.message);
const r2 = await call('authenticated', ids.guardian, `select public.request_player_deletion($1, 'synthetic-guardian@example.test', null) id`, [ids.p1]);
check('filing again returns the same request (idempotent; still one)', r2.ok && r2.rows[0].id === r1.rows[0].id && JSON.stringify(await requests(ids.p1)) === '["pending"]');
await refused('a non-guardian cancels the guardian\'s pending request', 'authenticated', ids.stranger, `select public.cancel_own_player_deletion_request($1)`, [ids.p1], 'Not authorized');
await refused('anon cancels', 'anon', null, `select public.cancel_own_player_deletion_request($1)`, [ids.p1], 'permission denied');
const c = await call('authenticated', ids.guardian, `select public.cancel_own_player_deletion_request($1) ok`, [ids.p1]);
check('the guardian cancels: the request is cancelled', c.ok && c.rows[0].ok === true && JSON.stringify(await requests(ids.p1)) === '["cancelled"]', c.message);
const before2 = await snapshot();
const c2 = await call('authenticated', ids.guardian, `select public.cancel_own_player_deletion_request($1) ok`, [ids.p1]);
check('cancelling again is an idempotent no-op (true, nothing changed)', c2.ok && c2.rows[0].ok === true && (await snapshot()) === before2);

await db.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} guardian account-control checks passed`);
if (failed.length) process.exitCode = 1;
