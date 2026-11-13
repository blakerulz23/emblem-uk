// Production order for PR #140: 0101 (R5) reached production before 0097 and
// 0098, so production applies them out of numeric order. Every other suite
// builds in filename order (0097, 0098, 0101). This one reproduces the real
// sequence and proves it ends in the same place:
//
//   1. build through 0096; the 0101 pre-check guards pass
//   2. apply 0101 alone; the 0101 post-check is 8/8 and reproduces the pre-check
//   3. apply 0097, then 0098 (each refuses a second run); the 0101 post-check
//      is still 8/8 with identical counts, and the whole public catalog equals
//      a database built in numeric order (so every behaviour the 0097, 0098
//      and 0101 suites prove holds for the production order too)
//   4. roll back 0098, then 0097 (0097 first is refused while 0098 is applied);
//      each step restores the exact intermediate catalog and leaves 0101
//      intact at 8/8
//   5. reapply 0097 and 0098: identical catalog to step 3, 0101 still 8/8
//   6. emergency rollback of 0101 with 0097/0098 applied: refused without its
//      acknowledgement; with it, the catalog is exactly a 0097 + 0098 build;
//      0101 then reapplies to the step 3 catalog
//
// Fictional data: one closed (cancelled, guardian_declined) gift order, which
// 0101 counts as blocked but leaves alone, so blocked_total = 1 and every other
// blocked count is 0, plus ordinary open orders. The "fixture rows unchanged"
// checks therefore cover the order data 0101 reads; the tables 0097/0098 change
// (moments, deletion requests, suspensions) are empty here, and their data
// paths, including the rollback refusals that depend on rows, are proven in
// migration_0097_test.mjs and migration_0098_test.mjs.
//
// Run: node --no-warnings supabase/tests/authz/migration_production_order_0101_0097_0098_test.mjs
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(HERE, '../..', p), 'utf8');
const M0097 = read('migrations/0097_coach_account_deletion_verified_moments.sql');
const M0098 = read('migrations/0098_deletion_review_suspension_and_verifier_identity.sql');
const M0101 = read('migrations/0101_gift_checkout_requires_guardian_approval.sql');
const RB0097 = read('rollback/0097_rollback.sql');
const RB0098 = read('rollback/0098_rollback.sql');
const RB0101 = read('rollback/0101_rollback.sql');
const ACK_0101 = ['emblem.acknowledge_0101_rollback', 'REOPEN-SELF-APPROVED-GIFT-CHECKOUT'];
const PRECHECK = read('verification/0101_precheck.sql');
const POSTCHECK = read('verification/0101_postcheck.sql');
const ACK_0097 = ['emblem.acknowledge_0097_rollback', 'BREAK-COACH-ACCOUNT-DELETION'];
const ACK_0098 = ['emblem.acknowledge_0098_rollback', 'REOPEN-DELETION-REVIEW-ACCESS-AND-VERIFIER-NOMINATION'];
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${!pass && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const keysOf = (d) => [...d.added, ...d.removed, ...d.changed];
const catalogDiff = (a, b) => keysOf(diffCatalog(a, b));

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
  return db;
}

// Every public table plus auth.users, as one md5 per table.
async function dataSnapshot(db) {
  const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
  const parts = [`auth.users:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from auth.users x`)).rows[0].h}`];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  return parts.join(',');
}
// Same data: every table present in both snapshots is identical, and any table that exists in
// only one (0098's deletion_review_access_suspensions) is empty ('e').
function sameData(a, b) {
  const A = new Map(a.split(',').map((p) => p.split(':')));
  const B = new Map(b.split(',').map((p) => p.split(':')));
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    if (A.has(k) && B.has(k) ? A.get(k) !== B.get(k) : (A.get(k) ?? B.get(k)) !== 'e') return false;
  }
  return true;
}

async function readOnlyRow(db, sql) {
  await db.exec('begin; set transaction read only;');
  try {
    const r = await db.query(sql);
    return { ok: true, row: Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, typeof v === 'bigint' || (typeof v === 'string' && /^\d+$/.test(v)) ? Number(v) : v])) };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    await db.exec('rollback;');
  }
}

// Applies one migration file; returns null on success or the error message (state rolled back).
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

const FLAGS = ['helper_present_invoker_pinned', 'helper_anon_denied', 'helper_authenticated_denied', 'helper_service_role_allowed',
  'begin_has_check', 'begin_grants_unchanged', 'apply_has_check', 'apply_grants_unchanged'];
const COUNTS = ['gift_orders', 'gift_genuine', 'gift_self_approved', 'gift_approval_missing', 'gift_not_approved',
  'blocked_approved_open', 'blocked_not_approved_open', 'blocked_paid', 'blocked_total'];
const EXPECTED = { gift_orders: 1, gift_genuine: 0, gift_self_approved: 0, gift_approval_missing: 0, gift_not_approved: 1,
  blocked_approved_open: 0, blocked_not_approved_open: 0, blocked_paid: 0, blocked_total: 1 };

async function post0101(db, label) {
  const r = await readOnlyRow(db, POSTCHECK);
  check(`${label}: 0101 post-check runs read-only`, r.ok, r.message);
  if (!r.ok) return;
  const P = r.row;
  check(`${label}: 0101 post-check 8/8`, FLAGS.every((k) => P[k] === true), Object.fromEntries(FLAGS.map((k) => [k, P[k]])));
  check(`${label}: non_gift_blocked = 0, refused_payment_events = 0`, P.non_gift_blocked === 0 && P.refused_payment_events === 0, P);
  check(`${label}: blocked_total 1, other blocked 0 (the one closed gift order)`, COUNTS.every((k) => P[k] === EXPECTED[k]), Object.fromEntries(COUNTS.map((k) => [k, P[k]])));
}

// --- 1. through 0096, fictional data ----------------------------------------------------------
console.log('\n=== 1. through 0096 ===');
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
  // A closed gift order (guardian_declined, cancelled).
  const gift = await order('PO-01-declined-closed', 'po-buyer@example.test', 'guardian_declined', 'cancelled');
  await db.query(
    `insert into public.builder_order_authority_declarations (submission_key, order_id, adult_user_id, adult_email, relationship, declaration_version, confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation)
     values ($1, $2, $3, 'po-buyer@example.test', 'other_adult', 'v1', true, true, true)`, [id(), gift, buyer]);
  await order('PO-02-ordinary-open', 'po-parent@example.test', 'confirmed', 'order_intent');
  await order('PO-03-historical-open', 'po-parent@example.test', null, 'pending_payment');
}
const c96 = await snapshotCatalog(db);
const pre = await readOnlyRow(db, PRECHECK);
check('1. 0101 pre-check runs read-only', pre.ok, pre.message);
check('1. pre-check guards true (0101 absent, both payment functions at 0080)', pre.row?.guard_not_applied === true && pre.row?.guard_begin_is_0080 === true && pre.row?.guard_apply_is_0080 === true, pre.row);
check('1. pre-check stop counts 0, blocked_total 1', COUNTS.every((k) => pre.row?.[k] === EXPECTED[k]), pre.row);

// --- 2. apply 0101 alone ----------------------------------------------------------------------
console.log('\n=== 2. 0101 first (as production) ===');
check('2. 0101 applies on 0096', (await apply(db, M0101)) === null);
const c101 = await snapshotCatalog(db);
await post0101(db, '2');

// --- 3. then 0097, then 0098 -------------------------------------------------------------------
console.log('\n=== 3. 0097 then 0098 on top of 0101 ===');
const data101 = await dataSnapshot(db);
let r = await apply(db, M0098);
check('3. 0098 before 0097 is refused (needs the 0097 state)', /0098 refused: the expected 0097 state is not in place/.test(r ?? ''), r);
check('3. …changing nothing', catalogDiff(c101, await snapshotCatalog(db)).length === 0);
check('3. 0097 applies on 0096 + 0101', (r = await apply(db, M0097)) === null, r);
const c97 = await snapshotCatalog(db);
check('3. 0097 changes nothing 0101 created or replaced', catalogDiff(c101, c97).every((k) => !/gift_order_checkout_block_reason|begin_gate3_checkout|apply_gate3_payment_event/.test(k)), catalogDiff(c101, c97));
check('3. 0097 refuses a second run', /0097 refused/.test((await apply(db, M0097)) ?? ''));
check('3. 0098 applies on 0096 + 0101 + 0097', (r = await apply(db, M0098)) === null, r);
const cProd = await snapshotCatalog(db);
check('3. 0098 changes nothing 0101 created or replaced', catalogDiff(c97, cProd).every((k) => !/gift_order_checkout_block_reason|begin_gate3_checkout|apply_gate3_payment_event/.test(k)), catalogDiff(c97, cProd));
check('3. 0098 refuses a second run', /0098 refused/.test((await apply(db, M0098)) ?? ''));
check('3. applying 0097 and 0098 left the fixture rows unchanged', sameData(data101, await dataSnapshot(db)));
await post0101(db, '3');

const numeric = await readyDatabase('0101'); // filename order: 0097, 0098, 0101
const cNumeric = await snapshotCatalog(numeric);
await numeric.close();
const orderDiff = catalogDiff(cNumeric, cProd);
check('3. production-order catalog == numeric-order catalog (every function body, policy, trigger, constraint and grant)', orderDiff.length === 0, orderDiff);
const blockFn = (await db.query(`select public.gift_order_checkout_block_reason(id) r from public.orders where order_ref = 'PO-01-declined-closed'`)).rows[0]?.r;
check('3. 0101 helper still answers (declined gift order is blocked)', typeof blockFn === 'string' && blockFn.length > 0, blockFn);

// --- 4. roll back 0098, then 0097, leaving 0101 -------------------------------------------------
console.log('\n=== 4. rollback 0098 then 0097 (0101 stays) ===');
const dataProd = await dataSnapshot(db);
r = await rollBack(db, RB0097, ACK_0097);
check('4. 0097 rollback first is refused while 0098 is applied', /0097 rollback refused: 0098 is still applied/.test(r ?? ''), r);
check('4. …changing nothing', catalogDiff(cProd, await snapshotCatalog(db)).length === 0);
check('4. 0098 rollback (acknowledged) succeeds', (r = await rollBack(db, RB0098, ACK_0098)) === null, r);
let diff = catalogDiff(c97, await snapshotCatalog(db));
check('4. after 0098 rollback the catalog is exactly 0096 + 0101 + 0097', diff.length === 0, diff);
await post0101(db, '4 (after 0098 rollback)');
check('4. 0097 rollback (acknowledged) succeeds', (r = await rollBack(db, RB0097, ACK_0097)) === null, r);
diff = catalogDiff(c101, await snapshotCatalog(db));
check('4. after 0097 rollback the catalog is exactly 0096 + 0101', diff.length === 0, diff);
check('4. neither rollback changed the fixture rows', sameData(dataProd, await dataSnapshot(db)));
await post0101(db, '4 (after 0097 rollback)');
const ackLeft = (await db.query(`select coalesce(current_setting($1, true), '') a, coalesce(current_setting($2, true), '') b`, [ACK_0097[0], ACK_0098[0]])).rows[0];
check('4. no rollback acknowledgement persists', ackLeft.a === '' && ackLeft.b === '', ackLeft);

// --- 5. reapply 0097 and 0098 -------------------------------------------------------------------
console.log('\n=== 5. reapply 0097 and 0098 ===');
check('5. 0097 reapplies', (r = await apply(db, M0097)) === null, r);
check('5. 0098 reapplies', (r = await apply(db, M0098)) === null, r);
diff = catalogDiff(cProd, await snapshotCatalog(db));
check('5. catalog identical to step 3 (and so to numeric order)', diff.length === 0, diff);
check('5. fixture rows unchanged throughout', sameData(dataProd, await dataSnapshot(db)));
await post0101(db, '5');
check('5. 0096 baseline differs from final (sanity: the catalog snapshot sees the migrations)', catalogDiff(c96, cProd).length > 0);

// --- 6. emergency rollback of 0101 while 0097/0098 stay -----------------------------------------
console.log('\n=== 6. rollback 0101 with 0097 + 0098 applied, then reapply ===');
const only9798 = await readyDatabase('0098'); // filename order: 0097, 0098, no 0101
const c9798 = await snapshotCatalog(only9798);
await only9798.close();
r = await rollBack(db, RB0101, null);
check('6. 0101 rollback without its acknowledgement is refused', /0101 rollback refused/.test(r ?? ''), r);
check('6. 0101 rollback (acknowledged) succeeds with 0097 + 0098 applied', (r = await rollBack(db, RB0101, ACK_0101)) === null, r);
diff = catalogDiff(c9798, await snapshotCatalog(db));
check('6. catalog is exactly 0096 + 0097 + 0098 (0097/0098 objects untouched)', diff.length === 0, diff);
check('6. 0101 helper gone, pre-check guards true again', ((p) => p.ok && p.row.guard_not_applied && p.row.guard_begin_is_0080 && p.row.guard_apply_is_0080)(await readOnlyRow(db, PRECHECK)));
check('6. 0101 reapplies with 0097 + 0098 applied', (r = await apply(db, M0101)) === null, r);
diff = catalogDiff(cProd, await snapshotCatalog(db));
check('6. catalog identical to step 3 again', diff.length === 0, diff);
check('6. fixture rows unchanged', sameData(dataProd, await dataSnapshot(db)));
await post0101(db, '6');

await db.close();
const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
