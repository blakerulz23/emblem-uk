// ============================================================================
// Proves Photo Day migrations 0104 (foundation), 0105 (staff controls) and
// 0106 (parent consent, publishing)
// against real PostgreSQL: every migration applied in order on an in-memory
// pglite database with stubbed Supabase roles and auth, same pattern as
// 0095_uk_partner_programme_pglite_test.mjs.
//
// RUN: node supabase/tests/0104_0105_photo_day_pglite_test.mjs
//      (MIGRATIONS_DIR=<path> to point at another checkout's migrations)
// REQUIRES (not a project dependency — install ad hoc before running):
//   npm install --no-save @electric-sql/pglite
// Fully disposable: no real project, no credentials.
//
// Covers: anon/authenticated can't touch the tables or call the functions;
// create/confirm/issue/revoke rules and their audit events; the upload
// token (wrong, replaced, revoked, expired, wrong prefix, cap); matching
// only with unwithdrawn photo_day_photography consent, within the campaign,
// while the participation is open; withdrawal releases matches.
// ============================================================================
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

function check(name, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) process.exitCode = 1;
}

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec('create extension if not exists pgcrypto;');
await db.exec(`
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
`);

const STAFF = '00000000-0000-4000-8000-0000000000ad';
const ORGANISER = '00000000-0000-4000-8000-0000000000b1';
const NOT_STAFF = ORGANISER;
const READINESS_SQL = `
  insert into auth.users (id, email) values ('${STAFF}', 'staff@example.test');
  insert into public.profiles (id, display_name) values ('${STAFF}', 'Staff');
  insert into public.staff_accounts (profile_id) values ('${STAFF}');
  begin; set local role service_role;
  select public.confirm_release_readiness('authorization_relationships_v1', repeat('0', 40), '${STAFF}', true, true, true, true, true, true);
  commit;
`;
const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
for (const f of files) {
  try {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  } catch (e) {
    console.log(`MIGRATION FAILED: ${f} — ${e.message}`);
    process.exit(1);
  }
  if (f.startsWith('0088_')) await db.exec(READINESS_SQL);
}
check(`applied ${files.length} migrations, including 0104 and 0105`, files.some((f) => f.startsWith('0104')) && files.some((f) => f.startsWith('0105')));

// --- Helpers -----------------------------------------------------------------
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const val = async (sql, params = []) => Object.values(await one(sql, params))[0];
const sha = (s) => createHash('sha256').update(s).digest('hex');
const isoDate = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
};

await db.exec(`
  insert into auth.users (id, email) values ('${ORGANISER}', 'organiser@example.test');
  insert into public.profiles (id, display_name) values ('${ORGANISER}', 'Organiser');
`);

async function seedCampaign(status = 'active', deadlineDays = 21) {
  return val(`
    insert into public.squad_invites(
      organiser_profile_id, organiser_role, club_team_name, football_age_group,
      authority_declaration_version, terms_version, privacy_version, campaign_status,
      deadline_at, grace_ends_at, delivery_recipient_name, delivery_recipient_role,
      delivery_address, delivery_postcode, delivery_contact, recipient_distribution_accepted_at
    ) values (
      $1, 'team_manager', 'Saddleworth Test U10', 'U10', 'v1', 'v1', 'v1', $2,
      now() + make_interval(days => $3), now() + make_interval(days => $3 + 1), 'Pat Manager', 'Manager',
      '1 Test Street, Testville', 'OL3 1AA', 'pat@example.test', now()
    ) returning id`, [ORGANISER, status, deadlineDays]);
}
async function seedParticipation(campaignId, status = 'started') {
  return val(`insert into public.squad_invite_participations(campaign_id, builder_token_hash, status, commitment_completed_at)
    values ($1, $2, $3, case when $3 = 'started' then null else now() end) returning id`, [campaignId, sha(randomUUID()), status]);
}
async function grantConsent(campaignId, participationId) {
  await db.query(`insert into public.squad_invite_permissions(campaign_id, participation_id, purpose, policy_version, granted)
    values ($1, $2, 'photo_day_photography', 'photo-day-v1', true)`, [campaignId, participationId]);
}
const create = (campaignId, staff, date, venue = 'Astley Sports Village', photographer = 'Blake', max = 400) =>
  val(`select public.create_squad_invite_photo_day($1, $2, $3::date, $4, $5, $6)`, [campaignId, staff, date, venue, photographer, max]);
const confirm = (dayId, staff, note) => val(`select public.confirm_photo_day_coach_permissions($1, $2, $3)`, [dayId, staff, note]);
const issue = (dayId, staff, hash, hours = 48) => val(`select public.issue_photo_day_photographer_link($1, $2, $3, $4)`, [dayId, staff, hash, hours]);
const revoke = (dayId, staff) => val(`select public.revoke_photo_day_photographer_link($1, $2)`, [dayId, staff]);
const record = (dayId, hash, key, bytes = 1000) => val(`select public.record_photo_day_photo($1, $2, $3, $4)`, [dayId, hash, key, bytes]);
const match = (photoId, participationId, staff = STAFF) => val(`select public.match_photo_day_photo($1, $2, $3)`, [photoId, participationId, staff]);
const unmatch = (photoId, staff = STAFF) => val(`select public.unmatch_photo_day_photo($1, $2)`, [photoId, staff]);
const keyFor = (dayId) => `photo-day/${dayId}/${randomUUID()}.jpg`;
const dayRow = (dayId) => one(`select * from public.squad_invite_photo_days where id = $1`, [dayId]);
const auditFor = async (campaignId, type) => (await db.query(
  `select metadata from public.squad_invite_audit_events where campaign_id = $1 and event_type = $2 order by id`, [campaignId, type])).rows;

// --- Privileges --------------------------------------------------------------
const FUNCTIONS = [
  'create_squad_invite_photo_day(uuid, uuid, date, text, text, integer)',
  'confirm_photo_day_coach_permissions(uuid, uuid, text)',
  'issue_photo_day_photographer_link(uuid, uuid, text, integer)',
  'revoke_photo_day_photographer_link(uuid, uuid)',
  'record_photo_day_photo(uuid, text, text, bigint)',
  'match_photo_day_photo(uuid, uuid, uuid)',
  'unmatch_photo_day_photo(uuid, uuid)',
  'release_photo_day_photos_for_withdrawn_consent(uuid)',
];
for (const role of ['anon', 'authenticated']) {
  for (const table of ['squad_invite_photo_days', 'squad_invite_photo_day_photos']) {
    const can = await val(`select has_table_privilege($1, $2, 'select') or has_table_privilege($1, $2, 'insert') or has_table_privilege($1, $2, 'update')`, [role, `public.${table}`]);
    check(`${role} has no access to ${table}`, can === false);
  }
  for (const f of FUNCTIONS) {
    check(`${role} cannot execute ${f.split('(')[0]}`, (await val(`select has_function_privilege($1, $2, 'execute')`, [role, `public.${f}`])) === false);
  }
}
for (const f of FUNCTIONS) {
  check(`service_role can execute ${f.split('(')[0]}`, (await val(`select has_function_privilege('service_role', $1, 'execute')`, [`public.${f}`])) === true);
}

// --- Create ------------------------------------------------------------------
const campaign = await seedCampaign('active', 21);
check('create refuses a non-staff profile', (await create(campaign, NOT_STAFF, isoDate(7))).reason === 'not_staff');
const cancelled = await seedCampaign('cancelled');
check('create refuses a cancelled campaign', (await create(cancelled, STAFF, isoDate(7))).reason === 'campaign_not_open');
check('create refuses a date in the past', (await create(campaign, STAFF, isoDate(-1))).reason === 'date_outside_campaign');
check('create refuses a date after the campaign deadline', (await create(campaign, STAFF, isoDate(30))).reason === 'date_outside_campaign');
check('create refuses a blank venue', (await create(campaign, STAFF, isoDate(7), ' ')).reason === 'invalid_details');
check('create refuses a cap over 1000', (await create(campaign, STAFF, isoDate(7), 'Astley', 'Blake', 5000)).reason === 'invalid_details');
const created = await create(campaign, STAFF, isoDate(7));
check('create succeeds for staff on an active campaign', created.ok === true && typeof created.photoDayId === 'string', created);
const dayId = created.photoDayId;
check('a second photo day for the same campaign is refused', (await create(campaign, STAFF, isoDate(8))).reason === 'already_exists');
{
  const d = await dayRow(dayId);
  const days = (new Date(d.photos_delete_after) - new Date(`${isoDate(7)}T00:00:00Z`)) / 86400000;
  check('new day starts scheduled, no token, no coach permission', d.status === 'scheduled' && d.photographer_token_hash === null && d.coach_permissions_confirmed_at === null);
  check('photos_delete_after is about 60 days after the shoot (London midnight)', days > 59.9 && days <= 60, days);
  check('photo_day_scheduled audit event written', (await auditFor(campaign, 'photo_day_scheduled')).length === 1);
}

// --- Coach permission gate ----------------------------------------------------
const TOKEN_A = sha('token-a');
check('link refused before coach permission is confirmed', (await issue(dayId, STAFF, TOKEN_A)).reason === 'coach_permissions_unconfirmed');
check('coach permission needs a note', (await confirm(dayId, STAFF, 'ok')).reason === 'note_required');
check('coach permission refuses non-staff', (await confirm(dayId, NOT_STAFF, 'Both managers agreed by email')).reason === 'not_staff');
check('coach permission confirmed', (await confirm(dayId, STAFF, 'Both managers agreed by email, 14 Nov')).ok === true);
check('confirming twice is refused and keeps the first time', (await confirm(dayId, STAFF, 'Again later')).reason === 'already_confirmed');
check('coach permission audit event written', (await auditFor(campaign, 'photo_day_coach_permissions_confirmed')).length === 1);

// --- Photographer link --------------------------------------------------------
check('link refuses a malformed hash', (await issue(dayId, STAFF, 'not-a-hash')).reason === 'invalid_token');
check('link refuses 0 hours', (await issue(dayId, STAFF, TOKEN_A, 0)).reason === 'invalid_validity');
check('link refuses more than 7 days', (await issue(dayId, STAFF, TOKEN_A, 169)).reason === 'invalid_validity');
const issued = await issue(dayId, STAFF, TOKEN_A, 48);
check('link issued', issued.ok === true && typeof issued.expiresAt === 'string', issued);
{
  const issuedEvents = await auditFor(campaign, 'photo_day_photographer_link_issued');
  check('link audit event never contains the token hash', issuedEvents.length === 1 && !JSON.stringify(issuedEvents).includes(TOKEN_A));
}

// --- Upload token -------------------------------------------------------------
check('upload with a wrong token is refused', (await record(dayId, sha('wrong'), keyFor(dayId))) === null);
check('upload into another day\'s prefix is refused', (await record(dayId, TOKEN_A, keyFor(randomUUID()))) === null);
const photo1 = await record(dayId, TOKEN_A, keyFor(dayId));
check('upload with the right token is recorded', typeof photo1 === 'string');
check('first upload moves the day to shooting', (await dayRow(dayId)).status === 'shooting');

const TOKEN_B = sha('token-b');
const reissued = await issue(dayId, STAFF, TOKEN_B, 24);
check('re-issuing replaces the link', reissued.ok === true);
check('re-issue audit records that an earlier link was replaced', (await auditFor(campaign, 'photo_day_photographer_link_issued'))[1]?.metadata?.replacedEarlierLink === true);
check('old token stops working after re-issue', (await record(dayId, TOKEN_A, keyFor(dayId))) === null);
const photo2 = await record(dayId, TOKEN_B, keyFor(dayId));
check('new token works', typeof photo2 === 'string');

await db.query(`update public.squad_invite_photo_days set max_photos = 2 where id = $1`, [dayId]);
check('upload past max_photos is refused', (await record(dayId, TOKEN_B, keyFor(dayId))) === null);
await db.query(`update public.squad_invite_photo_days set max_photos = 400 where id = $1`, [dayId]);

await db.query(`update public.squad_invite_photo_days set photographer_token_expires_at = now() - interval '1 minute' where id = $1`, [dayId]);
check('expired token is refused', (await record(dayId, TOKEN_B, keyFor(dayId))) === null);
await issue(dayId, STAFF, TOKEN_B, 24);

check('revoke works', (await revoke(dayId, STAFF)).ok === true);
check('revoked token is refused', (await record(dayId, TOKEN_B, keyFor(dayId))) === null);
check('revoking again reports no active link', (await revoke(dayId, STAFF)).reason === 'no_active_link');
check('revoke audit event written', (await auditFor(campaign, 'photo_day_photographer_link_revoked')).length === 1);
check('uploaded photo audit events written (2)', (await auditFor(campaign, 'photo_day_photo_uploaded')).length === 2);

// --- Matching -----------------------------------------------------------------
const consented = await seedParticipation(campaign);
const noConsent = await seedParticipation(campaign);
const committed = await seedParticipation(campaign, 'commitment_completed');
await grantConsent(campaign, consented);
await grantConsent(campaign, committed);
const otherCampaign = await seedCampaign('active');
const elsewhere = await seedParticipation(otherCampaign);
await grantConsent(otherCampaign, elsewhere);

check('match refuses non-staff', (await match(photo1, consented, NOT_STAFF)).reason === 'not_staff');
check('match refuses a child without photo_day_photography consent', (await match(photo1, noConsent)).reason === 'no_photo_day_consent');
check('match refuses a participation from another campaign', (await match(photo1, elsewhere)).reason === 'participation_not_in_campaign');
check('match refuses a participation that already committed', (await match(photo1, committed)).reason === 'participation_not_open');
check('match succeeds with consent', (await match(photo1, consented)).ok === true);
check('first match moves the day to matching', (await dayRow(dayId)).status === 'matching');
check('a new link is refused once matching has started (uploads are closed)',
  (await issue(dayId, STAFF, sha('token-c'))).reason === 'photo_day_not_accepting_uploads');

check('unmatch works', (await unmatch(photo1)).ok === true);
check('unmatching an unmatched photo is refused', (await unmatch(photo1)).reason === 'not_matched');

await match(photo1, consented);
await match(photo2, consented);
check('release does nothing while consent stands', (await val(`select public.release_photo_day_photos_for_withdrawn_consent($1)`, [consented])) === 0);
await db.query(`update public.squad_invite_permissions set withdrawn_at = now() where participation_id = $1 and purpose = 'photo_day_photography'`, [consented]);
check('withdrawn consent releases both matches', (await val(`select public.release_photo_day_photos_for_withdrawn_consent($1)`, [consented])) === 2);
check('after withdrawal, matching is refused', (await match(photo1, consented)).reason === 'no_photo_day_consent');

// --- Second campaign: create on approved_setup_required ----------------------
const setupCampaign = await seedCampaign('approved_setup_required');
check('create allowed while the organiser is still setting up delivery', (await create(setupCampaign, STAFF, isoDate(3))).ok === true);

// =============================================================================
// Phase 3 (0106): parent consent and publishing
// =============================================================================
check('0106 applied', files.some((f) => f.startsWith('0106')));
for (const f of ['record_photo_day_consent(uuid, uuid, text, boolean, text, text, integer)', 'publish_photo_day(uuid, uuid)']) {
  for (const role of ['anon', 'authenticated']) {
    check(`${role} cannot execute ${f.split('(')[0]}`, (await val(`select has_function_privilege($1, $2, 'execute')`, [role, `public.${f}`])) === false);
  }
  check(`service_role can execute ${f.split('(')[0]}`, (await val(`select has_function_privilege('service_role', $1, 'execute')`, [`public.${f}`])) === true);
}

const GUARDIAN = '00000000-0000-4000-8000-0000000000c1';
const OTHER_GUARDIAN = '00000000-0000-4000-8000-0000000000c2';
await db.exec(`
  insert into auth.users (id, email) values ('${GUARDIAN}', 'parent@example.test'), ('${OTHER_GUARDIAN}', 'other@example.test');
  insert into public.profiles (id, display_name) values ('${GUARDIAN}', 'Parent'), ('${OTHER_GUARDIAN}', 'Other');
`);
// One participation per guardian per campaign (unique index), so every
// seeded participation gets its own guardian unless one is given.
async function seedOwned(campaignId, guardianOrNull = null, status = 'started') {
  let guardian = guardianOrNull;
  if (!guardian) {
    guardian = randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [guardian, `${guardian}@example.test`]);
    await db.query(`insert into public.profiles (id, display_name) values ($1, 'Parent')`, [guardian]);
  }
  const hash = sha(randomUUID());
  const id = await val(`insert into public.squad_invite_participations(campaign_id, guardian_profile_id, builder_token_hash, status, commitment_completed_at)
    values ($1, $2, $3, $4, case when $4 = 'started' then null else now() end) returning id`, [campaignId, guardian, hash, status]);
  return { id, hash, guardian };
}
const consent = (p, granted, first = 'Sam', initial = 't', number = 7, guardian = p.guardian, hash = p.hash) =>
  val(`select public.record_photo_day_consent($1, $2, $3, $4, $5, $6, $7)`, [p.id, guardian, hash, granted, first, initial, number]);
const participation = (id) => one(`select * from public.squad_invite_participations where id = $1`, [id]);
const permissionRows = async (id) => (await db.query(
  `select granted, withdrawn_at, policy_version from public.squad_invite_permissions where participation_id = $1 and purpose = 'photo_day_photography'`, [id])).rows;

const c3 = await seedCampaign('active', 21);
const p1 = await seedOwned(c3);
check('consent refused when the campaign has no photo day', (await consent(p1, true)).reason === 'no_photo_day');
const day3 = (await create(c3, STAFF, isoDate(5))).photoDayId;

check('consent refused with the wrong builder token', (await consent(p1, true, 'Sam', 't', 7, p1.guardian, sha('nope'))).reason === 'participation_not_found');
check('consent refused for another guardian', (await consent(p1, true, 'Sam', 't', 7, OTHER_GUARDIAN)).reason === 'participation_not_found');
check('consent refuses a non-letter initial', (await consent(p1, true, 'Sam', '1')).reason === 'invalid_child_details');
check('consent refuses a name over 24 characters', (await consent(p1, true, 'A'.repeat(25))).reason === 'invalid_child_details');
check('consent refuses a squad number over 999', (await consent(p1, true, 'Sam', 't', 1000)).reason === 'invalid_child_details');
check('consent refuses an empty name', (await consent(p1, true, '  ')).reason === 'invalid_child_details');
check('grant succeeds', (await consent(p1, true, ' Sam ', 't', 7)).decision === 'granted');
{
  const p = await participation(p1.id);
  check('grant writes first name, upper-case initial and squad number', p.display_first_name === 'Sam' && p.display_surname_initial === 'T' && p.squad_number === 7, p);
  const rows = await permissionRows(p1.id);
  check('grant records one granted, unwithdrawn permission', rows.length === 1 && rows[0].granted === true && rows[0].withdrawn_at === null && rows[0].policy_version === 'squad_invite_photo_day_v1');
}
check('granting again updates rather than duplicates', (await consent(p1, true, 'Samuel', 't', 8)).ok === true && (await permissionRows(p1.id)).length === 1 && (await participation(p1.id)).display_first_name === 'Samuel');
check('grant audit event written twice', (await auditFor(c3, 'photo_day_consent_granted')).length === 2);

const p2 = await seedOwned(c3);
check('declining records a refused permission', (await consent(p2, false, null, null, null)).decision === 'declined');
{
  const rows = await permissionRows(p2.id);
  check('decline row is granted=false and writes no child details', rows.length === 1 && rows[0].granted === false && (await participation(p2.id)).display_first_name === null);
}
check('declining again is a no-op', (await consent(p2, false, null, null, null)).decision === 'declined' && (await auditFor(c3, 'photo_day_consent_declined')).length === 1);

const committedP = await seedOwned(c3, GUARDIAN, 'commitment_completed');
check('consent refused once the card is committed', (await consent(committedP, true)).reason === 'participation_not_open');

// The shoot happens.
await confirm(day3, STAFF, 'Both managers agreed in person');
const TOKEN_D3 = sha('day3-token');
await issue(day3, STAFF, TOKEN_D3, 24);
const d3photo1 = await record(day3, TOKEN_D3, keyFor(day3));
const d3photo2 = await record(day3, TOKEN_D3, keyFor(day3));
const p3 = await seedOwned(c3);
check('granting after the first upload is refused (shoot already taken)', (await consent(p3, true)).reason === 'photo_day_already_taken');
check('declining after the shoot still works', (await consent(p3, false, null, null, null)).decision === 'declined');

const publish = (dayId, staff = STAFF) => val(`select public.publish_photo_day($1, $2)`, [dayId, staff]);
check('publish refused before any match', (await publish(day3)).reason === 'photo_day_not_matching');
check('declined child cannot be matched', (await match(d3photo1, p2.id)).reason === 'no_photo_day_consent');
check('consented child can be matched', (await match(d3photo1, p1.id)).ok === true && (await match(d3photo2, p1.id)).ok === true);
check('publish refuses non-staff', (await publish(day3, NOT_STAFF)).reason === 'not_staff');
check('publish succeeds from matching', (await publish(day3)).ok === true);
{
  const d = await dayRow(day3);
  check('published day has no photographer link left', d.status === 'published' && d.photographer_token_hash === null && d.photographer_token_expires_at === null);
}
check('uploads refused after publishing', (await record(day3, TOKEN_D3, keyFor(day3))) === null);
check('publishing twice is refused', (await publish(day3)).reason === 'photo_day_not_matching');
check('publish audit event written', (await auditFor(c3, 'photo_day_status_changed')).some((r) => r.metadata.to === 'published'));
check('new matches are refused after publishing', (await match(d3photo1, p1.id)).reason === 'photo_day_not_matching');
check('staff can still unmatch after publishing (to correct a mistake)', (await unmatch(d3photo2)).ok === true);
// Put the second match back (test-only status flip) for the withdrawal check.
await db.query(`update public.squad_invite_photo_days set status = 'matching' where id = $1`, [day3]);
await match(d3photo2, p1.id);
await db.query(`update public.squad_invite_photo_days set status = 'published' where id = $1`, [day3]);

const withdrawn = await consent(p1, false, null, null, null);
check('withdrawing releases both matched photos', withdrawn.decision === 'withdrawn' && withdrawn.photosReleased === 2, withdrawn);
{
  const p = await participation(p1.id);
  const rows = await permissionRows(p1.id);
  const matchedLeft = await val(`select count(*)::int from public.squad_invite_photo_day_photos where participation_id = $1`, [p1.id]);
  check('withdrawal clears the child details given for matching', p.display_first_name === null && p.display_surname_initial === null && p.squad_number === null);
  check('withdrawal keeps the consent record, marked withdrawn', rows.length === 1 && rows[0].granted === true && rows[0].withdrawn_at !== null);
  check('no photos remain matched after withdrawal', matchedLeft === 0);
  check('withdraw audit event records how many photos were released', (await auditFor(c3, 'photo_day_consent_withdrawn'))[0]?.metadata?.photosReleased === 2);
}
check('re-granting after the shoot is refused', (await consent(p1, true)).reason === 'photo_day_already_taken');
