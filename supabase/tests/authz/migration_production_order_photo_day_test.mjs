// Final production order for PR #140, after Photo Day was released from main.
//
// Production today has 0101 (R5) and then 0103-0107 (the Squad Invite audit
// restore and Photo Day), but not 0097, 0098 or 0102. PR #140's migrations
// therefore reach production after 0103-0107, out of numeric order. This
// suite reproduces that exact sequence and proves it ends where every other
// suite tests (a database built in filename order):
//
//   1. production today: through 0096 with fictional orders, then 0101, then
//      0103, 0104, 0105, 0106, 0107 one by one. After each: the 0101
//      post-check is 8/8 with unchanged counts. After 0107: Photo Day's own
//      staging verification (supabase/tests/photo_day_staging_verify.mjs,
//      its checks read from that file and run unchanged) passes in full, and
//      0097, 0098 and 0102 are absent.
//   2. apply 0097, then 0098, then 0102 (each refuses a second run). After
//      each: 0101 8/8 with unchanged counts, Photo Day verification passes in
//      full, no Photo Day function, constraint, policy or grant changed, and
//      no fixture row changed.
//   3. the final catalog equals (a) a database built in filename order
//      (0097, 0098, 0101, 0102, 0103-0107: the reference every suite tests)
//      and (b) the order staging actually received (0101, 0097, 0098, 0102,
//      then 0103-0107).
//   4. rollback order: 0097 and 0098 rollbacks are refused while a later
//      migration is applied; 0102, then 0098, then 0097 each restore the exact
//      catalog before them, ending at exactly production today, with 0101
//      8/8 and Photo Day verification passing after every step and no
//      fixture row changed; then 0097, 0098 and 0102 reapply to the exact
//      final catalog.
//
// Photo Day behaviour (consent, matching, publishing, erasure) is proven by
// supabase/tests/0104_0105_photo_day_pglite_test.mjs on a filename-order
// database, which step 3 shows has the same catalog as this order.
//
// Run: node --no-warnings supabase/tests/authz/migration_production_order_photo_day_test.mjs
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase, listMigrations } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(HERE, '../..', p), 'utf8');
const migration = (n) => {
  const m = listMigrations().find((x) => x.version === n);
  if (!m) throw new Error(`migration ${n} not found`);
  return read(`migrations/${m.file}`);
};
const M0097 = migration('0097');
const M0098 = migration('0098');
const M0101 = migration('0101');
const M0102 = migration('0102');
const PHOTO_DAY = ['0103', '0104', '0105', '0106', '0107'];
const RB0097 = read('rollback/0097_rollback.sql');
const RB0098 = read('rollback/0098_rollback.sql');
const RB0102 = read('rollback/0102_rollback.sql');
const ACK_0097 = ['emblem.acknowledge_0097_rollback', 'BREAK-COACH-ACCOUNT-DELETION'];
const ACK_0098 = ['emblem.acknowledge_0098_rollback', 'REOPEN-DELETION-REVIEW-ACCESS-AND-VERIFIER-NOMINATION'];
const ACK_0102 = ['emblem.acknowledge_0102_rollback', 'ALLOW-HELD-ORDER-PAYMENT'];
const POSTCHECK = read('verification/0101_postcheck.sql');
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

// Photo Day's own read-only verification, taken from its file: everything
// between "set transaction read only" and the finally block. It needs only
// `client.query` and `check`, so it runs unchanged against PGlite.
const PD_SRC = read('tests/photo_day_staging_verify.mjs');
const PD_START = "await client.query('set transaction read only');";
const PD_BODY = PD_SRC.slice(PD_SRC.indexOf(PD_START) + PD_START.length, PD_SRC.indexOf('} finally {'));
const PD_EXPECTED = 89;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const catalogDiff = (a, b) => { const d = diffCatalog(a, b); return [...d.added, ...d.removed, ...d.changed]; };

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
  // My Season (0099, 0108, 0109) reaches production after everything this suite
  // covers; it is left out of every build here and proven separately in
  // my_season_production_order_test.mjs.
  const last = through ?? '9999';
  for (const [a, b] of [['0089', '0098'], ['0100', '0107'], ['0110', '9999']]) {
    if (a > last) break;
    await applyMigrations(db, { from: a, through: b < last ? b : last });
  }
  return db;
}

async function apply(db, sql) {
  try { await db.exec(sql); return null; } catch (e) { await db.exec('rollback;').catch(() => {}); return e.message; }
}
async function rollBack(db, sql, ack) {
  await db.exec('begin;');
  try {
    if (ack) await db.query(`select set_config($1, $2, true)`, ack);
    await db.exec(sql);
    return null;
  } catch (e) {
    await db.exec('rollback;').catch(() => {});
    return e.message;
  }
}

// Every public table plus auth.users, one md5 per table. Columns 0097 adds
// (NULL on existing rows) are left out so a row compares equal across steps.
const ADDED = new Set(['orders.intended_guardian_erased_at', 'orders.held_at', 'orders.held_reason',
  'builder_guardian_approval_requests.guardian_email_redacted_at', 'builder_guardian_approval_requests.guardian_distinct_from_buyer',
  'player_deletion_requests.cancelled_by_account_deleted_at', 'squad_invite_participation_deletion_requests.cancelled_by_account_deleted_at',
  'moments.verifier_account_deleted_at', 'coach_invites.revoked_at', 'coach_invites.revoked_reason', 'team_invites.revoked_at',
  'team_invites.revoked_reason', 'player_invites.revoked_at', 'player_invites.revoked_reason', 'pending_profile_deletions.rejection_reason']);
async function dataSnapshot(db) {
  const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
  const parts = [`auth.users:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from auth.users x`)).rows[0].h}`];
  for (const t of tables) {
    const cols = (await db.query(`select column_name c from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t])).rows
      .map((r) => r.c).filter((c) => !ADDED.has(`${t}.${c}`)).map((c) => `x."${c}"`).join(', ');
    parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(y::text, '|' order by y::text)), 'e') h from (select row(${cols}) y from public."${t}" x) z`)).rows[0].h}`);
  }
  return parts.join(',');
}
// Same data: tables in both snapshots identical; a table in only one is empty.
function sameData(a, b) {
  const A = new Map(a.split(',').map((p) => p.split(':')));
  const B = new Map(b.split(',').map((p) => p.split(':')));
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    if (A.has(k) && B.has(k) ? A.get(k) !== B.get(k) : (A.get(k) ?? B.get(k)) !== 'e') return false;
  }
  return true;
}

const FLAGS = ['helper_present_invoker_pinned', 'helper_anon_denied', 'helper_authenticated_denied', 'helper_service_role_allowed',
  'begin_has_check', 'begin_grants_unchanged', 'apply_has_check', 'apply_grants_unchanged'];
const COUNTS = ['gift_orders', 'gift_genuine', 'gift_self_approved', 'gift_approval_missing', 'gift_not_approved',
  'blocked_approved_open', 'blocked_not_approved_open', 'blocked_paid', 'blocked_total'];
const EXPECTED = { gift_orders: 1, gift_genuine: 0, gift_self_approved: 0, gift_approval_missing: 0, gift_not_approved: 1,
  blocked_approved_open: 0, blocked_not_approved_open: 0, blocked_paid: 0, blocked_total: 1 };

async function post0101(db, label) {
  await db.exec('begin; set transaction read only;');
  let P;
  try {
    P = Object.fromEntries(Object.entries((await db.query(POSTCHECK)).rows[0]).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v]));
  } catch (e) {
    check(`${label}: 0101 post-check runs read-only`, false, e.message);
    return;
  } finally {
    await db.exec('rollback;');
  }
  check(`${label}: 0101 post-check 8/8, counts unchanged (blocked_total 1, others 0, non_gift_blocked 0, refused_payment_events 0)`,
    FLAGS.every((k) => P[k] === true) && COUNTS.every((k) => P[k] === EXPECTED[k]) && P.non_gift_blocked === 0 && P.refused_payment_events === 0,
    Object.fromEntries([...FLAGS, ...COUNTS, 'non_gift_blocked', 'refused_payment_events'].map((k) => [k, P[k]])));
}

async function photoDay(db, label) {
  let pass = 0;
  const failed = [];
  const local = (name, ok) => { if (ok) pass++; else failed.push(name); };
  await db.exec('begin; set transaction read only;');
  try {
    await new AsyncFunction('client', 'check', PD_BODY)({ query: (sql, params) => db.query(sql, params) }, local);
  } catch (e) {
    failed.push(`threw: ${e.message}`);
  } finally {
    await db.exec('rollback;');
  }
  check(`${label}: Photo Day verification ${pass}/${pass + failed.length} (expected ${PD_EXPECTED}/${PD_EXPECTED})`, failed.length === 0 && pass === PD_EXPECTED, failed);
}

async function absent(db) {
  return (await db.query(`select
      not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'held_at') a,
      to_regclass('public.deletion_review_access_suspensions') is null b,
      to_regclass('public.erased_accounts') is null c,
      not exists (select 1 from pg_constraint where conname = 'builder_authority_audit_events_event_type_check'
                  and pg_get_constraintdef(oid) like '%held%') d`)).rows[0];
}

// Catalog keys that belong to 0101 or to Photo Day (0103-0107). 0097 adds a
// column, trigger and constraint to the deletion request table 0107 writes to;
// those additions are listed separately and are the only allowed changes.
const PD_FUNCS = /function:(close_photo_day_after_deletion|confirm_photo_day_coach_permissions|confirm_squad_invite_participation_erasure|create_squad_invite_photo_day|issue_photo_day_photographer_link|list_photo_days_due_for_deletion|mark_photo_day_photo_storage_deleted|match_photo_day_photo|photo_day_effective_delete_after|publish_photo_day|record_photo_day_consent|record_photo_day_photo|release_photo_day_photos_for_withdrawn_consent|revoke_photo_day_photographer_link|unmatch_photo_day_photo|gift_order_checkout_block_reason)\(/;
const PD_OBJECTS = /squad_invite_photo_day|squad_invite_audit_events\.squad_invite_audit_events_event_type_check|squad_invite_permissions\.squad_invite_permissions_purpose_check|squad_invite_participation_deletion_storage_objects/;
const touchesProtected = (keys) => keys.filter((k) => PD_FUNCS.test(k) || PD_OBJECTS.test(k));

// --- 1. production today ------------------------------------------------------------------------
console.log('\n=== 1. production today: 0096 + 0101 + 0103-0107 ===');
const db = await readyDatabase('0096');
{
  const buyer = id(), parent = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'po-buyer@example.test'), ($2, 'po-parent@example.test')`, [buyer, parent]);
  const order = async (ref, purchaser, authority, payment) => {
    const oid = id();
    await db.query(
      `insert into public.orders (id, order_ref, purchaser_email, source, payment_status, authority_status,
         currency, pricing_tier, paid_player_count, total_print_quantity, unit_price_pence, subtotal_pence, pricing_version, priced_at)
       values ($1, $2, $3, 'standalone_order', $4, $5, 'GBP', 'single', 1, 1, 2499, 2499, 1, now())`,
      [oid, ref, purchaser, payment, authority]);
    return oid;
  };
  const gift = await order('PO-01-declined-closed', 'po-buyer@example.test', 'guardian_declined', 'cancelled');
  await db.query(
    `insert into public.builder_order_authority_declarations (submission_key, order_id, adult_user_id, adult_email, relationship, declaration_version, confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation)
     values ($1, $2, $3, 'po-buyer@example.test', 'other_adult', 'v1', true, true, true)`, [id(), gift, buyer]);
  await order('PO-02-ordinary-open', 'po-parent@example.test', 'confirmed', 'order_intent');
  await order('PO-03-historical-open', 'po-parent@example.test', null, 'pending_payment');
}
check('1. 0101 applies on 0096', (await apply(db, M0101)) === null);
await post0101(db, '1 (0101)');
for (const n of PHOTO_DAY) {
  const r = await apply(db, migration(n));
  check(`1. ${n} applies on top`, r === null, r);
  await post0101(db, `1 (${n})`);
}
await photoDay(db, '1 (production today)');
const a1 = await absent(db);
check('1. 0097, 0098 and 0102 are absent (no held_at, no suspensions, no erased_accounts, 0071 audit event rule)', a1.a && a1.b && a1.c && a1.d, a1);
const cToday = await snapshotCatalog(db);
const data0 = await dataSnapshot(db);

// --- 2. 0097, 0098, 0102 on production today ----------------------------------------------------
console.log('\n=== 2. 0097 then 0098 then 0102 (final production order) ===');
const steps = [['0097', M0097, /0097 refused/], ['0098', M0098, /0098 refused/], ['0102', M0102, /0102 refused: 0102 is already applied/]];
const cAfter = { '0096+0101+0103-0107': cToday };
let prev = cToday;
for (const [n, sql, again] of steps) {
  const r = await apply(db, sql);
  check(`2. ${n} applies`, r === null, r);
  check(`2. ${n} refuses a second run`, again.test((await apply(db, sql)) ?? ''));
  const c = await snapshotCatalog(db);
  const t = touchesProtected(catalogDiff(prev, c));
  check(`2. ${n} changes no 0101 or Photo Day function, constraint, table, policy or grant`, t.length === 0, t);
  await post0101(db, `2 (${n})`);
  await photoDay(db, `2 (${n})`);
  check(`2. ${n} changed no fixture rows`, sameData(data0, await dataSnapshot(db)));
  cAfter[n] = c;
  prev = c;
}
const cFinal = prev;
{
  // The one table 0107 writes to that 0097 changes on purpose (it predates
  // Photo Day): the participation deletion request table gains the
  // cancellation marker, the contact-clearing trigger and its NOT VALID check
  // (section 11), and its cancellation rule accepts the marker in place of a
  // deleted canceller. Exactly these four, nothing else.
  const diff97 = catalogDiff(cToday, cAfter['0097']).filter((k) => /squad_invite_participation_deletion_requests/.test(k)).sort();
  check('2. 0097 changes squad_invite_participation_deletion_requests only by its marker column, contact trigger, contact check and cancellation rule',
    JSON.stringify(diff97) === JSON.stringify([
      'column:squad_invite_participation_deletion_requests.cancelled_by_account_deleted_at',
      'constraint:squad_invite_participation_deletion_requests.sipdr_cancellation_requires_actor',
      'constraint:squad_invite_participation_deletion_requests.sipdr_closed_has_no_contact',
      'trigger:squad_invite_participation_deletion_requests.sipdr_redact_closed_contact',
    ]), diff97);
}

// --- 3. final catalog equals the tested references ----------------------------------------------
console.log('\n=== 3. final catalog == filename order == staging order ===');
{
  const numeric = await readyDatabase(undefined); // every file, filename order
  const dNum = catalogDiff(await snapshotCatalog(numeric), cFinal);
  check('3. production-order catalog == filename-order catalog (every function body, policy, trigger, constraint, column and grant)', dNum.length === 0, dNum);
  await photoDay(numeric, '3 (filename order)');
  await numeric.close();
  const staging = await readyDatabase('0102'); // 0097, 0098, 0101, 0102 ...
  for (const n of PHOTO_DAY) await staging.exec(migration(n)); // ... then 0103-0107
  const dStg = catalogDiff(await snapshotCatalog(staging), cFinal);
  check('3. production-order catalog == the order staging received (0102 before 0103-0107)', dStg.length === 0, dStg);
  await staging.close();
}

// --- 4. rollback order back to production today -------------------------------------------------
console.log('\n=== 4. rollback 0102 -> 0098 -> 0097 back to production today, then reapply ===');
{
  let r = await rollBack(db, RB0097, ACK_0097);
  check('4. 0097 rollback refused while 0098/0102 are applied, changing nothing', /0097 rollback refused/.test(r ?? '') && catalogDiff(cFinal, await snapshotCatalog(db)).length === 0, r);
  // 0102 depends on 0097 (its holds), not on 0098, so 0098's rollback has no
  // 0102 guard; the documented order is still 0102, then 0098, then 0097.
  r = await rollBack(db, read('rollback/0101_rollback.sql'), ['emblem.acknowledge_0101_rollback', 'REOPEN-SELF-APPROVED-GIFT-CHECKOUT']);
  check('4. 0101 rollback refused while 0102 is applied, changing nothing', /0102 is still applied/.test(r ?? '') && catalogDiff(cFinal, await snapshotCatalog(db)).length === 0, r);
  check('4. 0102 rollback without its acknowledgement is refused', /0102 rollback refused/.test((await rollBack(db, RB0102, null)) ?? ''));
  for (const [n, sql, ack, target, label] of [
    ['0102', RB0102, ACK_0102, cAfter['0098'], '0096 + 0101 + 0103-0107 + 0097 + 0098'],
    ['0098', RB0098, ACK_0098, cAfter['0097'], '0096 + 0101 + 0103-0107 + 0097'],
    ['0097', RB0097, ACK_0097, cToday, 'production today (0096 + 0101 + 0103-0107)'],
  ]) {
    r = await rollBack(db, sql, ack);
    check(`4. ${n} rollback (acknowledged) succeeds`, r === null, r);
    const d = catalogDiff(target, await snapshotCatalog(db));
    check(`4. after the ${n} rollback the catalog is exactly ${label}`, d.length === 0, d);
    check(`4. the ${n} rollback leaves no acknowledgement`, (await db.query(`select coalesce(current_setting($1, true), '') a`, [ack[0]])).rows[0].a === '');
    await post0101(db, `4 (after ${n} rollback)`);
    await photoDay(db, `4 (after ${n} rollback)`);
    check(`4. the ${n} rollback changed no fixture rows`, sameData(data0, await dataSnapshot(db)));
  }
  for (const [n, sql] of steps) check(`4. ${n} reapplies`, (await apply(db, sql)) === null);
  const d = catalogDiff(cFinal, await snapshotCatalog(db));
  check('4. reapplied catalog is exactly the final catalog', d.length === 0, d);
  await post0101(db, '4 (reapplied)');
  await photoDay(db, '4 (reapplied)');
  check('4. reapplying changed no fixture rows', sameData(data0, await dataSnapshot(db)));
}

await db.close();
const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
