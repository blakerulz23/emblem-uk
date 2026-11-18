-- ============================================================================
-- 0108: My Season Phase 1: My Focus and coach observations.
--
-- A child's season, private to their family and their team's coaches:
--   - My Focus: one active focus per player (title, why it matters, what it
--     looks like, start date), set by a guardian or an active team coach.
--     Setting a new one ends the old one, which stays as "Earlier focus".
--   - Coach observations ("What your coach noticed"): short notes in one of
--     six fixed categories, written only by an ACTIVE coach of the player's
--     CURRENT team (coach_team, coach_assignment_is_active), never by a
--     direct-link coach and never by a coach about their own child. The
--     author may withdraw a note while still a team coach; it is then
--     hidden from everyone but the author and kept.
--   - An append-only audit of every write.
-- Nothing is public: no visibility column, no anon grant, never read by any
-- public-profile or share code. Nothing is ranked, scored or compared.
-- The legacy Season Focus (player_season_focus, 0023) is untouched.
--
-- Everything is gated by 0099: season_feature_enabled_for_team(players.team_id)
-- (global kill switch off AND team state pilot/on). With the flag off reads
-- return {"enabled": false}, RLS hides every row, and writes refuse (EMS02).
-- Switching a team back off hides its data again without deleting it.
--
-- Sections:
--   0. Precondition: 0099, 0097 (moments.verifier_account_deleted_at) and
--      0098 (profile_has_pending_deletion_review) present; 0108 absent.
--   1. Tables my_season_focuses, my_season_coach_observations,
--      my_season_audit_events (indexes, checks).
--   2. Triggers:
--      - content tables, BEFORE INSERT: a new row never carries the
--        deleted-author marker, nor an end / withdrawal;
--      - content tables, BEFORE UPDATE: when the author column goes from a
--        value to NULL (the ON DELETE SET NULL action when the author's
--        profile is deleted) author_account_deleted_at is stamped now(); any
--        other change is refused except ending a focus (ended_at/ended_by
--        from NULL), withdrawing an observation (withdrawn_at/withdrawn_by
--        from NULL) and the other ON DELETE SET NULL actions (ended_by,
--        withdrawn_by, team_id going to NULL). Applies to every role,
--        including service_role and the owner. A column may go to NULL
--        only once the row it referenced no longer exists, so a direct
--        UPDATE cannot fake a deleted author (stricter than the design's
--        "non-null to null" rule, same result for the FK action).
--      - audit, BEFORE UPDATE: only actor_profile_id going to NULL (FK
--        action, the profile gone); BEFORE DELETE: only when the player row no longer exists
--        (cascade from child erasure); BEFORE TRUNCATE: refused.
--      Verified in PGlite (PostgreSQL 17): the FK SET NULL action fires the
--      BEFORE UPDATE row trigger and the CHECK sees the stamped marker; the
--      cascade DELETE from players runs after the players row is gone, so
--      the audit delete exception sees it missing (my_season_test.mjs).
--   3. Helpers (SECURITY DEFINER, STABLE, search_path pinned):
--      my_season_is_guardian, my_season_is_team_coach (owner only),
--      my_season_can_read (authenticated, needed by the policies).
--   4. RLS + grants: authenticated may SELECT the two content tables
--      through policies (my_season_can_read; withdrawn observations only
--      for their author). No INSERT/UPDATE/DELETE for authenticated: every
--      write goes through the RPCs. Audit: no authenticated grant;
--      service_role SELECT only. anon: nothing. service_role keeps its
--      default privileges on the two content tables (staff tooling); the
--      section 2 triggers still bind it.
--   5. RPCs (authenticated only): my_season_set_focus,
--      my_season_add_observation, my_season_withdraw_observation,
--      my_season_for_player, plus the owner-only my_season_trim. Errors use
--      SQLSTATE EMS01..EMS09 with fixed
--      messages that carry no data:
--        EMS01 my_season_not_signed_in
--        EMS02 my_season_not_enabled
--        EMS03 my_season_not_allowed
--        EMS04 my_season_account_under_review
--        EMS05 my_season_invalid_input
--        EMS06 my_season_request_conflict
--        EMS07 my_season_own_child
--        EMS08 my_season_not_found
--        EMS09 my_season_immutable / my_season_insert_shape /
--              my_season_audit_append_only (the section 2 triggers)
--
-- Deletion (no change to account_deletion_blocking_reason or any 0097/0098
-- function): child erasure (erase_player_and_related_data deletes players)
-- cascades to all three tables. A deleted guardian's or coach's rows stay
-- with the child: the author column becomes NULL by ON DELETE SET NULL and
-- the trigger records author_account_deleted_at ("A former coach" /
-- "A parent" in the app). No email is ever stored here.
--
-- Rollback: supabase/rollback/0108_rollback.sql (DATA LOSS: drops the
-- tables). Checks: supabase/verification/0108_precheck.sql / _postcheck.sql.
-- Proven in supabase/tests/authz/my_season_test.mjs,
-- migration_0099_0108_test.mjs and my_season_production_order_test.mjs.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Precondition
-- ----------------------------------------------------------------------------
do $$
declare
  v_problems text[] := '{}';
begin
  if to_regclass('public.my_season_focuses') is not null
     or to_regclass('public.my_season_coach_observations') is not null
     or to_regclass('public.my_season_audit_events') is not null
     or to_regprocedure('public.my_season_for_player(uuid)') is not null then
    raise exception '0108 refused: a My Season object already exists (0108 already applied)';
  end if;
  if to_regclass('public.season_feature_global') is null
     or to_regclass('public.season_feature_team_states') is null
     or to_regprocedure('public.season_feature_enabled_for_team(uuid)') is null then
    v_problems := v_problems || '0099 (season feature states) is not applied'::text;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'moments' and column_name = 'verifier_account_deleted_at') then
    v_problems := v_problems || '0097 (moments.verifier_account_deleted_at) is not applied'::text;
  end if;
  if to_regprocedure('public.profile_has_pending_deletion_review(uuid)') is null then
    v_problems := v_problems || '0098 (profile_has_pending_deletion_review) is not applied'::text;
  end if;
  if to_regprocedure('public.coach_assignment_is_active(timestamptz, timestamptz)') is null then
    v_problems := v_problems || 'coach_assignment_is_active (0088) is missing'::text;
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0108 refused: the expected state is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table public.my_season_focuses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 60 and title = btrim(title)),
  why_it_matters text not null check (char_length(btrim(why_it_matters)) between 3 and 160),
  what_it_looks_like text not null check (char_length(btrim(what_it_looks_like)) between 3 and 160),
  started_on date not null,
  created_by uuid references public.profiles (id) on delete set null,
  author_role text not null check (author_role in ('guardian', 'coach')),
  author_account_deleted_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint my_season_focuses_author_or_marker check ((created_by is null) = (author_account_deleted_at is not null))
);

create unique index my_season_focuses_one_active on public.my_season_focuses (player_id) where ended_at is null;
create index my_season_focuses_player_created on public.my_season_focuses (player_id, created_at desc);

create table public.my_season_coach_observations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  category text not null check (category in ('lifted_the_team', 'kept_going', 'tried_something_new',
                                             'helped_someone_belong', 'spoke_up', 'came_back_stronger')),
  body text not null check (body = btrim(body) and char_length(body) between 20 and 160),
  author_id uuid references public.profiles (id) on delete set null,
  author_account_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles (id) on delete set null,
  request_id uuid not null unique,
  constraint my_season_coach_observations_author_or_marker check ((author_id is null) = (author_account_deleted_at is not null))
);

create index my_season_coach_observations_player_created on public.my_season_coach_observations (player_id, created_at desc);

create table public.my_season_audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  event text not null check (event in ('focus_set', 'focus_ended', 'observation_added', 'observation_withdrawn')),
  subject_id uuid not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_role text not null check (actor_role in ('guardian', 'coach'))
);

create index my_season_audit_events_player on public.my_season_audit_events (player_id, occurred_at);

comment on table public.my_season_focuses is
  'My Season: a child''s focus (0108). One active per player. Private to guardians and active team coaches; never public.';
comment on table public.my_season_coach_observations is
  'My Season: notes from an active coach of the player''s team (0108). Private; withdrawn notes are kept but shown only to their author.';
comment on table public.my_season_audit_events is
  'My Season append-only audit (0108). Removed only with the player (child erasure).';

-- ----------------------------------------------------------------------------
-- 2. Triggers
-- ----------------------------------------------------------------------------

-- 2a. Focuses: insert shape, then the only allowed updates.
create function public.my_season_focuses_before_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.created_by is null or new.author_account_deleted_at is not null
     or new.ended_at is not null or new.ended_by is not null then
    raise exception using errcode = 'EMS09', message = 'my_season_insert_shape';
  end if;
  return new;
end;
$$;

create function public.my_season_focuses_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A reference may go to NULL only as the ON DELETE SET NULL action, i.e.
  -- once the referenced profile no longer exists. A direct update (any role)
  -- cannot fake a deleted author or a deleted ender.
  if new.created_by is distinct from old.created_by then
    if old.created_by is null or new.created_by is not null
       or exists (select 1 from public.profiles where id = old.created_by) then
      raise exception using errcode = 'EMS09', message = 'my_season_immutable';
    end if;
    -- The author's account was deleted: record it (the marker).
    new.author_account_deleted_at := now();
  elsif new.author_account_deleted_at is distinct from old.author_account_deleted_at then
    raise exception using errcode = 'EMS09', message = 'my_season_immutable';
  end if;

  -- Ending: once, from NULL, recording who ended it.
  if new.ended_at is distinct from old.ended_at and old.ended_at is not null then
    raise exception using errcode = 'EMS09', message = 'my_season_immutable';
  end if;
  if new.ended_by is distinct from old.ended_by then
    if old.ended_at is null and new.ended_at is not null and old.ended_by is null then
      null; -- the end itself
    elsif old.ended_by is not null and new.ended_by is null
          and not exists (select 1 from public.profiles where id = old.ended_by) then
      null; -- ON DELETE SET NULL
    else
      raise exception using errcode = 'EMS09', message = 'my_season_immutable';
    end if;
  end if;

  if new.id is distinct from old.id
     or new.player_id is distinct from old.player_id
     or new.title is distinct from old.title
     or new.why_it_matters is distinct from old.why_it_matters
     or new.what_it_looks_like is distinct from old.what_it_looks_like
     or new.started_on is distinct from old.started_on
     or new.author_role is distinct from old.author_role
     or new.request_id is distinct from old.request_id
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'EMS09', message = 'my_season_immutable';
  end if;
  return new;
end;
$$;

-- 2b. Observations.
create function public.my_season_observations_before_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.author_id is null or new.author_account_deleted_at is not null
     or new.withdrawn_at is not null or new.withdrawn_by is not null then
    raise exception using errcode = 'EMS09', message = 'my_season_insert_shape';
  end if;
  return new;
end;
$$;

create function public.my_season_observations_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.author_id is distinct from old.author_id then
    if old.author_id is null or new.author_id is not null
       or exists (select 1 from public.profiles where id = old.author_id) then
      raise exception using errcode = 'EMS09', message = 'my_season_immutable';
    end if;
    new.author_account_deleted_at := now();
  elsif new.author_account_deleted_at is distinct from old.author_account_deleted_at then
    raise exception using errcode = 'EMS09', message = 'my_season_immutable';
  end if;

  if new.withdrawn_at is distinct from old.withdrawn_at and old.withdrawn_at is not null then
    raise exception using errcode = 'EMS09', message = 'my_season_immutable';
  end if;
  if new.withdrawn_by is distinct from old.withdrawn_by then
    if old.withdrawn_at is null and new.withdrawn_at is not null and old.withdrawn_by is null then
      null; -- the withdrawal itself
    elsif old.withdrawn_by is not null and new.withdrawn_by is null
          and not exists (select 1 from public.profiles where id = old.withdrawn_by) then
      null; -- ON DELETE SET NULL
    else
      raise exception using errcode = 'EMS09', message = 'my_season_immutable';
    end if;
  end if;

  -- team_id (the team at the time): only the ON DELETE SET NULL action.
  if new.team_id is distinct from old.team_id
     and (old.team_id is null or new.team_id is not null
          or exists (select 1 from public.teams where id = old.team_id)) then
    raise exception using errcode = 'EMS09', message = 'my_season_immutable';
  end if;

  if new.id is distinct from old.id
     or new.player_id is distinct from old.player_id
     or new.category is distinct from old.category
     or new.body is distinct from old.body
     or new.request_id is distinct from old.request_id
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'EMS09', message = 'my_season_immutable';
  end if;
  return new;
end;
$$;

-- 2c. Audit: append-only, with the two cascade exceptions.
create function public.my_season_audit_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only the ON DELETE SET NULL action of a deleted actor's profile.
  if old.actor_profile_id is not null and new.actor_profile_id is null
     and not exists (select 1 from public.profiles where id = old.actor_profile_id)
     and new.id = old.id and new.occurred_at = old.occurred_at and new.player_id = old.player_id
     and new.event = old.event and new.subject_id = old.subject_id and new.actor_role = old.actor_role then
    return new;
  end if;
  raise exception using errcode = 'EMS09', message = 'my_season_audit_append_only';
end;
$$;

-- Only the ON DELETE CASCADE from players (child erasure). The update and
-- delete triggers are SECURITY DEFINER so their lookups are never limited by
-- the caller's privileges or RLS.
create function public.my_season_audit_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.players where id = old.player_id) then
    raise exception using errcode = 'EMS09', message = 'my_season_audit_append_only';
  end if;
  return old;
end;
$$;

create function public.my_season_audit_refuse_truncate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = 'EMS09', message = 'my_season_audit_append_only';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'my_season_focuses_before_insert()', 'my_season_focuses_before_update()',
    'my_season_observations_before_insert()', 'my_season_observations_before_update()',
    'my_season_audit_before_update()', 'my_season_audit_before_delete()', 'my_season_audit_refuse_truncate()'] loop
    execute format('alter function public.%s owner to postgres', f);
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', f);
  end loop;
end;
$$;

create trigger my_season_focuses_before_insert
  before insert on public.my_season_focuses
  for each row execute function public.my_season_focuses_before_insert();
create trigger my_season_focuses_before_update
  before update on public.my_season_focuses
  for each row execute function public.my_season_focuses_before_update();
create trigger my_season_observations_before_insert
  before insert on public.my_season_coach_observations
  for each row execute function public.my_season_observations_before_insert();
create trigger my_season_observations_before_update
  before update on public.my_season_coach_observations
  for each row execute function public.my_season_observations_before_update();
create trigger my_season_audit_before_update
  before update on public.my_season_audit_events
  for each row execute function public.my_season_audit_before_update();
create trigger my_season_audit_before_delete
  before delete on public.my_season_audit_events
  for each row execute function public.my_season_audit_before_delete();
create trigger my_season_audit_refuse_truncate
  before truncate on public.my_season_audit_events
  for each statement execute function public.my_season_audit_refuse_truncate();

-- ----------------------------------------------------------------------------
-- 3. Helpers (before the policies that use them)
-- ----------------------------------------------------------------------------
create function public.my_season_is_guardian(p_player uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_player is not null and p_profile is not null
    and exists (select 1 from public.guardians g where g.player_id = p_player and g.profile_id = p_profile);
$$;

-- An ACTIVE coach_team row on the player's CURRENT team. Direct links
-- (coach_players) never count.
create function public.my_season_is_team_coach(p_player uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_player is not null and p_profile is not null
    and exists (select 1 from public.players p
                join public.coach_team ct on ct.team_id = p.team_id
                where p.id = p_player and p.team_id is not null and ct.profile_id = p_profile
                  and public.coach_assignment_is_active(ct.ended_at, ct.expires_at));
$$;

create function public.my_season_can_read(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.season_feature_enabled_for_team((select p.team_id from public.players p where p.id = p_player))
    and (public.my_season_is_guardian(p_player, auth.uid()) or public.my_season_is_team_coach(p_player, auth.uid()))
    and not public.profile_has_pending_deletion_review(auth.uid());
$$;

alter function public.my_season_is_guardian(uuid, uuid) owner to postgres;
alter function public.my_season_is_team_coach(uuid, uuid) owner to postgres;
alter function public.my_season_can_read(uuid) owner to postgres;
revoke all on function public.my_season_is_guardian(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.my_season_is_team_coach(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.my_season_can_read(uuid) from public, anon, service_role;
grant execute on function public.my_season_can_read(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. RLS and grants
-- ----------------------------------------------------------------------------
alter table public.my_season_focuses enable row level security;
alter table public.my_season_coach_observations enable row level security;
alter table public.my_season_audit_events enable row level security;

revoke all on public.my_season_focuses from public, anon, authenticated;
revoke all on public.my_season_coach_observations from public, anon, authenticated;
revoke all on public.my_season_audit_events from public, anon, authenticated, service_role;
grant select on public.my_season_focuses to authenticated;
grant select on public.my_season_coach_observations to authenticated;
grant select on public.my_season_audit_events to service_role;

create policy "my_season_focuses: guardians and active team coaches read"
  on public.my_season_focuses for select to authenticated
  using (public.my_season_can_read(player_id));

create policy "my_season_coach_observations: guardians and active team coaches read; withdrawn only by author"
  on public.my_season_coach_observations for select to authenticated
  using (public.my_season_can_read(player_id) and (withdrawn_at is null or author_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. RPCs
-- ----------------------------------------------------------------------------

-- Whitespace trim matching JavaScript String.prototype.trim for the
-- characters a form can send.
create function public.my_season_trim(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(p, '^[\s ﻿]+|[\s ﻿]+$', '', 'g');
$$;
alter function public.my_season_trim(text) owner to postgres;
revoke all on function public.my_season_trim(text) from public, anon, authenticated, service_role;

-- 5a. Set (replace) the focus.
create function public.my_season_set_focus(
  p_player_id uuid,
  p_title text,
  p_why text,
  p_looks_like text,
  p_started_on date,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_found boolean;
  v_is_guardian boolean;
  v_role text;
  v_existing record;
  v_title text := public.my_season_trim(p_title);
  v_why text := public.my_season_trim(p_why);
  v_looks text := public.my_season_trim(p_looks_like);
  v_old uuid;
  v_new uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'EMS01', message = 'my_season_not_signed_in';
  end if;
  if public.profile_has_pending_deletion_review(v_uid) then
    raise exception using errcode = 'EMS04', message = 'my_season_account_under_review';
  end if;

  select true, p.team_id into v_found, v_team from public.players p where p.id = p_player_id;
  v_is_guardian := public.my_season_is_guardian(p_player_id, v_uid);
  if v_found is null or not (v_is_guardian or public.my_season_is_team_coach(p_player_id, v_uid)) then
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end if;
  if not public.season_feature_enabled_for_team(v_team) then
    raise exception using errcode = 'EMS02', message = 'my_season_not_enabled';
  end if;
  v_role := case when v_is_guardian then 'guardian' else 'coach' end;

  if p_request_id is null then
    raise exception using errcode = 'EMS05', message = 'my_season_invalid_input';
  end if;

  -- One writer per player at a time.
  perform pg_advisory_xact_lock(hashtext('my_season_focus:' || p_player_id::text));

  select f.id, f.player_id, f.created_by into v_existing from public.my_season_focuses f where f.request_id = p_request_id;
  if v_existing.id is not null then
    if v_existing.player_id = p_player_id and v_existing.created_by = v_uid then
      return v_existing.id;
    end if;
    raise exception using errcode = 'EMS06', message = 'my_season_request_conflict';
  end if;

  if v_title is null or char_length(v_title) not between 3 and 60
     or v_why is null or char_length(v_why) not between 3 and 160
     or v_looks is null or char_length(v_looks) not between 3 and 160
     or p_started_on is null or p_started_on > current_date + 1 or p_started_on < date '2000-01-01' then
    raise exception using errcode = 'EMS05', message = 'my_season_invalid_input';
  end if;

  update public.my_season_focuses set ended_at = now(), ended_by = v_uid
   where player_id = p_player_id and ended_at is null
  returning id into v_old;
  if v_old is not null then
    insert into public.my_season_audit_events (player_id, event, subject_id, actor_profile_id, actor_role)
    values (p_player_id, 'focus_ended', v_old, v_uid, v_role);
  end if;

  begin
    insert into public.my_season_focuses (player_id, title, why_it_matters, what_it_looks_like, started_on, created_by, author_role, request_id)
    values (p_player_id, v_title, v_why, v_looks, p_started_on, v_uid, v_role, p_request_id)
    returning id into v_new;
  exception when unique_violation then
    -- The same request_id used concurrently for another player.
    raise exception using errcode = 'EMS06', message = 'my_season_request_conflict';
  end;

  insert into public.my_season_audit_events (player_id, event, subject_id, actor_profile_id, actor_role)
  values (p_player_id, 'focus_set', v_new, v_uid, v_role);
  return v_new;
end;
$$;

-- 5b. Add a coach observation.
create function public.my_season_add_observation(
  p_player_id uuid,
  p_category text,
  p_body text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_found boolean;
  v_existing record;
  v_body text := public.my_season_trim(p_body);
  v_new uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'EMS01', message = 'my_season_not_signed_in';
  end if;
  if public.profile_has_pending_deletion_review(v_uid) then
    raise exception using errcode = 'EMS04', message = 'my_season_account_under_review';
  end if;

  select true, p.team_id into v_found, v_team from public.players p where p.id = p_player_id;
  if v_found is null or not public.my_season_is_team_coach(p_player_id, v_uid) then
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end if;
  if public.my_season_is_guardian(p_player_id, v_uid) then
    raise exception using errcode = 'EMS07', message = 'my_season_own_child';
  end if;
  if not public.season_feature_enabled_for_team(v_team) then
    raise exception using errcode = 'EMS02', message = 'my_season_not_enabled';
  end if;

  if p_request_id is null then
    raise exception using errcode = 'EMS05', message = 'my_season_invalid_input';
  end if;

  perform pg_advisory_xact_lock(hashtext('my_season_observation:' || p_request_id::text));

  select o.id, o.player_id, o.author_id into v_existing from public.my_season_coach_observations o where o.request_id = p_request_id;
  if v_existing.id is not null then
    if v_existing.player_id = p_player_id and v_existing.author_id = v_uid then
      return v_existing.id;
    end if;
    raise exception using errcode = 'EMS06', message = 'my_season_request_conflict';
  end if;

  if p_category is null
     or p_category not in ('lifted_the_team', 'kept_going', 'tried_something_new', 'helped_someone_belong', 'spoke_up', 'came_back_stronger')
     or v_body is null or char_length(v_body) not between 20 and 160
     or (select count(*) from regexp_matches(v_body, '[.!?]+(\s|$)', 'g')) > 2 then
    raise exception using errcode = 'EMS05', message = 'my_season_invalid_input';
  end if;

  insert into public.my_season_coach_observations (player_id, team_id, category, body, author_id, request_id)
  values (p_player_id, v_team, p_category, v_body, v_uid, p_request_id)
  returning id into v_new;

  insert into public.my_season_audit_events (player_id, event, subject_id, actor_profile_id, actor_role)
  values (p_player_id, 'observation_added', v_new, v_uid, 'coach');
  return v_new;
end;
$$;

-- 5c. Withdraw one's own observation (idempotent).
create function public.my_season_withdraw_observation(p_observation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_obs record;
  v_team uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'EMS01', message = 'my_season_not_signed_in';
  end if;

  select o.id, o.player_id, o.author_id, o.withdrawn_at into v_obs
    from public.my_season_coach_observations o where o.id = p_observation_id for update;
  if v_obs.id is null then
    raise exception using errcode = 'EMS08', message = 'my_season_not_found';
  end if;
  if public.profile_has_pending_deletion_review(v_uid) then
    raise exception using errcode = 'EMS04', message = 'my_season_account_under_review';
  end if;
  if v_obs.author_id is distinct from v_uid or not public.my_season_is_team_coach(v_obs.player_id, v_uid) then
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end if;
  select p.team_id into v_team from public.players p where p.id = v_obs.player_id;
  if not public.season_feature_enabled_for_team(v_team) then
    raise exception using errcode = 'EMS02', message = 'my_season_not_enabled';
  end if;

  if v_obs.withdrawn_at is not null then
    return;
  end if;

  update public.my_season_coach_observations set withdrawn_at = now(), withdrawn_by = v_uid where id = v_obs.id;
  insert into public.my_season_audit_events (player_id, event, subject_id, actor_profile_id, actor_role)
  values (v_obs.player_id, 'observation_withdrawn', v_obs.id, v_uid, 'coach');
end;
$$;

-- 5d. The one read the app needs.
create function public.my_season_for_player(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_found boolean;
  v_guardian boolean;
  v_team_coach boolean;
  v_former boolean;
  v_direct boolean;
  v_active jsonb;
  v_earlier jsonb;
  v_obs jsonb;
begin
  if v_uid is null then
    raise exception using errcode = 'EMS01', message = 'my_season_not_signed_in';
  end if;

  select true, p.team_id into v_found, v_team from public.players p where p.id = p_player_id;
  if v_found is null or not public.season_feature_enabled_for_team(v_team) then
    return jsonb_build_object('enabled', false);
  end if;

  v_guardian := public.my_season_is_guardian(p_player_id, v_uid);
  v_team_coach := public.my_season_is_team_coach(p_player_id, v_uid);
  v_former := exists (select 1 from public.coach_team ct
                      where ct.team_id = v_team and ct.profile_id = v_uid
                        and not public.coach_assignment_is_active(ct.ended_at, ct.expires_at));
  v_direct := exists (select 1 from public.coach_players cp where cp.player_id = p_player_id and cp.profile_id = v_uid);

  if not (v_guardian or v_team_coach or v_former or v_direct) then
    return jsonb_build_object('enabled', false);
  end if;
  if public.profile_has_pending_deletion_review(v_uid) then
    return jsonb_build_object('enabled', true, 'access', 'none', 'reason', 'account_review');
  end if;
  if not (v_guardian or v_team_coach) then
    return jsonb_build_object('enabled', true, 'access', 'none',
                              'reason', case when v_former then 'former_coach' else 'private_coach' end);
  end if;

  select jsonb_build_object('id', f.id, 'title', f.title, 'whyItMatters', f.why_it_matters,
           'whatItLooksLike', f.what_it_looks_like, 'startedOn', f.started_on, 'endedAt', f.ended_at,
           'authorRole', f.author_role, 'authorName', pr.display_name)
    into v_active
    from public.my_season_focuses f left join public.profiles pr on pr.id = f.created_by
   where f.player_id = p_player_id and f.ended_at is null;

  select coalesce(jsonb_agg(x.j order by x.ended_at desc, x.created_at desc), '[]'::jsonb) into v_earlier
    from (select f.ended_at, f.created_at,
                 jsonb_build_object('id', f.id, 'title', f.title, 'whyItMatters', f.why_it_matters,
                   'whatItLooksLike', f.what_it_looks_like, 'startedOn', f.started_on, 'endedAt', f.ended_at,
                   'authorRole', f.author_role, 'authorName', pr.display_name) as j
            from public.my_season_focuses f left join public.profiles pr on pr.id = f.created_by
           where f.player_id = p_player_id and f.ended_at is not null
           order by f.ended_at desc, f.created_at desc
           limit 10) x;

  -- formerCoach: the author's account was deleted, or they are no longer an
  -- active coach of the player's current team.
  select coalesce(jsonb_agg(x.j order by x.created_at desc, x.id desc), '[]'::jsonb) into v_obs
    from (select o.created_at, o.id,
                 jsonb_build_object('id', o.id, 'category', o.category, 'body', o.body, 'createdAt', o.created_at,
                   'coachName', case when o.author_id is null then null else pr.display_name end,
                   'formerCoach', (o.author_id is null or not public.my_season_is_team_coach(p_player_id, o.author_id)),
                   'mine', coalesce(o.author_id = v_uid, false),
                   'withdrawn', o.withdrawn_at is not null) as j
            from public.my_season_coach_observations o left join public.profiles pr on pr.id = o.author_id
           where o.player_id = p_player_id and (o.withdrawn_at is null or o.author_id = v_uid)
           order by o.created_at desc, o.id desc
           limit 50) x;

  return jsonb_build_object(
    'enabled', true,
    'access', case when v_guardian then 'guardian' else 'coach' end,
    'canEditFocus', true,
    'canAddNote', v_team_coach and not v_guardian,
    'activeFocus', v_active,
    'earlierFocuses', v_earlier,
    'observations', v_obs);
end;
$$;

alter function public.my_season_set_focus(uuid, text, text, text, date, uuid) owner to postgres;
alter function public.my_season_add_observation(uuid, text, text, uuid) owner to postgres;
alter function public.my_season_withdraw_observation(uuid) owner to postgres;
alter function public.my_season_for_player(uuid) owner to postgres;
revoke all on function public.my_season_set_focus(uuid, text, text, text, date, uuid) from public, anon, service_role;
revoke all on function public.my_season_add_observation(uuid, text, text, uuid) from public, anon, service_role;
revoke all on function public.my_season_withdraw_observation(uuid) from public, anon, service_role;
revoke all on function public.my_season_for_player(uuid) from public, anon, service_role;
grant execute on function public.my_season_set_focus(uuid, text, text, text, date, uuid) to authenticated;
grant execute on function public.my_season_add_observation(uuid, text, text, uuid) to authenticated;
grant execute on function public.my_season_withdraw_observation(uuid) to authenticated;
grant execute on function public.my_season_for_player(uuid) to authenticated;

commit;
