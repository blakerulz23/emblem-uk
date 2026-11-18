-- 0099 + 0108 POST-CHECK (My Season Phase 1). Read-only: one SELECT inside a
-- read-only transaction, one row of booleans and counts. Never returns a
-- person, child, email or any text content. Run in the target project's SQL
-- editor immediately after applying 0099 and 0108.
--
-- PASS only if every boolean column is true and, straight after applying:
--   global_rows = 1, kill_switch_on = true (fail closed),
--   team_states_count = 0, team_states_enabled = 0,
--   focus_rows = observation_rows = audit_rows = 0.
-- At ALL times: withdrawn_rows_with_content = 0 and
-- active_rows_without_content = 0 (counts only; no content is ever returned).
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
                           ('public.my_season_trim(text)')),
  trig(sig) as (values ('public.my_season_focuses_before_insert()'), ('public.my_season_focuses_before_update()'),
                       ('public.my_season_observations_before_insert()'), ('public.my_season_observations_before_update()'),
                       ('public.my_season_audit_before_update()'), ('public.my_season_audit_before_delete()'),
                       ('public.my_season_audit_refuse_truncate()')),
  -- Owner-only: nobody but the owner may execute (service_role included).
  owner_only(sig) as (select sig from trig
                      union all values ('public.my_season_is_guardian(uuid, uuid)'), ('public.my_season_is_team_coach(uuid, uuid)'),
                                       ('public.my_season_trim(text)')),
  content_table(name) as (values ('my_season_focuses'), ('my_season_coach_observations')),
  -- Free text and the category: never in planner statistics or an index.
  content_column(tbl, col) as (values ('my_season_coach_observations', 'body'), ('my_season_coach_observations', 'category'),
                                      ('my_season_focuses', 'title'), ('my_season_focuses', 'why_it_matters'),
                                      ('my_season_focuses', 'what_it_looks_like'))
select
  (select count(*) from t where to_regclass('public.' || name) is not null) = 5 as tables_present,
  (select count(*) from rpc where to_regprocedure(sig) is not null) = 5
    and (select count(*) from internal where to_regprocedure(sig) is not null) = 4
    and (select count(*) from trig where to_regprocedure(sig) is not null) = 7 as functions_present,
  (select bool_and(c.relrowsecurity) and count(*) = 5 from pg_class c join t on c.relname = t.name
    where c.relnamespace = 'public'::regnamespace) as rls_enabled,
  -- The two SELECT policies stay as defence in depth (no SELECT grant reaches them today).
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'my_season%') = 2
    and (select count(*) from pg_policies where schemaname = 'public' and tablename like 'season_feature%') = 0 as policies_expected,
  (select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
    where c.relnamespace = 'public'::regnamespace and c.relname like 'my_season%' and not tg.tgisinternal) = 7 as triggers_present,
  -- 'O' = fires in normal operation; a disabled trigger would lift the immutability rules.
  not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
    where c.relnamespace = 'public'::regnamespace and c.relname like 'my_season%' and not tg.tgisinternal
      and tg.tgenabled <> 'O') as triggers_enabled,
  -- Withdrawal erases content; request_id is the idempotency key.
  exists (select 1 from pg_constraint c where c.conrelid = 'public.my_season_coach_observations'::regclass
           and c.conname = 'my_season_coach_observations_content_state' and c.contype = 'c' and c.convalidated) as observation_content_constraint_present,
  -- The definition itself, not just the name: a weakened rule fails here.
  exists (select 1 from pg_constraint c where c.conrelid = 'public.my_season_coach_observations'::regclass
           and c.conname = 'my_season_coach_observations_content_state'
           and regexp_replace(pg_get_constraintdef(c.oid), '\s+', ' ', 'g') = 'CHECK ((((withdrawn_at IS NULL) AND (category IS NOT NULL) AND (category = ANY (ARRAY[''lifted_the_team''::text, ''kept_going''::text, ''tried_something_new''::text, ''helped_someone_belong''::text, ''spoke_up''::text, ''came_back_stronger''::text])) AND (body IS NOT NULL) AND (body = btrim(body)) AND ((char_length(body) >= 20) AND (char_length(body) <= 160))) OR ((withdrawn_at IS NOT NULL) AND (body IS NULL) AND (category IS NULL))))') as observation_content_constraint_definition_ok,
  -- Withdrawn text must not survive in planner statistics or an index.
  (select count(*) from content_column cc join pg_attribute a
      on a.attrelid = ('public.' || cc.tbl)::regclass and a.attname = cc.col and a.attstattarget = 0) = 5 as content_statistics_off,
  not exists (select 1 from pg_stats s join content_column cc on s.tablename = cc.tbl and s.attname = cc.col
               where s.schemaname = 'public') as content_absent_from_pg_stats,
  not exists (select 1 from pg_index i where i.indrelid in ('public.my_season_focuses'::regclass, 'public.my_season_coach_observations'::regclass)
               and pg_get_indexdef(i.indexrelid) ~ '\m(body|category|title|why_it_matters|what_it_looks_like)\M') as content_not_indexed,
  exists (select 1 from pg_constraint c where c.conrelid = 'public.my_season_coach_observations'::regclass
           and c.conname = 'my_season_coach_observations_request_id_key' and c.contype = 'u') as observation_request_id_unique_present,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'my_season_coach_observations'
    and column_name in ('body', 'category') and is_nullable = 'YES') = 2 as observation_content_nullable,
  -- anon: nothing at all.
  not exists (select 1 from t where has_table_privilege('anon', 'public.' || name, 'select,insert,update,delete,truncate,references,trigger')) as anon_no_table_privileges,
  not exists (select 1 from rpc where has_function_privilege('anon', sig, 'execute'))
    and not exists (select 1 from internal where has_function_privilege('anon', sig, 'execute')) as anon_no_execute,
  -- authenticated: no table privilege at all (reads go through my_season_for_player).
  not has_table_privilege('authenticated', 'public.my_season_focuses', 'select,insert,update,delete,truncate,references,trigger')
    and not has_table_privilege('authenticated', 'public.my_season_coach_observations', 'select,insert,update,delete,truncate,references,trigger') as authenticated_no_content_table_privileges,
  -- PUBLIC: no table privilege, and no execute on anything except through the grants above.
  not exists (select 1 from t where has_table_privilege('public', 'public.' || name, 'select,insert,update,delete,truncate,references,trigger')) as public_no_table_privileges,
  not exists (select 1 from rpc where has_function_privilege('public', sig, 'execute'))
    and not exists (select 1 from internal where has_function_privilege('public', sig, 'execute')) as public_no_execute,
  -- Trigger functions and owner-only helpers: not executable by PUBLIC, anon,
  -- authenticated or service_role.
  not exists (select 1 from owner_only o cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) r(role)
              where has_function_privilege(r.role, o.sig, 'execute')) as owner_only_functions_locked,
  not has_table_privilege('authenticated', 'public.my_season_audit_events', 'select,insert,update,delete,truncate,references,trigger')
    and not has_table_privilege('authenticated', 'public.season_feature_global', 'select,insert,update,delete,truncate,references,trigger')
    and not has_table_privilege('authenticated', 'public.season_feature_team_states', 'select,insert,update,delete,truncate,references,trigger') as authenticated_no_audit_or_flags,
  not exists (select 1 from rpc where not has_function_privilege('authenticated', sig, 'execute'))
    and not exists (select 1 from internal where has_function_privilege('authenticated', sig, 'execute')) as authenticated_rpcs_only,
  has_table_privilege('service_role', 'public.my_season_audit_events', 'select')
    and not has_table_privilege('service_role', 'public.my_season_audit_events', 'insert,update,delete,truncate') as service_role_audit_select_only,
  -- SELECT and nothing else, read from the ACL too so MAINTAIN (PostgreSQL 17) is covered on any version.
  (select count(*) from content_table ct
    where has_table_privilege('service_role', 'public.' || ct.name, 'select')
      and not has_table_privilege('service_role', 'public.' || ct.name, 'insert,update,delete,truncate,references,trigger')
      and not has_any_column_privilege('service_role', 'public.' || ct.name, 'insert,update,references')
      and not exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) acl
                       where c.oid = ('public.' || ct.name)::regclass and acl.grantee = 'service_role'::regrole
                         and acl.privilege_type <> 'SELECT')) = 2 as service_role_content_select_only,
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
  (select count(*) from public.my_season_coach_observations where withdrawn_at is not null) as withdrawn_rows,
  (select count(*) from public.my_season_coach_observations
    where withdrawn_at is not null and (body is not null or category is not null)) as withdrawn_rows_with_content,
  (select count(*) from public.my_season_coach_observations
    where withdrawn_at is null and (body is null or category is null)) as active_rows_without_content,
  (select count(*) from public.my_season_audit_events) as audit_rows;

commit;
