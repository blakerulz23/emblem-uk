-- ============================================================================
-- Rollback for 0108_my_season_focus_and_observations.sql.
-- DATA LOSS: THIS DROPS EVERY MY SEASON FOCUS, COACH NOTE AND AUDIT EVENT.
-- ============================================================================
-- Drops the four My Season RPCs, the helpers, the trigger functions (and
-- with the tables their triggers, policies and indexes) and the three
-- tables my_season_focuses, my_season_coach_observations and
-- my_season_audit_events. The result is the exact pre-0108 catalog (proven
-- in supabase/tests/authz/migration_0099_0108_test.mjs). 0099's flag tables
-- stay; roll them back separately with 0099_rollback.sql.
--
-- Before running it: confirm with Blake, export the three tables if the
-- content must be kept, and set the deploy kill switch
-- (SEASON_FEATURE_KILL_SWITCH=true) so the app stops calling the RPCs.
--
-- It refuses, changing nothing, unless 0108 is applied and the SAME
-- TRANSACTION first sets this exact acknowledgement, transaction-local:
--
--   begin;
--   select set_config('emblem.acknowledge_0108_rollback', 'drop my season data', true);
--   -- then this file, in the same transaction
--
-- The file clears the acknowledgement before committing.
-- ============================================================================

begin;

do $$
begin
  if current_setting('emblem.acknowledge_0108_rollback', true) is distinct from 'drop my season data' then
    raise exception '0108 rollback refused: it permanently deletes every My Season focus, coach note and audit event. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0108_rollback'', ''drop my season data'', true);';
  end if;
  if to_regclass('public.my_season_focuses') is null
     or to_regclass('public.my_season_coach_observations') is null
     or to_regclass('public.my_season_audit_events') is null
     or to_regprocedure('public.my_season_for_player(uuid)') is null then
    raise exception '0108 rollback refused: 0108 is not (fully) applied';
  end if;
end;
$$;

drop function public.my_season_for_player(uuid);
drop function public.my_season_withdraw_observation(uuid);
drop function public.my_season_add_observation(uuid, text, text, uuid);
drop function public.my_season_set_focus(uuid, text, text, text, date, uuid);
drop function public.my_season_trim(text);

-- The audit table's own delete trigger refuses deletes while the player
-- exists, but DROP TABLE does not fire row or truncate triggers.
drop table public.my_season_audit_events;
drop table public.my_season_coach_observations;
drop table public.my_season_focuses;

drop function public.my_season_can_read(uuid);
drop function public.my_season_is_team_coach(uuid, uuid);
drop function public.my_season_is_guardian(uuid, uuid);
drop function public.my_season_focuses_before_insert();
drop function public.my_season_focuses_before_update();
drop function public.my_season_observations_before_insert();
drop function public.my_season_observations_before_update();
drop function public.my_season_audit_before_update();
drop function public.my_season_audit_before_delete();
drop function public.my_season_audit_refuse_truncate();

select set_config('emblem.acknowledge_0108_rollback', '', false);

commit;
