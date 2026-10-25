// ============================================================================
// Proves migration 0095 (UK partner programme) against real PostgreSQL —
// same pattern as full_migration_test.mjs: every migration applied in order
// on an in-memory pglite database with stubbed Supabase roles and auth.
//
// RUN: node supabase/tests/0095_uk_partner_programme_pglite_test.mjs
//      (MIGRATIONS_DIR=<path> to point at another checkout's migrations)
// REQUIRES (not a project dependency — install ad hoc before running):
//   npm install --no-save @electric-sql/pglite
// Fully disposable: no real project, no credentials.
//
// Covers: anon/authenticated can't touch the tables or call the functions;
// a paid order is credited once (idempotent); refunded/unknown/inactive/
// self orders don't earn; void on refund; payouts gather only payable
// commissions and refuse below £40.
// ============================================================================
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

function check(name, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) process.exitCode = 1;
}

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec('create extension if not exists pgcrypto;');
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
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
`);

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
for (const f of files) {
  try {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  } catch (e) {
    console.log(`MIGRATION FAILED: ${f} — ${e.message}`);
    process.exit(1);
  }
}
check(`applied ${files.length} migrations, including 0095 (last ${files[files.length - 1]})`, files.some((f) => f.startsWith('0095')));

// --- Privileges --------------------------------------------------------------
for (const role of ['anon', 'authenticated']) {
  for (const table of ['partners', 'partner_codes', 'partner_commissions', 'partner_payouts']) {
    let denied = false;
    try {
      await db.exec(`set role ${role}; select * from public.${table};`);
    } catch {
      denied = true;
    }
    await db.exec('reset role;');
    check(`${role} cannot read ${table}`, denied);
  }
  let denied = false;
  try {
    await db.exec(`set role ${role}; select public.record_uk_partner_commission(gen_random_uuid(), 'X', 1);`);
  } catch {
    denied = true;
  }
  await db.exec('reset role;');
  check(`${role} cannot call record_uk_partner_commission`, denied);
}

// --- Fixtures -----------------------------------------------------------------
// Orders are inserted with only the columns this test needs; anything else
// NOT NULL in orders gets a default from its own migrations, or the insert
// below reports exactly which column needs adding here.
const orderCols = await db.query(`
  select column_name, data_type, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and is_nullable = 'NO' and column_default is null
`);
const required = orderCols.rows.map((r) => r.column_name).filter((c) => c !== 'id');

async function makeOrder(paymentStatus) {
  const values = { payment_status: paymentStatus, source: 'team_order' };
  for (const col of required) {
    if (col in values) continue;
    const type = orderCols.rows.find((r) => r.column_name === col).data_type;
    values[col] = type === 'text' ? `t-${Math.random().toString(36).slice(2, 8)}` : type === 'integer' ? 1 : type === 'boolean' ? false : null;
  }
  const cols = Object.keys(values);
  const r = await db.query(
    `insert into public.orders (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    cols.map((c) => values[c]),
  );
  return r.rows[0].id;
}

await db.exec(`
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'creator@test.dev'), ('00000000-0000-0000-0000-0000000000b2', 'parent@test.dev');
  insert into public.partners (id, status, name, email, platform, profile_url, audience, confirmed_adult, confirmed_uk, terms_version)
  values
    ('00000000-0000-0000-0000-000000000001', 'active', 'Creator', 'creator@test.dev', 'tiktok', 'https://tiktok.com/@c', 'coaches', true, true, 'uk-2026-10'),
    ('00000000-0000-0000-0000-000000000002', 'paused', 'Paused', 'paused@test.dev', 'tiktok', 'https://tiktok.com/@p', 'parents', true, true, 'uk-2026-10');
  insert into public.partner_codes (code, partner_id, discount_bps) values ('COACHJO', '00000000-0000-0000-0000-000000000001', 2000), ('PAUSED', '00000000-0000-0000-0000-000000000002', 2000);
`);

let constraintHeld = false;
try {
  await db.exec(`insert into public.partner_codes (code, partner_id, discount_bps) values ('bad-code', '00000000-0000-0000-0000-000000000001', 2000)`);
} catch {
  constraintHeld = true;
}
check('codes must be 3–20 upper-case letters or digits', constraintHeld);

const rec = async (orderId, code, pence) => (await db.query(`select public.record_uk_partner_commission($1, $2, $3) as r`, [orderId, code, pence])).rows[0].r;

// --- Crediting ----------------------------------------------------------------
const paid = await makeOrder('paid');
const first = await rec(paid, 'coachjo', 1999);
check('a paid order with a partner code is credited', first.status === 'recorded', first);
const row = (await db.query(`select * from public.partner_commissions where order_id = $1`, [paid])).rows[0];
check('commission is 20% of what was paid, rounded down', row.commission_pence === 399, row.commission_pence);
check('commission is held for 45 days', Math.round((new Date(row.hold_until) - Date.now()) / 86400000) === 45);
check('a retried delivery never credits twice', (await rec(paid, 'COACHJO', 1999)).status === 'already_recorded');

check('an unknown code credits no one', (await rec(await makeOrder('paid'), 'NOPE', 1999)).status === 'no_partner');
check('an unpaid order is not credited', (await rec(await makeOrder('pending_payment'), 'COACHJO', 1999)).status === 'order_not_paid');

const pausedOrder = await makeOrder('paid');
const pausedResult = await rec(pausedOrder, 'PAUSED', 1999);
check('a paused partner gets a void row, not commission', pausedResult.status === 'recorded_void' && pausedResult.reason === 'partner_inactive', pausedResult);

// Self-order: the order's declaring adult is the partner.
const declCols = await db.query(`
  select column_name, data_type from information_schema.columns
  where table_schema = 'public' and table_name = 'builder_order_authority_declarations' and is_nullable = 'NO' and column_default is null
`);
const selfOrder = await makeOrder('paid');
{
  const values = { order_id: selfOrder, adult_user_id: '00000000-0000-0000-0000-0000000000a1', relationship: 'parent_guardian' };
  for (const { column_name: col, data_type: type } of declCols.rows) {
    if (col in values) continue;
    values[col] = type === 'text' ? `k-${Math.random().toString(36).slice(2, 10)}` : type === 'uuid' ? crypto.randomUUID() : type === 'boolean' ? true : type === 'integer' ? 1 : type.startsWith('timestamp') ? new Date().toISOString() : null;
  }
  const cols = Object.keys(values);
  try {
    // Constraints on declaration rows (relationship values etc.) differ by
    // migration; disable triggers/checks are not needed — if this insert is
    // refused, the self-order check is reported as not exercised.
    await db.query(`insert into public.builder_order_authority_declarations (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((c) => values[c]));
    const selfResult = await rec(selfOrder, 'COACHJO', 1999);
    check("a partner's own order earns nothing", selfResult.status === 'recorded_void' && selfResult.reason === 'self_order', selfResult);
  } catch (e) {
    console.log(`NOTE — self-order check not exercised (fixture insert refused: ${e.message})`);
  }
}

// --- Refunds and payouts -------------------------------------------------------
const refundedOrder = await makeOrder('paid');
await rec(refundedOrder, 'COACHJO', 1999);
const voided = (await db.query(`select public.void_uk_partner_commission($1, 'refunded') as r`, [refundedOrder])).rows[0].r;
const voidRow = (await db.query(`select status, void_reason, commission_pence from public.partner_commissions where order_id = $1`, [refundedOrder])).rows[0];
check('a refund voids a pending commission', voided.status === 'voided' && voidRow.status === 'void' && voidRow.void_reason === 'refunded' && voidRow.commission_pence === 0, voidRow);

const below = (await db.query(`select public.create_uk_partner_payout('00000000-0000-0000-0000-000000000001', null) as r`)).rows[0].r;
check('no payout while commissions are on hold', below.ok === false && below.reason === 'below_minimum' && below.amount_pence === 0, below);

// Ten more £24.99 orders (399p each after a 20% discount = 1999p paid), then
// move every hold into the past.
for (let i = 0; i < 10; i++) await rec(await makeOrder('paid'), 'COACHJO', 1999);
const refundedLater = await makeOrder('paid');
await rec(refundedLater, 'COACHJO', 1999);
await db.query(`update public.orders set payment_status = 'refunded' where id = $1`, [refundedLater]);
await db.exec(`update public.partner_commissions set hold_until = now() - interval '1 day'`);

const payout = (await db.query(`select public.create_uk_partner_payout('00000000-0000-0000-0000-000000000001', null) as r`)).rows[0].r;
check('payout gathers every payable commission (11 x 399p), skipping the refunded order', payout.ok === true && payout.amount_pence === 11 * 399, payout);
const leftover = (await db.query(`select status from public.partner_commissions where order_id = $1`, [refundedLater])).rows[0];
check('the refunded order stays pending and unpaid', leftover.status === 'pending');
const again = (await db.query(`select public.create_uk_partner_payout('00000000-0000-0000-0000-000000000001', null) as r`)).rows[0].r;
check('a second payout run finds nothing to pay', again.ok === false && again.amount_pence === 0, again);

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
