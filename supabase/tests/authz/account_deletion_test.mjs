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
import { applyMigrations, createDatabase } from './harness.mjs';

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

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} account-deletion checks passed`);
if (failed.length) process.exitCode = 1;
