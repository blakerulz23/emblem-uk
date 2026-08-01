-- Widens every coach-authorization policy identified in the coach-
-- connection architecture audit so a directly connected coach
-- (coach_players) has exactly the same football-development permissions
-- a team coach (coach_team -> team -> players.team_id) already has.
--
-- Shape: every widened policy keeps its existing team_id/coach_team
-- clause completely unchanged and ORs in one new
-- `exists (select 1 from coach_players cp where cp.player_id = ... and
-- cp.profile_id = auth.uid())` clause. Nothing here removes or weakens
-- the team path, and no policy grants anything beyond the single
-- player_id a coach_players row names — there is no team_id/club_id on
-- coach_players at all, so this can never widen into a roster, a
-- sibling, or club/league administration.
--
-- Two additions beyond the exact policy list in the milestone brief,
-- found during this migration's own audit and included because the
-- capability set is incomplete without them:
--   * "moments: visible to assigned coaches" (SELECT) — a coach who can
--     insert a recognition and update a verification but can never
--     select moments would never see the Verify Queue or a moment they
--     just wrote.
--   * "moments: coaches can delete their team's pending moments"
--     (DELETE, added in 0010_moments_delete_policy.sql) — this is what
--     backs the *reject* half of /api/os/moments/verify's PATCH;
--     widening only the UPDATE (approve) policy would leave a direct
--     coach able to approve but never reject.
--
-- player_season_focus is the one table with no direct INSERT policy at
-- all (see 0023_player_season_focus.sql's own header) — creation goes
-- through create_season_focus, a SECURITY DEFINER function that
-- determines author_role itself. Widening "INSERT" for that table means
-- widening the function's internal coach check, not a policy.
-- ---------------------------------------------------------------------------

-- players: SELECT for coaches
drop policy if exists "players: visible to assigned coaches" on players;
create policy "players: visible to assigned coaches"
  on players for select
  using (
    (
      players.team_id is not null
      and exists (
        select 1 from coach_team ct
        where ct.team_id = players.team_id and ct.profile_id = auth.uid()
      )
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = players.id and cp.profile_id = auth.uid()
    )
  );

-- moments: SELECT for coaches (addition — see header)
drop policy if exists "moments: visible to assigned coaches" on moments;
create policy "moments: visible to assigned coaches"
  on moments for select
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = moments.player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = moments.player_id and cp.profile_id = auth.uid()
    )
  );

-- moments: INSERT for coach recognition
drop policy if exists "moments: coaches can create recognitions for their team" on moments;
create policy "moments: coaches can create recognitions for their team"
  on moments for insert
  with check (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = moments.player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = moments.player_id and cp.profile_id = auth.uid()
    )
  );

-- moments: UPDATE for coach verification (approve)
drop policy if exists "moments: coaches can verify/update for their team" on moments;
create policy "moments: coaches can verify/update for their team"
  on moments for update
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = moments.player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = moments.player_id and cp.profile_id = auth.uid()
    )
  );

-- moments: DELETE for coach verification (reject) (addition — see header)
drop policy if exists "moments: coaches can delete their team's pending moments" on moments;
create policy "moments: coaches can delete their team's pending moments"
  on moments for delete
  using (
    verified_at is null
    and (
      exists (
        select 1 from players p
        join coach_team ct on ct.team_id = p.team_id
        where p.id = moments.player_id and ct.profile_id = auth.uid()
      )
      or exists (
        select 1 from coach_players cp
        where cp.player_id = moments.player_id and cp.profile_id = auth.uid()
      )
    )
  );

-- moment_media: SELECT (addition — this policy duplicates the
-- guardian/coach join inline rather than delegating to moments' own RLS,
-- so widening "moments: visible to assigned coaches" above does not
-- automatically cover it; without this, a coach could see that a moment
-- exists but never its photos/videos).
drop policy if exists "moment_media: follows parent moment's visibility" on moment_media;
create policy "moment_media: follows parent moment's visibility"
  on moment_media for select
  using (
    exists (
      select 1 from moments m
      left join guardians g on g.player_id = m.player_id and g.profile_id = auth.uid()
      left join players p on p.id = m.player_id
      left join coach_team ct on ct.team_id = p.team_id and ct.profile_id = auth.uid()
      left join coach_players cp on cp.player_id = m.player_id and cp.profile_id = auth.uid()
      where m.id = moment_media.moment_id
        and (g.profile_id is not null or ct.profile_id is not null or cp.profile_id is not null)
    )
  );
-- "moment_media: guardians can attach media to their submission" (INSERT)
-- is untouched — there has never been a coach-side INSERT policy for
-- moment_media at all (team or direct), so this is a pre-existing gap
-- unrelated to the team/direct distinction, out of this migration's scope.

-- player_assessments: SELECT
drop policy if exists "player_assessments: visible to coaches of the player's team" on player_assessments;
create policy "player_assessments: visible to coaches of the player's team"
  on player_assessments for select
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = player_assessments.player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = player_assessments.player_id and cp.profile_id = auth.uid()
    )
  );

-- player_assessments: INSERT — created_by = auth.uid() check preserved unchanged
drop policy if exists "player_assessments: coaches can add for their team" on player_assessments;
create policy "player_assessments: coaches can add for their team"
  on player_assessments for insert
  with check (
    created_by = auth.uid()
    and (
      exists (
        select 1 from players p join coach_team ct on ct.team_id = p.team_id
        where p.id = player_assessments.player_id and ct.profile_id = auth.uid()
      )
      or exists (
        select 1 from coach_players cp
        where cp.player_id = player_assessments.player_id and cp.profile_id = auth.uid()
      )
    )
  );

-- player_season_focus: SELECT
drop policy if exists "player_season_focus: visible to coaches of the player's team" on player_season_focus;
create policy "player_season_focus: visible to coaches of the player's team"
  on player_season_focus for select
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = player_season_focus.player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = player_season_focus.player_id and cp.profile_id = auth.uid()
    )
  );

-- player_season_focus: "INSERT" — widen create_season_focus's internal
-- coach check instead of a policy (see header). create or replace
-- preserves the function's existing grants (revoke-all-from-public/anon,
-- execute-to-authenticated from 0023) since the signature is unchanged —
-- no re-grant needed. Every other line is byte-for-byte identical to
-- 0023_player_season_focus.sql's original; only the coach branch's
-- condition gained an `or`.
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
  ) or exists (
    select 1 from public.coach_players cp
    where cp.player_id = p_player_id and cp.profile_id = v_uid
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

-- profiles: attribution visibility — a coach must be able to resolve the
-- display_name of a guardian who authored something (e.g. a Season Focus
-- entry) for a player reached only via a direct connection, the same way
-- 0023 already covers it for team-based coaches.
drop policy if exists "profiles: coaches can view guardians of their players" on profiles;
create policy "profiles: coaches can view guardians of their players"
  on profiles for select
  using (
    exists (
      select 1 from coach_team ct
      join players p on p.team_id = ct.team_id
      join guardians g on g.player_id = p.id
      where ct.profile_id = auth.uid() and g.profile_id = profiles.id
    )
    or exists (
      select 1 from coach_players cp
      join guardians g on g.player_id = cp.player_id
      where cp.profile_id = auth.uid() and g.profile_id = profiles.id
    )
  );
-- "profiles: coaches can view co-coaches of a shared team" (0023) is
-- deliberately NOT touched — there is no "co-coach" concept for a direct
-- connection (no team, so no shared-team peer to resolve), so widening
-- it would have no real case to serve.

-- player_strengths: SELECT
drop policy if exists "player_strengths: visible to coaches of the player's team" on player_strengths;
create policy "player_strengths: visible to coaches of the player's team"
  on player_strengths for select
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = player_strengths.player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = player_strengths.player_id and cp.profile_id = auth.uid()
    )
  );

-- player_strengths: INSERT — created_by = auth.uid() check preserved unchanged
drop policy if exists "player_strengths: coaches can add for their team" on player_strengths;
create policy "player_strengths: coaches can add for their team"
  on player_strengths for insert
  with check (
    created_by = auth.uid()
    and (
      exists (
        select 1 from players p join coach_team ct on ct.team_id = p.team_id
        where p.id = player_strengths.player_id and ct.profile_id = auth.uid()
      )
      or exists (
        select 1 from coach_players cp
        where cp.player_id = player_strengths.player_id and cp.profile_id = auth.uid()
      )
    )
  );
