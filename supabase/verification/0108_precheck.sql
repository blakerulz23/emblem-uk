-- 0099 + 0108 PRE-CHECK (My Season Phase 1). Read-only: one SELECT inside a
-- read-only transaction, one row of booleans and counts. Never returns a
-- person, child, email or any text content. Run in the target project's SQL
-- editor immediately before applying 0099_season_feature_states.sql and
-- 0108_my_season_focus_and_observations.sql.
--
-- STOP (do not apply) unless every boolean column is true. teams_count is
-- context only: applying enables nothing (the global kill switch is seeded
-- TRUE and no team gets a state row).
-- Proven against fictional data in supabase/tests/authz/migration_0099_0108_test.mjs.
begin;
set transaction read only;

select
  -- Neither migration is applied yet.
  to_regclass('public.season_feature_global') is null
    and to_regclass('public.season_feature_team_states') is null
    and to_regprocedure('public.season_feature_enabled_for_team(uuid)') is null as guard_0099_not_applied,
  to_regclass('public.my_season_focuses') is null
    and to_regclass('public.my_season_coach_observations') is null
    and to_regclass('public.my_season_audit_events') is null
    and to_regclass('public.my_season_observation_staff_removals') is null
    and to_regprocedure('public.my_season_for_player(uuid)') is null
    and to_regprocedure('public.my_season_staff_remove_observation(uuid, text)') is null as guard_0108_not_applied,
  -- Prerequisites.
  to_regprocedure('public.coach_assignment_is_active(timestamptz, timestamptz)') is not null
    and to_regprocedure('public.is_authorized_coach_for_player(uuid)') is not null as has_0088_0089_lockdown,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'moments'
          and column_name = 'verifier_account_deleted_at') as has_0097,
  to_regprocedure('public.profile_has_pending_deletion_review(uuid)') is not null as has_0098,
  to_regprocedure('public.erase_player_and_related_data(uuid)') is not null as has_child_erasure,
  to_regclass('public.staff_accounts') is not null as has_staff_accounts,
  -- The legacy Season Focus stays as it is.
  to_regclass('public.player_season_focus') is not null as legacy_season_focus_present,
  (select count(*) from public.teams) as teams_count;

commit;
