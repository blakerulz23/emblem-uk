// Migration 0099 (R5: gift-order checkout and payment require a genuine
// guardian approval), its pre/post checks and its rollback.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// On a fresh 0096 database (0088, a readiness record, 0089-0096) proves:
//   1. at 0096 the defect: a buyer whose gift order was approved from their
//      own address gets a checkout and the payment is marked paid;
//   2. the pre-check runs read-only and counts the fixture correctly;
//   3. 0099 changes exactly one new function and two function bodies (no
//      ACL, table, policy or data change);
//   4. checkout (as the declaring adult, authenticated): self-approved via
//      the purchaser address, via a declaration address, and approval-missing
//      gift orders are refused with nothing written; genuine gift and
//      ordinary orders check out exactly as before; every other 0080 refusal
//      is unchanged;
//   5. payment (as service_role): those orders are never marked paid, one
//      append-only refusal event is recorded, a redelivery is a no-op;
//      genuine, ordinary, historical and Squad Invite payments apply exactly
//      as before; refunds/cancellations still work;
//   6. fail closed: with the approval read failing, checkout of a gift order
//      is refused and writes nothing, the payment call raises and rolls back
//      completely (dedup row included); ordinary orders are unaffected;
//   7. the helper agrees with the app's own loadApprovedGuardianEmail
//      (src/lib/gift-order-guardian.ts) on every fixture order, and only
//      service_role can call it;
//   8. the post-check passes and reproduces the pre-check counts;
//   9. 0099 refuses to apply twice or without 0080, changing nothing;
//  10. the rollback refuses without its acknowledgement, restores the exact
//      0096 catalog with it (and the defect is back), the acknowledgement
//      never persists, and 0099 re-applies to the exact 0099 catalog.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';
import { loadApprovedGuardianEmail } from '../../../src/lib/gift-order-guardian.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = fs.readFileSync(path.resolve(HERE, '../../migrations/0099_gift_checkout_requires_guardian_approval.sql'), 'utf8');
const ROLLBACK = fs.readFileSync(path.resolve(HERE, '../../rollback/0099_rollback.sql'), 'utf8');
const PRECHECK = fs.readFileSync(path.resolve(HERE, '../../verification/0099_precheck.sql'), 'utf8');
const POSTCHECK = fs.readFileSync(path.resolve(HERE, '../../verification/0099_postcheck.sql'), 'utf8');
const ACK = `select set_config('emblem.acknowledge_0099_rollback', 'REOPEN-SELF-APPROVED-GIFT-CHECKOUT', true)`;
const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();
const keysOf = (d) => [...d.added, ...d.removed, ...d.changed];
const sameCatalog = (a, b) => keysOf(diffCatalog(a, b)).length === 0;

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
  const tables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows.map((r) => r.relname);
  const parts = [];
  for (const t of tables) parts.push(`${t}:${(await db.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'e') h from public."${t}" x`)).rows[0].h}`);
  return parts.join(',');
}

// One statement as a role in its own transaction; `commit` false rolls it back.
async function as(db, role, uid, sql, params = [], { commit = true, before = null } = {}) {
  await db.exec('begin;');
  try {
    if (before) await db.exec(before);
    if (role === 'service_role') await db.exec('set local role service_role;');
    else if (role) await db.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [role, uid ?? '']);
    const r = await db.query(sql, params);
    await db.exec(commit ? 'commit;' : 'rollback;');
    return { status: 'ok', rows: r.rows };
  } catch (e) {
    await db.exec('rollback;');
    return { status: e.code ?? 'error', message: e.message };
  }
}

// --- Fixture at 0096 -----------------------------------------------------------------------
const db = await readyDatabase('0096');
const U = { buyer: id(), stranger: id(), parent: id() };
const EMAIL = { buyer: 'r5-buyer@example.test', billing: 'r5-billing@example.test', guardian: 'r5-guardian@example.test', parent: 'r5-parent@example.test' };
await db.query(`insert into auth.users (id, email) values ($1, $2), ($3, 'r5-stranger@example.test'), ($4, $5)`, [U.buyer, EMAIL.buyer, U.stranger, U.parent, EMAIL.parent]);

// k: [authority_status, purchaser_email, source, declaring adult, approved request email(s) oldest first]
const SPEC = {
  ordinary:        ['confirmed',                 EMAIL.parent,  'standalone_order', U.parent, []],
  historical:      [null,                        EMAIL.buyer,   'standalone_order', U.buyer,  []],
  squad:           [null,                        EMAIL.parent,  'squad_invite',     null,     []],
  genuine:         ['guardian_approved',         EMAIL.buyer,   'standalone_order', U.buyer,  [EMAIL.guardian]],
  selfPurchaser:   ['guardian_approved',         EMAIL.buyer,   'standalone_order', U.buyer,  ['  R5-Buyer@Example.TEST ']],
  selfDeclaration: ['guardian_approved',         EMAIL.billing, 'standalone_order', U.buyer,  [EMAIL.buyer]],
  missing:         ['guardian_approved',         EMAIL.buyer,   'standalone_order', U.buyer,  []],
  pending:         ['guardian_approval_pending', EMAIL.buyer,   'standalone_order', U.buyer,  []],
  declined:        ['guardian_declined',         EMAIL.buyer,   'standalone_order', U.buyer,  []],
  latestGenuine:   ['guardian_approved',         EMAIL.buyer,   'standalone_order', U.buyer,  [EMAIL.buyer, EMAIL.guardian]],
  latestSelf:      ['guardian_approved',         EMAIL.buyer,   'standalone_order', U.buyer,  [EMAIL.guardian, EMAIL.buyer]],
  // Purchaser address wrapped in a no-break space and a tab (JavaScript trim() strips both; btrim would not).
  selfWhitespace:  ['guardian_approved',         ' R5-Tab@example.test\t', 'standalone_order', U.buyer, ['r5-tab@example.test']],
  // Two approved rows, the buyer's with no responded_at: the app's PostgREST order (desc = NULLS FIRST) picks it.
  nullFirst:       ['guardian_approved',         EMAIL.buyer,   'standalone_order', U.buyer,  [EMAIL.guardian]],
};
const O = {};
let n = 0;
for (const [k, [authority, purchaser, source, adult, approvals]] of Object.entries(SPEC)) {
  O[k] = id();
  n += 1;
  await db.query(
    `insert into public.orders (id, order_ref, purchaser_email, source, payment_status, authority_status,
       currency, pricing_tier, paid_player_count, total_print_quantity, unit_price_pence, subtotal_pence, pricing_version, priced_at)
     values ($1, $2, $3, $4, 'order_intent', $5, 'GBP', 'single', 1, 1, 2499, 2499, 1, now())`,
    [O[k], `R5-${String(n).padStart(2, '0')}-${k}`, purchaser, source, authority]
  );
  if (adult) {
    const adultEmail = adult === U.buyer ? EMAIL.buyer : EMAIL.parent;
    await db.query(
      `insert into public.builder_order_authority_declarations (submission_key, order_id, adult_user_id, adult_email, relationship, declaration_version, confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation)
       values ($1, $2, $3, $4, $5, 'v1', true, true, true)`,
      [id(), O[k], adult, adultEmail, authority === 'confirmed' ? 'parent_guardian' : 'other_adult']
    );
  }
  let minutes = 60;
  for (const email of approvals) {
    await db.query(
      `insert into public.builder_guardian_approval_requests (order_id, guardian_email, token_hash, status, declaration_version, expires_at, responded_at, created_at)
       values ($1, $2, $3, 'approved', 'v1', now() + interval '14 days', now() - make_interval(mins => $4), now() - make_interval(mins => $4))`,
      [O[k], email, crypto.randomBytes(16).toString('hex'), minutes]
    );
    minutes -= 30;
  }
}
// 'missing' still has a request on file, just never approved (revoked).
await db.query(`insert into public.builder_guardian_approval_requests (order_id, guardian_email, token_hash, status, declaration_version, expires_at) values ($1, $2, $3, 'revoked', 'v1', now() + interval '14 days')`, [O.missing, EMAIL.guardian, crypto.randomBytes(16).toString('hex')]);
await db.query(`insert into public.builder_guardian_approval_requests (order_id, guardian_email, token_hash, status, declaration_version, expires_at, responded_at) values ($1, $2, $3, 'approved', 'v1', now() + interval '14 days', null)`, [O.nullFirst, EMAIL.buyer, crypto.randomBytes(16).toString('hex')]);
const BLOCKED = ['selfPurchaser', 'selfDeclaration', 'missing', 'latestSelf', 'selfWhitespace', 'nullFirst'];

const state = async (k) => (await db.query(`select payment_status, paid_at, shopify_order_id from public.orders where id = $1`, [O[k]])).rows[0];
const events = async (k) => Number((await db.query(`select count(*)::int c from public.payment_state_events where order_id = $1`, [O[k]])).rows[0].c);
const dedup = async (eid) => Number((await db.query(`select count(*)::int c from public.shopify_webhook_events where id = $1`, [eid])).rows[0].c);
const checkoutAs = (uid, k, opts) => as(db, 'authenticated', uid, `select public.begin_gate3_checkout($1) r`, [O[k]], opts);
const pay = (k, eid, to = 'paid', opts) =>
  as(db, 'service_role', null, `select public.apply_gate3_payment_event($1, $2, $3, $4, $5, 2499, 'GBP') r`, [O[k], eid, `orders/${to}`, to, `shop-${eid}`], opts);
const reason = (r) => (r.status === 'ok' ? r.rows[0].r.reason ?? (r.rows[0].r.ok ? 'ok' : r.rows[0].r.applied ? 'applied' : '?') : r.status);

// --- 1. At 0096: the defect -----------------------------------------------------------------
console.log('\n=== 1. at 0096 (before 0099) ===');
{
  const c = await checkoutAs(U.buyer, 'selfPurchaser', { commit: false });
  check('1. at 0096 a self-approved gift order (purchaser address) gets a checkout', c.status === 'ok' && c.rows[0].r.ok === true, reason(c));
  const d = await checkoutAs(U.buyer, 'selfDeclaration', { commit: false });
  check('1. …and so does one approved from the declaring adult\'s address', d.status === 'ok' && d.rows[0].r.ok === true, reason(d));
  const p = await pay('selfPurchaser', 'evt-0096-self', 'paid', { commit: false });
  check('1. …and its payment is marked paid', p.status === 'ok' && p.rows[0].r.applied === true, reason(p));
  check('1. (all of the above rolled back: fixture unchanged)', (await state('selfPurchaser')).payment_status === 'order_intent' && (await events('selfPurchaser')) === 0);
}

// --- 2. Pre-check ---------------------------------------------------------------------------
console.log('\n=== 2. pre-check ===');
const preData = await dataSnapshot(db);
const pre = (await as(db, null, null, PRECHECK, [], { commit: false, before: 'set transaction read only;' }));
const PRE = pre.rows?.[0] ?? {};
const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]));
const PREN = num(PRE);
check('2. pre-check runs in a READ ONLY transaction', pre.status === 'ok', pre.message);
check('2. pre-check guards: 0099 not applied, both functions are 0080', PREN.guard_not_applied === true && PREN.guard_begin_is_0080 === true && PREN.guard_apply_is_0080 === true);
const expectedPre = { gift_orders: 10, gift_approved: 8, gift_genuine: 2, gift_self_approved: 5, gift_approval_missing: 1, gift_not_approved: 2,
  blocked_approved_open: 6, blocked_not_approved_open: 2, blocked_paid: 0, blocked_total: 8, non_gift_open: 3 };
check('2. pre-check counts match the fixture', Object.entries(expectedPre).every(([k, v]) => PREN[k] === v), Object.fromEntries(Object.keys(expectedPre).map((k) => [k, PREN[k]])));
check('2. pre-check returns counts and booleans only (no ids, emails or names)', Object.values(PREN).every((v) => typeof v === 'number' || typeof v === 'boolean'));

// --- 3. Apply 0099 ---------------------------------------------------------------------------
console.log('\n=== 3. apply 0099 ===');
const SIGS = ['public.begin_gate3_checkout(uuid)', 'public.apply_gate3_payment_event(uuid, text, text, text, text, integer, text)'];
const fnMeta = async () => Promise.all(SIGS.map(async (sig) => (await db.query(`select p.proacl::text a, p.prosecdef s, p.proconfig::text c, pg_get_userbyid(p.proowner) o from pg_proc p where p.oid = to_regprocedure($1)`, [sig])).rows[0]));
const meta96 = await fnMeta();
const c96 = await snapshotCatalog(db);
await db.exec(MIGRATION);
const c99 = await snapshotCatalog(db);
const d = diffCatalog(c96, c99);
check('3. 0099 adds exactly one catalog object (the helper) and changes exactly the two payment functions',
  d.removed.length === 0 && d.added.length === 1 && /gift_order_checkout_block_reason/.test(String(d.added[0])) &&
  d.changed.length === 2 && d.changed.every((k) => /begin_gate3_checkout|apply_gate3_payment_event/.test(String(k))), { added: d.added, changed: d.changed, removed: d.removed });
{
  const meta99 = await fnMeta();
  check('3. both functions keep owner, SECURITY DEFINER, search_path and ACL exactly', JSON.stringify(meta96) === JSON.stringify(meta99), meta99);
}
check('3. applying 0099 changes no data', (await dataSnapshot(db)) === preData);

// --- 4. Checkout after 0099 ------------------------------------------------------------------
console.log('\n=== 4. checkout after 0099 ===');
for (const k of BLOCKED) {
  const before = await state(k), ev = await events(k);
  const r = await checkoutAs(U.buyer, k);
  const after = await state(k);
  check(`4. ${k}: checkout refused with gift_approval_invalid, nothing written`,
    reason(r) === 'gift_approval_invalid' && r.rows[0].r.ok === false && after.payment_status === before.payment_status && (await events(k)) === ev, `${reason(r)}, ${after.payment_status}`);
}
for (const k of ['genuine', 'latestGenuine']) {
  const r = await checkoutAs(U.buyer, k);
  check(`4. ${k}: genuine guardian-approved gift checks out exactly as before (snapshot returned, order_intent -> pending_payment, one event)`,
    r.status === 'ok' && r.rows[0].r.ok === true && r.rows[0].r.subtotalPence === 2499 && (await state(k)).payment_status === 'pending_payment' && (await events(k)) === 1, reason(r));
}
{
  const r = await checkoutAs(U.parent, 'ordinary');
  check('4. ordinary (confirmed) order checks out exactly as before', r.status === 'ok' && r.rows[0].r.ok === true && (await state('ordinary')).payment_status === 'pending_payment' && (await events('ordinary')) === 1, reason(r));
  const again = await checkoutAs(U.parent, 'ordinary');
  check('4. …and a repeat is still idempotent (no second event)', again.rows?.[0]?.r?.ok === true && (await events('ordinary')) === 1);
}
for (const [k, uid, want] of [['pending', U.buyer, 'authority_not_confirmed'], ['declined', U.buyer, 'authority_not_confirmed'], ['historical', U.buyer, 'authority_not_confirmed'],
  ['genuine', U.stranger, 'not_authorized'], ['selfPurchaser', U.stranger, 'not_authorized'], ['genuine', null, 'not_authenticated']]) {
  const r = uid ? await checkoutAs(uid, k) : await as(db, 'authenticated', '', `select public.begin_gate3_checkout($1) r`, [O[k]]);
  check(`4. unchanged 0080 refusal: ${k} as ${uid === U.stranger ? 'an unrelated adult' : uid ? 'the buyer' : 'no session'} -> ${want}`, reason(r) === want, reason(r));
}

// --- 5. Payment after 0099 -------------------------------------------------------------------
console.log('\n=== 5. payment after 0099 ===');
// selfPurchaser simulates a checkout opened before 0099 (pending_payment).
await db.query(`update public.orders set payment_status = 'pending_payment' where id = $1`, [O.selfPurchaser]);
for (const k of [...BLOCKED, 'pending', 'declined']) {
  const before = await state(k), ev = await events(k);
  const eid = `evt-${k}`;
  const r = await pay(k, eid);
  const after = await state(k);
  const refusal = (await db.query(`select from_status, to_status, reason, shopify_event_id from public.payment_state_events where order_id = $1 order by created_at desc limit 1`, [O[k]])).rows[0];
  check(`5. ${k}: payment not applied (gift_approval_invalid), status/paid_at/shopify id unchanged, one refusal event, dedup recorded`,
    reason(r) === 'gift_approval_invalid' && r.rows[0].r.applied === false && after.payment_status === before.payment_status && after.paid_at === null && after.shopify_order_id === null &&
    (await events(k)) === ev + 1 && refusal.reason === `paid_refused_gift_approval_invalid:shopify_order_id=shop-${eid}` && refusal.from_status === before.payment_status && refusal.to_status === before.payment_status &&
    refusal.shopify_event_id === eid && (await dedup(eid)) === 1, `${reason(r)}, ${after.payment_status}`);
  const again = await pay(k, eid);
  check(`5. ${k}: redelivery is a duplicate_event no-op (no second refusal event)`, reason(again) === 'duplicate_event' && (await events(k)) === ev + 1);
}
for (const k of ['genuine', 'latestGenuine', 'ordinary', 'historical', 'squad']) {
  const r = await pay(k, `evt-${k}`);
  const s = await state(k);
  check(`5. ${k}: payment applied exactly as before (paid, paid_at and Shopify id recorded)`, r.status === 'ok' && r.rows[0].r.applied === true && s.payment_status === 'paid' && s.paid_at !== null && s.shopify_order_id === `shop-evt-${k}`, reason(r));
}
{
  const r = await pay('genuine', 'evt-genuine-refund', 'refunded');
  check('5. a refund of a genuine paid gift order still applies', r.rows?.[0]?.r?.applied === true && (await state('genuine')).payment_status === 'refunded', reason(r));
  const c = await pay('selfPurchaser', 'evt-self-cancel', 'cancelled');
  check('5. a refused gift order can still be cancelled (staff clean-up path unchanged)', c.rows?.[0]?.r?.applied === true && (await state('selfPurchaser')).payment_status === 'cancelled', reason(c));
  const late = await pay('selfDeclaration', 'evt-selfdecl-fail', 'failed');
  check('5. …and marked failed', late.rows?.[0]?.r?.applied === true && (await state('selfDeclaration')).payment_status === 'failed', reason(late));
}

// --- 6. Fail closed --------------------------------------------------------------------------
console.log('\n=== 6. fail closed (approval read fails) ===');
// Fresh unpaid orders for this section, so earlier sections don't mask anything.
const F = { gift: id(), ordinary: id() };
for (const [k, authority, adult, adultEmail, rel] of [['gift', 'guardian_approved', U.buyer, EMAIL.buyer, 'other_adult'], ['ordinary', 'confirmed', U.parent, EMAIL.parent, 'parent_guardian']]) {
  await db.query(`insert into public.orders (id, order_ref, purchaser_email, source, payment_status, authority_status, currency, pricing_tier, paid_player_count, total_print_quantity, unit_price_pence, subtotal_pence, pricing_version, priced_at)
                  values ($1, $2, $3, 'standalone_order', 'order_intent', $4, 'GBP', 'single', 1, 1, 2499, 2499, 1, now())`, [F[k], `R5-FAIL-${k}`, adultEmail, authority]);
  await db.query(`insert into public.builder_order_authority_declarations (submission_key, order_id, adult_user_id, adult_email, relationship, declaration_version, confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation) values ($1, $2, $3, $4, $5, 'v1', true, true, true)`, [id(), F[k], adult, adultEmail, rel]);
}
await db.query(`insert into public.builder_guardian_approval_requests (order_id, guardian_email, token_hash, status, declaration_version, expires_at, responded_at) values ($1, $2, $3, 'approved', 'v1', now() + interval '14 days', now())`, [F.gift, EMAIL.guardian, crypto.randomBytes(16).toString('hex')]);
const BREAK = 'alter table public.builder_guardian_approval_requests rename to r5_unavailable;';
{
  // Each call breaks the approval table inside its own transaction, then rolls everything back.
  const fstate = async (k) => (await db.query(`select payment_status from public.orders where id = $1`, [F[k]])).rows[0].payment_status;
  const fevents = async (k) => Number((await db.query(`select count(*)::int c from public.payment_state_events where order_id = $1`, [F[k]])).rows[0].c);
  await db.exec('begin;');
  await db.exec(BREAK);
  await db.query(`select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true)`, [U.buyer]);
  const g = (await db.query(`select public.begin_gate3_checkout($1) r`, [F.gift])).rows[0].r;
  await db.exec('reset role;');
  const gStatus = (await db.query(`select payment_status from public.orders where id = $1`, [F.gift])).rows[0].payment_status;
  const gEvents = Number((await db.query(`select count(*)::int c from public.payment_state_events where order_id = $1`, [F.gift])).rows[0].c);
  await db.query(`select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true)`, [U.parent]);
  const o = (await db.query(`select public.begin_gate3_checkout($1) r`, [F.ordinary])).rows[0].r;
  await db.exec('rollback;');
  check('6. checkout of a genuine gift order is refused with gift_approval_unverified when the approval read fails, and writes nothing', g.ok === false && g.reason === 'gift_approval_unverified' && gStatus === 'order_intent' && gEvents === 0, g);
  check('6. an ordinary order still checks out while the approval read is failing (never reads it)', o.ok === true, o);

  await db.exec('begin;');
  await db.exec(BREAK);
  await db.exec('set local role service_role;');
  await db.exec('savepoint s;');
  let raised = null;
  try { await db.query(`select public.apply_gate3_payment_event($1, 'evt-fail-gift', 'orders/paid', 'paid', 'shop-fail', 2499, 'GBP')`, [F.gift]); } catch (e) { raised = e.message; }
  await db.exec('rollback to savepoint s;');
  const dedupInTx = Number((await db.query(`select count(*)::int c from public.shopify_webhook_events where id = 'evt-fail-gift'`)).rows[0].c);
  const ordinaryPay = (await db.query(`select public.apply_gate3_payment_event($1, 'evt-fail-ordinary', 'orders/paid', 'paid', 'shop-fail-o', 2499, 'GBP') r`, [F.ordinary])).rows[0].r;
  await db.exec('rollback;');
  check('6. the payment call raises when the approval read fails (route returns 500, Shopify retries)', raised !== null && /r5_unavailable|builder_guardian_approval_requests|does not exist/.test(raised), raised);
  check('6. …and rolls back completely: no dedup row, order unchanged, no event', dedupInTx === 0 && (await fstate('gift')) === 'order_intent' && (await fevents('gift')) === 0 && (await dedup('evt-fail-gift')) === 0);
  check('6. an ordinary payment still applies while the approval read is failing', ordinaryPay.applied === true, ordinaryPay);
  // After the fault clears, the same delivery applies normally (Shopify's retry).
  const retry = await as(db, 'service_role', null, `select public.apply_gate3_payment_event($1, 'evt-fail-gift', 'orders/paid', 'paid', 'shop-fail', 2499, 'GBP') r`, [F.gift]);
  check('6. once the read works again, Shopify\'s retry of the same delivery applies the genuine payment', retry.rows?.[0]?.r?.applied === true && (await fstate('gift')) === 'paid', reason(retry));
}

// --- 7. Helper: agrees with the app, and access ------------------------------------------------
console.log('\n=== 7. helper vs app rule, access ===');
{
  // Minimal read-only service-role client for loadApprovedGuardianEmail.
  const IDENT = /^[a-z_]+$/;
  const client = {
    from(table) {
      if (!IDENT.test(table)) throw new Error('bad table');
      const q = { cols: '*', where: [], params: [], order: null, limit: null };
      const run = async () => {
        let sql = `select ${q.cols} from public.${table}`;
        if (q.where.length) sql += ` where ${q.where.join(' and ')}`;
        if (q.order) sql += ` order by ${q.order}`;
        if (q.limit) sql += ` limit ${q.limit}`;
        const r = await as(db, 'service_role', null, sql, q.params, { commit: false, before: 'set transaction read only;' });
        return r.status === 'ok' ? { data: r.rows, error: null } : { data: null, error: { message: r.message } };
      };
      const b = {
        select(c) { q.cols = c; return b; },
        eq(c, v) { q.params.push(v); q.where.push(`${c} = $${q.params.length}`); return b; },
        order(c, o) { q.order = `${c} ${o?.ascending === false ? 'desc' : 'asc'}`; return b; },
        limit(x) { q.limit = Number(x); return b; },
        then: (res, rej) => run().then(res, rej),
      };
      return b;
    },
  };
  const mismatches = [];
  for (const k of ['genuine', 'selfPurchaser', 'selfDeclaration', 'missing', 'latestGenuine', 'latestSelf', 'selfWhitespace', 'nullFirst']) {
    const purchaser = (await db.query(`select purchaser_email from public.orders where id = $1`, [O[k]])).rows[0].purchaser_email;
    const app = await loadApprovedGuardianEmail(client, O[k], purchaser);
    const sqlReason = (await as(db, 'service_role', null, `select public.gift_order_checkout_block_reason($1) r`, [O[k]], { commit: false })).rows[0].r;
    const appAllows = app.ok && app.email !== null;
    if (appAllows !== (sqlReason === null)) mismatches.push({ k, app, sqlReason });
  }
  check('7. for every guardian_approved fixture order the SQL helper and the app\'s loadApprovedGuardianEmail agree', mismatches.length === 0, mismatches);
  const reasons = {};
  for (const k of Object.keys(O)) reasons[k] = (await as(db, 'service_role', null, `select public.gift_order_checkout_block_reason($1) r`, [O[k]], { commit: false })).rows[0].r;
  check('7. helper reasons per order', reasons.ordinary === null && reasons.historical === null && reasons.squad === null && reasons.genuine === null && reasons.latestGenuine === null &&
    reasons.selfPurchaser === 'gift_self_approved' && reasons.selfDeclaration === 'gift_self_approved' && reasons.latestSelf === 'gift_self_approved' &&
    reasons.selfWhitespace === 'gift_self_approved' && reasons.nullFirst === 'gift_self_approved' &&
    reasons.missing === 'gift_approval_missing' && reasons.pending === 'gift_not_approved' && reasons.declined === 'gift_not_approved', reasons);
  const none = await as(db, 'service_role', null, `select public.gift_order_checkout_block_reason($1) r`, [id()], { commit: false });
  check('7. helper returns NULL for an unknown order id (callers already refuse unknown orders)', none.rows[0].r === null);
  const auth = await as(db, 'authenticated', U.buyer, `select public.gift_order_checkout_block_reason($1)`, [O.genuine], { commit: false });
  const anon = await as(db, 'anon', '', `select public.gift_order_checkout_block_reason($1)`, [O.genuine], { commit: false });
  check('7. authenticated and anon cannot call the helper (42501)', auth.status === '42501' && anon.status === '42501', `${auth.status}, ${anon.status}`);
}

// --- 8. Post-check -----------------------------------------------------------------------------
console.log('\n=== 8. post-check ===');
{
  // Post-check on a fresh copy of the fixture state just after applying, so its counts are comparable to the pre-check.
  const fresh = await readyDatabase('0096');
  // Re-create the same fixture shape cheaply: copy the relevant rows across.
  const copy = async (table, cols) => {
    const rows = (await db.query(`select ${cols} from public.${table} where order_id = any($1) or $2`, [Object.values(O), false])).rows;
    for (const r of rows) {
      const keys = Object.keys(r);
      await fresh.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((x) => r[x]));
    }
  };
  for (const u of (await db.query(`select id, email from auth.users where id = any($1)`, [Object.values(U)])).rows) await fresh.query(`insert into auth.users (id, email) values ($1, $2)`, [u.id, u.email]);
  for (const [k, [authority, purchaser, source]] of Object.entries(SPEC)) {
    await fresh.query(`insert into public.orders (id, order_ref, purchaser_email, source, payment_status, authority_status, currency, pricing_tier, paid_player_count, total_print_quantity, unit_price_pence, subtotal_pence, pricing_version, priced_at)
                       values ($1, $2, $3, $4, 'order_intent', $5, 'GBP', 'single', 1, 1, 2499, 2499, 1, now())`, [O[k], `R5-${k}`, purchaser, source, authority]);
  }
  await copy('builder_order_authority_declarations', 'submission_key, order_id, adult_user_id, adult_email, relationship, declaration_version, confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation');
  await copy('builder_guardian_approval_requests', 'order_id, guardian_email, token_hash, status, declaration_version, expires_at, responded_at, created_at');
  const preFresh = num((await as(fresh, null, null, PRECHECK, [], { commit: false, before: 'set transaction read only;' })).rows[0]);
  check('8. (fresh copy) pre-check reproduces section 2', Object.entries(expectedPre).every(([k, v]) => preFresh[k] === v), preFresh);
  const postBlocked = await as(fresh, null, null, POSTCHECK, [], { commit: false, before: 'set transaction read only;' });
  check('8. post-check before 0099 fails loudly (helper missing), so it cannot be mistaken for a pass', postBlocked.status !== 'ok', postBlocked.status);
  await fresh.exec(MIGRATION);
  const post = await as(fresh, null, null, POSTCHECK, [], { commit: false, before: 'set transaction read only;' });
  const P = num(post.rows?.[0] ?? {});
  check('8. post-check runs in a READ ONLY transaction', post.status === 'ok', post.message);
  const flags = Object.entries(P).filter(([k]) => /^(helper_|begin_|apply_)/.test(k));
  check('8. post-check: every helper_/begin_/apply_ flag is true', flags.length === 8 && flags.every(([, v]) => v === true), Object.fromEntries(flags));
  check('8. post-check: non_gift_blocked = 0 and refused_payment_events = 0', P.non_gift_blocked === 0 && P.refused_payment_events === 0, P);
  const same = ['gift_orders', 'gift_genuine', 'gift_self_approved', 'gift_approval_missing', 'gift_not_approved', 'blocked_approved_open', 'blocked_not_approved_open', 'blocked_paid', 'blocked_total'];
  check('8. post-check reproduces every pre-check count (inline rule == helper)', same.every((k) => P[k] === preFresh[k]), Object.fromEntries(same.map((k) => [k, [preFresh[k], P[k]]])));
  check('8. post-check returns counts and booleans only', Object.values(P).every((v) => typeof v === 'number' || typeof v === 'boolean'));
  // On the main database (after section 5), the refused payments are counted.
  const live = num((await as(db, null, null, POSTCHECK, [], { commit: false, before: 'set transaction read only;' })).rows[0]);
  check('8. post-check counts refused payments (section 5 recorded 8)', live.refused_payment_events === 8, live.refused_payment_events);
}

// --- 9. Preconditions -------------------------------------------------------------------------
console.log('\n=== 9. preconditions ===');
{
  const before = await snapshotCatalog(db);
  let refusal = null;
  try { await db.exec(MIGRATION); } catch (e) { refusal = e.message; await db.exec('rollback;').catch(() => {}); }
  check('9. 0099 refuses to apply twice, changing nothing', /0099 refused: .*already applied/.test(refusal ?? '') && sameCatalog(before, await snapshotCatalog(db)), refusal);
  const old = await createDatabase();
  await applyMigrations(old, { through: '0077' });
  const oldBefore = await snapshotCatalog(old);
  let oldRefusal = null;
  try { await old.exec(MIGRATION); } catch (e) { oldRefusal = e.message; await old.exec('rollback;').catch(() => {}); }
  check('9. 0099 refuses without the 0080 functions, changing nothing', /0099 refused: the expected 0080 state is not in place/.test(oldRefusal ?? '') && sameCatalog(oldBefore, await snapshotCatalog(old)), oldRefusal);
}

// --- 10. Rollback -----------------------------------------------------------------------------
console.log('\n=== 10. rollback ===');
{
  const dataBefore = await dataSnapshot(db);
  let refusal = null;
  try { await db.exec(ROLLBACK); } catch (e) { refusal = e.message; await db.exec('rollback;').catch(() => {}); }
  check('10. rollback refuses without the acknowledgement, changing nothing', /0099 rollback refused/.test(refusal ?? '') && sameCatalog(c99, await snapshotCatalog(db)), refusal);
  await db.exec('begin;');
  await db.query(ACK);
  await db.exec(ROLLBACK.replace(/^begin;$/m, ''));
  const cBack = await snapshotCatalog(db);
  check('10. with the acknowledgement it restores the exact 0096 catalog', sameCatalog(c96, cBack), keysOf(diffCatalog(c96, cBack)));
  check('10. the rollback changes no data (refusal events stay as history)', (await dataSnapshot(db)) === dataBefore);
  const ack = (await db.query(`select coalesce(current_setting('emblem.acknowledge_0099_rollback', true), '') v`)).rows[0].v;
  check('10. the acknowledgement does not persist', ack === '', ack);
  const reopened = await checkoutAs(U.buyer, 'latestSelf', { commit: false });
  check('10. after rollback the R5 defect is back (proves the rollback really restores 0080)', reopened.rows?.[0]?.r?.ok === true, reason(reopened));
  let again = null;
  try { await db.exec('begin;'); await db.query(ACK); await db.exec(ROLLBACK.replace(/^begin;$/m, '')); } catch (e) { again = e.message; await db.exec('rollback;').catch(() => {}); }
  check('10. a second rollback refuses (0099 not applied)', /0099 is not applied/.test(again ?? ''), again);
  await db.exec(MIGRATION);
  check('10. 0099 re-applies to the exact 0099 catalog', sameCatalog(c99, await snapshotCatalog(db)));
  const blockedAgain = await checkoutAs(U.buyer, 'latestSelf', { commit: false });
  check('10. …and the block is back in force', reason(blockedAgain) === 'gift_approval_invalid', reason(blockedAgain));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
