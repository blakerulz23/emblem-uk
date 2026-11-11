-- ============================================================================
-- EMERGENCY ONLY: THIS ROLLBACK LETS COACHES KEEP ACCESS DURING DELETION REVIEW,
-- LETS STAFF SELF-DELETE, AND LETS A SIGNED-IN USER NAME ANOTHER PERSON AS VERIFIER.
-- ============================================================================
-- Reverses 0098_deletion_review_suspension_and_verifier_identity.sql,
-- returning the schema to exactly its 0097 state. Prefer fixing forward.
--
-- It refuses to run, changing nothing, unless:
--   - 0098 is applied;
--   - deletion_review_access_suspensions is EMPTY: once any staff review
--     has suspended access, that table is the only record of what to
--     restore, and dropping it would strand those coaches;
--   - no pending_profile_deletions row is 'rejected' or carries a
--     rejection_reason (the 0076 status rule cannot hold them);
--   - the SAME TRANSACTION first sets this exact acknowledgement,
--     transaction-local (third argument true):
--
--   begin;
--   select set_config('emblem.acknowledge_0098_rollback', 'REOPEN-DELETION-REVIEW-ACCESS-AND-VERIFIER-NOMINATION', true);
--   -- then this file, in the same transaction
--
-- The file clears the acknowledgement before committing.
--
-- Data: lossless, because it runs only while nothing uses the 0098 state.
begin;

do $$
declare
  v_n bigint;
begin
  if current_setting('emblem.acknowledge_0098_rollback', true) is distinct from 'REOPEN-DELETION-REVIEW-ACCESS-AND-VERIFIER-NOMINATION' then
    raise exception '0098 rollback refused: it lets coaches keep access during deletion review, lets staff self-delete and reopens verifier nomination. To proceed deliberately, in one transaction first run: select set_config(''emblem.acknowledge_0098_rollback'', ''REOPEN-DELETION-REVIEW-ACCESS-AND-VERIFIER-NOMINATION'', true);';
  end if;
  if to_regclass('public.deletion_review_access_suspensions') is null then
    raise exception '0098 rollback refused: 0098 is not applied';
  end if;
  select count(*) into v_n from public.deletion_review_access_suspensions;
  if v_n > 0 then
    raise exception '0098 rollback refused: % access suspension record(s) exist; they are the only record of what to restore. Fix forward instead.', v_n;
  end if;
  select count(*) into v_n from public.pending_profile_deletions where status = 'rejected' or rejection_reason is not null;
  if v_n > 0 then
    raise exception '0098 rollback refused: % rejected profile deletion(s) exist. Fix forward instead.', v_n;
  end if;
end;
$$;

-- 1e and 2 reversed: the 0097 function body, exactly.
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
  -- 0097: a moment this account verified stays coach_verified with its
  -- verified_at, so the child keeps the record; only the verifier's
  -- identity is removed, and verifier_account_deleted_at records why.
  update public.moments
     set verified_by = null, verifier_account_deleted_at = now()
   where verified_by = v_uid;
  -- 0097: a cancellation this account made stays recorded as cancelled,
  -- with its cancelled_at; only the canceller's identity is removed.
  -- (Left to ON DELETE SET NULL, cancelled_by would break the
  -- cancellation rule and roll the whole deletion back.)
  update public.player_deletion_requests
     set cancelled_by = null, cancelled_by_account_deleted_at = now()
   where cancelled_by = v_uid and status = 'cancelled';
  update public.squad_invite_participation_deletion_requests
     set cancelled_by = null, cancelled_by_account_deleted_at = now()
   where cancelled_by = v_uid and status = 'cancelled';
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
drop policy "moments: a verifier change can only name the caller as coach" on public.moments;
drop policy "moments: a signed-in user can only name themselves as verifier" on public.moments;
drop function public.moment_verifier_unchanged(uuid, uuid);

-- 1d, 1c, 1b reversed.
drop function public.restore_coach_access_after_deletion_rejection(uuid, uuid, text);
drop function public.reject_pending_profile_deletion(uuid, uuid, text);
drop table public.deletion_review_access_suspensions;

-- 1a reversed: the 0076 status rule (no row is 'rejected').
alter table public.pending_profile_deletions drop constraint pending_profile_deletions_rejection_check;
alter table public.pending_profile_deletions drop constraint pending_profile_deletions_status_check;
alter table public.pending_profile_deletions drop column rejection_reason;
alter table public.pending_profile_deletions add constraint pending_profile_deletions_status_check
  check (status in ('pending', 'resolved'));

-- Never let the acknowledgement outlive this transaction.
select set_config('emblem.acknowledge_0098_rollback', '', false);

commit;
