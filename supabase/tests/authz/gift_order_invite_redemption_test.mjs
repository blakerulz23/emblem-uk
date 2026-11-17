// Gift-order guardian invites against the real schema (C6 review, F-1).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Runs the app's own src/lib/guardian-invite-eligibility.ts and
// src/lib/gift-order-guardian.ts (Node strips types) through a minimal
// stand-in for the service-role Supabase client, in the same order
// POST /api/os/invites/redeem calls them: authorization
// (checkGuardianInviteRedemption), then checkGiftFirstGuardianClaim, then
// checkGiftOrderInviteRedemption. Every read runs as service_role inside a
// READ ONLY transaction, so the suite proves the reads are permitted after
// 0089-0091, use real column names (orders.authority_status,
// builder_guardian_approval_requests, builder_order_authority_declarations),
// and write nothing.
//
// The rule under test: an invite whose order_id is a single-card gift order
// is redeemable only by the approving guardian's confirmed email, whether or
// not the child already has a guardian.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';
import { checkGuardianInviteRedemption } from '../../../src/lib/guardian-invite-eligibility.ts';
import { checkGiftFirstGuardianClaim, checkGiftOrderInviteRedemption } from '../../../src/lib/gift-order-guardian.ts';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}

const db = await createDatabase();
await applyMigrations(db, { through: '0088' });
const readinessStaff = crypto.randomUUID();
await db.query(`insert into auth.users (id, email) values ($1, 'gift-readiness-staff@example.test')`, [readinessStaff]);
await db.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [readinessStaff]);
await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [readinessStaff]);
await db.exec('begin; set local role service_role;');
await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [readinessStaff]);
await db.exec('commit;');
await applyMigrations(db, { from: '0089', through: '0091' });
await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;`);

// --- Minimal read-only service-role client ---------------------------------
const IDENT = /^[a-z_]+$/;
const reads = [];
async function readOnlyAsService(sql, params) {
  await db.exec('begin read only;');
  try {
    await db.exec('set local role service_role;');
    const r = await db.query(sql, params);
    await db.exec('commit;');
    return { data: r.rows, error: null };
  } catch (e) {
    await db.exec('rollback;');
    return { data: null, error: { code: e.code, message: e.message } };
  }
}
const client = {
  from(table) {
    if (!IDENT.test(table)) throw new Error('bad table');
    const q = { columns: '*', where: [], params: [], order: null, limit: null };
    const run = async (single) => {
      let sql = `select ${q.columns} from public.${table}`;
      if (q.where.length) sql += ` where ${q.where.join(' and ')}`;
      if (q.order) sql += ` order by ${q.order}`;
      if (q.limit) sql += ` limit ${q.limit}`;
      reads.push(table);
      const r = await readOnlyAsService(sql, q.params);
      if (r.error || !single) return r;
      if (r.data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      return { data: r.data[0] ?? null, error: null };
    };
    const col = (c) => { if (!IDENT.test(c)) throw new Error('bad column'); return c; };
    const b = {
      select(cols) {
        if (!cols.split(',').every((c) => IDENT.test(c.trim()))) throw new Error('bad columns');
        q.columns = cols;
        return b;
      },
      eq(c, v) { q.params.push(v); q.where.push(`${col(c)} = $${q.params.length}`); return b; },
      in(c, vs) { q.params.push(vs); q.where.push(`${col(c)} = any($${q.params.length})`); return b; },
      is(c, v) { if (v !== null) throw new Error('is: only null'); q.where.push(`${col(c)} is null`); return b; },
      not(c, op, v) { if (op !== 'is' || v !== null) throw new Error('not: only is null'); q.where.push(`${col(c)} is not null`); return b; },
      order(c, opts) { q.order = `${col(c)} ${opts?.ascending === false ? 'desc' : 'asc'} nulls last`; return b; },
      limit(n) { q.limit = Number(n); return b; },
      maybeSingle: () => run(true),
      then: (res, rej) => run(false).then(res, rej),
    };
    return b;
  },
};

// --- Fictional world -------------------------------------------------------
const id = () => crypto.randomUUID();
const P = { buyer: id(), buyerSecond: id(), guardian: id(), otherParent: id(), pendingGuardian: id(), confirmedParent: id(), handoffParent: id(), unconfirmed: id() };
const EMAIL = {
  buyer: 'gift-buyer@example.test',
  buyerSecond: 'gift-buyer.second@example.test',
  guardian: 'gift-guardian@example.test',
  otherParent: 'gift-other-parent@example.test',
  pendingGuardian: 'gift-pending-guardian@example.test',
  confirmedParent: 'gift-confirmed-parent@example.test',
  handoffParent: 'gift-handoff-parent@example.test',
  unconfirmed: 'gift-unconfirmed@example.test',
};
for (const [k, uid] of Object.entries(P)) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)`, [uid, EMAIL[k], k === 'unconfirmed' ? null : new Date().toISOString()]);
  await db.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [uid, `Fictional ${k}`]);
}
const userOf = async (uid) => {
  const u = (await db.query(`select id, email, email_confirmed_at from auth.users where id = $1`, [uid])).rows[0];
  return { id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at && new Date(u.email_confirmed_at).toISOString() };
};

const season = id(), club = id(), TEAM = id();
await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Gift Season', 'gift season')`, [season]);
await db.query(`insert into public.clubs (id, name) values ($1, 'Gift FC')`, [club]);
await db.query(`insert into public.teams (id, club_id, name, season_id) values ($1, $2, 'U9', $3)`, [TEAM, club, season]);

// Children: one per scenario so guardian state can differ.
const C = { linked: id(), fresh: id(), otherLinked: id(), pending: id(), selfApproved: id(), confirmed: id(), multiA: id(), multiB: id() };
for (const [k, pid] of Object.entries(C)) await db.query(`insert into public.players (id, name, team_id) values ($1, $2, $3)`, [pid, `Gift ${k}`, TEAM]);

const O = { linked: id(), fresh: id(), otherLinked: id(), pending: id(), selfApproved: id(), confirmed: id(), multi: id() };
const order = (oid, ref, authority) =>
  db.query(`insert into public.orders (id, order_ref, purchaser_email, source, payment_status, authority_status) values ($1, $2, $3, 'team_order', 'fulfilled', $4)`, [oid, ref, EMAIL.buyer, authority]);
await order(O.linked, 'GIFT-LINKED', 'guardian_approved');
await order(O.fresh, 'GIFT-FRESH', 'guardian_approved');
await order(O.otherLinked, 'GIFT-OTHER', 'guardian_approved');
await order(O.pending, 'GIFT-PENDING', 'guardian_approval_pending');
await order(O.selfApproved, 'GIFT-SELF', 'guardian_approved');
await order(O.confirmed, 'GIFT-CONFIRMED', 'confirmed');
await order(O.multi, 'GIFT-MULTI', 'guardian_approved');

const card = (pid, oid, tok, status) => db.query(`insert into public.cards (player_id, order_id, claim_token, status) values ($1, $2, $3, $4)`, [pid, oid, tok, status]);
await card(C.linked, O.linked, 'GIFT-C1', 'claimed');
await card(C.fresh, O.fresh, 'GIFT-C2', 'assigned');
await card(C.otherLinked, O.otherLinked, 'GIFT-C3', 'claimed');
await card(C.pending, O.pending, 'GIFT-C4', 'claimed');
await card(C.selfApproved, O.selfApproved, 'GIFT-C5', 'claimed');
await card(C.confirmed, O.confirmed, 'GIFT-C6', 'claimed');
await card(C.multiA, O.multi, 'GIFT-C7', 'claimed');
await card(C.multiB, O.multi, 'GIFT-C8', 'claimed');

for (const oid of Object.values(O)) {
  await db.query(`insert into public.builder_order_authority_declarations (submission_key, order_id, adult_user_id, adult_email, relationship, declaration_version, confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation)
                  values ($1, $2, $3, $4, 'other_adult', 'v1', true, true, true)`, [id(), oid, P.buyer, EMAIL.buyer]);
}
const approval = (oid, email, status) =>
  db.query(`insert into public.builder_guardian_approval_requests (order_id, guardian_email, token_hash, status, declaration_version, expires_at, responded_at)
            values ($1, $2, $3, $4, 'v1', now() + interval '14 days', case when $4 = 'pending' then null else now() end)`, [oid, email, crypto.randomBytes(16).toString('hex'), status]);
for (const oid of [O.linked, O.fresh, O.otherLinked, O.multi]) await approval(oid, EMAIL.guardian, 'approved');
await approval(O.pending, EMAIL.pendingGuardian, 'pending');
await approval(O.selfApproved, EMAIL.buyer, 'approved'); // approved from the buyer's own address (716e7eb case)

const guardianLink = (pid, uid) => db.query(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [pid, uid]);
await guardianLink(C.linked, P.guardian); // the approving guardian has already linked
await guardianLink(C.otherLinked, P.otherParent); // someone else linked first
await guardianLink(C.pending, P.otherParent);
await guardianLink(C.selfApproved, P.otherParent);
await guardianLink(C.confirmed, P.confirmedParent);
await guardianLink(C.multiA, P.otherParent);

// Invites as the trusted service-role paths wrote them (order_id set).
const code = () => `GIFT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const invite = async (pid, oid, email, createdBy = null) => {
  const c = code();
  await db.query(`insert into public.player_invites (player_id, code, created_by, invited_email, origin, order_id) values ($1, $2, $3, $4, $5, $6)`,
    [pid, c, createdBy, email, createdBy ? 'second_guardian' : 'order_approval', oid]);
  return c;
};
const inv = {
  legacyBuyer: await invite(C.linked, O.linked, EMAIL.buyer),
  buyerHandoff: await invite(C.linked, O.linked, EMAIL.buyerSecond, P.buyer),
  freshGuardian: await invite(C.fresh, O.fresh, EMAIL.guardian),
  freshBuyer: await invite(C.fresh, O.fresh, EMAIL.buyer),
  otherLinkedGuardian: await invite(C.otherLinked, O.otherLinked, EMAIL.guardian),
  pendingGuardian: await invite(C.pending, O.pending, EMAIL.pendingGuardian),
  selfApprovedBuyer: await invite(C.selfApproved, O.selfApproved, EMAIL.buyer),
  confirmedHandoff: await invite(C.confirmed, O.confirmed, EMAIL.handoffParent, P.buyer),
};

// --- The route's decision, in its order ------------------------------------
async function decide(inviteCode, uid) {
  const i = (await db.query(`select player_id, created_by, order_id, invited_email from public.player_invites where code = $1`, [inviteCode])).rows[0];
  const user = await userOf(uid);
  const eligibility = await checkGuardianInviteRedemption(client, { player_id: i.player_id, created_by: i.created_by, order_id: i.order_id, invited_email: i.invited_email }, uid);
  if (eligibility.outcome !== 'eligible') return { stage: 'authorization', outcome: eligibility.outcome };
  const first = await checkGiftFirstGuardianClaim(client, i.player_id, user);
  if (first.outcome === 'refused' || first.outcome === 'failed') return { stage: 'first_guardian', outcome: first.outcome, authority: eligibility.authority };
  const byOrder = await checkGiftOrderInviteRedemption(client, i.order_id, user);
  if (byOrder.outcome === 'refused' || byOrder.outcome === 'failed') return { stage: 'gift_order', outcome: byOrder.outcome, authority: eligibility.authority, first: first.outcome };
  return { stage: 'done', outcome: 'allowed', authority: eligibility.authority, first: first.outcome, byOrder: byOrder.outcome };
}

const snapshot = async () => JSON.stringify((await db.query(`select (select count(*) from public.guardians) g, (select count(*) from public.player_invites where used_at is not null) u,
  (select count(*) from public.profiles where role is not null) r, (select count(*) from public.relationship_audit_events) a, (select count(*) from public.cards where status = 'claimed') c`)).rows[0]);
let wroteNothing = true;
async function expectDecision(name, inviteCode, uid, expected) {
  const before = await snapshot();
  const r = await decide(inviteCode, uid);
  if ((await snapshot()) !== before) wroteNothing = false;
  const pass = Object.entries(expected).every(([k, v]) => r[k] === v);
  check(name, pass, JSON.stringify(r));
}

// F-1: the legacy buyer-held invites. Authorization alone grants 'order'
// authority and the first-guardian gate is inactive (a guardian exists), so
// only the new gift-order rule stands between the buyer and a guardian link.
await expectDecision('F-1: legacy order_approval invite to the buyer, approving guardian already linked: refused by the gift-order rule (authorization alone said order/eligible)',
  inv.legacyBuyer, P.buyer, { stage: 'gift_order', outcome: 'refused', authority: 'order', first: 'not_gift' });
await expectDecision('F-1: buyer-created handoff invite to a second address the buyer holds: refused by the gift-order rule',
  inv.buyerHandoff, P.buyerSecond, { stage: 'gift_order', outcome: 'refused', authority: 'order' });
await expectDecision('approving guardian redeems their invite as first guardian: allowed',
  inv.freshGuardian, P.guardian, { outcome: 'allowed', first: 'allowed', byOrder: 'allowed' });
await expectDecision('buyer redeems a buyer-addressed invite before any guardian: refused (first-guardian gate, unchanged)',
  inv.freshBuyer, P.buyer, { stage: 'first_guardian', outcome: 'refused' });
await expectDecision('approving guardian redeems their order invite after someone else linked: allowed',
  inv.otherLinkedGuardian, P.guardian, { outcome: 'allowed', first: 'not_gift', byOrder: 'allowed' });
await expectDecision('pending gift order, guardian exists: the named guardian is refused (no approval yet)',
  inv.pendingGuardian, P.pendingGuardian, { stage: 'gift_order', outcome: 'refused' });
await expectDecision('approval from the buyer\'s own address, guardian exists: the buyer is refused',
  inv.selfApprovedBuyer, P.buyer, { stage: 'gift_order', outcome: 'refused' });
await expectDecision('confirmed (non-gift) order: a purchaser handoff invite carrying order_id is still allowed after a guardian exists',
  inv.confirmedHandoff, P.handoffParent, { outcome: 'allowed', first: 'not_gift', byOrder: 'not_gift' });
const directGift = await checkGiftOrderInviteRedemption(client, O.multi, await userOf(P.buyer));
check('multi-card gift order: not_gift (unchanged; held by staff under A2)', directGift.outcome === 'not_gift', JSON.stringify(directGift));
const unconfirmedGuardianAddr = await checkGiftOrderInviteRedemption(client, O.linked, { email: EMAIL.guardian, email_confirmed_at: null });
check('the approving address with an unconfirmed email is refused', unconfirmedGuardianAddr.outcome === 'refused', JSON.stringify(unconfirmedGuardianAddr));
const noOrder = await checkGiftOrderInviteRedemption(client, null, await userOf(P.buyer));
check('an invite without order_id is not_gift', noOrder.outcome === 'not_gift', JSON.stringify(noOrder));

check('every read ran read-only as service_role and no evaluation wrote anything', wroteNothing && reads.length > 0, `${reads.length} reads`);
const touched = [...new Set(reads)].sort().join(',');
check('the gift-order reads touched only the expected tables',
  ['builder_guardian_approval_requests', 'builder_order_authority_declarations', 'cards', 'guardians', 'orders'].every((t) => touched.includes(t)), touched);

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} gift-order invite redemption checks passed`);
process.exit(passed === results.length ? 0 : 1);
