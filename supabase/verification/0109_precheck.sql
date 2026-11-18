-- 0109 PRE-CHECK. Read-only: one SELECT in a read-only transaction, one row of
-- booleans and counts. Never returns a person, child, email or any text.
-- Run immediately before 0109_my_season_parent_coach_withdrawal_guard.sql.
--
-- STOP unless every boolean is true, withdrawn_rows_with_content = 0 and
-- active_rows_without_content = 0. Keep the counts: the post-check must match.
begin;
set transaction read only;

with w as (select p.* from pg_proc p where p.oid = to_regprocedure('public.my_season_withdraw_observation(uuid)'))
select
  coalesce((select md5(p.prosrc) = '7db826bc158e12811f5e7a35c7ceafde' from w p), false) as withdraw_is_exact_0108,
  coalesce((select pg_get_function_result(p.oid) = 'void'
              and pg_get_function_identity_arguments(p.oid) = 'p_observation_id uuid'
              and p.prosecdef and p.provolatile = 'v' and p.prokind = 'f'
              and p.proconfig = array['search_path=public, pg_temp']
              and pg_get_userbyid(p.proowner) = 'postgres'
              and (select l.lanname from pg_language l where l.oid = p.prolang) = 'plpgsql' from w p), false) as withdraw_shape_ok,
  coalesce((select (select array_agg(x order by x) from (
           select case when e.grantee = 0 then 'PUBLIC' else pg_get_userbyid(e.grantee)::text end x
             from aclexplode(p.proacl) e where e.privilege_type = 'EXECUTE') g) = array['authenticated', 'postgres'] from w p), false) as withdraw_grants_ok,
  (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_season_add_observation(uuid, text, text, uuid)'::regprocedure) = 'd253c34d11992b0bc49650ebf2f065f9' as add_observation_unchanged,
  (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_season_staff_remove_observation(uuid, text)'::regprocedure) = '127954da28f246459d160b33e4560ffa' as staff_removal_unchanged,
  (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_season_is_guardian(uuid, uuid)'::regprocedure) = 'f04557795463b761bb4811f6205fc358' as guardian_helper_unchanged,
  (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_season_is_team_coach(uuid, uuid)'::regprocedure) = 'c2895948431f21764a71511ecbaab9ad' as coach_helper_unchanged,
  exists (
      select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.conrelid = 'public.guardians'::regclass and c.confrelid = 'public.profiles'::regclass
         and array_length(c.conkey, 1) = 1 and a.attname = 'profile_id' and c.convalidated and not c.condeferrable
         and not exists (select 1 from pg_trigger t where t.tgconstraint = c.oid and t.tgenabled <> 'O')) as guardian_profile_fk_ok,
  pg_get_userbyid((select c.relowner from pg_class c where c.oid = 'public.profiles'::regclass)) = 'postgres' as profiles_owned_by_postgres,
  (select count(*) from public.my_season_coach_observations) as observation_rows,
  (select count(*) from public.my_season_coach_observations where withdrawn_at is null) as active_observation_rows,
  (select count(*) from public.my_season_coach_observations where withdrawn_at is not null) as withdrawn_rows,
  (select count(*) from public.my_season_coach_observations where withdrawn_at is not null and (body is not null or category is not null)) as withdrawn_rows_with_content,
  (select count(*) from public.my_season_coach_observations where withdrawn_at is null and (body is null or category is null)) as active_rows_without_content,
  (select count(*) from public.my_season_focuses) as focus_rows,
  (select count(*) from public.my_season_focuses where ended_at is null) as active_focus_rows,
  (select count(*) from public.my_season_audit_events) as audit_rows,
  (select count(*) from public.my_season_observation_staff_removals) as staff_removal_rows,
  -- Notes this migration stops their author withdrawing.
  (select count(*) from public.my_season_coach_observations o
    where o.withdrawn_at is null and o.author_id is not null
      and exists (select 1 from public.guardians g where g.player_id = o.player_id and g.profile_id = o.author_id)) as active_notes_by_a_guardian_author
;

commit;
