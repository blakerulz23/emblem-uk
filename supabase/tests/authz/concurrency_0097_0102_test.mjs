// Real-PostgreSQL concurrency tests for 0097 (section 12) and 0102: the
// erasure of a named or approving guardian racing an order approval, an
// order's profile invite, a payment webhook and a new approval request.
// PGlite has one connection, so it cannot test this.
//
// Every interleaving is forced deterministically: one connection holds its
// transaction open while the test proves (from pg_stat_activity) that the
// other is genuinely waiting on a lock, then releases it.
//
// RUN: node --no-warnings supabase/tests/authz/concurrency_0097_0102_test.mjs
// REQUIRES a throwaway local server from `embedded-postgres` and the `pg`
// client, installed in an isolated tooling folder named by
// EMBLEM_AUTHZ_PG_DIR (never resolved from the repository's node_modules):
//   npm install --prefix <tooling-dir> --save-exact --no-audit --no-fund embedded-postgres@17.5.0-beta.15 pg@8.13.1
// Fully disposable: a temporary data directory, listening on 127.0.0.1 only,
// deleted at the end. No real project, no credentials.
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { listMigrations, MIGRATIONS_DIR, PLATFORM_STUBS, PRODUCTION_DEFAULT_PRIVILEGES } from './harness.mjs';

const TOOL = process.env.EMBLEM_AUTHZ_PG_DIR;
if (!TOOL || !path.isAbsolute(TOOL)) throw new Error('Set EMBLEM_AUTHZ_PG_DIR to the absolute tooling folder holding embedded-postgres and pg.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(TOOL, 'node_modules', 'embedded-postgres', 'dist', 'index.js')).href);
const pg = (await import(pathToFileURL(path.join(TOOL, 'node_modules', 'pg', 'lib', 'index.js')).href)).default;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'emblem-0102-'));
const PORT = 55000 + Math.floor(Math.random() * 900);
const PASSWORD = crypto.randomBytes(12).toString('hex');
const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const id = () => crypto.randomUUID();

const server = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'postgres', password: PASSWORD, port: PORT, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: () => {}, onError: () => {} });
await server.initialise();
await server.start();
await server.createDatabase('emblem');
const connect = async () => { const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: PASSWORD, database: 'emblem' }); c.on('error', () => {}); await c.connect(); return c; };

const err = (p) => p.then(() => null, (e) => `${e.code ?? ''}:${e.message}`);
async function waitsOnLock(observer, client) {
  const pid = client.processID;
  for (let i = 0; i < 200; i++) {
    const r = (await observer.query(`select wait_event_type from pg_stat_activity where pid = $1`, [pid])).rows[0];
    if (r?.wait_event_type === 'Lock') return true;
    await new Promise((res) => setTimeout(res, 25));
  }
  return false;
}

let A, B, O, mig;
try {
  const setup = await connect();
  console.log((await setup.query('select version()')).rows[0].version.split(',')[0]);
  await setup.query(PLATFORM_STUBS);
  await setup.query(PRODUCTION_DEFAULT_PRIVILEGES);
  await setup.query(`alter database emblem set search_path = "$user", public, extensions`);
  await setup.end();
  mig = await connect();
  for (const m of listMigrations()) {
    if (m.version > '0102') break;
    if (m.version === '0089') {
      const staff = id();
      await mig.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [staff]);
      await mig.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [staff]);
      await mig.query(`insert into public.staff_accounts (profile_id) values ($1)`, [staff]);
      await mig.query('begin; set local role service_role;');
      await mig.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [staff]);
      await mig.query('commit;');
    }
    try { await mig.query(fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8')); } catch (e) { throw new Error(`${m.file}: ${e.message}`); }
  }
  check('setup: every migration through 0102 applies on real PostgreSQL (numbered order)', true);

  // Fixtures (owner).
  const player = id();
  await mig.query(`insert into public.players (id, name) values ($1, 'Fictional Player')`, [player]);
  const person = async (tag) => {
    const uid = id(); const email = `c-${tag}-${uid.slice(0, 6)}@example.test`;
    await mig.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, email]);
    await mig.query(`insert into public.profiles (id) values ($1)`, [uid]);
    return { uid, email };
  };
  let k = 0;
  const order = async ({ purchaser = 'c-buyer@example.test', intended = null, authority = null, payment = 'order_intent', approver = null }) => {
    const oid = (await mig.query(`insert into public.orders (order_ref, purchaser_email, intended_guardian_email, source, payment_status, authority_status,
        currency, pricing_tier, paid_player_count, total_print_quantity, unit_price_pence, subtotal_pence, pricing_version, priced_at)
      values ($1, $2, $3, 'standalone_order', $4, $5, 'GBP', 'single', 1, 1, 2499, 2499, 1, now()) returning id`,
      [`C-${++k}-${id().slice(0, 6)}`, purchaser, intended, payment, authority])).rows[0].id;
    if (authority) await mig.query(`insert into public.builder_order_authority_declarations (submission_key, order_id, adult_user_id, adult_email, relationship, declaration_version, confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation)
      values ($1, $2, $3, $4, 'other_adult', 'v1', true, true, true)`, [id(), oid, id(), purchaser]);
    if (approver) await mig.query(`insert into public.builder_guardian_approval_requests (order_id, guardian_email, token_hash, status, declaration_version, expires_at, responded_at)
      values ($1, $2, $3, 'approved', 'v1', now() + interval '14 days', now() - interval '1 hour')`, [oid, approver, crypto.randomBytes(32).toString('hex')]);
    return oid;
  };
  const ord = async (oid) => (await mig.query(`select * from public.orders where id = $1`, [oid])).rows[0];
  const erase = (c, who) => c.query(`select public.erase_account_for_deletion($1, $2, null)`, [who.uid, who.email]);
  const invite = (c, oid, email) => c.query(`insert into public.player_invites (player_id, code, invited_email, origin, order_id) values ($1, $2, $3, 'order_approval', $4) returning id`,
    [player, `C-${id().slice(0, 8).toUpperCase()}`, email, oid]);
  A = await connect(); B = await connect(); O = await connect();

  // 1. Erasure first, then the order's profile invite: it waits, then is refused.
  {
    const x = await person('s1');
    const oid = await order({ intended: x.email, payment: 'fulfilled' });
    await B.query('begin'); await erase(B, x);
    const p = err(invite(A, oid, x.email));
    const waited = await waitsOnLock(O, A);
    await B.query('commit');
    const e = await p;
    check('1. erasure first: the profile invite to the erased guardian waits for the erasure, then is refused (EMINV); no invite exists',
      waited && e?.startsWith('EMINV:') && Number((await mig.query(`select count(*) n from public.player_invites where order_id = $1`, [oid])).rows[0].n) === 0, { waited, e });
  }
  // 2. Invite first: the erasure waits for it, then revokes it.
  {
    const x = await person('s2');
    const oid = await order({ intended: x.email, payment: 'fulfilled' });
    await A.query('begin'); const iid = (await invite(A, oid, x.email)).rows[0].id;
    const p = err(erase(B, x));
    const waited = await waitsOnLock(O, B);
    await A.query('commit');
    const e = await p;
    const row = (await mig.query(`select revoked_at, invited_email, code from public.player_invites where id = $1`, [iid])).rows[0];
    check('2. invite first: the erasure waits for the invite to commit, then revokes it (no address, new code)',
      waited && e === null && row.revoked_at !== null && row.invited_email === null && row.code.startsWith('revoked:'), { waited, e });
  }
  // 3. Erasure first, then staff approval of the order: it waits, then is refused (held).
  {
    const x = await person('s3');
    const oid = await order({ intended: x.email, payment: 'paid' });
    await B.query('begin'); await erase(B, x);
    const p = err(A.query(`update public.orders set payment_status = 'fulfilled', approved_at = now() where id = $1`, [oid]));
    const waited = await waitsOnLock(O, A);
    await B.query('commit');
    const e = await p;
    const o = await ord(oid);
    check('3. erasure first: a staff approval waits on the order row, then is refused (EMHLD order_held); the order stays paid and held',
      waited && e?.startsWith('EMHLD:') && o.payment_status === 'paid' && o.held_at !== null, { waited, e });
  }
  // 4. Staff approval first: the erasure waits, finds the order finished (no hold), and the invite is then refused.
  {
    const x = await person('s4');
    const oid = await order({ intended: x.email, payment: 'paid' });
    await A.query('begin'); await A.query(`update public.orders set payment_status = 'fulfilled', approved_at = now() where id = $1`, [oid]);
    const p = err(erase(B, x));
    const waited = await waitsOnLock(O, B);
    await A.query('commit');
    const e = await p;
    const o = await ord(oid);
    const late = await err(invite(A, oid, x.email));
    check('4. approval first: the erasure waits, then clears the named address (finished order: not held); the approval\'s invite, sent after, is refused',
      waited && e === null && o.payment_status === 'fulfilled' && o.intended_guardian_email === null && o.intended_guardian_erased_at !== null && o.held_at === null
        && late?.startsWith('EMINV:'), { waited, e, late });
  }
  // 5. Erasure of the approving guardian first, then a payment webhook: it waits, then is refused and recorded.
  {
    const x = await person('s5');
    const oid = await order({ authority: 'guardian_approved', payment: 'pending_payment', approver: x.email });
    await B.query('begin'); await erase(B, x);
    const p = A.query(`select public.apply_gate3_payment_event($1, 'C-EV-5', 'orders/paid', 'paid', 'C-SHOP-5', 2499, 'GBP') r`, [oid]).then((r) => r.rows[0].r);
    const waited = await waitsOnLock(O, A);
    await B.query('commit');
    const r = await p;
    const o = await ord(oid);
    check('5. erasure first: a payment webhook waits on the order row, then is not applied (order_held), recorded once; the order stays unpaid and held',
      waited && r.applied === false && r.reason === 'order_held' && o.payment_status === 'pending_payment' && o.held_at !== null
        && Number((await mig.query(`select count(*) n from public.payment_state_events where order_id = $1 and reason like 'paid_refused_order_held%'`, [oid])).rows[0].n) === 1, { waited, r });
  }
  // 6. Payment webhook first: the erasure waits; the order is paid, then held (refund needed).
  {
    const x = await person('s6');
    const oid = await order({ authority: 'guardian_approved', payment: 'pending_payment', approver: x.email });
    await A.query('begin');
    const r = (await A.query(`select public.apply_gate3_payment_event($1, 'C-EV-6', 'orders/paid', 'paid', 'C-SHOP-6', 2499, 'GBP') r`, [oid])).rows[0].r;
    const p = err(erase(B, x));
    const waited = await waitsOnLock(O, B);
    await A.query('commit');
    const e = await p;
    const o = await ord(oid);
    const restart = await err(A.query(`select public.create_builder_guardian_approval_request($1, 'c-new@example.test', $2, 'v1')`, [oid, crypto.randomBytes(32).toString('hex')]));
    check('6. payment first: the erasure waits, then holds the paid order; it cannot be restarted until refunded or cancelled',
      r.applied === true && waited && e === null && o.payment_status === 'paid' && o.held_at !== null && restart?.includes('held_order_paid_refund_or_cancel_first'), { waited, e, restart });
  }
  // 7. A new approval request first: the erasure waits for it, then revokes it and holds the order.
  {
    const x = await person('s7');
    const oid = await order({ authority: 'guardian_approval_pending' });
    await A.query('begin');
    await A.query(`select public.create_builder_guardian_approval_request($1, $2, $3, 'v1')`, [oid, x.email, crypto.randomBytes(32).toString('hex')]);
    const p = err(erase(B, x));
    const waited = await waitsOnLock(O, B);
    await A.query('commit');
    const e = await p;
    const req = (await mig.query(`select status, guardian_email from public.builder_guardian_approval_requests where order_id = $1`, [oid])).rows[0];
    check('7. approval request first: the erasure waits for it, then revokes it (no address) and holds the order',
      waited && e === null && req.status === 'revoked' && req.guardian_email === null && (await ord(oid)).held_at !== null, { waited, e, req });
  }
  // 8. The same account's self-deletion twice at once (the app path; it locks the profile first): one erases, the other is refused.
  {
    const x = await person('s8');
    const oid = await order({ intended: x.email, payment: 'paid' });
    const selfDelete = async (c) => {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [x.uid]);
      return c.query('select public.delete_own_guardian_account() r');
    };
    const first = (await selfDelete(B)).rows[0].r;
    const p = err(selfDelete(A).then(() => A.query('commit')));
    const waited = await waitsOnLock(O, A);
    await B.query('commit');
    const e = await p;
    await A.query('rollback').catch(() => {});
    const o = await ord(oid);
    check('8. the same account deleting itself twice at once: the second waits on the profile, then is refused; the order is held once',
      first.canDeleteIdentity === true && waited && e !== null && o.held_at !== null
        && Number((await mig.query(`select count(*) n from public.erased_accounts where profile_id = $1`, [x.uid])).rows[0].n) === 1, { waited, e });
  }
} catch (e) {
  check('concurrency suite', false, e.stack);
} finally {
  for (const c of [A, B, O, mig]) await c?.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}
const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} concurrency checks passed`);
// Explicit exit: embedded-postgres installs an exit hook, so an exit code set earlier would be lost.
process.exit(failed ? 1 : 0);
