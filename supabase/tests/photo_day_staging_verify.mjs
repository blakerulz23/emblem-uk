import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Photo Day staging rehearsal, step 2: READ-ONLY checks that migrations
// 0103-0107 are applied correctly on the hosted STAGING project.
// See docs/operations/photo-day-staging-rehearsal.md for the whole runbook.
//
// RUN: node supabase/tests/photo_day_staging_verify.mjs (from the repo root)
// REQUIRES (not a project dependency — install ad hoc before running):
//   npm install --no-save pg
// REQUIRES: a populated, git-ignored .env.staging.local at the repo root
// with STAGING_SUPABASE_DB_URL (same file hosted_staging_verify.mjs uses).
//
// Read-only: one transaction, SET TRANSACTION READ ONLY, rolled back.
// SAFETY GUARD (same as hosted_staging_verify.mjs): refuses to run unless
// the connection string resolves to the staging ref and not production.
// ============================================================================
const STAGING_REF = 'rqgrpaprfxxhcvqtwhgj';
const PRODUCTION_REF = 'ksszgbcditlfimnfnzla';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envText = fs.readFileSync(path.join(REPO_ROOT, '.env.staging.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const dbUrl = env.STAGING_SUPABASE_DB_URL ?? env.STAGING_DB_URL;
if (!dbUrl || !dbUrl.includes(STAGING_REF)) {
  console.error(`SAFETY ABORT: STAGING_SUPABASE_DB_URL does not resolve to staging ref ${STAGING_REF}.`);
  process.exit(1);
}
if (dbUrl.includes(PRODUCTION_REF)) {
  console.error(`SAFETY ABORT: STAGING_SUPABASE_DB_URL contains the PRODUCTION ref ${PRODUCTION_REF}.`);
  process.exit(1);
}

function check(name, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) process.exitCode = 1;
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query('set transaction read only');
  const val = async (sql, params = []) => Object.values((await client.query(sql, params)).rows[0] ?? {})[0];

  const auditDef = await val(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'squad_invite_audit_events_event_type_check'`);
  for (const e of ['coach_card_submitted', 'coach_card_locked', 'coach_card_changes_requested', 'photo_rejected', 'campaign_reopened']) {
    check(`0103: audit event ${e} allowed`, String(auditDef).includes(`'${e}'`));
  }
  for (const e of ['photo_day_scheduled', 'photo_day_photographer_link_revoked', 'photo_day_consent_withdrawn', 'photo_day_photos_deleted']) {
    check(`0104-0106: audit event ${e} allowed`, String(auditDef).includes(`'${e}'`));
  }
  check('0104: photo_day_photography consent purpose', String(await val(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'squad_invite_permissions_purpose_check'`)).includes('photo_day_photography'));
  check('0107: photo_day_photo erasure kind', String(await val(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'squad_invite_participation_deletion_storage_objects_kind_check'`)).includes('photo_day_photo'));

  for (const table of ['squad_invite_photo_days', 'squad_invite_photo_day_photos']) {
    check(`${table} exists with RLS on`, (await val(`select relrowsecurity from pg_class where oid = to_regclass($1)`, [`public.${table}`])) === true);
    for (const role of ['anon', 'authenticated']) {
      const any = await val(`select has_table_privilege($1, $2, 'select') or has_table_privilege($1, $2, 'insert') or has_table_privilege($1, $2, 'update') or has_table_privilege($1, $2, 'delete')`, [role, `public.${table}`]);
      check(`${role} has no access to ${table}`, any === false);
    }
  }

  const SERVICE_ONLY = [
    'record_photo_day_photo(uuid, text, text, bigint)', 'match_photo_day_photo(uuid, uuid, uuid)', 'unmatch_photo_day_photo(uuid, uuid)',
    'release_photo_day_photos_for_withdrawn_consent(uuid)',
    'create_squad_invite_photo_day(uuid, uuid, date, text, text, integer)', 'confirm_photo_day_coach_permissions(uuid, uuid, text)',
    'issue_photo_day_photographer_link(uuid, uuid, text, integer)', 'revoke_photo_day_photographer_link(uuid, uuid)',
    'record_photo_day_consent(uuid, uuid, text, boolean, text, text, integer)', 'publish_photo_day(uuid, uuid)',
    'photo_day_effective_delete_after(uuid)', 'list_photo_days_due_for_deletion(integer)',
    'mark_photo_day_photo_storage_deleted(uuid)', 'close_photo_day_after_deletion(uuid)',
  ];
  for (const sig of SERVICE_ONLY) {
    const oid = await val(`select to_regprocedure($1)::oid`, [`public.${sig}`]);
    check(`function ${sig.split('(')[0]} exists`, oid !== null && oid !== undefined);
    if (!oid) continue;
    const [definer, config] = Object.values((await client.query(`select prosecdef, proconfig from pg_proc where oid = $1`, [oid])).rows[0]);
    check(`${sig.split('(')[0]} is security definer with empty search_path`, definer === true && (config ?? []).some((c) => c === 'search_path=""'), config);
    for (const role of ['anon', 'authenticated']) {
      check(`${role} cannot execute ${sig.split('(')[0]}`, (await val(`select has_function_privilege($1, $2::regprocedure, 'execute')`, [role, oid])) === false);
    }
    check(`service_role can execute ${sig.split('(')[0]}`, (await val(`select has_function_privilege('service_role', $1::regprocedure, 'execute')`, [oid])) === true);
  }

  const erasure = await val(`select pg_get_functiondef('public.confirm_squad_invite_participation_erasure(uuid, text)'::regprocedure)`);
  check('0107: erasure function includes the Photo Day block', String(erasure).includes("'photo_day_photo'"));
  check('erasure function still callable by authenticated (staff check inside)', (await val(`select has_function_privilege('authenticated', 'public.confirm_squad_invite_participation_erasure(uuid, text)', 'execute')`)) === true);
} finally {
  await client.query('rollback').catch(() => undefined);
  await client.end();
}
