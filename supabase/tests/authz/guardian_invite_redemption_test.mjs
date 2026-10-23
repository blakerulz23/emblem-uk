// Gate 3.7: guardian-invite redemption eligibility against the real schema.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Runs the app's own src/lib/guardian-invite-eligibility.ts (Node strips
// types) through a minimal stand-in for the service-role Supabase client.
// Every read it makes runs as service_role inside a READ ONLY transaction,
// so the suite proves the reads are permitted after 0089 and 0090, use real
// column names, and write nothing. Relationships are built with the
// release's trusted functions, so ended assignments and removed direct
// links carry their real audit history.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';
import { checkGuardianInviteRedemption } from '../../../src/lib/guardian-invite-eligibility.ts';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}

const db = await createDatabase();
await applyMigrations(db, { through: '0088' });
// Release readiness, then the real 0089 and 0090 (as in production).
const readinessStaff = crypto.randomUUID();
await db.query(`insert into auth.users (id, email) values ($1, 'readiness-staff@example.test')`, [readinessStaff]);
await db.query(`insert into public.profiles (id, display_name) values ($1, 'Readiness Staff')`, [readinessStaff]);
await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [readinessStaff]);
await db.exec('begin; set local role service_role;');
await db.query(`select public.confirm_release_readiness('authorization_relationships_v1', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', $1, true, true, true, true, true, true)`, [readinessStaff]);
await db.exec('commit;');
await applyMigrations(db, { from: '0089', through: '0090' });
// GoTrue's admin API reports whether an email is confirmed; the harness's
// stand-in auth.users table gains that column here, for this suite only.
await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;`);

async function as(role, uid, fn) {
  await db.exec('begin;');
  try {
    await db.exec(`set local role ${role};`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [uid ?? '']);
    const r = await fn();
    await db.exec('commit;');
    return r;
  } catch (e) {
    await db.exec('rollback;');
    throw e;
  }
}
const service = (sql, params) => as('service_role', null, () => db.query(sql, params));
const user = (uid, sql, params) => as('authenticated', uid, () => db.query(sql, params));

// --- Minimal service-role client: only what the eligibility module uses ----
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
  auth: {
    admin: {
      // GoTrue's admin lookup (not a PostgREST read).
      getUserById: async (uid) => {
        const r = await db.query(`select id, email, email_confirmed_at from auth.users where id = $1`, [uid]);
        const u = r.rows[0];
        return u ? { data: { user: { id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at && new Date(u.email_confirmed_at).toISOString() } }, error: null } : { data: { user: null }, error: { code: 'user_not_found', message: 'User not found' } };
      },
    },
  },
  from(table) {
    if (!IDENT.test(table)) throw new Error('bad table');
    const q = { columns: '*', where: [], params: [], limit: null };
    const run = async (single) => {
      let sql = `select ${q.columns} from public.${table}`;
      if (q.where.length) sql += ` where ${q.where.join(' and ')}`;
      if (q.limit) sql += ` limit ${q.limit}`;
      reads.push(table);
      const r = await readOnlyAsService(sql, q.params);
      if (r.error || !single) return r;
      if (r.data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      return { data: r.data[0] ?? null, error: null };
    };
    const b = {
      select(cols) {
        if (!cols.split(',').every((c) => IDENT.test(c.trim()))) throw new Error('bad columns');
        q.columns = cols;
        return b;
      },
      eq(col, v) {
        if (!IDENT.test(col)) throw new Error('bad column');
        q.params.push(v);
        q.where.push(`${col} = $${q.params.length}`);
        return b;
      },
      in(col, vs) {
        if (!IDENT.test(col)) throw new Error('bad column');
        q.params.push(vs);
        q.where.push(`${col} = any($${q.params.length})`);
        return b;
      },
      limit(n) {
        q.limit = Number(n);
        return b;
      },
      maybeSingle: () => run(true),
      then: (res, rej) => run(false).then(res, rej),
    };
    return b;
  },
};

// --- Fictional world -------------------------------------------------------
const id = () => crypto.randomUUID();
const P = {
  guardian: id(), exGuardian: id(), coach: id(), endedCoach: id(), expiredCoach: id(), directCoach: id(), removedDirect: id(),
  dual: id(), purchaser: id(), unverifiedPurchaser: id(), formerCoach: id(), adult: id(), staff: id(),
};
await db.query(`insert into auth.users (id, email) select u, 'g37-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [Object.values(P)]);
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [P.purchaser]);
await db.query(`insert into public.profiles (id, display_name) select u, 'Fictional ' || left(u::text, 4) from unnest($1::uuid[]) u`, [Object.values(P)]);
await db.query(`insert into public.staff_accounts (profile_id) values ($1)`, [P.staff]);

const season = id(), club = id(), TEAM = id(), PREVIOUS_TEAM = id();
const child = id(), firstChild = id(), otherChild = id(), movedChild = id();
await db.query(`insert into public.seasons (id, label, normalized_label) values ($1, 'Fictional Season', 'fictional season')`, [season]);
await service(`with c as (insert into public.clubs (id, name) values ($1, 'Fictional FC') returning id)
               insert into public.teams (id, club_id, name, season_id) values ($2, $1, 'U11', $4), ($3, $1, 'U10', $4)`, [club, TEAM, PREVIOUS_TEAM, season]);
// The child starts on the previous team; the former coach coaches it there.
// movedChild (no guardian) also starts on the previous team.
await db.query(`insert into public.players (id, name, team_id) values ($1, 'Fictional Child', $4), ($2, 'Fictional First', $3), ($5, 'Fictional Other', $3), ($6, 'Fictional Moved', $4)`, [child, firstChild, TEAM, PREVIOUS_TEAM, otherChild, movedChild]);

const guardianLink = (player, profile) =>
  service(`insert into public.guardians (player_id, profile_id, created_via, created_by) values ($1, $2, 'card_claim', $2)`, [player, profile]);
await guardianLink(child, P.guardian);
await guardianLink(child, P.exGuardian);
await guardianLink(child, P.dual);

const activate = (team, profile) => service(`select public.activate_coach_assignment($1, $2, 'staff', $3)`, [team, profile, P.staff]);
const end = (team, profile) => service(`select public.end_coach_assignment($1, $2, $3, 'Fictional reason')`, [team, profile, P.staff]);
await activate(PREVIOUS_TEAM, P.formerCoach);

const code = () => `G37-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const inviteAs = async (creator, player) => {
  const c = code();
  await user(creator, `insert into public.player_invites (player_id, code, created_by, invited_email, origin) values ($1, $2, $3, null, 'second_guardian')`, [player, c, creator]);
  return c;
};
const inviteAsService = async (player, createdBy, orderId) => {
  const c = code();
  await service(`insert into public.player_invites (player_id, code, created_by, invited_email, origin, order_id) values ($1, $2, $3, null, $4, $5)`, [player, c, createdBy, orderId ? 'order_approval' : 'second_guardian', orderId]);
  return c;
};

// While coaching the previous team, the former coach mints an invite for a
// child with no guardian.
const formerOwnInvite = await inviteAs(P.formerCoach, movedChild);
await end(PREVIOUS_TEAM, P.formerCoach);
// Staff order approval moves both children to the current team (no history kept).
await service(`update public.players set team_id = $1 where id = any($2)`, [TEAM, [child, movedChild]]);

await activate(TEAM, P.coach);
await activate(TEAM, P.dual);
await activate(TEAM, P.endedCoach);
await end(TEAM, P.endedCoach);
await service(`insert into public.coach_team (team_id, profile_id, created_at, created_via, created_by, expires_at)
               values ($1, $2, now() - interval '30 days', 'staff', $3, now() - interval '1 day')`, [TEAM, P.expiredCoach, P.staff]);
await service(`insert into public.coach_players (player_id, profile_id, created_via, created_by) values ($1, $2, 'guardian_invite', $3), ($1, $4, 'guardian_invite', $3)`,
  [child, P.directCoach, P.guardian, P.removedDirect]);
const removal = (await service(`select public.remove_direct_coach_link($1, $2, $3, 'Fictional reason') as r`, [child, P.removedDirect, P.guardian])).rows[0].r;
check('setup: the removed direct coach was removed through the trusted function', removal === 'removed', removal);

// Orders: a fulfilled order for the child (purchaser verified), one whose
// purchaser email is unverified, and one for a different child.
const order = id(), unverifiedOrder = id(), otherOrder = id();
const email = async (uid) => (await db.query(`select email from auth.users where id = $1`, [uid])).rows[0].email;
await db.query(`insert into public.orders (id, order_ref, purchaser_email, source, payment_status) values
  ($1, 'G37-ORDER-1', $4, 'standalone_order', 'fulfilled'), ($2, 'G37-ORDER-2', $5, 'standalone_order', 'fulfilled'), ($3, 'G37-ORDER-3', 'nobody@example.test', 'standalone_order', 'fulfilled')`,
  [order, unverifiedOrder, otherOrder, await email(P.purchaser), await email(P.unverifiedPurchaser)]);
await db.query(`insert into public.cards (player_id, order_id, claim_token, status) values ($1, $2, 'G37-CARD-1', 'claimed'), ($1, $3, 'G37-CARD-2', 'claimed'), ($4, $5, 'G37-CARD-3', 'assigned')`,
  [child, order, unverifiedOrder, otherChild, otherOrder]);

// Invites, created by their real authority (signed in, five columns) or by
// the trusted service-role paths (order approval, recovery handoff).
const inv = {
  guardian: await inviteAs(P.guardian, child),
  coach: await inviteAs(P.coach, child),
  coachFirst: await inviteAs(P.coach, firstChild),
  dual: await inviteAs(P.dual, child),
  exGuardian: await inviteAs(P.exGuardian, child),
  order: await inviteAsService(child, null, order),
  forgedOrder: await inviteAsService(child, null, otherOrder),
  handoff: await inviteAsService(child, P.purchaser, null),
  unverifiedHandoff: await inviteAsService(child, P.unverifiedPurchaser, null),
  deletedCreator: await inviteAsService(child, null, null),
  deletedCreatorFirst: await inviteAsService(firstChild, null, null),
  formerOwn: formerOwnInvite,
};
// The ex-guardian stops being a guardian after inviting (an administrative
// removal: no app role may delete guardian rows).
await db.query(`delete from public.guardians where player_id = $1 and profile_id = $2`, [child, P.exGuardian]);

const auditBefore = (await db.query(`select count(*)::int n from public.relationship_audit_events`)).rows[0].n;
const writesBefore = (await db.query(`select (select count(*) from public.guardians) g, (select count(*) from public.player_invites where used_at is not null) u, (select count(*) from public.profiles where role is not null) r`)).rows[0];

async function evaluate(inviteCode, redeemer) {
  const row = (await db.query(`select player_id, created_by, order_id from public.player_invites where code = $1`, [inviteCode])).rows[0];
  return checkGuardianInviteRedemption(client, row, redeemer);
}
async function expectOutcome(name, inviteCode, redeemer, expected) {
  const r = await evaluate(inviteCode, redeemer);
  const pass = r.outcome === expected.outcome && (expected.authority === undefined || r.authority === expected.authority);
  check(name, pass, JSON.stringify(r.outcome === 'failed' ? { outcome: r.outcome, code: r.error?.code } : r));
}
const REFUSED = { outcome: 'refused' };

await expectOutcome('the creator redeeming their own invite is refused', inv.coach, P.coach, REFUSED);
await expectOutcome('an active coach of the current team is refused', inv.guardian, P.coach, REFUSED);
await expectOutcome('an ended coach of the current team is refused', inv.guardian, P.endedCoach, REFUSED);
await expectOutcome('an expired coach of the current team is refused', inv.guardian, P.expiredCoach, REFUSED);
await expectOutcome('a current direct coach is refused', inv.guardian, P.directCoach, REFUSED);
await expectOutcome('a removed direct coach is refused (audit history)', inv.guardian, P.removedDirect, REFUSED);
await expectOutcome('a coach-authority invite for a child who already has a guardian is refused', inv.coach, P.adult, REFUSED);
await expectOutcome('a deleted/unknown creator is treated as non-guardian: refused when the child has a guardian', inv.deletedCreator, P.adult, REFUSED);
await expectOutcome('an ex-guardian\'s invite is treated as non-guardian: refused when the child has a guardian', inv.exGuardian, P.adult, REFUSED);
await expectOutcome('an order id that is not this child\'s order is not order authority: refused', inv.forgedOrder, P.adult, REFUSED);
await expectOutcome('an unverified purchaser email is not a recovery handoff: refused', inv.unverifiedHandoff, P.adult, REFUSED);
// Only the creator rule can refuse these two.
await expectOutcome('a former previous-team coach redeeming their own invite (child has no guardian) is refused', inv.formerOwn, P.formerCoach, REFUSED);
await expectOutcome('a purchaser redeeming their own recovery handoff is refused', inv.handoff, P.purchaser, REFUSED);
await expectOutcome('a coach-authority invite to a former previous-team coach is refused (child has a guardian)', inv.coach, P.formerCoach, REFUSED);

await expectOutcome('a genuine guardian invite to an ordinary adult is eligible (guardian authority)', inv.guardian, P.adult, { outcome: 'eligible', authority: 'guardian' });
await expectOutcome('a dual guardian/coach creator acts through guardian authority', inv.dual, P.adult, { outcome: 'eligible', authority: 'guardian' });
await expectOutcome('an order invite for this child\'s order is eligible (order authority)', inv.order, P.adult, { outcome: 'eligible', authority: 'order' });
await expectOutcome('a recovery handoff from the verified purchaser is eligible', inv.handoff, P.adult, { outcome: 'eligible', authority: 'recovery_handoff' });
await expectOutcome('a coach-created first-guardian invite redeemed by a different non-coach is eligible', inv.coachFirst, P.adult, { outcome: 'eligible', authority: 'coach' });
await expectOutcome('a deleted creator\'s invite for a child with no guardian is eligible', inv.deletedCreatorFirst, P.adult, { outcome: 'eligible', authority: 'coach' });
await expectOutcome('documented boundary: a genuine guardian invite to a former previous-team coach is eligible', inv.guardian, P.formerCoach, { outcome: 'eligible', authority: 'guardian' });

const auditAfter = (await db.query(`select count(*)::int n from public.relationship_audit_events`)).rows[0].n;
const writesAfter = (await db.query(`select (select count(*) from public.guardians) g, (select count(*) from public.player_invites where used_at is not null) u, (select count(*) from public.profiles where role is not null) r`)).rows[0];
check('every eligibility read ran read-only as service_role and nothing was written (guardians, used invites, roles, audit)',
  auditAfter === auditBefore && JSON.stringify(writesAfter) === JSON.stringify(writesBefore) && reads.length > 0, `${reads.length} reads`);
check('the reads touched only the expected tables',
  [...new Set(reads)].sort().join(',') === 'cards,coach_players,coach_team,guardians,orders,players,relationship_audit_events', [...new Set(reads)].sort().join(','));
const audit = (await db.query(`select count(*)::int n from public.relationship_audit_events where table_name = 'coach_players' and event = 'DELETE' and profile_id = $1`, [P.removedDirect])).rows[0].n;
check('the removed direct link is in the audit history the rule relies on', audit === 1, String(audit));

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} guardian-invite redemption checks passed`);
process.exit(passed === results.length ? 0 : 1);
