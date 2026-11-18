-- ============================================================================
-- Rollback for 0109_my_season_parent_coach_withdrawal_guard.sql.
-- ============================================================================
-- Restores the exact 0108 my_season_withdraw_observation. It changes no table
-- or row. It REOPENS THE GAP 0109 closed: a coach who wrote a note before
-- becoming the child's guardian can withdraw it again.
--
-- It refuses, changing nothing, unless the exact 0109 function is installed and
-- the SAME TRANSACTION first sets this acknowledgement, transaction-local:
--
--   begin;
--   select set_config('emblem.acknowledge_0109_rollback', 'reopen parent coach withdrawal', true);
--   -- then this file, in the same transaction
--
-- It does not touch supabase_migrations.schema_migrations: remove the 0109
-- ledger row separately, under its own guard, if one was added.
-- ============================================================================

begin;

do $$
begin
  if current_setting('emblem.acknowledge_0109_rollback', true) is distinct from 'reopen parent coach withdrawal' then
    raise exception '0109 rollback refused: it lets a parent-coach withdraw their own note about their child again. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0109_rollback'', ''reopen parent coach withdrawal'', true);';
  end if;
  if to_regprocedure('public.my_season_withdraw_observation(uuid)') is null
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_season_withdraw_observation(uuid)'::regprocedure) <> '081f1ea6eb6b7acd27dafda6f9a3063d' then
    raise exception '0109 rollback refused: the exact 0109 function is not installed';
  end if;
end;
$$;

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
  if v_player is null or not public.my_season_is_team_coach(v_player, v_uid) then
    raise exception using errcode = 'EMS03', message = 'my_season_not_allowed';
  end if;
  select p.team_id into v_team from public.players p where p.id = v_player;
  if not public.season_feature_enabled_for_team(v_team) then
    raise exception using errcode = 'EMS02', message = 'my_season_not_enabled';
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

do $$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_season_withdraw_observation(uuid)'::regprocedure) <> '7db826bc158e12811f5e7a35c7ceafde' then
    raise exception '0109 rollback failed: the restored function is not the exact 0108 function';
  end if;
end;
$$;

select set_config('emblem.acknowledge_0109_rollback', '', true);

commit;
