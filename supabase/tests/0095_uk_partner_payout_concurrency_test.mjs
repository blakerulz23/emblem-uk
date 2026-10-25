// ============================================================================
// Migration 0095: payout / void / refund CONCURRENCY tests against a real,
// multi-connection PostgreSQL server (pglite runs one connection, so it
// cannot test this). Uses a throwaway local server from `embedded-postgres`.
//
// RUN: node supabase/tests/0095_uk_partner_payout_concurrency_test.mjs
//      (MIGRATIONS_DIR=<path> to point at another checkout's migrations)
// REQUIRES (not project dependencies; install ad hoc before running):
//   npm install --no-save embedded-postgres@17.10.0-beta.17 pg
// Fully disposable: a temporary data directory, deleted at the end. No real
// project, no credentials.
//
// Every interleaving below is forced deterministically: one connection
// holds its transaction open while the test proves (from pg_stat_activity)
// that the other is genuinely blocked on a lock, then releases it.
// ============================================================================
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'emblem-0095-'));
const PORT = 54000 + Math.floor(Math.random() * 1000);

let failures = 0;
function check(name, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) failures++;
}

const server = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
await server.initialise();
await server.start();
await server.createDatabase('emblem');
const pool = new pg.Pool({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'emblem', max: 20 });

try {
  const version = (await pool.query('show server_version')).rows[0].server_version;
  const isolation = (await pool.query('show default_transaction_isolation')).rows[0].default_transaction_isolation;
  console.log(`PostgreSQL ${version}, default isolation ${isolation}\n`);

  // --- Supabase-compatible stubs, as in full_migration_test.mjs ---
  await pool.query(`
    create extension if not exists pgcrypto;
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
    grant usage on schema public to anon, authenticated, service_role;
  `);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    try {
      await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    } catch (e) {
      console.log(`MIGRATION FAILED: ${f} — ${e.message}`);
      process.exitCode = 1;
      throw e;
    }
  }
  check(`applied ${files.length} migrations on a real server, ending with ${files[files.length - 1]}`, files[files.length - 1].startsWith('0095'));

  // --- Fixtures ---------------------------------------------------------------
  const orderCols = (await pool.query(`
    select column_name, data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and is_nullable = 'NO' and column_default is null and column_name <> 'id'
  `)).rows;

  async function makeOrder(status = 'paid') {
    const values = { payment_status: status, source: 'team_order' };
    for (const { column_name: col, data_type: type } of orderCols) {
      if (col in values) continue;
      values[col] = type === 'text' ? `t-${Math.random().toString(36).slice(2, 10)}` : type === 'integer' ? 1 : type === 'boolean' ? false : null;
    }
    const cols = Object.keys(values);
    const r = await pool.query(`insert into public.orders (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, cols.map((c) => values[c]));
    return r.rows[0].id;
  }

  let partnerSeq = 0;
  /** An active partner with `count` paid orders, each credited 1999p (399p commission) and past the hold. */
  async function seedPartner(count) {
    partnerSeq++;
    const code = `CODE${partnerSeq}`;
    const partnerId = (await pool.query(
      `insert into public.partners (status, name, email, platform, profile_url, audience, confirmed_adult, confirmed_uk, terms_version)
       values ('active', 'Creator', $1, 'tiktok', 'https://tiktok.com/@c', 'coaches', true, true, 'uk-2026-10') returning id`,
      [`creator${partnerSeq}@test.dev`],
    )).rows[0].id;
    await pool.query(`insert into public.partner_codes (code, partner_id, discount_bps) values ($1, $2, 2000)`, [code, partnerId]);
    const orders = [];
    for (let i = 0; i < count; i++) {
      const orderId = await makeOrder('paid');
      const r = (await pool.query(`select public.record_uk_partner_commission($1, $2, 1999) as r`, [orderId, code])).rows[0].r;
      if (r.status !== 'recorded') throw new Error(`seed failed: ${JSON.stringify(r)}`);
      orders.push(orderId);
    }
    await pool.query(`update public.partner_commissions set hold_until = now() - interval '1 day' where partner_id = $1`, [partnerId]);
    return { partnerId, orders };
  }

  /** Every payout's amount equals the sum of its linked commissions (and it has at least one). */
  async function payoutsBalanced() {
    const r = await pool.query(`
      select p.id, p.amount_pence, coalesce(sum(c.commission_pence), 0)::int as linked_sum, count(c.id)::int as linked_count
      from public.partner_payouts p left join public.partner_commissions c on c.payout_id = p.id
      group by p.id, p.amount_pence
      having p.amount_pence <> coalesce(sum(c.commission_pence), 0) or count(c.id) = 0
    `);
    return r.rows;
  }

  async function backendPid(client) {
    return (await client.query('select pg_backend_pid() as pid')).rows[0].pid;
  }

  /** Waits until `pid` is blocked on a lock (true), or gives up after 5 s (false). */
  async function waitUntilBlocked(pid) {
    for (let i = 0; i < 100; i++) {
      const r = await pool.query(`select wait_event_type from pg_stat_activity where pid = $1`, [pid]);
      if (r.rows[0]?.wait_event_type === 'Lock') return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  async function commissionOf(orderId) {
    return (await pool.query(`select status, payout_id, commission_pence from public.partner_commissions where order_id = $1`, [orderId])).rows[0];
  }

  const payout = (client, partnerId) => client.query(`select public.create_uk_partner_payout($1, null) as r`, [partnerId]).then((x) => x.rows[0].r);
  const voidCommission = (client, orderId) => client.query(`select public.void_uk_partner_commission($1, 'refunded') as r`, [orderId]).then((x) => x.rows[0].r);

  // ==========================================================================
  // 1. Payout versus refund / void
  // ==========================================================================
  console.log('\n— 1. Payout versus refund/void —');

  // 1a. Payout allocates first; the void waits, then leaves the paid commission alone.
  {
    const { partnerId, orders } = await seedPartner(11);
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query('begin');
      const p = await payout(a, partnerId);
      const bPid = await backendPid(b);
      const voidPromise = voidCommission(b, orders[0]);
      check('1a: a void started during an open payout is blocked on the partner lock', await waitUntilBlocked(bPid));
      await a.query('commit');
      const v = await voidPromise;
      check('1a: payout of all 11 commissions (11 x 399p)', p.ok && p.amount_pence === 4389 && p.commission_count === 11, p);
      check('1a: the late void reports the commission as already paid and leaves it (staff reconcile)', v.status === 'paid', v);
      check('1a: that commission is still in the payout at full value', (await commissionOf(orders[0])).status === 'paid');
    } finally {
      a.release();
      b.release();
    }
    check('1a: payout amount equals its linked commissions', (await payoutsBalanced()).length === 0);
  }

  // 1b. The void commits first; the payout waits, then excludes the voided commission.
  {
    const { partnerId, orders } = await seedPartner(12);
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await b.query('begin');
      const v = await voidCommission(b, orders[0]);
      const aPid = await backendPid(a);
      const payoutPromise = payout(a, partnerId);
      check('1b: a payout started during an open void is blocked', await waitUntilBlocked(aPid));
      await b.query('commit');
      const p = await payoutPromise;
      check('1b: the void succeeded', v.status === 'voided', v);
      check('1b: the payout has the other 11 commissions only (11 x 399p)', p.ok && p.amount_pence === 4389 && p.commission_count === 11, p);
      const c = await commissionOf(orders[0]);
      check('1b: the voided commission is not in the payout', c.status === 'void' && c.payout_id === null, c);
    } finally {
      a.release();
      b.release();
    }
    check('1b: payout amount equals its linked commissions', (await payoutsBalanced()).length === 0);
  }

  // 1c. A refund is mid-transaction on an order (as apply_gate3_payment_event
  //     holds it FOR UPDATE); the payout waits for it, re-checks, and drops it.
  {
    const { partnerId, orders } = await seedPartner(12);
    const a = await pool.connect();
    const r = await pool.connect();
    try {
      await r.query('begin');
      await r.query(`select id from public.orders where id = $1 for update`, [orders[0]]);
      await r.query(`update public.orders set payment_status = 'refunded' where id = $1`, [orders[0]]);
      const aPid = await backendPid(a);
      const payoutPromise = payout(a, partnerId);
      check('1c: a payout reaching an order that a refund is changing is blocked', await waitUntilBlocked(aPid));
      await r.query('commit');
      const p = await payoutPromise;
      check('1c: the refunded order drops out of the payout (11 x 399p)', p.ok && p.amount_pence === 4389 && p.commission_count === 11, p);
      const c = await commissionOf(orders[0]);
      check('1c: its commission stays pending and unpaid (voided by the refund webhook)', c.status === 'pending' && c.payout_id === null, c);
    } finally {
      a.release();
      r.release();
    }
    check('1c: payout amount equals its linked commissions', (await payoutsBalanced()).length === 0);
  }

  // 1d. The payout has locked its set; a refund on one of those orders waits
  //     until the payout commits (the set cannot change underneath it).
  {
    const { partnerId, orders } = await seedPartner(11);
    const a = await pool.connect();
    const r = await pool.connect();
    try {
      await a.query('begin');
      const p = await payout(a, partnerId);
      const rPid = await backendPid(r);
      const refundPromise = r.query(`update public.orders set payment_status = 'refunded' where id = $1`, [orders[0]]);
      check('1d: a refund on an order inside an open payout is blocked until the payout ends', await waitUntilBlocked(rPid));
      await a.query('commit');
      await refundPromise;
      check('1d: payout of all 11 (the refund came after allocation)', p.ok && p.amount_pence === 4389, p);
      const c = await commissionOf(orders[0]);
      check('1d: the commission stays paid in the payout (refund after payout: staff reconcile)', c.status === 'paid' && c.payout_id === p.payout_id, c);
    } finally {
      a.release();
      r.release();
    }
    check('1d: payout amount equals its linked commissions', (await payoutsBalanced()).length === 0);
  }

  // ==========================================================================
  // 2. Two simultaneous payout requests
  // ==========================================================================
  console.log('\n— 2. Two simultaneous payouts —');
  {
    const { partnerId } = await seedPartner(11);
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query('begin');
      const first = await payout(a, partnerId);
      const bPid = await backendPid(b);
      const secondPromise = payout(b, partnerId);
      check('2: the second payout is blocked while the first is open', await waitUntilBlocked(bPid));
      await a.query('commit');
      const second = await secondPromise;
      check('2: the first payout takes everything', first.ok && first.amount_pence === 4389, first);
      check('2: the second finds nothing left to pay', second.ok === false && second.reason === 'below_minimum' && second.amount_pence === 0, second);
      const n = (await pool.query(`select count(*)::int as n from public.partner_payouts where partner_id = $1`, [partnerId])).rows[0].n;
      check('2: exactly one payout exists', n === 1, n);
    } finally {
      a.release();
      b.release();
    }
  }

  // Free-running stress: two payouts and three voids for the same partner
  // fired at once (as service_role), 25 rounds, no forced ordering.
  {
    let errors = [];
    let doublePayouts = 0;
    let voidedInPayout = 0;
    for (let round = 0; round < 25; round++) {
      const { partnerId, orders } = await seedPartner(14);
      const asService = (sql, params) => pool.connect().then(async (c) => {
        try {
          await c.query('set role service_role');
          return (await c.query(sql, params)).rows[0].r;
        } finally {
          await c.query('reset role').catch(() => {});
          c.release();
        }
      });
      const results = await Promise.allSettled([
        asService(`select public.create_uk_partner_payout($1, null) as r`, [partnerId]),
        asService(`select public.void_uk_partner_commission($1, 'refunded') as r`, [orders[0]]),
        asService(`select public.create_uk_partner_payout($1, null) as r`, [partnerId]),
        asService(`select public.void_uk_partner_commission($1, 'refunded') as r`, [orders[1]]),
        asService(`select public.void_uk_partner_commission($1, 'cancelled') as r`, [orders[2]]),
      ]);
      errors = errors.concat(results.filter((x) => x.status === 'rejected').map((x) => x.reason.message));
      const okPayouts = results.filter((x, i) => (i === 0 || i === 2) && x.status === 'fulfilled' && x.value.ok);
      if (okPayouts.length > 1) doublePayouts++;
      const bad = await pool.query(`select count(*)::int as n from public.partner_commissions where partner_id = $1 and status = 'void' and payout_id is not null`, [partnerId]);
      voidedInPayout += bad.rows[0].n;
    }
    check('2 (stress, 25 rounds): no errors and no deadlocks', errors.length === 0, errors.slice(0, 3));
    check('2 (stress): never more than one payout per round', doublePayouts === 0, doublePayouts);
    check('2 (stress): no voided commission ever ends up in a payout', voidedInPayout === 0, voidedInPayout);
    check('2 (stress): every payout equals its linked commissions', (await payoutsBalanced()).length === 0);
  }

  // ==========================================================================
  // 3. Payout amount equals its linked commission total (enforced)
  // ==========================================================================
  console.log('\n— 3. Payout = linked commissions, enforced by the database —');
  const unbalanced = await payoutsBalanced();
  check('3: across every payout created above, amount = sum of linked commissions', unbalanced.length === 0, unbalanced);
  const anyPayout = (await pool.query(`select id from public.partner_payouts limit 1`)).rows[0].id;

  async function rejectedAtCommit(sql, params) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(sql, params);
      await c.query('commit');
      return false;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      return /linked commission/.test(e.message);
    } finally {
      c.release();
    }
  }
  check('3: changing a paid commission\'s amount is refused at commit',
    await rejectedAtCommit(`update public.partner_commissions set commission_pence = commission_pence + 1 where payout_id = $1 and id = (select id from public.partner_commissions where payout_id = $1 limit 1)`, [anyPayout]));
  check('3: detaching a commission from its payout is refused at commit',
    await rejectedAtCommit(`update public.partner_commissions set status = 'pending', payout_id = null where id = (select id from public.partner_commissions where payout_id = $1 limit 1)`, [anyPayout]));
  check('3: changing a payout\'s amount is refused at commit',
    await rejectedAtCommit(`update public.partner_payouts set amount_pence = amount_pence + 100 where id = $1`, [anyPayout]));
  {
    const { partnerId } = await seedPartner(1);
    check('3: a payout with no commissions is refused at commit',
      await rejectedAtCommit(`insert into public.partner_payouts (partner_id, amount_pence) values ($1, 5000)`, [partnerId]));
  }
  check('3: nothing above left an unbalanced payout behind', (await payoutsBalanced()).length === 0);

  // The staff "Mark sent" route writes partner_payouts as service_role,
  // which fires the balance trigger: it must succeed for a valid write and
  // still refuse a tampering one.
  {
    const c = await pool.connect();
    try {
      await c.query('set role service_role');
      await c.query(`update public.partner_payouts set sent_at = now(), sent_reference = 'TEST-REF' where id = $1`, [anyPayout]);
      check('service_role can mark a payout sent (trigger runs, payout still balanced)', true);
      let refused = false;
      try {
        await c.query(`update public.partner_payouts set amount_pence = amount_pence + 1 where id = $1`, [anyPayout]);
      } catch (e) {
        refused = /linked commission/.test(e.message);
      }
      check('service_role still cannot unbalance a payout', refused);
    } catch (e) {
      check('service_role can mark a payout sent (trigger runs, payout still balanced)', false, e.message);
    } finally {
      await c.query('reset role');
      c.release();
    }
  }

  // service_role can run the functions; anon/authenticated cannot.
  {
    const c = await pool.connect();
    try {
      await c.query('set role authenticated');
      let denied = false;
      try {
        await c.query(`select public.create_uk_partner_payout(gen_random_uuid(), null)`);
      } catch {
        denied = true;
      }
      check('authenticated cannot call create_uk_partner_payout', denied);
    } finally {
      await c.query('reset role');
      c.release();
    }
  }
} finally {
  await pool.end();
  await server.stop();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
if (failures) process.exitCode = 1;
