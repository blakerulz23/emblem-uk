-- ============================================================================
-- 0109: My Season: a parent-coach cannot withdraw a note about their own child.
--
-- 0108 already stops a coach ADDING a note about their own child (EMS07). Its
-- withdrawal only checked that the caller wrote the note and is a current team
-- coach, so a coach who later became the child's guardian could still erase a
-- note they wrote earlier. This replaces my_season_withdraw_observation only.
--
-- Unchanged: signature, void result, SECURITY DEFINER, search_path, owner and
-- grants (CREATE OR REPLACE keeps them, and section 3 proves it); the review
-- check first; EMS03 for an unknown note or another coach's note; the coach and
-- feature checks; the atomic erase, its audit event and the silent no-op for a
-- note this author already withdrew. Staff removal is not touched.
--
-- New, before anything is erased:
--   1. FOR UPDATE on the caller's own profile row, once the note is known to
--      be theirs. guardians.profile_id references profiles(id), so every new
--      guardian link, whichever code creates it, takes FOR KEY SHARE on that
--      row and conflicts with this lock. The withdrawal and a new guardian link
--      for the same person therefore run one after the other.
--   2. my_season_is_guardian (the same helper Add note uses): a guardian of the
--      child gets EMS07 while the note still has content.
-- This relies on READ COMMITTED, the level PostgREST uses: the check after the
-- lock sees a link committed while the call waited.
--
-- No table, row, policy, trigger or grant changes. Proven in
-- supabase/tests/authz/my_season_0109_test.mjs and, on real PostgreSQL,
-- my_season_0109_concurrency_test.mjs.
-- Rollback: supabase/rollback/0109_rollback.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Preconditions
-- ----------------------------------------------------------------------------
do $$
declare
  v_fn pg_proc%rowtype;
begin
  if to_regprocedure('public.my_season_withdraw_observation(uuid)') is null then
    raise exception '0109 refused: 0108 is not applied (my_season_withdraw_observation is missing)';
  end if;
  select * into v_fn from pg_proc where oid = 'public.my_season_withdraw_observation(uuid)'::regprocedure;
  if position('0109:' in v_fn.prosrc) > 0 then
    raise exception '0109 refused: already applied';
  end if;
  if md5(v_fn.prosrc) <> '7db826bc158e12811f5e7a35c7ceafde' then
    raise exception '0109 refused: my_season_withdraw_observation is not the exact 0108 function';
  end if;
  if to_regprocedure('public.my_season_is_guardian(uuid, uuid)') is null then
    raise exception '0109 refused: my_season_is_guardian is missing';
  end if;
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.conrelid = 'public.guardians'::regclass and c.confrelid = 'public.profiles'::regclass
       and array_length(c.conkey, 1) = 1 and a.attname = 'profile_id' and c.convalidated and not c.condeferrable
       and not exists (select 1 from pg_trigger t where t.tgconstraint = c.oid and t.tgenabled <> 'O')) then
    raise exception '0109 refused: guardians.profile_id must have a validated, immediate, enabled foreign key to profiles';
  end if;
  if pg_get_userbyid((select c.relowner from pg_class c where c.oid = 'public.profiles'::regclass)) <> pg_get_userbyid(v_fn.proowner) then
    raise exception '0109 refused: the function owner must own public.profiles';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. The function
-- ----------------------------------------------------------------------------
create or replace function public.my_season_withdraw_observation(p_observation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_player uuid;
  v_team uuid;
  v_withdrawn uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'EMS01', message = 'my_season_not_signed_in';
  end if;

  -- Review first, so the answer for an account under review never depends
  -- on whether the id exists.
  if public.profile_has_pending_deletion_review(v_uid) then
    raise exception using errcode = 'EMS04', message = 'my_season_account_under_review';
  end if;

  -- Only the caller's own note is ever looked at (and nothing is locked yet):
  -- an unknown id and another coach's note, withdrawn or not, take the same
  -- path to the same EMS03, so withdraw is not an existence oracle.
  select o.player_id into v_player
    from public.my_season_coach_observations o
   where o.id = p_observation_id and o.author_id = v_uid;
  if v_player is null then
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end if;

  -- 0109: lock the caller's own profile row before reading their guardian
  -- status. Every new guardians row takes FOR KEY SHARE on this row through its
  -- profile_id foreign key, which conflicts with FOR UPDATE. A guardian link
  -- still uncommitted makes this wait and is then seen below; one started after
  -- this lock waits until the withdrawal has finished. A deleted profile leaves
  -- no row, so its author gets the same EMS03.
  perform 1 from public.profiles pr where pr.id = v_uid for update;
  if not found then
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end if;

  if not public.my_season_is_team_coach(v_player, v_uid) then
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end if;
  select p.team_id into v_team from public.players p where p.id = v_player;
  if not public.season_feature_enabled_for_team(v_team) then
    raise exception using errcode = 'EMS02', message = 'my_season_not_enabled';
  end if;

  -- 0109: the same guardian rule as Add note, even for the note's own author.
  -- Only a live note is refused: a note this author already withdrew has nothing
  -- left to erase, so a retry stays the silent no-op below.
  if public.my_season_is_guardian(v_player, v_uid)
     and exists (select 1 from public.my_season_coach_observations o
                  where o.id = p_observation_id and o.author_id = v_uid and o.withdrawn_at is null) then
    raise exception using errcode = 'EMS07', message = 'my_season_own_child';
  end if;

  -- One atomic statement. A simultaneous withdrawal waits on the row lock,
  -- re-checks withdrawn_at, matches nothing and adds no audit event.
  begin
    update public.my_season_coach_observations
       set withdrawn_at = now(), withdrawn_by = v_uid, body = null, category = null
     where id = p_observation_id and author_id = v_uid and withdrawn_at is null
    returning id into v_withdrawn;

    if v_withdrawn is null then
      -- Matching nothing is success only if this author withdrew the note. It
      -- may instead have lost its author to an account deletion the update
      -- waited on, with the text still there, or have been removed by staff
      -- (the author cannot withdraw that): never report either as done. Every
      -- other outcome is the same EMS03 as any other denial.
      if exists (select 1 from public.my_season_coach_observations o
                  where o.id = p_observation_id and o.author_id = v_uid and o.withdrawn_at is not null)
         and not exists (select 1 from public.my_season_observation_staff_removals r
                          where r.observation_id = p_observation_id) then
        return; -- already withdrawn: a silent no-op
      end if;
      raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
    end if;

    insert into public.my_season_audit_events (player_id, event, subject_id, actor_profile_id, actor_role)
    values (v_player, 'observation_withdrawn', v_withdrawn, v_uid, 'coach');
  exception when foreign_key_violation then
    -- The child or the caller's profile was deleted after the checks above.
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Prove the security properties and grants survived
-- ----------------------------------------------------------------------------
do $$
declare
  p pg_proc%rowtype;
begin
  select * into p from pg_proc where oid = 'public.my_season_withdraw_observation(uuid)'::regprocedure;
  if not (pg_get_function_result(p.oid) = 'void' and p.prosecdef and p.proconfig = array['search_path=public, pg_temp']
          and pg_get_userbyid(p.proowner) = 'postgres'
          and (select array_agg(x order by x) from (
                 select case when e.grantee = 0 then 'PUBLIC' else pg_get_userbyid(e.grantee)::text end x
                   from aclexplode(p.proacl) e where e.privilege_type = 'EXECUTE') g) = array['authenticated', 'postgres']) then
    raise exception '0109 refused: the function shape or grants changed';
  end if;
end;
$$;

commit;
