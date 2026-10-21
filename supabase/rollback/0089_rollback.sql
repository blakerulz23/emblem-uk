-- ============================================================================
-- EMERGENCY ONLY: THIS ROLLBACK REOPENS THE CONFIRMED AUTHORIZATION
-- VULNERABILITY.
-- ============================================================================
-- Reverses 0089_relationship_authorization_lockdown.sql, returning the schema
-- to exactly its 0088 state. Once it runs, any signed-in account can again
-- give itself a role, attach itself as coach of any team, link itself as
-- guardian of any child, create clubs and teams, and ended or expired
-- coaches regain team access. It is never a routine operation. Prefer
-- fixing forward. Use it only if a legitimate flow is broken by 0089 and
-- cannot be fixed quickly, and re-apply 0089 as soon as possible (its
-- release-readiness precondition will still be satisfied).
--
-- It refuses to run, changing nothing, unless the SAME session first sets
-- this exact acknowledgement:
--
--   select set_config('emblem.acknowledge_0089_rollback', 'REOPEN-AUTHORIZATION-VULNERABILITY', false);
--
-- (SQL Editor: put that line above this file's contents in the same run.
-- CLI/psql: run it in the same connection before this file.)
--
-- Data: lossless. 0089 changed only policies, grants and function bodies;
-- this restores them. No row is created, changed or deleted.
begin;

do $$
begin
  if current_setting('emblem.acknowledge_0089_rollback', true) is distinct from 'REOPEN-AUTHORIZATION-VULNERABILITY' then
    raise exception '0089 rollback refused: it reopens the confirmed authorization vulnerability. To proceed deliberately, first run in this same session: select set_config(''emblem.acknowledge_0089_rollback'', ''REOPEN-AUTHORIZATION-VULNERABILITY'', false);';
  end if;
end;
$$;

-- 6 reversed: TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on the same 27 tables.
grant truncate, references, trigger on table
  public.active_viewers, public.card_definitions, public.cards, public.claim_attempts, public.clubs,
  public.coach_invites, public.coach_players, public.coach_team, public.guardians, public.moment_media,
  public.moment_visibility_changes, public.moments, public.orders, public.player_assessments,
  public.player_deletion_requests, public.player_goals, public.player_invites, public.player_season_focus,
  public.player_skill_snapshots, public.player_strengths, public.players, public.profiles, public.seasons,
  public.staff_accounts, public.story_updates, public.team_invites, public.teams
  to anon, authenticated;

do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on table
      public.active_viewers, public.card_definitions, public.cards, public.claim_attempts, public.clubs,
      public.coach_invites, public.coach_players, public.coach_team, public.guardians, public.moment_media,
      public.moment_visibility_changes, public.moments, public.orders, public.player_assessments,
      public.player_deletion_requests, public.player_goals, public.player_invites, public.player_season_focus,
      public.player_skill_snapshots, public.player_strengths, public.players, public.profiles, public.seasons,
      public.staff_accounts, public.story_updates, public.team_invites, public.teams
      to anon, authenticated';
  end if;
end;
$$;

-- 5 reversed: the helpers are executable by PUBLIC again (0088's default).
grant execute on function public.is_authorized_coach_for_player(uuid) to public;
revoke execute on function public.is_authorized_coach_for_player(uuid) from authenticated;
grant execute on function public.is_guardian_of_team_player(uuid) to public;
revoke execute on function public.is_guardian_of_team_player(uuid) from authenticated;

-- 4 reversed: coach access without the active-assignment requirement.
CREATE OR REPLACE FUNCTION public.is_authorized_coach_for_player(check_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    exists (
      select 1 from public.players p
      join public.coach_team ct on ct.team_id = p.team_id
      where p.id = check_player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.coach_players cp
      where cp.player_id = check_player_id and cp.profile_id = auth.uid()
    );
$function$;

CREATE OR REPLACE FUNCTION public.update_player_coach_fields(p_player_id uuid, p_football_age_group text, p_height_cm integer, p_preferred_foot text, p_secondary_position text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_authorized boolean;
  v_primary_position text;
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
    football_age_group = p_football_age_group,
    height_cm = p_height_cm,
    preferred_foot = p_preferred_foot,
    secondary_position = p_secondary_position,
    coach_fields_updated_at = now()
  where id = p_player_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_secondary_position(p_player_id uuid, p_secondary_position text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_season_focus(p_player_id uuid, p_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

alter policy "card_definitions: visible to coaches of the linked player's tea" on public.card_definitions
  using ((EXISTS ( SELECT 1
   FROM ((cards c
     JOIN players p ON ((p.id = c.player_id)))
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((c.card_definition_id = card_definitions.id) AND (ct.profile_id = auth.uid())))));

alter policy "cards: visible to coaches of the player's team" on public.cards
  using (((player_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = cards.player_id) AND (ct.profile_id = auth.uid()))))));

alter policy "moment_media: follows parent moment's visibility" on public.moment_media
  using ((EXISTS ( SELECT 1
   FROM ((((moments m
     LEFT JOIN guardians g ON (((g.player_id = m.player_id) AND (g.profile_id = auth.uid()))))
     LEFT JOIN players p ON ((p.id = m.player_id)))
     LEFT JOIN coach_team ct ON (((ct.team_id = p.team_id) AND (ct.profile_id = auth.uid()))))
     LEFT JOIN coach_players cp ON (((cp.player_id = m.player_id) AND (cp.profile_id = auth.uid()))))
  WHERE ((m.id = moment_media.moment_id) AND ((g.profile_id IS NOT NULL) OR (ct.profile_id IS NOT NULL) OR (cp.profile_id IS NOT NULL))))));

alter policy "moments: coaches can create recognitions for their team" on public.moments
  with check (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "moments: coaches can delete their team's pending moments" on public.moments
  using (((verified_at IS NULL) AND ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid())))))));

alter policy "moments: coaches can verify/update for their team" on public.moments
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "moments: visible to assigned coaches" on public.moments
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "player_assessments: coaches can add for their team" on public.player_assessments
  with check (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_assessments.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_assessments.player_id) AND (cp.profile_id = auth.uid())))))));

alter policy "player_assessments: visible to coaches of the player's team" on public.player_assessments
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_assessments.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_assessments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "player_goals: coaches can create for their team" on public.player_goals
  with check (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_goals.player_id) AND (ct.profile_id = auth.uid()))))));

alter policy "player_goals: visible to coaches of the player's team" on public.player_goals
  using ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_goals.player_id) AND (ct.profile_id = auth.uid())))));

alter policy "player_invites: coaches can create for their team" on public.player_invites
  with check (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_invites.player_id) AND (ct.profile_id = auth.uid()))))));

alter policy "player_invites: coaches can view/create for their team" on public.player_invites
  using ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_invites.player_id) AND (ct.profile_id = auth.uid())))));

alter policy "player_season_focus: visible to coaches of the player's team" on public.player_season_focus
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_season_focus.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_season_focus.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "skill snapshots: coaches can write" on public.player_skill_snapshots
  with check ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_skill_snapshots.player_id) AND (ct.profile_id = auth.uid())))));

alter policy "skill snapshots: visible to assigned coaches" on public.player_skill_snapshots
  using ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_skill_snapshots.player_id) AND (ct.profile_id = auth.uid())))));

alter policy "player_strengths: coaches can add for their team" on public.player_strengths
  with check (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_strengths.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_strengths.player_id) AND (cp.profile_id = auth.uid())))))));

alter policy "player_strengths: visible to coaches of the player's team" on public.player_strengths
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_strengths.player_id) AND (ct.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_strengths.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "players: coaches can add roster players to their team" on public.players
  with check (((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM coach_team ct
  WHERE ((ct.team_id = players.team_id) AND (ct.profile_id = auth.uid()))))));

alter policy "players: visible to assigned coaches" on public.players
  using ((((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM coach_team ct
  WHERE ((ct.team_id = players.team_id) AND (ct.profile_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = players.id) AND (cp.profile_id = auth.uid()))))));

alter policy "profiles: coaches can view co-coaches of a shared team" on public.profiles
  using ((EXISTS ( SELECT 1
   FROM (coach_team ct1
     JOIN coach_team ct2 ON ((ct2.team_id = ct1.team_id)))
  WHERE ((ct1.profile_id = auth.uid()) AND (ct2.profile_id = profiles.id)))));

alter policy "profiles: coaches can view guardians of their players" on public.profiles
  using (((EXISTS ( SELECT 1
   FROM ((coach_team ct
     JOIN players p ON ((p.team_id = ct.team_id)))
     JOIN guardians g ON ((g.player_id = p.id)))
  WHERE ((ct.profile_id = auth.uid()) AND (g.profile_id = profiles.id)))) OR (EXISTS ( SELECT 1
   FROM (coach_players cp
     JOIN guardians g ON ((g.player_id = cp.player_id)))
  WHERE ((cp.profile_id = auth.uid()) AND (g.profile_id = profiles.id))))));

alter policy "profiles: guardians can view coaches of their player's team" on public.profiles
  using ((EXISTS ( SELECT 1
   FROM ((guardians g
     JOIN players p ON ((p.id = g.player_id)))
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((g.profile_id = auth.uid()) AND (ct.profile_id = profiles.id)))));

alter policy "team_invites: coaches can view their team's invites" on public.team_invites
  using ((EXISTS ( SELECT 1
   FROM coach_team ct
  WHERE ((ct.team_id = team_invites.team_id) AND (ct.profile_id = auth.uid())))));

alter policy "coach_team: a coach can see their own assignments" on public.coach_team
  using ((auth.uid() = profile_id));
alter policy "coach_team: guardians of a player on this team can view" on public.coach_team
  using (public.is_guardian_of_team_player(team_id));

revoke execute on function public.coach_assignment_is_active(timestamptz, timestamptz) from authenticated;

-- 3 reversed: coach_invites insert on every column.
revoke insert (player_id, code, created_by, invited_email) on public.coach_invites from authenticated;
grant insert on public.coach_invites to authenticated;

-- 2 reversed: direct writes and the self-attach / self-link / coach-create policies.
grant insert, update, delete on public.coach_team, public.guardians, public.clubs, public.teams to authenticated;

create policy "coach_team: a coach can attach themselves" on public.coach_team
  for insert with check (auth.uid() = profile_id);
create policy "guardians: a parent can link themselves" on public.guardians
  for insert with check (auth.uid() = profile_id);
create policy "clubs: coaches can create" on public.clubs
  for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));
create policy "teams: coaches can create" on public.teams
  for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

-- 1 reversed: profiles writable on every column, as at 0088.
revoke insert (id, display_name), update (display_name) on public.profiles from authenticated;
grant insert, update, delete on public.profiles to authenticated;

alter policy "profiles: insert own row on signup" on public.profiles
  with check ((auth.uid() = id));
-- ALTER POLICY cannot remove a WITH CHECK clause, so this one is recreated.
drop policy "profiles: update own row" on public.profiles;
create policy "profiles: update own row" on public.profiles
  for update using (auth.uid() = id);

commit;
