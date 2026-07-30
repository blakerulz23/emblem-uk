-- Coach Player Detail — Milestone 1: Season Focus.
--
-- Shared with attribution: either a guardian or a coach can create an
-- entry, but every row records its own real author + role — never merged
-- into one anonymous value. Not a fit for player_goals (0004_player_photo.sql)
-- — that table's target/current columns are NOT NULL with a `target > 0`
-- check, so a non-numeric focus tag would have to fake a numeric target to
-- fit.
--
-- Creation is NOT exposed via a direct INSERT policy. An earlier version of
-- this migration tried enforcing the 3-active-per-player cap via a
-- self-referencing subquery inside the INSERT policy's WITH CHECK
-- (`select count(*) from player_season_focus where ...`) — confirmed by
-- direct testing (as the real `authenticated` role, not the table owner,
-- which silently bypasses RLS) to throw `42P17: infinite recursion
-- detected in policy`. Evaluating that subquery re-triggers this table's
-- own RLS, which is what recurses. This is a real, unconditional break —
-- not a rare edge case — so every creation now goes through
-- `create_season_focus`, a SECURITY DEFINER function whose internal
-- queries bypass RLS entirely, sidestepping the self-reference. No direct
-- INSERT policy exists for `authenticated` — this function is the sole
-- creation boundary.
--
-- The function also closes the 3-active-cap race condition for real this
-- time: it takes an explicit row lock on the target player
-- (`select ... for update`) before counting active entries, so two
-- concurrent calls for the same player serialize at the lock rather than
-- both reading the same pre-insert count.
--
-- Status changes (completed/archived) stay on the existing creator-only
-- UPDATE policy below (a plain `created_by = auth.uid()` check, with no
-- self-referencing subquery — not subject to the same recursion risk).
create table player_season_focus (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  created_by uuid not null references profiles (id),
  author_role text not null check (author_role in ('guardian', 'coach')),
  label text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table player_season_focus enable row level security;
grant select, update on player_season_focus to authenticated;

create policy "player_season_focus: visible to guardians of the player"
  on player_season_focus for select
  using (exists (
    select 1 from guardians g
    where g.player_id = player_season_focus.player_id and g.profile_id = auth.uid()
  ));

create policy "player_season_focus: visible to coaches of the player's team"
  on player_season_focus for select
  using (exists (
    select 1 from players p
    join coach_team ct on ct.team_id = p.team_id
    where p.id = player_season_focus.player_id and ct.profile_id = auth.uid()
  ));

create policy "player_season_focus: creator can update their own entry"
  on player_season_focus for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create index idx_player_season_focus_player on player_season_focus (player_id);

-- ---------------------------------------------------------------------------
-- create_season_focus — the sole creation path for player_season_focus.
--
-- Determines author_role itself (guardian relationship checked first, then
-- coach_team) rather than accepting it from the caller — the function is
-- the single source of truth for who authored an entry, not user input.
-- Locks the target player row before counting active entries, so the
-- 3-active cap holds under real concurrent calls, not just sequential ones.
-- ---------------------------------------------------------------------------
create or replace function public.create_season_focus(p_player_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
  v_author_role text;
  v_active_count int;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  v_label := nullif(trim(p_label), '');
  if v_label is null then
    raise exception 'A focus label is required';
  end if;
  if length(v_label) > 60 then
    raise exception 'Focus label must be 60 characters or fewer';
  end if;

  if exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = v_uid
  ) then
    v_author_role := 'guardian';
  elsif exists (
    select 1 from public.players p
    join public.coach_team ct on ct.team_id = p.team_id
    where p.id = p_player_id and ct.profile_id = v_uid
  ) then
    v_author_role := 'coach';
  else
    raise exception 'Not authorized to create a Season Focus for this player';
  end if;

  -- Serializes concurrent calls for the same player on this lock, so the
  -- active-count read below can't race with another call's insert.
  perform 1 from public.players where id = p_player_id for update;

  select count(*) into v_active_count
  from public.player_season_focus
  where player_id = p_player_id and status = 'active';

  if v_active_count >= 3 then
    raise exception 'This player already has 3 active Season Focus entries';
  end if;

  insert into public.player_season_focus (player_id, created_by, author_role, label, status)
  values (p_player_id, v_uid, v_author_role, v_label, 'active')
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.create_season_focus(uuid, text) from public;
revoke all on function public.create_season_focus(uuid, text) from anon;
grant execute on function public.create_season_focus(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Author-display support: a Season Focus entry's real author name must be
-- visible to everyone who can see the player, not just guardians.
-- 0004_player_photo.sql already covers guardian-viewing-co-guardian and
-- guardian-viewing-coach; neither covers a coach's own read side (a coach
-- resolving a guardian-authored entry's name, or a co-coach's). These are
-- the missing, symmetric coach-side policies — same join shape, no new
-- pattern. Verified to stay a DAG, not a cycle: these read from
-- coach_team/players/guardians, none of which read back from profiles.
-- ---------------------------------------------------------------------------
create policy "profiles: coaches can view guardians of their players"
  on profiles for select
  using (
    exists (
      select 1 from coach_team ct
      join players p on p.team_id = ct.team_id
      join guardians g on g.player_id = p.id
      where ct.profile_id = auth.uid() and g.profile_id = profiles.id
    )
  );

create policy "profiles: coaches can view co-coaches of a shared team"
  on profiles for select
  using (
    exists (
      select 1 from coach_team ct1
      join coach_team ct2 on ct2.team_id = ct1.team_id
      where ct1.profile_id = auth.uid() and ct2.profile_id = profiles.id
    )
  );
