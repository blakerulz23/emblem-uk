// A guardian who created a coach invite, or whose invite became a direct
// coach link, can delete their account (0088 §11).
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR).
// Disposable in-memory PGlite, fictional data with generated ids only.
//
// Each scenario runs on a fresh database twice: at 0087 (where
// delete_own_guardian_account fails) and at 0088 (where it succeeds, and the
// invite / direct link remain with created_by = NULL).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations, createDatabase } from './harness.mjs';
import { diffCatalog, snapshotCatalog } from './catalog.mjs';

const ROLLBACK_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../rollback/0088_rollback.sql');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}
const id = () => crypto.randomUUID();

async function scenario(through, { redeemed, otherGuardian, linkOnly = false }) {
  const db = await createDatabase();
  await applyMigrations(db, { through });
  const ids = { player: id(), guardian: id(), other: id(), coach: id(), invite: id() };
  await db.query(`insert into auth.users (id, email) select u, 'p-' || left(u::text, 8) || '@example.test' from unnest($1::uuid[]) u`, [[ids.guardian, ids.other, ids.coach]]);
  await db.query(`insert into profiles (id, role, display_name) values ($1, 'parent', 'Fictional Parent'), ($2, 'parent', 'Other Parent'), ($3, 'coach', 'Fictional Coach')`, [ids.guardian, ids.other, ids.coach]);
  await db.query(`insert into players (id, name) values ($1, 'Fictional Player')`, [ids.player]);
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [ids.player, ids.guardian]);
  if (otherGuardian) await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [ids.player, ids.other]);
  // linkOnly: the guardian created a direct link whose invite record was
  // made by someone else, isolating the coach_players.created_by reference.
  await db.query(`insert into coach_invites (id, player_id, code, created_by) values ($1, $2, 'COACH-' || left(md5(random()::text), 8), $3)`,
    [ids.invite, ids.player, linkOnly ? ids.other : ids.guardian]);
  if (redeemed) {
    await db.query(`update coach_invites set used_at = now(), used_by = $1 where id = $2`, [ids.coach, ids.invite]);
    await db.query(`insert into coach_players (player_id, profile_id, created_via, created_by) values ($1, $2, 'guardian_invite', $3)`, [ids.player, ids.coach, ids.guardian]);
  }

  let outcome;
  await db.exec('begin;');
  try {
    await db.exec('set local role authenticated;');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true);`, [ids.guardian]);
    const r = await db.query(`select public.delete_own_guardian_account() as result`);
    await db.exec('commit;');
    outcome = { ok: true, result: r.rows[0].result };
  } catch (e) {
    await db.exec('rollback;');
    outcome = { ok: false, error: e.message };
  }

  const state = {
    profileGone: (await db.query(`select 1 from profiles where id = $1`, [ids.guardian])).rows.length === 0,
    invite: (await db.query(`select created_by, used_by from coach_invites where id = $1`, [ids.invite])).rows[0] ?? null,
    link: (await db.query(`select created_by, created_via, connected_at from coach_players where player_id = $1 and profile_id = $2`, [ids.player, ids.coach])).rows[0] ?? null,
  };
  await db.close();
  return { outcome, state, ids };
}

for (const otherGuardian of [true, false]) {
  const who = otherGuardian ? 'player has another guardian' : 'sole guardian';

  const before1 = await scenario('0087', { redeemed: false, otherGuardian });
  check(`[0087, ${who}] unredeemed coach invite: account deletion failed before the fix`, !before1.outcome.ok, before1.outcome.error);
  const after1 = await scenario('0088', { redeemed: false, otherGuardian });
  check(`[0088, ${who}] unredeemed coach invite: account deletion succeeds`,
    after1.outcome.ok && after1.outcome.result.canDeleteIdentity === true && after1.state.profileGone, JSON.stringify(after1.outcome));
  check(`[0088, ${who}] the unredeemed invite remains, with created_by = NULL`,
    after1.state.invite !== null && after1.state.invite.created_by === null, JSON.stringify(after1.state.invite));

  const before2 = await scenario('0087', { redeemed: true, otherGuardian });
  check(`[0087, ${who}] redeemed invite + direct link: account deletion failed before the fix`, !before2.outcome.ok, before2.outcome.error);
  const after2 = await scenario('0088', { redeemed: true, otherGuardian });
  check(`[0088, ${who}] redeemed invite + direct link: account deletion succeeds`,
    after2.outcome.ok && after2.outcome.result.canDeleteIdentity === true && after2.state.profileGone, JSON.stringify(after2.outcome));
  check(`[0088, ${who}] the direct link remains, with created_by = NULL and its origin and time intact`,
    after2.state.link !== null && after2.state.link.created_by === null && after2.state.link.created_via === 'guardian_invite' && after2.state.link.connected_at !== null,
    JSON.stringify(after2.state.link));
  check(`[0088, ${who}] the used invite remains, with created_by = NULL and the redeeming coach kept`,
    after2.state.invite !== null && after2.state.invite.created_by === null && after2.state.invite.used_by === after2.ids.coach, JSON.stringify(after2.state.invite));
}

const before3 = await scenario('0087', { redeemed: true, otherGuardian: true, linkOnly: true });
check('[0087] direct link created by the guardian (invite made by another): deletion failed on coach_players.created_by',
  !before3.outcome.ok && before3.outcome.error.includes('coach_players_created_by_fkey'), before3.outcome.error);
const after3 = await scenario('0088', { redeemed: true, otherGuardian: true, linkOnly: true });
check('[0088] direct link created by the guardian: deletion succeeds and the link remains with created_by = NULL',
  after3.outcome.ok && after3.state.profileGone && after3.state.link?.created_by === null, JSON.stringify(after3.state.link));

// ---------------------------------------------------------------------------
// The coach who REDEEMED an invite (coach_invites.used_by)
// ---------------------------------------------------------------------------
// delete_own_guardian_account (0076) already clears used_by itself; the key
// blocked every other profile deletion (an auth user removed directly, which
// cascades to profiles). used_at is the consumed marker and must never move.
async function redeemerScenario(through, how) {
  const db = await createDatabase();
  await applyMigrations(db, { through });
  const ids = { player: id(), guardian: id(), coach: id(), invite: id() };
  await db.query(`insert into auth.users (id, email) values ($1, 'g@example.test'), ($2, 'c@example.test')`, [ids.guardian, ids.coach]);
  await db.query(`insert into profiles (id, role) values ($1, 'parent'), ($2, 'coach')`, [ids.guardian, ids.coach]);
  await db.query(`insert into players (id, name) values ($1, 'Fictional Player')`, [ids.player]);
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2)`, [ids.player, ids.guardian]);
  await db.query(`insert into coach_invites (id, player_id, code, created_by, used_at, used_by) values ($1, $2, 'COACH-REDEEM01', $3, '2026-10-01T09:30:00Z', $4)`,
    [ids.invite, ids.player, ids.guardian, ids.coach]);
  await db.query(`insert into coach_players (player_id, profile_id, created_via, created_by) values ($1, $2, 'guardian_invite', $3)`, [ids.player, ids.coach, ids.guardian]);
  let outcome;
  try {
    if (how === 'auth user') await db.query(`delete from auth.users where id = $1`, [ids.coach]);
    else if (how === 'profile') await db.query(`delete from profiles where id = $1`, [ids.coach]);
    else {
      await db.exec('begin; set local role authenticated;');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ids.coach]);
      try { await db.query(`select public.delete_own_guardian_account()`); await db.exec('commit;'); } catch (e) { await db.exec('rollback;'); throw e; }
    }
    outcome = { ok: true };
  } catch (e) {
    outcome = { ok: false, error: e.message };
  }
  const invite = (await db.query(`select used_at, used_by, created_by from coach_invites where id = $1`, [ids.invite])).rows[0] ?? null;
  const guardianKept = (await db.query(`select 1 from guardians where player_id = $1 and profile_id = $2`, [ids.player, ids.guardian])).rows.length === 1;
  const playerKept = (await db.query(`select 1 from players where id = $1`, [ids.player])).rows.length === 1;
  await db.close();
  return { outcome, invite, guardianKept, playerKept };
}

for (const how of ['auth user', 'profile']) {
  const before = await redeemerScenario('0087', how);
  check(`[0087] deleting the redeeming coach’s ${how} directly is blocked by coach_invites.used_by`,
    !before.outcome.ok && before.outcome.error.includes('coach_invites_used_by_fkey'), before.outcome.error);
  const after = await redeemerScenario('0088', how);
  check(`[0088] deleting the redeeming coach’s ${how} succeeds`, after.outcome.ok, after.outcome.error);
  check(`[0088] (${how}) the invite remains, used_by = NULL, used_at unchanged, so it stays consumed`,
    after.invite !== null && after.invite.used_by === null && after.invite.used_at?.toISOString() === '2026-10-01T09:30:00.000Z',
    JSON.stringify(after.invite));
  check(`[0088] (${how}) the player and their guardian are untouched`, after.playerKept && after.guardianKept);
}
const viaFunction = await redeemerScenario('0088', 'delete_own_guardian_account');
check('[0088] the in-app account deletion of the redeeming coach also keeps used_at and clears used_by',
  viaFunction.outcome.ok && viaFunction.invite.used_by === null && viaFunction.invite.used_at?.toISOString() === '2026-10-01T09:30:00.000Z',
  JSON.stringify(viaFunction.invite));

// ---------------------------------------------------------------------------
// Applying 0088 leaves existing used_by / used_at exactly as they were
// ---------------------------------------------------------------------------
{
  const db = await createDatabase();
  await applyMigrations(db, { through: '0087' });
  const g = id(), c = id(), p = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'g@example.test'), ($2, 'c@example.test')`, [g, c]);
  await db.query(`insert into profiles (id, role) values ($1, 'parent'), ($2, 'coach')`, [g, c]);
  await db.query(`insert into players (id, name) values ($1, 'Fictional Player')`, [p]);
  await db.query(`insert into coach_invites (player_id, code, created_by, used_at, used_by) values
    ($1, 'COACH-PRE00001', $2, '2026-09-01T10:00:00Z', $3),
    ($1, 'COACH-PRE00002', $2, '2026-09-02T10:00:00Z', null),
    ($1, 'COACH-PRE00003', $2, null, null)`, [p, g, c]);
  const snapshot = async () => JSON.stringify((await db.query(`select code, used_at, used_by, created_by from coach_invites order by code`)).rows);
  const before = await snapshot();
  await applyMigrations(db, { from: '0088', through: '0088' });
  check('applying 0088 does not alter any existing used_at, used_by or created_by', (await snapshot()) === before);
  await db.close();
}

// ---------------------------------------------------------------------------
// Rollback refusal: a deleted invite creator cannot be restored
// ---------------------------------------------------------------------------
{
  const db = await createDatabase();
  await applyMigrations(db, { through: '0087' });
  const catalog0087 = await snapshotCatalog(db);
  await applyMigrations(db, { from: '0088', through: '0088' });
  const g = id(), other = id(), p = id();
  await db.query(`insert into auth.users (id, email) values ($1, 'g@example.test'), ($2, 'o@example.test')`, [g, other]);
  await db.query(`insert into profiles (id, role) values ($1, 'parent'), ($2, 'parent')`, [g, other]);
  await db.query(`insert into players (id, name) values ($1, 'Fictional Player')`, [p]);
  await db.query(`insert into guardians (player_id, profile_id) values ($1, $2), ($1, $3)`, [p, g, other]);
  await db.query(`insert into coach_invites (player_id, code, created_by) values ($1, 'COACH-GONE0001', $2)`, [p, g]);
  await db.exec('begin; set local role authenticated;');
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [g]);
  await db.query(`select public.delete_own_guardian_account()`);
  await db.exec('commit;');
  const catalogBefore = await snapshotCatalog(db);
  let refusal = null;
  try {
    await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  } catch (e) {
    refusal = e.message;
    await db.exec('rollback;').catch(() => {});
  }
  check('rollback refuses when an invite creator was deleted after 0088, with a clear reason',
    refusal !== null && refusal.includes('Rollback refused') && refusal.includes('no creator'), refusal);
  const after = diffCatalog(catalogBefore, await snapshotCatalog(db));
  check('the refused rollback changed nothing', after.added.length + after.removed.length + after.changed.length === 0,
    [...after.added, ...after.removed, ...after.changed].join(', '));
  // Resolving the row deliberately makes the rollback succeed again.
  await db.query(`delete from coach_invites where created_by is null`);
  await db.exec(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  const back = diffCatalog(catalog0087, await snapshotCatalog(db));
  check('once resolved, the rollback restores the exact 0087 catalog', back.added.length + back.removed.length + back.changed.length === 0,
    [...back.added, ...back.removed, ...back.changed].join(', '));
  await db.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} account-deletion checks passed`);
if (failed.length) process.exitCode = 1;
