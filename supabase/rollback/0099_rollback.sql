-- ============================================================================
-- Rollback for 0099_season_feature_states.sql.
-- ============================================================================
-- Drops season_feature_enabled_for_team and the two flag tables
-- (season_feature_global, season_feature_team_states). Every team's state
-- and the global kill switch are lost; with them gone My Season cannot be
-- enabled anywhere. The result is the exact pre-0099 catalog (proven in
-- supabase/tests/authz/migration_0099_0108_test.mjs).
--
-- It refuses, changing nothing, unless:
--   - 0099 is applied;
--   - 0108 is NOT applied (its functions call season_feature_enabled_for_team;
--     roll back 0108 first with 0108_rollback.sql);
--   - the SAME TRANSACTION first sets this exact acknowledgement,
--     transaction-local:
--
--   begin;
--   select set_config('emblem.acknowledge_0099_rollback', 'drop season feature states', true);
--   -- then this file, in the same transaction
--
-- The file clears the acknowledgement before committing.
-- ============================================================================

begin;

do $$
begin
  if current_setting('emblem.acknowledge_0099_rollback', true) is distinct from 'drop season feature states' then
    raise exception '0099 rollback refused: it drops every team''s season feature state. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0099_rollback'', ''drop season feature states'', true);';
  end if;
  if to_regclass('public.my_season_focuses') is not null
     or to_regclass('public.my_season_coach_observations') is not null
     or to_regclass('public.my_season_audit_events') is not null
     or to_regprocedure('public.my_season_for_player(uuid)') is not null
     or to_regprocedure('public.my_season_can_read(uuid)') is not null then
    raise exception '0099 rollback refused: 0108 (My Season) is still applied; roll back 0108 first';
  end if;
  if to_regclass('public.season_feature_global') is null
     or to_regclass('public.season_feature_team_states') is null
     or to_regprocedure('public.season_feature_enabled_for_team(uuid)') is null then
    raise exception '0099 rollback refused: 0099 is not (fully) applied';
  end if;
end;
$$;

drop function public.season_feature_enabled_for_team(uuid);
drop table public.season_feature_team_states;
drop table public.season_feature_global;

select set_config('emblem.acknowledge_0099_rollback', '', false);

commit;
