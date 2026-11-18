-- ============================================================================
-- 0099: Season feature states (My Season Phase 1 flag).
--
-- Where My Season (0108) is switched on. It is enabled for a player only
-- when ALL of these hold:
--   - the app's deploy kill switch (env SEASON_FEATURE_KILL_SWITCH) is not
--     'true' (checked by the app, never stored here);
--   - season_feature_global.kill_switch = false;
--   - the player's team has a season_feature_team_states row whose state is
--     'pilot' or 'on'.
-- Defaults fail closed: the global row is seeded with kill_switch = TRUE and
-- no team has a row (= 'off'). 'demo' is treated as off for real data.
-- Phase 1 has no UI to change any of this; staff change it with SQL, with
-- approval, as service_role or the owner.
--
-- This migration:
--   0. Precondition: refuses, changing nothing, if any 0099 object already
--      exists (re-run) or if the 0088/0089 lockdown objects are missing.
--   1. season_feature_global: singleton (id boolean primary key, always
--      true), seeded with one row, kill_switch = true.
--   2. season_feature_team_states: one row per team (cascade-deleted with
--      the team), state in ('off','demo','pilot','on'), default 'off'.
--      Both tables: RLS enabled with NO policies; every privilege revoked
--      from public, anon and authenticated; service_role holds exactly
--      select, insert and update (staff tooling; no delete, truncate,
--      references, trigger or maintain).
--   3. season_feature_enabled_for_team(team_id) boolean: SECURITY DEFINER,
--      STABLE, search_path pinned; true only for kill_switch = false and a
--      team state of 'pilot' or 'on'. Executable by service_role only; the
--      0108 functions call it as owner.
--
-- Order-independent: creates new objects only and depends on nothing after
-- 0089, so applying it after 0107 (the production order) gives the same
-- catalog as filename order (proven in
-- supabase/tests/authz/migration_0099_0108_test.mjs and
-- my_season_production_order_test.mjs).
-- Rollback: supabase/rollback/0099_rollback.sql (refuses while 0108 exists).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Precondition
-- ----------------------------------------------------------------------------
do $$
declare
  v_problems text[] := '{}';
begin
  if to_regclass('public.season_feature_global') is not null
     or to_regclass('public.season_feature_team_states') is not null
     or to_regprocedure('public.season_feature_enabled_for_team(uuid)') is not null then
    raise exception '0099 refused: a season feature state object already exists (0099 already applied)';
  end if;
  if to_regprocedure('public.coach_assignment_is_active(timestamptz, timestamptz)') is null then
    v_problems := v_problems || 'coach_assignment_is_active (0088) is missing'::text;
  end if;
  if to_regprocedure('public.is_authorized_coach_for_player(uuid)') is null then
    v_problems := v_problems || 'is_authorized_coach_for_player (0089) is missing'::text;
  end if;
  if to_regclass('public.teams') is null or to_regclass('public.profiles') is null then
    v_problems := v_problems || 'teams or profiles is missing'::text;
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0099 refused: the expected 0089 state is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. season_feature_global (singleton)
-- ----------------------------------------------------------------------------
create table public.season_feature_global (
  id boolean primary key default true check (id),
  kill_switch boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.season_feature_global (id, kill_switch) values (true, true);

alter table public.season_feature_global enable row level security;
revoke all on public.season_feature_global from public, anon, authenticated, service_role;
grant select, insert, update on public.season_feature_global to service_role;

comment on table public.season_feature_global is
  'My Season global switch (0099). One row. kill_switch = true (the default) disables My Season everywhere. Staff change it with SQL, with approval.';

-- ----------------------------------------------------------------------------
-- 2. season_feature_team_states
-- ----------------------------------------------------------------------------
create table public.season_feature_team_states (
  team_id uuid primary key references public.teams (id) on delete cascade,
  state text not null default 'off' check (state in ('off', 'demo', 'pilot', 'on')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.season_feature_team_states enable row level security;
revoke all on public.season_feature_team_states from public, anon, authenticated, service_role;
grant select, insert, update on public.season_feature_team_states to service_role;

comment on table public.season_feature_team_states is
  'My Season state per team (0099). No row = off. Only pilot and on enable My Season for real data; demo is off.';

-- ----------------------------------------------------------------------------
-- 3. season_feature_enabled_for_team
-- ----------------------------------------------------------------------------
create function public.season_feature_enabled_for_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_team_id is not null
    and exists (select 1 from public.season_feature_global g where g.id and g.kill_switch = false)
    and exists (select 1 from public.season_feature_team_states s
                where s.team_id = p_team_id and s.state in ('pilot', 'on'));
$$;

alter function public.season_feature_enabled_for_team(uuid) owner to postgres;
revoke all on function public.season_feature_enabled_for_team(uuid) from public, anon, authenticated;
grant execute on function public.season_feature_enabled_for_team(uuid) to service_role;

comment on function public.season_feature_enabled_for_team(uuid) is
  'True only when the global kill switch is off and the team state is pilot or on (0099). Internal: service_role and owner only.';

commit;
