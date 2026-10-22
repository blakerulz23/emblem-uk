// Atomic team-invite redemption and the stale-invitation rule:
// redeem_team_invite (0088).
//
// RUN: node --no-warnings supabase/tests/authz/team_invite_redemption_test.mjs
// (needs EMBLEM_AUTHZ_PGLITE_DIR; see README.md). Disposable in-memory PGlite,
// fictional data with generated ids only. Every scenario runs twice: on a
// 0088 database and on the real 0089 (after a readiness record).
//
// Concurrency note: PGlite is a single embedded connection, so two truly
// simultaneous transactions can't run here. This file replays both orders
// of every race (two redeemers; a redemption and a staff ending) and proves
// the outcome of each. The contract test proves the structure that makes
// the real race safe: the invite row and the coach's assignment row are
// both read FOR UPDATE (end_coach_assignment locks the same assignment
// row), and the reactivating upsert repeats the cutoff rule in its own
// WHERE. A real two-connection test belongs in the hosted rehearsal.
import crypto from 'crypto';
import { applyMigrations, createDatabase } from './harness.mjs';

const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

// --- Applying 0088 consumes no team invite and changes no assignment ---------
{
  const db = await createDatabase();
  await applyMigrations(db, { through: '0087' });
  const t = id(), c = id(), club = id(), season = id();
  await db.query(`insert into seasons (id, label, normalized_label) values ($1, 'Test Season', 'test season')`, [season]);
  await db.query(`insert into clubs (id, name) values ($1, 'Fictional FC')`, [club]);
  await db.query(`insert into teams (id, club_id, name, season_id) values ($1, $2, 'Fictional U10', $3)`, [t, club, season]);
  await db.query(`insert into team_invites (team_id, code) values ($1, 'TEAM-PRE0088')`, [t]);
  await db.query(`insert into auth.users (id, email) values ($1, 'c@example.test')`, [c]);
  await db.query(`insert into profiles (id, role) values ($1, 'coach')`, [c]);
  await db.query(`insert into coach_team (team_id, profile_id) values ($1, $2)`, [t, c]);
  await applyMigrations(db, { from: '0088', through: '0088' });
  const r = (await db.query(`select (select count(*)::int from team_invites where used_at is not null) consumed,
    (select count(*)::int from coach_team where ended_at is not null) ended`)).rows[0];
  check('applying 0088 consumes no team invite and ends no assignment', r.consumed === 0 && r.ended === 0, JSON.stringify(r));
  await db.close();
}

async function suite(through) {
  const tag = `[${through}]`;
  const db = await createDatabase();
  await applyMigrations(db, { through: '0088' });

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
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  // Also reports the trusted-operation markers as they stand after the call,
  // inside the same transaction.
  const redeem = (code, coach, name = null) =>
    as('service_role', null, async () => {
      const rows = (await db.query(`select status, team_id from public.redeem_team_invite($1, $2, $3)`, [code, coach, name])).rows;
      const markers = (await db.query(`select coalesce(current_setting('emblem.trusted_operation', true), '') op, coalesce(current_setting('emblem.actor_profile_id', true), '') actor`)).rows[0];
      return { rows, markersCleared: markers.op === '' && markers.actor === '' };
    });

  const ids = {
    season: id(), club: id(), team: id(), team2: id(), staff: id(),
    fresh: id(), parent: id(), noProfile: id(), other: id(), active: id(),
    endedBefore: id(), endedEqual: id(), endedAfter: id(), endedFutureExpiry: id(),
    elapsedAfterEnd: id(), expiredOnly: id(), expiredFresh: id(), staffBack: id(),
    rivalA: id(), rivalB: id(), raceEndFirst: id(), raceRedeemFirst: id(), failing: id(),
  };
  const people = Object.entries(ids).filter(([k]) => !['season', 'club', 'team', 'team2'].includes(k)).map(([, v]) => v);
  await db.query(`insert into auth.users (id, email) select u, 'u-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [people]);
  // Everyone except noProfile and failing has a profile; most are coaches.
  for (const [k, v] of Object.entries(ids)) {
    if (['season', 'club', 'team', 'team2', 'noProfile', 'failing'].includes(k)) continue;
    const role = k === 'parent' ? 'parent' : k === 'staff' || k === 'fresh' || k === 'other' || k.startsWith('rival') ? null : 'coach';
    await db.query(`insert into profiles (id, role, display_name) values ($1, $2, $3)`, [v, role, `Fictional ${k}`]);
  }
  await db.exec(`
    insert into staff_accounts (profile_id) values ('${ids.staff}');
    insert into seasons (id, label, normalized_label) values ('${ids.season}', 'Test Season', 'test season');
    insert into clubs (id, name) values ('${ids.club}', 'Fictional FC');
    insert into teams (id, club_id, name, season_id) values
      ('${ids.team}', '${ids.club}', 'Fictional U10', '${ids.season}'), ('${ids.team2}', '${ids.club}', 'Fictional U12', '${ids.season}');
  `);
  // Assignments with controlled database times (relative to now()).
  const assign = (coach, { created = "now() - interval '30 days'", ended = null, expires = null } = {}) =>
    db.query(`insert into coach_team (team_id, profile_id, created_at, created_via, ended_at, ended_by, end_reason, expires_at)
      values ($1, $2, ${created}, 'staff', ${ended ?? 'null'}, ${ended ? `'${ids.staff}'` : 'null'}, ${ended ? "'Fictional reason'" : 'null'}, ${expires ?? 'null'})`, [ids.team, coach]);
  const invite = (code, { team = ids.team, issued = 'now()', expires = "now() + interval '7 days'", usedAt = 'null', usedBy = null } = {}) =>
    db.query(`insert into team_invites (team_id, code, created_at, expires_at, used_at, used_by) values ($1, $2, ${issued}, ${expires}, ${usedAt}, $3)`, [team, code, usedBy]);
  const state = async (code, coach) => ({
    invite: await one(`select used_at, used_by from team_invites where code = $1`, [code]),
    assignment: await one(`select ended_at, ended_by, expires_at from coach_team where team_id = $1 and profile_id = $2`, [ids.team, coach]),
    profile: await one(`select role, display_name from profiles where id = $1`, [coach]),
    audit: (await one(`select count(*)::int n from relationship_audit_events where table_name = 'coach_team' and profile_id = $1`, [coach])).n,
  });
  const active = async (coach, team = ids.team) =>
    (await one(`select public.coach_assignment_is_active(ended_at, expires_at) a from coach_team where team_id = $1 and profile_id = $2`, [team, coach]))?.a === true;

  if (through === '0089') {
    await as('service_role', null, () => db.query(`select public.confirm_release_readiness('authorization_relationships_v1', $1, $2, true, true, true, true, true, true)`, [COMMIT, ids.staff]));
    await applyMigrations(db, { from: '0089', through: '0089' });
  }

  // Refusal helper: fixed status, no team id, nothing written, markers clear.
  async function expectRefused(label, code, coach, status) {
    const before = await state(code, coach);
    const r = await redeem(code, coach);
    const after = await state(code, coach);
    check(`${tag} ${label}: '${status}' with no team id`, r.rows.length === 1 && r.rows[0].status === status && r.rows[0].team_id === null, JSON.stringify(r.rows));
    check(`${tag} ${label}: invite, assignment, role and audit unchanged`, JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }));
    check(`${tag} ${label}: trusted-operation markers clear`, r.markersCleared);
  }

  // 1. Ordinary redemption ------------------------------------------------------
  await invite('TEAM-FRESH01');
  const r1 = await redeem('TEAM-FRESH01', ids.fresh, 'Fictional Coach');
  const s1 = await state('TEAM-FRESH01', ids.fresh);
  check(`${tag} an unused invite is redeemed and returns its team`, r1.rows[0]?.status === 'redeemed' && r1.rows[0]?.team_id === ids.team, JSON.stringify(r1.rows));
  check(`${tag} the assignment is created active, via team_invite, by the coach`,
    (await active(ids.fresh)) && (await one(`select created_via, created_by from coach_team where team_id = $1 and profile_id = $2`, [ids.team, ids.fresh])).created_by === ids.fresh);
  check(`${tag} the invite is consumed once, by this coach (database time)`, s1.invite.used_at !== null && s1.invite.used_by === ids.fresh, JSON.stringify(s1.invite));
  const audit1 = (await db.query(`select event, actor_source, actor_profile_id, operation, db_role from relationship_audit_events where table_name = 'coach_team' and profile_id = $1`, [ids.fresh])).rows;
  check(`${tag} exactly one audit event: INSERT by trusted function redeem_team_invite, actor = the coach`,
    audit1.length === 1 && audit1[0].event === 'INSERT' && audit1[0].actor_source === 'trusted_function' && audit1[0].operation === 'redeem_team_invite' &&
    audit1[0].actor_profile_id === ids.fresh && audit1[0].db_role === 'service_role', JSON.stringify(audit1));
  check(`${tag} trusted-operation markers are cleared after a redemption`, r1.markersCleared);
  check(`${tag} a profile with no role becomes coach`, s1.profile.role === 'coach', JSON.stringify(s1.profile));

  // 2–3. Roles ---------------------------------------------------------------------
  await invite('TEAM-PARENT1');
  const r2 = await redeem('TEAM-PARENT1', ids.parent);
  check(`${tag} a parent redeeming a team invite keeps the parent role and gains the assignment`,
    r2.rows[0]?.status === 'redeemed' && (await state('TEAM-PARENT1', ids.parent)).profile.role === 'parent' && (await active(ids.parent)));
  await invite('TEAM-NOPROF1');
  const r3 = await redeem('TEAM-NOPROF1', ids.noProfile, 'Brand New Coach');
  const s3 = await state('TEAM-NOPROF1', ids.noProfile);
  check(`${tag} an account with no profile gets one, with the coach role and its name`,
    r3.rows[0]?.status === 'redeemed' && s3.profile?.role === 'coach' && s3.profile?.display_name === 'Brand New Coach', JSON.stringify(s3.profile));

  // 4–5. Retries -------------------------------------------------------------------
  const beforeRetry = await state('TEAM-FRESH01', ids.fresh);
  const retry = await redeem('TEAM-FRESH01', ids.fresh);
  check(`${tag} a retry by the coach who redeemed it is idempotent ('already_redeemed_by_you', same team)`,
    retry.rows[0]?.status === 'already_redeemed_by_you' && retry.rows[0]?.team_id === ids.team, JSON.stringify(retry.rows));
  check(`${tag} …and writes nothing`, JSON.stringify(await state('TEAM-FRESH01', ids.fresh)) === JSON.stringify(beforeRetry));
  await expectRefused('another account replaying a consumed invite', 'TEAM-FRESH01', ids.other, 'invalid');

  // Invalid invitations -------------------------------------------------------------
  await invite('TEAM-EXPIRED', { issued: "now() - interval '8 days'", expires: "now() - interval '1 minute'" });
  await expectRefused('an expired invite', 'TEAM-EXPIRED', ids.other, 'invalid');
  await expectRefused('an unknown code', 'TEAM-NOSUCHCODE', ids.other, 'invalid');
  const nulls = await redeem(null, ids.other);
  check(`${tag} missing code or coach is 'invalid'`, nulls.rows[0]?.status === 'invalid');

  // Already active -------------------------------------------------------------------
  await assign(ids.active);
  await invite('TEAM-ACTIVE1');
  await expectRefused('a coach who is already active', 'TEAM-ACTIVE1', ids.active, 'already_active');

  // 6–8. Manual ending --------------------------------------------------------------
  await assign(ids.endedBefore, { ended: "now() - interval '1 day'" });
  await invite('TEAM-PREEND1', { issued: "now() - interval '2 days'" });
  await expectRefused('an invite issued before the assignment was ended', 'TEAM-PREEND1', ids.endedBefore, 'stale_after_end');

  await assign(ids.endedEqual, { ended: "now() - interval '1 day'" });
  await db.query(`insert into team_invites (team_id, code, created_at) select $1, 'TEAM-EQUAL01', ended_at from coach_team where team_id = $1 and profile_id = $2`, [ids.team, ids.endedEqual]);
  check(`${tag} (fixture) the invite's issue time equals the ending time exactly`,
    (await one(`select (select created_at from team_invites where code = 'TEAM-EQUAL01') = (select ended_at from coach_team where team_id = $1 and profile_id = $2) eq`, [ids.team, ids.endedEqual])).eq);
  await expectRefused('an invite issued at exactly the ending time', 'TEAM-EQUAL01', ids.endedEqual, 'stale_after_end');

  await assign(ids.endedAfter, { ended: "now() - interval '2 days'" });
  await invite('TEAM-POSTEND', { issued: "now() - interval '1 day'" });
  const r8 = await redeem('TEAM-POSTEND', ids.endedAfter);
  const a8 = (await db.query(`select event, actor_source, operation, actor_profile_id from relationship_audit_events where table_name = 'coach_team' and profile_id = $1 order by id desc limit 1`, [ids.endedAfter])).rows[0];
  check(`${tag} an invite issued after the ending reactivates the assignment`, r8.rows[0]?.status === 'redeemed' && (await active(ids.endedAfter)), JSON.stringify(r8.rows));
  check(`${tag} …audited as an UPDATE by redeem_team_invite with the coach as actor`,
    a8?.event === 'UPDATE' && a8?.actor_source === 'trusted_function' && a8?.operation === 'redeem_team_invite' && a8?.actor_profile_id === ids.endedAfter, JSON.stringify(a8));
  check(`${tag} …and the ending details are cleared`, (await state('TEAM-POSTEND', ids.endedAfter)).assignment.ended_by === null);

  // 9–11. Expiry --------------------------------------------------------------------
  // 9. Ended, with an expiry still in the future: the cutoff is the ending, so
  // an invite issued after the ending (and before that expiry) is accepted.
  await assign(ids.endedFutureExpiry, { ended: "now() - interval '2 days'", expires: "now() + interval '5 days'" });
  await invite('TEAM-BEFOREXP', { issued: "now() - interval '1 day'" });
  const r9 = await redeem('TEAM-BEFOREXP', ids.endedFutureExpiry);
  const s9 = await state('TEAM-BEFOREXP', ids.endedFutureExpiry);
  check(`${tag} an invite issued before a future expiry is redeemed before that expiry`, r9.rows[0]?.status === 'redeemed' && (await active(ids.endedFutureExpiry)), JSON.stringify(r9.rows));
  check(`${tag} …and the future expiry is kept`, s9.assignment.expires_at !== null && new Date(s9.assignment.expires_at) > new Date());
  // 10. The same situation once that expiry has elapsed: the later cutoff is
  // now the expiry, which the invite predates.
  await assign(ids.elapsedAfterEnd, { ended: "now() - interval '3 days'", expires: "now() - interval '1 day'" });
  await invite('TEAM-ELAPSED1', { issued: "now() - interval '2 days'" });
  await expectRefused('the same kind of invite once the expiry has elapsed', 'TEAM-ELAPSED1', ids.elapsedAfterEnd, 'stale_after_expiry');
  await assign(ids.expiredOnly, { expires: "now() - interval '1 day'" });
  await invite('TEAM-PREEXP01', { issued: "now() - interval '2 days'" });
  await expectRefused('an invite issued before an elapsed expiry (never ended)', 'TEAM-PREEXP01', ids.expiredOnly, 'stale_after_expiry');
  // 11. A fresh invite issued after the elapsed expiry.
  await assign(ids.expiredFresh, { expires: "now() - interval '1 day'" });
  await invite('TEAM-POSTEXP1', { issued: "now() - interval '12 hours'" });
  const r11 = await redeem('TEAM-POSTEXP1', ids.expiredFresh);
  check(`${tag} a fresh invite issued after an elapsed expiry reactivates the assignment, with no expiry`,
    r11.rows[0]?.status === 'redeemed' && (await active(ids.expiredFresh)) && (await state('TEAM-POSTEXP1', ids.expiredFresh)).assignment.expires_at === null, JSON.stringify(r11.rows));

  // 12. Staff reactivation is independent of invites --------------------------------
  await assign(ids.staffBack, { ended: "now() - interval '1 day'" });
  await invite('TEAM-STAFF01', { issued: "now() - interval '2 days'" });
  await expectRefused('(staff case) the old invite', 'TEAM-STAFF01', ids.staffBack, 'stale_after_end');
  await as('authenticated', ids.staffBack, () => db.query(`insert into coach_team_requests (club_name, team_name) values ('Fictional FC', 'Fictional U10')`));
  const req = await one(`select id from coach_team_requests where requester_profile_id = $1`, [ids.staffBack]);
  await as('service_role', null, () => db.query(`select public.approve_coach_team_request($1, $2, $3, null, null)`, [req.id, ids.staff, ids.team]));
  check(`${tag} staff approval still reactivates the ended coach`, await active(ids.staffBack));
  check(`${tag} …and the old invite is still unused (staff action never consumes it)`, (await state('TEAM-STAFF01', ids.staffBack)).invite.used_at === null);

  // 13. Unrelated invitations stay valid ---------------------------------------------
  await invite('TEAM-UNRELATED', { issued: "now() - interval '3 days'" });
  await invite('TEAM2-UNRELATED', { team: ids.team2, issued: "now() - interval '3 days'" });
  const unrelated = await one(`select count(*)::int n from team_invites where code in ('TEAM-UNRELATED', 'TEAM2-UNRELATED') and used_at is null`);
  check(`${tag} refusals and redemptions left other unused invites untouched`, unrelated.n === 2);
  const ru = await redeem('TEAM-UNRELATED', ids.rivalA);
  check(`${tag} an older unused invite for the same team still works for a coach with no previous access there`, ru.rows[0]?.status === 'redeemed', JSON.stringify(ru.rows));

  // 14. Two accounts, one invite (sequential replay) ------------------------------------
  await invite('TEAM-ONEWIN1');
  const first = await redeem('TEAM-ONEWIN1', ids.rivalB);
  const second = await redeem('TEAM-ONEWIN1', ids.other);
  check(`${tag} two accounts redeeming one invite: exactly one wins`, first.rows[0]?.status === 'redeemed' && second.rows[0]?.status === 'invalid', `${first.rows[0]?.status} / ${second.rows[0]?.status}`);
  check(`${tag} …only the winner holds the assignment and the invite records only the winner`,
    (await active(ids.rivalB)) && !(await one(`select 1 x from coach_team where team_id = $1 and profile_id = $2`, [ids.team, ids.other])) &&
    (await state('TEAM-ONEWIN1', ids.rivalB)).invite.used_by === ids.rivalB);

  // 15. A staff ending and a redemption, both orders ---------------------------------
  // (a) The ending commits first: the invite (issued before it) is refused.
  await assign(ids.raceEndFirst);
  await invite('TEAM-RACE-A', { issued: "now() - interval '1 hour'" });
  await as('service_role', null, () => db.query(`select public.end_coach_assignment($1, $2, $3, 'Fictional reason')`, [ids.team, ids.raceEndFirst, ids.staff]));
  await expectRefused('race, ending first: an invite issued before the ending', 'TEAM-RACE-A', ids.raceEndFirst, 'stale_after_end');
  // (b) The redemption commits first (fresh assignment), then the ending: the
  // consumed invite can never restore access afterwards.
  await invite('TEAM-RACE-B');
  const rb = await redeem('TEAM-RACE-B', ids.raceRedeemFirst);
  await as('service_role', null, () => db.query(`select public.end_coach_assignment($1, $2, $3, 'Fictional reason')`, [ids.team, ids.raceRedeemFirst, ids.staff]));
  await expectRefused('race, redemption first then ending: replaying the consumed invite', 'TEAM-RACE-B', ids.raceRedeemFirst, 'invalid');
  check(`${tag} …the assignment stays ended`, rb.rows[0]?.status === 'redeemed' && !(await active(ids.raceRedeemFirst)));

  // 16. Forced failure rolls everything back ------------------------------------------
  await db.exec(`
    create function public.zz_test_fail_invite() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure after assignment'; end; $$;
    create trigger zz_test_fail_invite before update on public.team_invites for each row execute function public.zz_test_fail_invite();
  `);
  await invite('TEAM-ROLLBACK');
  let failure = null;
  try {
    await redeem('TEAM-ROLLBACK', ids.failing, 'Should Not Exist');
  } catch (e) {
    failure = e.message;
  }
  const rolled = await state('TEAM-ROLLBACK', ids.failing);
  check(`${tag} a failure after the assignment write surfaces as an error`, failure?.includes('synthetic failure after assignment'), failure);
  check(`${tag} …the invite is unused, and no profile, role, assignment or audit event remains`,
    rolled.invite.used_at === null && rolled.invite.used_by === null && rolled.profile === undefined && rolled.assignment === undefined && rolled.audit === 0, JSON.stringify(rolled));
  await db.exec(`drop trigger zz_test_fail_invite on public.team_invites; drop function public.zz_test_fail_invite();`);
  check(`${tag} …once the failure is gone the same invite redeems normally`, (await redeem('TEAM-ROLLBACK', ids.failing)).rows[0]?.status === 'redeemed');

  // 17–18. Permissions --------------------------------------------------------------------
  for (const [role, uid] of [['authenticated', ids.other], ['anon', null]]) {
    let error = null;
    try {
      await as(role, uid, () => db.query(`select * from public.redeem_team_invite('TEAM2-UNRELATED', $1)`, [ids.other]));
    } catch (e) {
      error = e.message;
    }
    check(`${tag} ${role} cannot execute redeem_team_invite`, error?.includes('permission denied'), error);
  }
  const fn = await one(`select proacl::text acl, prosecdef secdef, array_to_string(proconfig, ',') config, pg_get_userbyid(proowner) owner
    from pg_proc where oid = 'public.redeem_team_invite(text,uuid,text)'::regprocedure`);
  check(`${tag} only the owner and service_role may execute it (no PUBLIC, anon or authenticated)`, fn.acl === '{postgres=X/postgres,service_role=X/postgres}', fn.acl);
  check(`${tag} SECURITY DEFINER, owner postgres, empty search_path`, fn.secdef === true && fn.owner === 'postgres' && fn.config === 'search_path=""', JSON.stringify(fn));
  check(`${tag} the refusals never consumed the unrelated invite on the other team`,
    (await one(`select used_at from team_invites where code = 'TEAM2-UNRELATED'`)).used_at === null);

  await db.close();
}

await suite('0088');
await suite('0089');

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} team-invite redemption checks passed`);
if (failed.length) process.exitCode = 1;
