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
--   - no account deletion is pending staff review while that account still
--     has parent links (guardians rows). From 0097 a deletion that goes to
--     staff review changes nothing but the request; the 0076 function this
--     restores has no completion step, and removing such an account's login
--     would drop its parent links without the child-data clean-up. Complete
--     (complete_pending_profile_deletion) or reject those first.
--   - no staff decision on an account deletion has been recorded
--     (account_deletion_staff_actions is an audit; it is not dropped while
--     it holds anything), and no erased account still has a sign-in
--     identity (its erased_accounts record is what keeps it out);
--   - NO row carries any 0097 marker (moments.verifier_account_deleted_at,
--     or cancelled_by_account_deleted_at on either deletion-request table).
--     Once any account deletion has used one, those rows have the actor
--     NULL and cannot satisfy the original rules; the account no longer
--     exists, so there is nothing honest to restore. Then the only way is
--     forward.
--   - (not reversed, by design) the email 0097 cleared from the review
--     record of each erased account stays cleared: the account is gone and
--     the plaintext email must not come back. A self_deleted audit event
--     counts as a recorded decision above, so the rollback refuses once any
--     reviewed account has erased itself. Likewise invite addresses cleared
--     by an erasure, and child-deletion contacts cleared when a request
--     closed, are not restored;
--   - no invite has been revoked because its recipient account was erased
--     (the revocation record and the guard that keeps it unredeemable are
--     not dropped while anything uses them);
--   - no order or guardian approval request carries a section 12 marker
--     (a named guardian erased, a hold, a redacted approval): without them
--     a profile invite could fall back to the buyer, and a redacted
--     approval request could not satisfy the NOT NULL restored here.
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
     or to_regprocedure('public.guard_profile_deletion()') is null
     or not exists (select 1 from pg_trigger where tgname = 'profiles_account_deletion_guard')
     or to_regprocedure('public.account_deletion_blocking_reason(uuid)') is null
     or to_regprocedure('public.erase_account_for_deletion(uuid, text, uuid)') is null
     or to_regprocedure('public.complete_pending_profile_deletion(uuid, text)') is null
     or to_regclass('public.erased_accounts') is null
     or to_regclass('public.account_deletion_staff_actions') is null
     or to_regprocedure('public.account_is_erased()') is null
     or to_regprocedure('public.record_account_sign_in_removal(uuid, text, text)') is null
     or not exists (select 1 from pg_trigger where tgname = 'profiles_refuse_erased_account')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'moments'
                    and policyname = 'moments: only account deletion marks a verifier as deleted')
     or (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'cancelled_by_account_deleted_at'
         and table_name in ('player_deletion_requests', 'squad_invite_participation_deletion_requests')) <> 2 then
    raise exception '0097 rollback refused: 0097 is not applied';
  end if;
  -- 0098 builds on 0097's function body; roll it back first.
  if to_regclass('public.deletion_review_access_suspensions') is not null then
    raise exception '0097 rollback refused: 0098 is still applied; roll back 0098 first';
  end if;
  select p.prosrc into v_body from pg_proc p where p.oid = to_regprocedure('public.delete_own_guardian_account()');
  if v_body is null or v_body not like '%public.erase_account_for_deletion(v_uid, v_email, null)%' then
    raise exception '0097 rollback refused: delete_own_guardian_account() is not the 0097 definition';
  end if;
  select count(distinct d.auth_user_id) into v_marked
    from public.pending_profile_deletions d join public.guardians g on g.profile_id = d.auth_user_id
   where d.status = 'pending';
  if v_marked > 0 then
    raise exception '0097 rollback refused: % account deletion(s) are pending staff review with parent links still in place; complete or reject them first.', v_marked;
  end if;
  select count(*) into v_marked from public.account_deletion_staff_actions;
  if v_marked > 0 then
    raise exception '0097 rollback refused: % account-deletion audit event(s) (staff decisions, or a reviewed account''s own self-deletion) are recorded; that audit cannot be dropped. Fix forward instead.', v_marked;
  end if;
  select count(*) into v_marked from public.erased_accounts e where exists (select 1 from auth.users u where u.id = e.profile_id);
  if v_marked > 0 then
    raise exception '0097 rollback refused: % erased account(s) still have a sign-in identity; dropping the erased-account record would let them back in. Remove those identities first.', v_marked;
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
  if to_regprocedure('public.refuse_revoked_invite_reuse()') is null
     or to_regprocedure('public.revoke_invites_addressed_to(uuid, text)') is null
     or to_regprocedure('public.redact_closed_deletion_request_contact()') is null then
    raise exception '0097 rollback refused: 0097 is not applied (invite revocation or contact redaction missing)';
  end if;
  select (select count(*) from public.player_invites where revoked_at is not null)
       + (select count(*) from public.coach_invites where revoked_at is not null)
       + (select count(*) from public.team_invites where revoked_at is not null)
    into v_marked;
  if v_marked > 0 then
    raise exception '0097 rollback refused: % invite(s) were revoked because their recipient account was erased; dropping the revocation record and its guard is not allowed. Fix forward instead.', v_marked;
  end if;
  if to_regprocedure('public.redact_order_guardian_addresses(uuid, text)') is null
     or to_regprocedure('public.refuse_held_order_progress()') is null
     or to_regprocedure('public.refuse_redacted_approval_change()') is null then
    raise exception '0097 rollback refused: 0097 is not applied (order guardian redaction missing)';
  end if;
  select (select count(*) from public.orders where intended_guardian_erased_at is not null or held_at is not null)
       + (select count(*) from public.builder_guardian_approval_requests where guardian_email_redacted_at is not null)
    into v_marked;
  if v_marked > 0 then
    raise exception '0097 rollback refused: % order(s) or guardian approval request(s) record an erased named guardian or a hold; dropping that record is not allowed. Fix forward instead.', v_marked;
  end if;
end;
$$;

-- 12 reversed (no row carries a section 12 marker: checked above).
drop trigger builder_guardian_approval_requests_redacted_guard on public.builder_guardian_approval_requests;
drop function public.refuse_redacted_approval_change();
drop trigger orders_held_guard on public.orders;
drop function public.refuse_held_order_progress();
alter table public.builder_guardian_approval_requests alter column guardian_email set not null;
alter table public.builder_guardian_approval_requests
  drop constraint builder_guardian_approval_requests_redaction_state,
  drop column guardian_distinct_from_buyer, drop column guardian_email_redacted_at;
alter table public.orders
  drop constraint orders_hold_state,
  drop column held_reason, drop column held_at, drop column intended_guardian_erased_at;

-- 11 reversed (addresses already cleared stay cleared).
alter table public.squad_invite_participation_deletion_requests drop constraint sipdr_closed_has_no_contact;
alter table public.player_deletion_requests drop constraint player_deletion_requests_closed_has_no_contact;
drop trigger sipdr_redact_closed_contact on public.squad_invite_participation_deletion_requests;
drop trigger player_deletion_requests_redact_closed_contact on public.player_deletion_requests;
drop function public.redact_closed_deletion_request_contact();

-- 10 reversed (no invite is revoked: checked above).
drop trigger team_invites_revoked_guard on public.team_invites;
drop trigger coach_invites_revoked_guard on public.coach_invites;
drop trigger player_invites_revoked_guard on public.player_invites;
drop function public.refuse_revoked_invite_reuse();
alter table public.team_invites drop constraint team_invites_revoked_state, drop column revoked_reason, drop column revoked_at;
alter table public.coach_invites drop constraint coach_invites_revoked_state, drop column revoked_reason, drop column revoked_at;
alter table public.player_invites drop constraint player_invites_revoked_state, drop column revoked_reason, drop column revoked_at;

-- 9 reversed (the erased-account records left are for identities already
-- removed, so nothing they protected remains).
drop trigger profiles_refuse_erased_account on public.profiles;
drop function public.account_is_erased();
drop function public.record_account_sign_in_removal(uuid, text, text);
drop function public.refuse_erased_account_profile();
drop table public.account_deletion_staff_actions;
drop table public.erased_accounts;
drop function public.reject_account_deletion_record_change();

-- 7, 8, 4b and 4a reversed.
drop trigger profiles_account_deletion_guard on public.profiles;
drop function public.guard_profile_deletion();
drop function public.complete_pending_profile_deletion(uuid, text);
drop function public.erase_account_for_deletion(uuid, text, uuid);
drop function public.revoke_invites_addressed_to(uuid, text);
drop function public.redact_order_guardian_addresses(uuid, text);
drop function public.account_deletion_blocking_reason(uuid);

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
