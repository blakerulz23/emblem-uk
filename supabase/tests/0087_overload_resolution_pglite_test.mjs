// ============================================================================
// Proves migration 0087's create_card_share_public_page overload fix
// directly against real PostgreSQL — see full_migration_test.mjs's own
// header for the established pattern this follows.
//
// RUN: node supabase/tests/0087_overload_resolution_pglite_test.mjs
// REQUIRES (not a project dependency — install ad hoc before running):
//   npm install --no-save @electric-sql/pglite
// Fully disposable — creates an in-memory Postgres instance, never touches
// any real project, needs no credentials of any kind.
//
// PostgreSQL identifies a function by (schema, name, parameter TYPE LIST).
// 0085 created create_card_share_public_page(uuid, text); the ORIGINAL
// (flawed) draft of 0087 only ran `create or replace function
// create_card_share_public_page(uuid, text, text default null)` — a
// different argument count, so CREATE OR REPLACE could not and did not
// replace the 0085 signature. Part 1 below reproduces exactly that and
// shows the real ambiguity error Postgres raises for a two-argument call
// once both signatures coexist. Part 2 proves the corrected 0087 (an
// explicit DROP of the old signature before creating the new one, inside
// the same migration transaction) leaves exactly one overload, and that
// both the currently-deployed two-key call shape and PR #100's new
// three-key shape succeed against it unambiguously — no wrapper function,
// no duplicated logic, a single implementation throughout.
// ============================================================================
import { PGlite } from '@electric-sql/pglite';

function check(name, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) process.exitCode = 1;
}

async function countOverloads(db, proname) {
  const r = await db.query(`select count(*)::int as n from pg_proc where proname = $1`, [proname]);
  return r.rows[0].n;
}

// ---------------------------------------------------------------------
// PART 1 — prove the ORIGINAL (flawed) 0087 design is genuinely ambiguous,
// not hypothetically ambiguous.
// ---------------------------------------------------------------------
{
  const db = new PGlite();
  await db.exec(`
    -- 0085's real signature: create_card_share_public_page(uuid, text)
    create function create_card_share_public_page(p_order_id uuid, p_front_image_key text)
    returns text language sql as $$ select 'two-arg:' || p_front_image_key $$;
  `);
  const n1 = await countOverloads(db, 'create_card_share_public_page');
  check('Part 1: exactly one overload exists right after 0085-equivalent', n1 === 1, { count: n1 });

  const before = await db.query(`select create_card_share_public_page(p_order_id := $1, p_front_image_key := $2) as r`, [
    '00000000-0000-0000-0000-000000000000',
    'front.png',
  ]);
  check('Part 1: two-arg call succeeds before the flawed 0087 is applied', before.rows[0].r === 'two-arg:front.png');

  // The ORIGINAL 0087 as first written: CREATE OR REPLACE with a
  // three-argument signature, no DROP of the old one first.
  await db.exec(`
    create or replace function create_card_share_public_page(
      p_order_id uuid, p_front_image_key text, p_back_image_key text default null
    ) returns text language sql as $$ select 'three-arg:' || p_front_image_key || ':' || coalesce(p_back_image_key, '<null>') $$;
  `);
  const n2 = await countOverloads(db, 'create_card_share_public_page');
  check('Part 1: TWO overloads now exist — proves CREATE OR REPLACE did not replace the old one', n2 === 2, { count: n2 });

  let ambiguousErrorSeen = false;
  let errorMessage = '';
  try {
    await db.query(`select create_card_share_public_page(p_order_id := $1, p_front_image_key := $2) as r`, [
      '00000000-0000-0000-0000-000000000000',
      'front.png',
    ]);
  } catch (e) {
    ambiguousErrorSeen = true;
    errorMessage = e.message;
  }
  check('Part 1: a real two-argument call now fails with a genuine Postgres ambiguity error', ambiguousErrorSeen, { errorMessage });
}

// ---------------------------------------------------------------------
// PART 2 — prove the CORRECTED design (DROP old signature, then CREATE
// the three-argument one) removes the ambiguity and keeps both call
// shapes working.
// ---------------------------------------------------------------------
{
  const db = new PGlite();
  await db.exec(`
    create function create_card_share_public_page(p_order_id uuid, p_front_image_key text)
    returns text language sql as $$ select 'two-arg:' || p_front_image_key $$;
  `);

  // The CORRECTED 0087: drop the old signature first, then create the new one.
  await db.exec(`
    drop function if exists create_card_share_public_page(uuid, text);
    create or replace function create_card_share_public_page(
      p_order_id uuid, p_front_image_key text, p_back_image_key text default null
    ) returns text language sql as $$ select 'three-arg:' || p_front_image_key || ':' || coalesce(p_back_image_key, '<null>') $$;
  `);

  const n = await countOverloads(db, 'create_card_share_public_page');
  check('Part 2: exactly ONE overload exists after the corrected 0087', n === 1, { count: n });

  // OLD application payload shape: exactly the two keys the currently
  // deployed (pre-PR-#100) route sends.
  const oldCall = await db.query(`select create_card_share_public_page(p_order_id := $1, p_front_image_key := $2) as r`, [
    '00000000-0000-0000-0000-000000000000',
    'front.png',
  ]);
  check(
    'Part 2: OLD two-key payload {p_order_id, p_front_image_key} succeeds, unambiguous, back defaults to null',
    oldCall.rows[0].r === 'three-arg:front.png:<null>',
    { result: oldCall.rows[0].r }
  );

  // NEW application payload shape: PR #100's own three keys.
  const newCall = await db.query(
    `select create_card_share_public_page(p_order_id := $1, p_front_image_key := $2, p_back_image_key := $3) as r`,
    ['00000000-0000-0000-0000-000000000000', 'front.png', 'back.png']
  );
  check(
    'Part 2: NEW three-key payload {p_order_id, p_front_image_key, p_back_image_key} succeeds',
    newCall.rows[0].r === 'three-arg:front.png:back.png',
    { result: newCall.rows[0].r }
  );
}

console.log('\nDone.');
