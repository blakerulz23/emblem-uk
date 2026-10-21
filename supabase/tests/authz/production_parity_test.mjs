// Gate 0: proves the local database matches the saved production catalog
// evidence before any authorization test relies on it.
//
// RUN: see supabase/tests/authz/README.md (needs EMBLEM_AUTHZ_PGLITE_DIR and
// EMBLEM_AUTHZ_EVIDENCE_DIR). Disposable in-memory PGlite only; reads
// catalog metadata, inserts no rows and needs no credentials.
//
// Each local query is the same SELECT as the production capture (minus the
// read_only_guard column), and its rows are formatted the way the Supabase
// SQL Editor exported them: SQL NULL as "null", booleans as true/false, a
// text[] as a JSON array.
import { applyMigrations, createDatabase, listMigrations, readOnly } from './harness.mjs';
import { loadEvidence } from './evidence.mjs';

const BASELINE_VERSION = '0087';
const EXPECTED_MIGRATION_COUNT = 87;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}

function exportValue(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}

// Compares two row sets keyed by `keyCols`; every other column must be equal.
function compareRows(label, prodRows, localRows, keyCols, { normalise = {} } = {}) {
  const key = (r) => keyCols.map((k) => r[k]).join(' | ');
  const local = new Map(localRows.map((r) => [key(r), Object.fromEntries(Object.entries(r).map(([k, v]) => [k, exportValue(v)]))]));
  const prod = new Map(prodRows.map((r) => [key(r), r]));
  const missing = [...prod.keys()].filter((k) => !local.has(k));
  const extra = [...local.keys()].filter((k) => !prod.has(k));
  const differing = [];
  let normalisedOnly = 0;
  for (const [k, p] of prod) {
    const l = local.get(k);
    if (!l) continue;
    for (const col of Object.keys(p)) {
      if (p[col] === l[col]) continue;
      const n = normalise[col];
      if (n && n(p[col]) === n(l[col])) { normalisedOnly++; continue; }
      differing.push(`${k} [${col}] production=${JSON.stringify(p[col])} local=${JSON.stringify(l[col])}`);
    }
  }
  const pass = missing.length === 0 && extra.length === 0 && differing.length === 0;
  const notes = [`${prod.size} production rows, ${local.size} local rows`];
  if (normalisedOnly) notes.push(`${normalisedOnly} value(s) equal only after whitespace normalisation`);
  check(label, pass, notes.join('; '));
  for (const m of missing) console.log(`       missing locally: ${m}`);
  for (const e of extra) console.log(`       extra locally:   ${e}`);
  for (const d of differing) console.log(`       differs: ${d}`);
}

const collapseWhitespace = (s) => s.replace(/\s+/g, ' ').trim();

// --- P8: migration files vs the production ledger -------------------------
const ledger = loadEvidence('P8');
const files = listMigrations().filter((m) => m.version <= BASELINE_VERSION);
check(`P8: ${EXPECTED_MIGRATION_COUNT} ledger entries`, ledger.length === EXPECTED_MIGRATION_COUNT, `${ledger.length}`);
check(`P8: ${EXPECTED_MIGRATION_COUNT} migration files 0001–${BASELINE_VERSION}`, files.length === EXPECTED_MIGRATION_COUNT, `${files.length}`);
const ledgerMismatches = [];
for (let i = 0; i < Math.max(ledger.length, files.length); i++) {
  const l = ledger[i];
  const f = files[i];
  if (!l || !f || l.version !== f.version || l.name !== f.name) {
    ledgerMismatches.push(`#${i + 1} ledger=${l ? `${l.version}_${l.name}` : '-'} file=${f ? f.file : '-'}`);
  }
}
check('P8: every migration file matches the ledger version and name, in order', ledgerMismatches.length === 0, ledgerMismatches.join('; '));
check('P8: no duplicate ledger versions', new Set(ledger.map((l) => l.version)).size === ledger.length);

// --- Build the local database ----------------------------------------------
const db = await createDatabase();
const applied = await applyMigrations(db, { through: BASELINE_VERSION });
check(
  `applied migrations 0001–${BASELINE_VERSION} in ledger order`,
  applied.length === EXPECTED_MIGRATION_COUNT && applied.every((m, i) => m.version === ledger[i].version && m.name === ledger[i].name),
  `${applied.length} applied`
);

await readOnly(db, async () => {
  // --- P1: policies --------------------------------------------------------
  const p1 = await db.query(`
    select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','clubs','teams','players','coach_team','coach_players','guardians',
                        'moments','moment_media','player_invites','team_invites','cards','card_definitions',
                        'player_assessments','player_strengths','player_season_focus','player_goals','story_updates')
    order by tablename, policyname;`);
  compareRows('P1: policies (name, command, permissive, roles, USING, WITH CHECK)', loadEvidence('P1'), p1.rows,
    ['tablename', 'policyname'], { normalise: { qual: collapseWhitespace, with_check: collapseWhitespace } });

  // --- P2: RLS flags -------------------------------------------------------
  const p2 = await db.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
    order by c.relname;`);
  compareRows('P2: RLS enabled/forced on every public table', loadEvidence('P2'), p2.rows, ['table_name']);

  // --- P3: table grants ----------------------------------------------------
  const p3 = await db.query(`
    select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon','authenticated')
    group by table_name, grantee
    order by table_name, grantee;`);
  compareRows('P3: table grants to anon/authenticated', loadEvidence('P3'), p3.rows, ['table_name', 'grantee']);

  // --- P4: column grants ---------------------------------------------------
  const p4 = await db.query(`
    select table_name, grantee, privilege_type,
           string_agg(column_name, ',' order by column_name) as columns
    from information_schema.column_privileges
    where table_schema = 'public' and grantee in ('anon','authenticated')
      and table_name in ('profiles','players','moments')
    group by table_name, grantee, privilege_type
    order by table_name, grantee, privilege_type;`);
  compareRows('P4: column grants on profiles/players/moments', loadEvidence('P4'), p4.rows, ['table_name', 'grantee', 'privilege_type']);

  // --- P5: functions -------------------------------------------------------
  const p5 = await db.query(`
    select p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prosecdef as security_definer,
           pg_get_userbyid(p.proowner) as owner,
           p.proconfig as settings,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
           has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname, args;`);
  compareRows('P5: public functions (signature, SECURITY DEFINER, owner, settings, execute rights)', loadEvidence('P5'), p5.rows, ['function_name', 'args']);

  // --- P6: triggers (production returned 0 rows; recorded in errors.txt) --
  const p6 = await db.query(`
    select event_object_table as table_name, trigger_name
    from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table in ('profiles','teams','players','coach_team','guardians','moments');`);
  check('P6: no triggers on profiles/teams/players/coach_team/guardians/moments (production: 0 rows)', p6.rows.length === 0, `${p6.rows.length} local rows`);

  // --- P7: default privileges (project-owned objects only) ----------------
  const p7 = await db.query(`
    select pg_get_userbyid(defaclrole) as for_role, defaclnamespace::regnamespace::text as schema,
           defaclobjtype as object_type, defaclacl::text as acl
    from pg_default_acl order by 2, 3, 4;`);
  const projectRows = (rows) => rows.filter((r) => r.for_role === 'postgres' && r.schema === 'public');
  compareRows('P7: default privileges for postgres in public', projectRows(loadEvidence('P7')), projectRows(p7.rows), ['for_role', 'schema', 'object_type']);
  const outOfScope = p7.rows.length - projectRows(p7.rows).length;
  check('P7: no other default-privilege rows exist locally', outOfScope === 0, `${outOfScope}`);
});

await db.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} production-parity checks passed`);
if (failed.length) process.exitCode = 1;
