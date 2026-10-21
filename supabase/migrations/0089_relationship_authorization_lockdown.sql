-- Relationship authorization, step 2 of 2: lockdown.
--
-- Closes the paths by which a signed-in account could give itself a role or
-- a relationship, and makes coach access depend on an ACTIVE assignment.
-- Every legitimate write now goes through a trusted server path (claim,
-- recovery, guardian / team / coach invite, staff approval or removal), all
-- of which exist since 0088 and are used by the compatible application.
--
-- 0. Precondition: refuses to run (changing nothing) unless 0088 is fully
--    present AND staff have recorded that the compatible application is
--    deployed and its six smoke checks passed (release readiness for
--    'authorization_relationships_v1'). See the deployment order in
--    supabase/tests/authz/README.md.
-- 1. profiles: a signed-in user may create only their own profile, only
--    with id and display_name (role stays NULL), and may update only their
--    own display_name. The role is set only by ensure_profile_role.
-- 2. coach_team, guardians, clubs, teams: the self-attach, self-link and
--    coach-create policies are dropped and signed-in INSERT/UPDATE/DELETE is
--    revoked. Reads are unchanged (club and team visibility: decision B,
--    deferred).
-- 3. coach_invites: a guardian may insert only player_id, code, created_by
--    (still forced to themselves by RLS) and invited_email; never used_at,
--    used_by, expires_at, id or created_at.
-- 4. Active assignments: every policy and elevated function that grants
--    coach access through coach_team now also requires
--    coach_assignment_is_active(ended_at, expires_at). The direct-link
--    (coach_players) branches are deliberately unchanged: a direct link is
--    an independent relationship (see 0088).
-- 5. is_authorized_coach_for_player / is_guardian_of_team_player: no longer
--    executable by anon (only authenticated, whose RLS policies call them).
-- 6. TRUNCATE, REFERENCES, TRIGGER and MAINTAIN revoked from anon and
--    authenticated on the 27 public tables that had them.
--
-- Not changed: default privileges for future objects (decision C), service
-- role grants, existing relationship rows, any history.
--
-- Rollback: supabase/rollback/0089_rollback.sql. It REOPENS the confirmed
-- vulnerability and refuses to run without an explicit acknowledgement.
begin;

-- ---------------------------------------------------------------------------
-- 0. Precondition (before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  v_problems text[] := '{}';
  v_name text;
  r record;
  v_oid oid;
  v_count int;
  v_ok boolean;
begin
  foreach v_name in array array['public.coach_team_requests', 'public.relationship_audit_events', 'public.release_readiness_confirmations'] loop
    if to_regclass(v_name) is null then v_problems := v_problems || ('missing table ' || v_name); end if;
  end loop;

  for r in select * from (values
      ('coach_team', 'created_at'), ('coach_team', 'created_via'), ('coach_team', 'created_by'), ('coach_team', 'expires_at'),
      ('coach_team', 'ended_at'), ('coach_team', 'ended_by'), ('coach_team', 'end_reason'),
      ('guardians', 'created_at'), ('guardians', 'created_via'), ('guardians', 'created_by')
    ) as v(t, c) loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.t and column_name = r.c) then
      v_problems := v_problems || ('missing column ' || r.t || '.' || r.c);
    end if;
  end loop;

  if to_regclass('public.coach_team_requests_one_pending_per_requester') is null then
    v_problems := v_problems || 'missing index coach_team_requests_one_pending_per_requester'::text;
  end if;

  for r in select * from (values
      ('coach_team', 'relationship_audit'), ('guardians', 'relationship_audit'), ('coach_players', 'relationship_audit'),
      ('coach_team_requests', 'coach_team_requests_transition'),
      ('release_readiness_confirmations', 'release_readiness_append_only'),
      ('release_readiness_confirmations', 'release_readiness_no_truncate')
    ) as v(t, g) loop
    if to_regclass('public.' || r.t) is null or not exists (
      select 1 from pg_trigger tg where tg.tgrelid = ('public.' || r.t)::regclass and tg.tgname = r.g and tg.tgenabled <> 'D'
    ) then
      v_problems := v_problems || ('missing or disabled trigger ' || r.g || ' on ' || r.t);
    end if;
  end loop;

  -- Each function the compatible application (or 0089 itself) relies on:
  -- exact signature, SECURITY DEFINER flag, empty search_path, and who may
  -- execute it.
  for r in select * from (values
      ('public.coach_assignment_is_active(timestamptz,timestamptz)', false, false, true),
      ('public.ensure_profile_role(uuid,text,text)', true, false, true),
      ('public.activate_coach_assignment(uuid,uuid,text,uuid)', true, false, true),
      ('public.approve_coach_team_request(uuid,uuid,uuid,timestamptz,uuid)', true, false, true),
      ('public.reject_coach_team_request(uuid,uuid,text)', true, false, true),
      ('public.cancel_own_coach_team_request(uuid)', true, true, true),
      ('public.end_coach_assignment(uuid,uuid,uuid,text)', true, false, true),
      ('public.remove_direct_coach_link(uuid,uuid,uuid,text)', true, false, true),
      ('public.redeem_coach_invite(text,uuid,text)', true, false, true),
      ('public.confirm_release_readiness(text,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean)', true, false, true),
      ('public.record_relationship_audit_event()', true, false, false)
    ) as v(sig, secdef, auth_exec, service_exec) loop
    v_oid := to_regprocedure(r.sig);
    if v_oid is null then
      v_problems := v_problems || ('missing function ' || r.sig);
    elsif not exists (
      select 1 from pg_proc p
      where p.oid = v_oid
        and p.prosecdef = r.secdef
        and p.proconfig = array['search_path=""']
        and has_function_privilege('anon', p.oid, 'execute') = false
        and has_function_privilege('authenticated', p.oid, 'execute') = r.auth_exec
        and has_function_privilege('service_role', p.oid, 'execute') = r.service_exec
    ) then
      v_problems := v_problems || ('function has unexpected security properties: ' || r.sig);
    end if;
  end loop;

  if cardinality(v_problems) > 0 then
    raise exception '0089 refused: migration 0088 is not fully in place: %', array_to_string(v_problems, '; ');
  end if;

  -- Release readiness: exactly one confirmation for this contract, all six
  -- checks true, a git commit id, and the confirming account still staff.
  select count(*) into v_count from public.release_readiness_confirmations where contract = 'authorization_relationships_v1';
  if v_count <> 1 then
    raise exception '0089 refused: expected exactly one release-readiness confirmation for authorization_relationships_v1, found %', v_count;
  end if;
  select (c.check_card_claim and c.check_guardian_invite and c.check_team_invite
          and c.check_coach_invite and c.check_dual_view and c.check_team_request_flow) is true
    into v_ok from public.release_readiness_confirmations c where c.contract = 'authorization_relationships_v1';
  if not v_ok then
    raise exception '0089 refused: release readiness does not confirm all six smoke checks';
  end if;
  if not exists (select 1 from public.release_readiness_confirmations c
                 where c.contract = 'authorization_relationships_v1' and c.app_commit ~ '^[0-9a-f]{7,40}$') then
    raise exception '0089 refused: release readiness has no valid application commit';
  end if;
  if not exists (select 1 from public.release_readiness_confirmations c
                 join public.staff_accounts s on s.profile_id = c.confirmed_by
                 where c.contract = 'authorization_relationships_v1') then
    raise exception '0089 refused: the account that confirmed release readiness is no longer staff';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.profiles from authenticated;
grant insert (id, display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

alter policy "profiles: insert own row on signup" on public.profiles
  with check ((auth.uid() = id) and (role is null));
alter policy "profiles: update own row" on public.profiles
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

-- ---------------------------------------------------------------------------
-- 2. Relationship, club and team tables: no direct signed-in writes
-- ---------------------------------------------------------------------------
drop policy "coach_team: a coach can attach themselves" on public.coach_team;
drop policy "guardians: a parent can link themselves" on public.guardians;
drop policy "clubs: coaches can create" on public.clubs;
drop policy "teams: coaches can create" on public.teams;

revoke insert, update, delete on public.coach_team, public.guardians, public.clubs, public.teams from authenticated;

-- ---------------------------------------------------------------------------
-- 3. coach_invites: only the columns a guardian legitimately supplies
-- ---------------------------------------------------------------------------
revoke insert on public.coach_invites from authenticated;
grant insert (player_id, code, created_by, invited_email) on public.coach_invites to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Coach access requires an active assignment
-- ---------------------------------------------------------------------------
-- RLS policies run as the querying user, so they need to call the rule.
grant execute on function public.coach_assignment_is_active(timestamptz, timestamptz) to authenticated;

-- A coach sees only their active assignments; a family sees only the
-- active coaches of their player's team. Every coach policy that reads
-- coach_team inherits this, and also checks it explicitly below.
alter policy "coach_team: a coach can see their own assignments" on public.coach_team
  using (((auth.uid() = profile_id) and public.coach_assignment_is_active(ended_at, expires_at)));
alter policy "coach_team: guardians of a player on this team can view" on public.coach_team
  using ((public.is_guardian_of_team_player(team_id) and public.coach_assignment_is_active(ended_at, expires_at)));

alter policy "card_definitions: visible to coaches of the linked player's tea" on public.card_definitions
  using ((EXISTS ( SELECT 1
   FROM ((cards c
     JOIN players p ON ((p.id = c.player_id)))
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((c.card_definition_id = card_definitions.id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

alter policy "cards: visible to coaches of the player's team" on public.cards
  using (((player_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = cards.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at))))));

alter policy "moment_media: follows parent moment's visibility" on public.moment_media
  using ((EXISTS ( SELECT 1
   FROM ((((moments m
     LEFT JOIN guardians g ON (((g.player_id = m.player_id) AND (g.profile_id = auth.uid()))))
     LEFT JOIN players p ON ((p.id = m.player_id)))
     LEFT JOIN coach_team ct ON (((ct.team_id = p.team_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at))))
     LEFT JOIN coach_players cp ON (((cp.player_id = m.player_id) AND (cp.profile_id = auth.uid()))))
  WHERE ((m.id = moment_media.moment_id) AND ((g.profile_id IS NOT NULL) OR (ct.profile_id IS NOT NULL) OR (cp.profile_id IS NOT NULL))))));

alter policy "moments: coaches can create recognitions for their team" on public.moments
  with check (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "moments: coaches can delete their team's pending moments" on public.moments
  using (((verified_at IS NULL) AND ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid())))))));

alter policy "moments: coaches can verify/update for their team" on public.moments
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "moments: visible to assigned coaches" on public.moments
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = moments.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = moments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "player_assessments: coaches can add for their team" on public.player_assessments
  with check (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_assessments.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_assessments.player_id) AND (cp.profile_id = auth.uid())))))));

alter policy "player_assessments: visible to coaches of the player's team" on public.player_assessments
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_assessments.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_assessments.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "player_goals: coaches can create for their team" on public.player_goals
  with check (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_goals.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at))))));

alter policy "player_goals: visible to coaches of the player's team" on public.player_goals
  using ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_goals.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

alter policy "player_invites: coaches can create for their team" on public.player_invites
  with check (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_invites.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at))))));

alter policy "player_invites: coaches can view/create for their team" on public.player_invites
  using ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_invites.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

alter policy "player_season_focus: visible to coaches of the player's team" on public.player_season_focus
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_season_focus.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_season_focus.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "skill snapshots: coaches can write" on public.player_skill_snapshots
  with check ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_skill_snapshots.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

alter policy "skill snapshots: visible to assigned coaches" on public.player_skill_snapshots
  using ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_skill_snapshots.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

alter policy "player_strengths: coaches can add for their team" on public.player_strengths
  with check (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_strengths.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_strengths.player_id) AND (cp.profile_id = auth.uid())))))));

alter policy "player_strengths: visible to coaches of the player's team" on public.player_strengths
  using (((EXISTS ( SELECT 1
   FROM (players p
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((p.id = player_strengths.player_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = player_strengths.player_id) AND (cp.profile_id = auth.uid()))))));

alter policy "players: coaches can add roster players to their team" on public.players
  with check (((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM coach_team ct
  WHERE ((ct.team_id = players.team_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at))))));

alter policy "players: visible to assigned coaches" on public.players
  using ((((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM coach_team ct
  WHERE ((ct.team_id = players.team_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at))))) OR (EXISTS ( SELECT 1
   FROM coach_players cp
  WHERE ((cp.player_id = players.id) AND (cp.profile_id = auth.uid()))))));

alter policy "profiles: coaches can view co-coaches of a shared team" on public.profiles
  using ((EXISTS ( SELECT 1
   FROM (coach_team ct1
     JOIN coach_team ct2 ON ((ct2.team_id = ct1.team_id)))
  WHERE ((ct1.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct1.ended_at, ct1.expires_at) AND (ct2.profile_id = profiles.id) AND public.coach_assignment_is_active(ct2.ended_at, ct2.expires_at)))));

alter policy "profiles: coaches can view guardians of their players" on public.profiles
  using (((EXISTS ( SELECT 1
   FROM ((coach_team ct
     JOIN players p ON ((p.team_id = ct.team_id)))
     JOIN guardians g ON ((g.player_id = p.id)))
  WHERE ((ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at) AND (g.profile_id = profiles.id)))) OR (EXISTS ( SELECT 1
   FROM (coach_players cp
     JOIN guardians g ON ((g.player_id = cp.player_id)))
  WHERE ((cp.profile_id = auth.uid()) AND (g.profile_id = profiles.id))))));

alter policy "profiles: guardians can view coaches of their player's team" on public.profiles
  using ((EXISTS ( SELECT 1
   FROM ((guardians g
     JOIN players p ON ((p.id = g.player_id)))
     JOIN coach_team ct ON ((ct.team_id = p.team_id)))
  WHERE ((g.profile_id = auth.uid()) AND (ct.profile_id = profiles.id) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

alter policy "team_invites: coaches can view their team's invites" on public.team_invites
  using ((EXISTS ( SELECT 1
   FROM coach_team ct
  WHERE ((ct.team_id = team_invites.team_id) AND (ct.profile_id = auth.uid()) AND public.coach_assignment_is_active(ct.ended_at, ct.expires_at)))));

-- Elevated (SECURITY DEFINER, RLS-bypassing) coach checks.
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
        and public.coach_assignment_is_active(ct.ended_at, ct.expires_at)
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
      and public.coach_assignment_is_active(ct.ended_at, ct.expires_at)
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
      and public.coach_assignment_is_active(ct.ended_at, ct.expires_at)
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
      and public.coach_assignment_is_active(ct.ended_at, ct.expires_at)
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

-- ---------------------------------------------------------------------------
-- 5. Relationship helpers: not executable by anon
-- ---------------------------------------------------------------------------
revoke all on function public.is_authorized_coach_for_player(uuid) from public, anon;
grant execute on function public.is_authorized_coach_for_player(uuid) to authenticated;
revoke all on function public.is_guardian_of_team_player(uuid) from public, anon;
grant execute on function public.is_guardian_of_team_player(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. TRUNCATE, REFERENCES, TRIGGER and MAINTAIN from anon and authenticated
-- ---------------------------------------------------------------------------
-- The exact 27 tables that held them at 0088 (named, so the rollback can
-- restore exactly these). TRUNCATE bypasses RLS; none is used by the app.
revoke truncate, references, trigger on table
  public.active_viewers, public.card_definitions, public.cards, public.claim_attempts, public.clubs,
  public.coach_invites, public.coach_players, public.coach_team, public.guardians, public.moment_media,
  public.moment_visibility_changes, public.moments, public.orders, public.player_assessments,
  public.player_deletion_requests, public.player_goals, public.player_invites, public.player_season_focus,
  public.player_skill_snapshots, public.player_strengths, public.players, public.profiles, public.seasons,
  public.staff_accounts, public.story_updates, public.team_invites, public.teams
  from anon, authenticated;

do $$
begin
  -- MAINTAIN exists from PostgreSQL 17 (production's default ACLs include it).
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table
      public.active_viewers, public.card_definitions, public.cards, public.claim_attempts, public.clubs,
      public.coach_invites, public.coach_players, public.coach_team, public.guardians, public.moment_media,
      public.moment_visibility_changes, public.moments, public.orders, public.player_assessments,
      public.player_deletion_requests, public.player_goals, public.player_invites, public.player_season_focus,
      public.player_skill_snapshots, public.player_strengths, public.players, public.profiles, public.seasons,
      public.staff_accounts, public.story_updates, public.team_invites, public.teams
      from anon, authenticated';
  end if;
end;
$$;

commit;
