-- 0099 + 0108 POST-CHECK (My Season Phase 1). Read-only: one SELECT inside a
-- read-only transaction, one row of booleans and counts. Never returns a
-- person, child, email or any text content. Run in the target project's SQL
-- editor immediately after applying 0099 and 0108.
--
-- PASS only if every boolean column is true and, straight after applying:
--   global_rows = 1, kill_switch_on = true (fail closed),
--   team_states_count = 0, team_states_enabled = 0,
--   focus_rows = observation_rows = audit_rows = 0.
-- Later runs (after a pilot is approved) expect kill_switch_on = false and
-- team_states_enabled = the approved pilot teams only.
-- On any failure: stop, and decide on supabase/rollback/0108_rollback.sql
-- then 0099_rollback.sql with Blake.
-- Proven against fictional data in supabase/tests/authz/migration_0099_0108_test.mjs.
begin;
set transaction read only;

with
  t(name) as (values ('season_feature_global'), ('season_feature_team_states'), ('my_season_focuses'),
                     ('my_season_coach_observations'), ('my_season_audit_events')),
  rpc(sig) as (values ('public.my_season_set_focus(uuid, text, text, text, date, uuid)'),
                      ('public.my_season_add_observation(uuid, text, text, uuid)'),
                      ('public.my_season_withdraw_observation(uuid)'),
                      ('public.my_season_for_player(uuid)'),
                      ('public.my_season_can_read(uuid)')),
  internal(sig) as (values ('public.season_feature_enabled_for_team(uuid)'),
                           ('public.my_season_is_guardian(uuid, uuid)'),
                           ('public.my_season_is_team_coach(uuid, uuid)'),
                           ('public.my_season_trim(text)'))
select
  (select count(*) from t where to_regclass('public.' || name) is not null) = 5 as tables_present,
  (select count(*) from rpc where to_regprocedure(sig) is not null) = 5
    and (select count(*) from internal where to_regprocedure(sig) is not null) = 4 as functions_present,
  (select bool_and(c.relrowsecurity) and count(*) = 5 from pg_class c join t on c.relname = t.name
    where c.relnamespace = 'public'::regnamespace) as rls_enabled,
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'my_season%') = 2
    and (select count(*) from pg_policies where schemaname = 'public' and tablename like 'season_feature%') = 0 as policies_expected,
  (select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
    where c.relnamespace = 'public'::regnamespace and c.relname like 'my_season%' and not tg.tgisinternal) = 7 as triggers_present,
  -- anon: nothing at all.
  not exists (select 1 from t where has_table_privilege('anon', 'public.' || name, 'select,insert,update,delete,truncate,references,trigger')) as anon_no_table_privileges,
  not exists (select 1 from rpc where has_function_privilege('anon', sig, 'execute'))
    and not exists (select 1 from internal where has_function_privilege('anon', sig, 'execute')) as anon_no_execute,
  -- authenticated: SELECT only on the two content tables; nothing on audit or flags.
  has_table_privilege('authenticated', 'public.my_season_focuses', 'select')
    and has_table_privilege('authenticated', 'public.my_season_coach_observations', 'select')
    and not has_table_privilege('authenticated', 'public.my_season_focuses', 'insert,update,delete,truncate,references,trigger')
    and not has_table_privilege('authenticated', 'public.my_season_coach_observations', 'insert,update,delete,truncate,references,trigger') as authenticated_select_only_content,
  not has_table_privilege('authenticated', 'public.my_season_audit_events', 'select,insert,update,delete,truncate,references,trigger')
    and not has_table_privilege('authenticated', 'public.season_feature_global', 'select,insert,update,delete,truncate,references,trigger')
    and not has_table_privilege('authenticated', 'public.season_feature_team_states', 'select,insert,update,delete,truncate,references,trigger') as authenticated_no_audit_or_flags,
  not exists (select 1 from rpc where not has_function_privilege('authenticated', sig, 'execute'))
    and not exists (select 1 from internal where has_function_privilege('authenticated', sig, 'execute')) as authenticated_rpcs_only,
  has_table_privilege('service_role', 'public.my_season_audit_events', 'select')
    and not has_table_privilege('service_role', 'public.my_season_audit_events', 'insert,update,delete,truncate') as service_role_audit_select_only,
  has_table_privilege('service_role', 'public.season_feature_team_states', 'select,insert,update')
    and not has_table_privilege('service_role', 'public.season_feature_team_states', 'delete,truncate') as service_role_flag_tooling,
  -- Flag state.
  (select count(*) from public.season_feature_global) as global_rows,
  coalesce((select kill_switch from public.season_feature_global where id), true) as kill_switch_on,
  (select count(*) from public.season_feature_team_states) as team_states_count,
  (select count(*) from public.season_feature_team_states where state in ('pilot', 'on')) as team_states_enabled,
  -- Data.
  (select count(*) from public.my_season_focuses) as focus_rows,
  (select count(*) from public.my_season_coach_observations) as observation_rows,
  (select count(*) from public.my_season_audit_events) as audit_rows;

commit;
