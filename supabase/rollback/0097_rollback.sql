-- ============================================================================
-- EMERGENCY ONLY: THIS ROLLBACK BREAKS ACCOUNT DELETION FOR COACHES AGAIN.
-- ============================================================================
-- Reverses 0097_coach_account_deletion_verified_moments.sql, returning
-- public.moments, the two deletion-request tables and
-- delete_own_guardian_account() to exactly their 0096 state (the 0076
-- function body, the 0020 consistency rule and the original cancellation
-- rules). Once it runs, self-service account deletion again fails, and rolls
-- back, for every coach who has ever verified a moment or sent a
-- recognition, and for every account that ever cancelled a deletion
-- request. Prefer fixing
-- forward. Use this only if 0097 breaks a legitimate flow that cannot be
-- fixed quickly, and re-apply 0097 as soon as possible.
--
-- It refuses to run, changing nothing, unless:
--   - 0097 is applied (the column, the policy and the 0097 function body are
--     all present);
--   - NO row carries any 0097 marker (moments.verifier_account_deleted_at,
--     or cancelled_by_account_deleted_at on either deletion-request table).
--     Once any account deletion has used one, those rows have the actor
--     NULL and cannot satisfy the original rules; the account no longer
--     exists, so there is nothing honest to restore. Then the only way is
--     forward.
--   - the SAME TRANSACTION first sets this exact acknowledgement,
--     transaction-local (third argument true):
--
--   begin;
--   select set_config('emblem.acknowledge_0097_rollback', 'BREAK-COACH-ACCOUNT-DELETION', true);
--   -- then this file, in the same transaction
--
-- (This file's own begin is then a no-op and its commit commits.) The file
-- also clears the acknowledgement before committing, so it never outlives
-- the transaction.
--
-- Data: lossless, because it runs only while no row uses the new column.
-- No row is created, changed or deleted.
begin;

do $$
declare
  v_marked bigint;
  v_body text;
begin
  if current_setting('emblem.acknowledge_0097_rollback', true) is distinct from 'BREAK-COACH-ACCOUNT-DELETION' then
    raise exception '0097 rollback refused: it breaks account deletion for coaches again. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0097_rollback'', ''BREAK-COACH-ACCOUNT-DELETION'', true);';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'moments' and column_name = 'verifier_account_deleted_at')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'moments'
                    and policyname = 'moments: only account deletion marks a verifier as deleted')
     or (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'cancelled_by_account_deleted_at'
         and table_name in ('player_deletion_requests', 'squad_invite_participation_deletion_requests')) <> 2 then
    raise exception '0097 rollback refused: 0097 is not applied';
  end if;
  select p.prosrc into v_body from pg_proc p where p.oid = to_regprocedure('public.delete_own_guardian_account()');
  if v_body is null or v_body not like '%verifier_account_deleted_at = now()%' then
    raise exception '0097 rollback refused: delete_own_guardian_account() is not the 0097 definition';
  end if;
  select count(*) into v_marked from public.moments where verifier_account_deleted_at is not null;
  if v_marked > 0 then
    raise exception '0097 rollback refused: % moment(s) were verified by a coach whose account has since been deleted; the 0020 rule cannot hold them. Fix forward instead.', v_marked;
  end if;
  select (select count(*) from public.player_deletion_requests where cancelled_by_account_deleted_at is not null)
       + (select count(*) from public.squad_invite_participation_deletion_requests where cancelled_by_account_deleted_at is not null)
    into v_marked;
  if v_marked > 0 then
    raise exception '0097 rollback refused: % cancelled deletion request(s) were cancelled by an account that has since been deleted; the original cancellation rules cannot hold them. Fix forward instead.', v_marked;
  end if;
end;
$$;

-- 4 reversed: the 0076 function body, exactly.
create or replace function public.delete_own_guardian_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_email text;
  v_player_ids uuid[];
  v_player_id uuid;
  v_other_guardians_count int;
  v_players_unlinked uuid[] := '{}';
  v_players_deletion_requested uuid[] := '{}';
  v_request_id uuid;
  v_blocked boolean;
  v_blocking_reason text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid;

  select array_agg(player_id) into v_player_ids from public.guardians where profile_id = v_uid;

  if v_player_ids is not null then
    foreach v_player_id in array v_player_ids loop
      select count(*) into v_other_guardians_count
      from public.guardians
      where player_id = v_player_id and profile_id <> v_uid;

      if v_other_guardians_count > 0 then
        delete from public.guardians where player_id = v_player_id and profile_id = v_uid;
        update public.moments set uploaded_by = null where player_id = v_player_id and uploaded_by = v_uid;
        update public.coach_invites set created_by = null where player_id = v_player_id and created_by = v_uid;
        update public.coach_invites set used_by = null where player_id = v_player_id and used_by = v_uid;
        update public.player_invites set created_by = null where player_id = v_player_id and created_by = v_uid;
        update public.player_invites set used_by = null where player_id = v_player_id and used_by = v_uid;
        v_players_unlinked := v_players_unlinked || v_player_id;
      else
        select id into v_request_id
        from public.player_deletion_requests
        where player_id = v_player_id and status = 'pending'
        limit 1;

        if v_request_id is null then
          insert into public.player_deletion_requests (player_id, requested_by, requester_email, notes)
          values (v_player_id, v_uid, v_email, 'Automatic: filed because the sole guardian deleted their account')
          returning id into v_request_id;
          -- Same immediate lockdown a guardian-filed request gets — this
          -- guardian's own `guardians` row for this player still exists
          -- at this point (removed below), so suspend_card's own
          -- authorization check passes exactly as it would for a direct
          -- guardian call.
          perform public.lockdown_for_player_deletion_request(v_request_id, v_player_id);
        end if;

        delete from public.guardians where player_id = v_player_id and profile_id = v_uid;
        v_players_deletion_requested := v_players_deletion_requested || v_player_id;
      end if;
    end loop;
  end if;

  -- Defense-in-depth pass, unscoped to any specific player.
  delete from public.active_viewers where profile_id = v_uid;
  delete from public.story_updates where recipient_profile_id = v_uid;
  update public.coach_invites set created_by = null where created_by = v_uid;
  update public.coach_invites set used_by = null where used_by = v_uid;
  update public.player_invites set created_by = null where created_by = v_uid;
  update public.player_invites set used_by = null where used_by = v_uid;
  update public.moments set uploaded_by = null where uploaded_by = v_uid;
  -- Newly covered nullable references (previously left untouched, which
  -- would have blocked the profiles delete via NO ACTION/RESTRICT).
  update public.moments set verified_by = null where verified_by = v_uid;
  update public.orders set approved_by = null where approved_by = v_uid;
  update public.team_invites set created_by = null where created_by = v_uid;
  update public.team_invites set used_by = null where used_by = v_uid;
  update public.squad_invite_audit_events set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_link_audit_events set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_notification_outbox set recipient_profile_id = null where recipient_profile_id = v_uid;
  update public.squad_invite_participations set guardian_profile_id = null where guardian_profile_id = v_uid;
  update public.squad_invite_permissions set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_request_audit_events set actor_profile_id = null where actor_profile_id = v_uid;

  -- NOT-NULL blockers: cannot be nulled, and their rows are required
  -- campaign/financial/audit records that must not be destroyed. Detect
  -- rather than attempt and fail.
  select exists (
    select 1 from public.player_assessments where created_by = v_uid
    union all select 1 from public.player_goals where created_by = v_uid
    union all select 1 from public.player_season_focus where created_by = v_uid
    union all select 1 from public.player_strengths where created_by = v_uid
  ) into v_blocked;
  if v_blocked then
    v_blocking_reason := 'coach_authored_player_records';
  else
    select exists (
      select 1 from public.squad_invite_links where created_by_profile_id = v_uid
      union all select 1 from public.squad_invite_organiser_ownership where organiser_profile_id = v_uid
      union all select 1 from public.squad_invite_requests where organiser_profile_id = v_uid
      union all select 1 from public.squad_invites where organiser_profile_id = v_uid
    ) into v_blocked;
    if v_blocked then
      v_blocking_reason := 'squad_invite_organiser_history';
    else
      select exists (
        select 1 from public.squad_invite_request_declarations where actor_profile_id = v_uid
      ) into v_blocked;
      if v_blocked then
        v_blocking_reason := 'squad_invite_audit_history';
      end if;
    end if;
  end if;

  if v_blocked then
    insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason)
    values (v_uid, v_email, v_blocking_reason)
    on conflict (auth_user_id) do update set blocking_reason = excluded.blocking_reason;
  else
    delete from public.profiles where id = v_uid;
  end if;

  return jsonb_build_object(
    'playersUnlinked', to_jsonb(v_players_unlinked),
    'playersDeletionRequested', to_jsonb(v_players_deletion_requested),
    'canDeleteIdentity', not v_blocked
  );
end;
$$;

revoke all on function public.delete_own_guardian_account() from public, anon;
grant execute on function public.delete_own_guardian_account() to authenticated;

alter function public.delete_own_guardian_account() owner to postgres;

-- 3 reversed.
drop policy "moments: only account deletion marks a verifier as deleted" on public.moments;

-- 2 reversed: the 0020 rule, exactly (the column is still NULL everywhere).
alter table public.moments drop constraint moments_verification_status_consistency;

-- 1 reversed.
alter table public.moments drop column verifier_account_deleted_at;

alter table public.moments add constraint moments_verification_status_consistency
  check (
    (verification_status = 'coach_verified' and verified_at is not null and verified_by is not null)
    or
    (verification_status in ('family_memory', 'pending_verification', 'system_generated') and verified_at is null and verified_by is null)
  );

-- 5 reversed: the original cancellation rules (the columns are NULL everywhere).
alter table public.player_deletion_requests drop constraint player_deletion_requests_cancellation_requires_actor;
alter table public.player_deletion_requests drop column cancelled_by_account_deleted_at;
alter table public.player_deletion_requests add constraint player_deletion_requests_cancellation_requires_actor
  check (status <> 'cancelled' or (cancelled_by is not null and cancelled_at is not null));

alter table public.squad_invite_participation_deletion_requests drop constraint sipdr_cancellation_requires_actor;
alter table public.squad_invite_participation_deletion_requests drop column cancelled_by_account_deleted_at;
alter table public.squad_invite_participation_deletion_requests add constraint sipdr_cancellation_requires_actor
  check (status <> 'cancelled' or (cancelled_by is not null and cancelled_at is not null));

-- Never let the acknowledgement outlive this transaction.
select set_config('emblem.acknowledge_0097_rollback', '', false);

commit;
