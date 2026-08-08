-- Coach Player Details — Milestone 2, STAGE 1 of 3 (secure expand): date of
-- birth, assigned football age group, height, preferred foot, all
-- coach-managed. Extends the exact pattern 0021_players_coach_fields.sql
-- established for secondary_position (narrow SECURITY DEFINER writes, no
-- broad coach UPDATE grant) rather than inventing a new one.
--
-- ============================================================================
-- STAGED ROLLOUT — revised twice (see the report for why): the original
-- split had this file add date_of_birth as a purely additive change, with
-- the privilege lockdown deferred to a later "Stage 3" migration — a real
-- window, not a theoretical one, in which date_of_birth existed as an
-- ordinary column while `authenticated` still held Supabase's
-- project-default table-level SELECT/UPDATE/INSERT on `players` (see
-- Part 6 below). "Every row is null until the UI to set one ships" is not
-- an authorization boundary — it only describes today's data, not what a
-- client is permitted to do. Corrected once by folding the grant lockdown
-- into this same migration. Corrected again here: that version claimed
-- `position` was locked down alongside date_of_birth in this same file,
-- which directly contradicted the same file's own note that Stage 0's
-- app instance still needs raw UPDATE on `position` until Stage 2 ships —
-- both statements were in the migration at once. There is exactly one
-- accurate sequence, and it now has five stages, not three:
--
--   STAGE 0 (separate app deploy, no migration, ships BEFORE this file) —
--     compatibility-only application changes against TODAY's schema: every
--     `players.*`/bare `.select()` query becomes an explicit column list of
--     columns that already exist, and players/route.ts stops inserting
--     age/height/preferred_foot (see the report for the exact file list
--     and diffs). The existing raw position UPDATE is UNCHANGED at this
--     stage — Stage 0 does not touch position/route.ts's write path at
--     all, only its bare .select(). This does two things Stage 1 depends
--     on: it proves no live code still needs a broad table-level SELECT
--     grant to function, and it stops the one INSERT call site that used
--     to name age/height/preferred_foot, so this migration's INSERT grant
--     (Part 6) doesn't have to keep them. Confirmed fully rolled out (no
--     old instance left serving traffic) before Stage 1 is ever applied.
--
--   STAGE 1 (this file) — new columns, new constraints (none of which any
--     existing row can violate — see the read-only audit below), the
--     backfill, every new/fixed function (including update_primary_position,
--     Part 5 — created here so Stage 2 can call it, but NOT yet the only
--     effective way to change `position`: see below), AND — in this same
--     migration, not a later one — the table-level REVOKE/GRANT that makes
--     date_of_birth and every coach-owned field unreachable by ordinary
--     client privilege from the instant they exist. There is no version of
--     `players` that has date_of_birth without also having it protected.
--     Two columns are deliberately still grantable here, for two different
--     reasons: `age`/`height` (SELECT only — Stage 0 already stopped
--     writing to them, they carry nothing sensitive, and are dropped
--     outright in Stage 3), and `position` (UPDATE — Stage 0's app
--     instance still calls a raw `.update()` on it, and has not yet
--     switched to update_primary_position; that switch is Stage 2's job).
--     Do not read Part 5's creation of update_primary_position as making
--     it "the only effective path" for position during Stage 1 — it isn't
--     yet, and this file must not claim otherwise. It becomes the only
--     effective path once Stage 2.5 revokes the raw grant.
--
--   STAGE 2 (separate app deploy, not a migration) — src/lib/os-data.ts's
--     new-column queries, the new /api/os/players/[id]/coach-fields route,
--     the frontend, and players/[id]/position/route.ts switching from a
--     raw update to the update_primary_position RPC created in Stage 1.
--     Can only deploy after Stage 1 (it calls functions/reads columns
--     Stage 1 creates). Must be confirmed fully rolled out before Stage
--     2.5 runs — Stage 2.5 is what makes the raw grant Stage 2's own code
--     no longer needs actually stop existing.
--
--   STAGE 2.5 (0038_player_position_permission_lock.sql) — a small,
--     separate migration: revokes `authenticated`'s raw table-level UPDATE
--     on `position` and re-grants exactly the three columns that remain
--     legitimately writable that way. This is the point update_primary_
--     position genuinely becomes the only effective write path for
--     `position` — not Stage 1, and it is deliberately its own migration
--     rather than folded into Stage 1 (would have broken Stage 0) or
--     Stage 3 (a privilege change has no business being coupled to a
--     destructive column drop it has nothing to do with — see that file's
--     own header).
--
--   STAGE 3 (0039_player_legacy_columns_contract.sql, optional, deferred)
--     — drops the now-unused players.age/height once Stage 2 has been
--     stable for a real window, no old app instance remains, and a
--     backup exists. Not part of this release's critical path — see that
--     file's own header for its explicit preconditions.
--
-- SEPARATE, ORTHOGONAL FIX BUNDLED AT STAGE 1 — 0037_service_role_least_
-- privilege.sql is not part of this feature's own expand/lock/contract
-- sequence above; it corrects a pre-existing, unrelated gap (no migration
-- in this repo's history had ever explicitly granted `service_role`
-- anything, found via hosted-staging testing — see the report). It is
-- deployed together with this file at Stage 1 purely for scheduling
-- convenience — both are additive, independent, and safe to apply in the
-- same release window — not because either depends on the other.
-- ============================================================================
--
-- Read-only production audit performed before writing this migration
-- (2026-08-08, service-role SELECT only, no writes): 64 players rows total,
-- ZERO with a non-null `age`, ZERO with a non-null `height`, every single
-- row has `preferred_foot is null`, ZERO with a non-null `secondary_position`.
-- All four are provably unused in production today — no backfill/parsing/
-- preservation is needed for any of them, and the new secondary_position
-- CHECK CONSTRAINT below cannot fail against any existing row. Only
-- football_age_group has real values to derive (from team names — see
-- Part 2).
--
-- ---------------------------------------------------------------------------
-- Part 1 — new coach-managed columns
-- ---------------------------------------------------------------------------
alter table players
  add column date_of_birth date,
  add column football_age_group text,
  add column height_cm int,
  -- "Last updated" for Coach Player Details' own indicator — deliberately
  -- its own column, not players.created_at (a player's creation date) or
  -- a guess derived from some other table. Set only by
  -- update_player_coach_fields, only on a successful write of these five
  -- fields — not a generic row-touched-at column (nothing else on
  -- `players` needs one today), so it can't be misread as "this whole
  -- record was edited" when only, say, the guardian-owned favourite_player
  -- changed.
  add column coach_fields_updated_at timestamptz;

-- Not in the future — a hard logical truth about any date of birth,
-- appropriate at the schema layer (unlike the *plausible age range* check,
-- which is a product judgement call and belongs in update_player_coach_fields
-- below, not baked into the schema).
alter table players
  add constraint players_date_of_birth_not_future
  check (date_of_birth is null or date_of_birth <= current_date);

-- The supported U-age options (matches the approved prototype's
-- AGE_GROUP_OPTIONS exactly — src/app/os/prototype-player-profile/types.ts).
-- Deliberately a fixed list, not free text: this is what "controlled
-- validation matching the supported U-age options" means at the DB layer,
-- enforced regardless of which write path is ever used, not just today's.
alter table players
  add constraint players_football_age_group_valid
  check (football_age_group is null or football_age_group in
    ('U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18'));

-- Matches the prototype's own validated range (CoachDetailView.tsx:
-- MIN_HEIGHT_CM/MAX_HEIGHT_CM) — one source of truth for the bound, quoted
-- in both places rather than picked independently twice.
alter table players
  add constraint players_height_cm_plausible
  check (height_cm is null or height_cm between 80 and 220);

-- Widen preferred_foot's existing check constraint (today: 'Left'/'Right'
-- only) to also allow 'Both' — safe to replace outright rather than
-- migrate-in-place: every existing row has preferred_foot is null
-- (confirmed above), so there are no existing 'Left'/'Right' values that
-- could be affected by dropping and re-adding this constraint.
alter table players drop constraint if exists players_preferred_foot_check;
alter table players
  add constraint players_preferred_foot_check
  check (preferred_foot is null or preferred_foot in ('Left', 'Right', 'Both'));

-- secondary_position gains the same fixed football-position list the
-- approved prototype's picker offers (POSITION_OPTIONS in
-- prototype-player-profile/types.ts), plus the "can't duplicate primary
-- position" rule as a real cross-column constraint — not just a UI
-- affordance that happens to hide the option. Safe to add now: zero rows
-- have a non-null secondary_position in production today (confirmed
-- above), so there is no existing free-text value this could invalidate.
--
-- The collision this constraint can trigger (a guardian's primary-position
-- update landing on a value a coach already set as secondary_position) is
-- resolved atomically by update_primary_position (Part 5) — once the
-- guardian-facing route calls it (Stage 2) it is no longer possible to hit
-- this constraint as a raw, unhandled error through the app. Until Stage
-- 2.5 revokes the raw table-level UPDATE grant on `position` (still held
-- by Stage 0's app instance — see this file's header), a direct REST call
-- that bypasses the app and writes `position` the old way can still hit
-- this constraint raw; that residual path is closed by Stage 2.5, not
-- this file — see that function for the exact atomic behaviour.
alter table players
  add constraint players_secondary_position_valid
  check (secondary_position is null or secondary_position in
    ('GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'));
alter table players
  add constraint players_secondary_position_not_primary
  check (secondary_position is null or secondary_position <> "position");

-- ---------------------------------------------------------------------------
-- Part 2 — one-time football_age_group backfill from team names
-- ---------------------------------------------------------------------------
-- The pre-existing mechanism (extractAgeGroup, src/app/os/playerProfile.ts)
-- regex-matched /U\d{1,2}\b/i against the team's *name* — never a stored
-- field. Reproduced here as a one-time UPDATE, with one deliberate
-- improvement over the original: the original regex's trailing \b fails on
-- a name like "U9s" (no word boundary between the digit and the "s") —
-- this migration's own read-only audit found exactly one such team in
-- production ("U9s", out of 11 total).
--
-- What "U9s" actually receives, precisely: the UPDATE below extracts ONLY
-- the capture group (the digits — regexp_match's return is a 1-indexed
-- array of capture groups, Postgres does not place the whole match at
-- index 0 the way some other regex flavours do), then rebuilds the
-- canonical value as 'U' || digits. For "U9s", group 1 is '9', rebuilt as
-- 'U9' — a value that IS in the twelve-option allow list — so "U9s"
-- backfills successfully to football_age_group = 'U9'. It is NOT left
-- null. The only team actually left null is "Trafford FC" (no digit at
-- all — nothing to extract). Verified empirically against a disposable
-- database seeded with both exact team names — see the report.
--
-- Re-validated against the exact option list before writing — the CHECK
-- CONSTRAINT above would reject anything else regardless, but this makes
-- the intent explicit rather than relying on the constraint to silently
-- fail the whole migration.
update players p
set football_age_group = 'U' || (regexp_match(t.name, 'U(\d{1,2})', 'i'))[1]
from teams t
where p.team_id = t.id
  and p.football_age_group is null
  and ('U' || (regexp_match(t.name, 'U(\d{1,2})', 'i'))[1]) in
    ('U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18');

-- ---------------------------------------------------------------------------
-- Part 3 — get_player_age: the *only* way anyone gets a calculated age
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER (bypasses RLS internally, so it re-implements the
-- authorization itself, first) — visible to exactly who could already see
-- this player's row: a guardian, a team coach, or a directly-connected
-- coach (mirrors "players: visible to guardians" + the 0032-widened
-- "players: visible to assigned coaches", combined, since age is not
-- privacy-sensitive the way the raw date is — anyone who can see the
-- player at all can see their age).
--
-- Deliberately computes age fresh on every call rather than storing it:
-- age changes over calendar time and a generated column's expression must
-- be immutable, so age can never correctly be a generated column (this is
-- the exact reason this is a function instead) — computed here, at request
-- time, the same way the approved prototype's calculateAge() does client-
-- side for its mock data (src/app/os/prototype-player-profile/types.ts).
--
-- Hardening applied uniformly to every SECURITY DEFINER function in this
-- migration:
--   - `set search_path = ''` + every reference schema-qualified
--     (public./auth.) — prevents a search-path/object-shadowing attack.
--   - `auth.uid() is null` is checked explicitly and fails closed, rather
--     than relying on the implicit `x = null` → null → false behaviour a
--     missing/invalid session would otherwise fall through to.
--   - `revoke all ... from public, anon; grant execute ... to
--     authenticated;` — EXECUTE is never reachable by an unauthenticated
--     caller, and PUBLIC (which every new role implicitly inherits from,
--     including future ones) never gets it by default.
--   - the only caller-supplied identity is p_player_id — never a coach id,
--     team id, or role claim — so there is no parameter an attacker could
--     set to impersonate a different coach or team; authorization is
--     always re-derived from auth.uid() alone.
create or replace function public.get_player_age(p_player_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dob date;
  v_authorized boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = auth.uid()
  ) or exists (
    select 1 from public.players p
    join public.coach_team ct on ct.team_id = p.team_id
    where p.id = p_player_id and ct.profile_id = auth.uid()
  ) or exists (
    select 1 from public.coach_players cp
    where cp.player_id = p_player_id and cp.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to view this player';
  end if;

  select date_of_birth into v_dob from public.players where id = p_player_id;
  if v_dob is null then
    return null;
  end if;
  return extract(year from age(current_date, v_dob))::int;
end;
$$;

revoke all on function public.get_player_age(uuid) from public;
revoke all on function public.get_player_age(uuid) from anon;
grant execute on function public.get_player_age(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 4 — get_player_date_of_birth: coach-only, and only ever called
-- explicitly (Coach Player Details opening its edit form) — never bundled
-- into a bulk squad-list fetch.
-- ---------------------------------------------------------------------------
create or replace function public.get_player_date_of_birth(p_player_id uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.players p
    join public.coach_team ct on ct.team_id = p.team_id
    where p.id = p_player_id and ct.profile_id = auth.uid()
  ) or exists (
    select 1 from public.coach_players cp
    where cp.player_id = p_player_id and cp.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to view this player''s date of birth';
  end if;

  return (select date_of_birth from public.players where id = p_player_id);
end;
$$;

revoke all on function public.get_player_date_of_birth(uuid) from public;
revoke all on function public.get_player_date_of_birth(uuid) from anon;
grant execute on function public.get_player_date_of_birth(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 5 — update_player_coach_fields, update_primary_position: the only
-- effective write paths for coach-owned fields and for primary position,
-- from the instant this migration applies (Part 6 revokes the broad grant
-- that would otherwise make that "only" claim false).
-- ---------------------------------------------------------------------------
-- update_player_coach_fields: the one atomic Save action Coach Player
-- Details performs, covering all five coach-owned fields together —
-- matches the approved prototype's single-Save interaction (one action,
-- not five requests). Same construction discipline as
-- update_secondary_position: explicit authorization check first, then
-- validation, then a write that can only ever touch these six columns
-- (five plus coach_fields_updated_at).
create or replace function public.update_player_coach_fields(
  p_player_id uuid,
  p_date_of_birth date,
  p_football_age_group text,
  p_height_cm int,
  p_preferred_foot text,
  p_secondary_position text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_primary_position text;
  v_age int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.players p
    join public.coach_team ct on ct.team_id = p.team_id
    where p.id = p_player_id and ct.profile_id = auth.uid()
  ) or exists (
    select 1 from public.coach_players cp
    where cp.player_id = p_player_id and cp.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to update this player''s details';
  end if;

  -- Mirrors the approved prototype's own client-side validation
  -- (CoachDetailView.tsx) — re-checked here because a Save action must
  -- never trust client-only validation, the same reasoning
  -- update_secondary_position's list check already applies.
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;
  if p_date_of_birth is not null then
    v_age := extract(year from age(current_date, p_date_of_birth))::int;
    if v_age < 3 or v_age > 19 then
      raise exception 'Date of birth results in an implausible age (%)', v_age;
    end if;
  end if;

  if p_football_age_group is not null
     and p_football_age_group not in ('U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18') then
    raise exception 'Unsupported football age group: %', p_football_age_group;
  end if;

  if p_height_cm is not null and (p_height_cm < 80 or p_height_cm > 220) then
    raise exception 'Height must be between 80 and 220cm';
  end if;

  if p_preferred_foot is not null and p_preferred_foot not in ('Left', 'Right', 'Both') then
    raise exception 'Unsupported preferred foot: %', p_preferred_foot;
  end if;

  if p_secondary_position is not null
     and p_secondary_position not in ('GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST') then
    raise exception 'Unsupported secondary position: %', p_secondary_position;
  end if;

  select "position" into v_primary_position from public.players where id = p_player_id;
  if p_secondary_position is not null and p_secondary_position = v_primary_position then
    raise exception 'Secondary position cannot match the primary position';
  end if;

  update public.players
  set
    date_of_birth = p_date_of_birth,
    football_age_group = p_football_age_group,
    height_cm = p_height_cm,
    preferred_foot = p_preferred_foot,
    secondary_position = p_secondary_position,
    coach_fields_updated_at = now()
  where id = p_player_id;
end;
$$;

revoke all on function public.update_player_coach_fields(uuid, date, text, int, text, text) from public;
revoke all on function public.update_player_coach_fields(uuid, date, text, int, text, text) from anon;
grant execute on function public.update_player_coach_fields(uuid, date, text, int, text, text) to authenticated;

-- update_primary_position: a guardian's own change to their player's
-- primary position (the RLS-guardian-owned field — "players: guardians can
-- update their player", 0001_init.sql). Written as a SECURITY DEFINER
-- function, same as the coach-owned functions above, but for a different
-- reason: not to restrict *who* can call it beyond what RLS already would
-- (the guardian check below is the same boundary that policy already
-- enforces), but so a single write can also, atomically, clear a
-- coach-set secondary_position when it would otherwise collide with the
-- new primary position — secondary_position is a coach-owned column a
-- guardian has no ordinary grant on (Part 6), so only a definer-rights
-- function can touch it on the guardian's behalf, and only for this one
-- narrow, self-limiting purpose: it can null secondary_position out, it
-- can never set it to anything.
--
-- Found by this feature's own disposable-database testing: a guardian
-- changing their player's primary position to a value a coach had already
-- set as secondary_position tripped players_secondary_position_not_primary
-- as a raw, unhandled Postgres constraint error via the old two-write
-- (client reads nothing, just PATCHes position) design. Resolved here by
-- making the whole operation one atomic write: if the new primary position
-- equals the current secondary position, secondary_position is cleared in
-- the same statement and the function reports that back (`true`) so the
-- caller can surface "secondary position cleared — it matched your new
-- primary position" instead of a raw error, and the UI can refresh to show
-- secondary position as "Not set". Any other primary-position change
-- leaves secondary_position untouched and returns `false`.
--
-- Created here, in Stage 1, but NOT yet the only effective way to change
-- `position` — Stage 0's already-live app instance still calls a raw
-- `.update()` on it, and Part 6 below deliberately keeps that column
-- grantable through this migration so that instance keeps working. This
-- function becomes the only effective path once Stage 2 (the app deploy
-- that switches players/[id]/position/route.ts to call it) is confirmed
-- live and Stage 2.5 (0038_player_position_permission_lock.sql) then
-- revokes the raw grant — not before. Do not read its existence here as
-- that boundary already being closed.
create or replace function public.update_primary_position(p_player_id uuid, p_position text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_trimmed text;
  v_current_secondary text;
  v_cleared boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to update this player';
  end if;

  v_trimmed := nullif(trim(p_position), '');
  if v_trimmed is null then
    raise exception 'A position is required';
  end if;

  select secondary_position into v_current_secondary from public.players where id = p_player_id;
  v_cleared := v_current_secondary is not null and v_current_secondary = v_trimmed;

  update public.players
  set
    "position" = v_trimmed,
    secondary_position = case when v_cleared then null else secondary_position end
  where id = p_player_id;

  return v_cleared;
end;
$$;

revoke all on function public.update_primary_position(uuid, text) from public;
revoke all on function public.update_primary_position(uuid, text) from anon;
grant execute on function public.update_primary_position(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 5b — fix update_secondary_position's missing direct-coach path
-- ---------------------------------------------------------------------------
-- Found during this migration's own audit: migration 0032 widened nearly
-- every coach-authorization check to also accept a coach_players direct
-- connection (not just coach_team), explicitly so a directly-connected
-- coach has the same football-development permissions a team coach already
-- has. update_secondary_position (0021, predates 0032) was missed — a
-- coach reachable only via a direct connection can view a player, share an
-- assessment, add a strength, but could not set their secondary position.
-- This is a real, pre-existing authorization gap, not something this
-- migration introduces — corrected here (function body only; signature
-- and grants are unchanged) since it's the same function family this
-- migration is already extending, and reported separately from the
-- new-feature work per that reasoning. Also now fails closed on a null
-- auth.uid(), matching the other functions above.
--
-- Also updated: the 60-character free-text check is replaced with the same
-- fixed-list check players_secondary_position_valid now enforces at the
-- column level (Part 1) — this function would otherwise hit that raw
-- constraint with an unfriendly Postgres error for any value outside the
-- fifteen supported codes, instead of the clear message every other
-- validation failure in this migration gives. Safe to tighten: zero
-- production rows have a non-null secondary_position today (confirmed by
-- this migration's own read-only audit), so no existing free-text value is
-- affected.
create or replace function public.update_secondary_position(p_player_id uuid, p_secondary_position text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text;
  v_authorized boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.players p
    join public.coach_team ct on ct.team_id = p.team_id
    where p.id = p_player_id and ct.profile_id = auth.uid()
  ) or exists (
    select 1 from public.coach_players cp
    where cp.player_id = p_player_id and cp.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to update this player''s secondary position';
  end if;

  v_value := nullif(trim(p_secondary_position), '');
  if v_value is not null and v_value not in
    ('GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST') then
    raise exception 'Unsupported secondary position: %', v_value;
  end if;

  update public.players set secondary_position = v_value where id = p_player_id;
end;
$$;
-- Grants unchanged from 0021 — already `authenticated`-only, still correct.

-- ---------------------------------------------------------------------------
-- Part 6 — effective privilege model, locked down in the SAME migration
-- that introduces the columns it protects (this is the fix for the gap
-- described at the top of this file)
-- ---------------------------------------------------------------------------
-- `authenticated`/`anon` hold table-level SELECT/UPDATE/INSERT on every
-- `public` table by default — this is Supabase's own project-provisioning
-- default privilege (`alter default privileges in schema public grant ...`
-- run once at project creation, outside any migration file in this repo),
-- not something any migration here ever granted directly. Confirmed
-- empirically against a disposable database seeded with this project's
-- full migration history (see the report). A column-level REVOKE alone
-- (an earlier, incorrect version of this work) cannot override that
-- broader table-level grant — PostgreSQL privileges are additive. The only
-- effective pattern is table-level REVOKE first, then an explicit
-- column-level GRANT.
--
-- SELECT: date_of_birth is the one column deliberately absent. age/height
-- are deliberately still present — not because anything sensitive lives
-- there (both are provably unused, see the audit above), but because a
-- Stage 0 app instance may still be reading them via its own explicit
-- column list until Stage 2 fully replaces it; they are dropped outright
-- (not un-granted first) in Stage 3, once that's confirmed.
revoke select on players from authenticated, anon;
grant select (
  id, team_id, name, "position", age, height, preferred_foot, height_cm,
  football_age_group, card_nfc_id, photo_key, squad_number, created_at,
  favourite_player, football_ambition, secondary_position,
  coach_fields_updated_at, public_player_id, public_id_enabled,
  public_id_rotated_at
) on players to authenticated;
-- anon gets no grant at all: no anon-facing code path queries `players`
-- directly (the public Share Profile route, src/lib/public-player-
-- profile.ts, uses the service-role client exclusively, which bypasses
-- table/column grants and RLS both).

-- UPDATE: the five coach-owned fields (date_of_birth, football_age_group,
-- height_cm, preferred_foot, secondary_position — plus
-- coach_fields_updated_at) are absent, same as before. "position" is
-- DELIBERATELY STILL PRESENT here — not an oversight, and not the same
-- thing as claiming update_primary_position (Part 5) is already the only
-- effective path (it is not, yet). Stage 0's app instance is still live
-- when this migration runs and still calls a raw `.update()` on
-- `position` (players/[id]/position/route.ts has not yet been switched to
-- the RPC — that is Stage 2's job); revoking this grant here would break
-- that instance immediately, exactly the kind of gap this file's header
-- exists to prevent. The raw grant on `position` is removed in
-- 0038_player_position_permission_lock.sql (Stage 2.5), once Stage 2 is
-- confirmed fully rolled out — see that file for the actual closing of
-- this gap. Re-granted explicitly, alongside `position`, to the three
-- other columns still legitimately written by an ordinary UPDATE (audited
-- against every `.update(...)` call site on `players` in the repo — see
-- the report): photo_key (players/[id]/photo/route.ts), favourite_player
-- and football_ambition (players/[id]/route.ts). team_id is intentionally
-- not in this list even though a service-role path (orders/[id]/approve/
-- route.ts) writes it — that path already uses the service-role client,
-- which this REVOKE does not affect at all.
revoke update on players from authenticated, anon;
grant update (photo_key, "position", favourite_player, football_ambition) on players to authenticated;

-- INSERT: the existing "players: coaches can add roster players to their
-- team" RLS policy (0003_claiming_and_rosters.sql) already restricts *who*
-- can insert a new player row — this restricts *which columns* they set
-- while doing so, to exactly what src/app/api/os/players/route.ts's
-- roster-add flow sends once its Stage 0 fix lands: team_id, name,
-- position, squad_number. preferred_foot is deliberately NOT included —
-- see the report's "preferred_foot" section: a new roster player is
-- created with preferred_foot left null, and it is set afterward, like
-- every other coach-owned field, only through update_player_coach_fields.
-- This is what makes that function the *only effective* write path for
-- preferred_foot, not merely the one the UI happens to use — an INSERT
-- naming it would otherwise have been a second, ungoverned path around the
-- same validation. date_of_birth, football_age_group, height_cm,
-- secondary_position, and coach_fields_updated_at are absent for the same
-- reason they always were.
revoke insert on players from authenticated, anon;
grant insert (team_id, name, "position", squad_number) on players to authenticated;
