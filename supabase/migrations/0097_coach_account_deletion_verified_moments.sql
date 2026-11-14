-- Coach account deletion: keep the child's coach-verified moments.
--
-- Self-service account deletion (delete_own_guardian_account, last defined
-- in 0076) fails for every coach who has ever verified a moment or sent a
-- Celebrate recognition. It runs
--   update public.moments set verified_by = null where verified_by = v_uid;
-- but moments_verification_status_consistency (0020) requires verified_by
-- to be set on every coach_verified moment, so the whole call raises and
-- rolls back. Nothing changes, and the account can never be deleted.
--
-- After 0097 the child's moment stays exactly as it was: same row, still
-- coach_verified, same verified_at, title, note, media and visibility. Only
-- the verifier's identity goes. A new column,
-- moments.verifier_account_deleted_at, records why verified_by is empty, so
-- "verified by a coach whose account has since been deleted" is an explicit
-- state rather than a missing value:
--
--   0. Precondition: refuses, changing nothing, unless the 0076 deletion
--      function and the 0020 constraint are exactly in place and 0097 has
--      not already been applied.
--   1. Adds moments.verifier_account_deleted_at (timestamptz, NULL). No
--      existing row changes; every existing row gets NULL.
--   2. Replaces moments_verification_status_consistency (same name):
--        coach_verified: verified_at set, and EXACTLY ONE of verified_by
--          or verifier_account_deleted_at set;
--        family_memory / pending_verification / system_generated:
--          verified_at, verified_by and verifier_account_deleted_at all
--          NULL (the 0020 rule, plus the new column).
--      Added NOT VALID, then validated in the same transaction: every
--      existing row passed the 0020 rule and has the new column NULL, so it
--      passes the new rule.
--   3. A RESTRICTIVE insert policy for authenticated: a signed-in user can
--      never insert a moment carrying the deleted-verifier marker, so the
--      state is reachable only through account deletion. authenticated has
--      no UPDATE privilege on the new column (0029's column grant is
--      unchanged), so an update cannot set it either.
--   4. delete_own_guardian_account decides first, then does one of two
--      things (0076 cleaned up first and decided after):
--        - something blocks the deletion (coach-authored player records,
--          Squad Invite history): it records the request in
--          pending_profile_deletions for staff review and changes NOTHING
--          else. Parent links, child deletion requests, cards and their
--          lock state, moments (uploaded_by and verified_by), invites and
--          every other reference stay as they are, because the account
--          still exists and staff may reject the deletion;
--        - nothing blocks it: it erases the account at once
--          (erase_account_for_deletion, section 4b: the 0076 clean-up,
--          unchanged apart from the verifier statement, then the profile
--          delete).
--      The 0076 blocker detection is now account_deletion_blocking_reason
--      (section 4a), unchanged. A moment this account verified keeps its
--      status and verified_at; verified_by becomes NULL and
--      verifier_account_deleted_at is set ONLY as the profile row is
--      deleted (section 7). (0076 cleared verified_by before deciding,
--      which broke every coach deletion; that statement is gone.)
--      Grants re-stated unchanged (authenticated only).
--
--
-- Expanded scope (same defect class, same fix): a guardian, or a coach who
-- is also a guardian, who ever cancelled a child-deletion request (or a
-- Squad Invite participation deletion request) could not delete their
-- account either. Deleting the profile sets cancelled_by to NULL (ON DELETE
-- SET NULL), which player_deletion_requests_cancellation_requires_actor and
-- sipdr_cancellation_requires_actor forbid on a cancelled request.
--   5. Both tables get cancelled_by_account_deleted_at, and both
--      cancellation rules (same names, NOT VALID then validated) become:
--        cancelled: cancelled_at set, and EXACTLY ONE of cancelled_by or
--          cancelled_by_account_deleted_at set;
--        any other status: the marker NULL (cancelled_by unconstrained, as
--          before).
--      The precondition also proves authenticated holds no INSERT or UPDATE
--      on either table, so no signed-in user can set the marker.
--   6. Cancellations are marked the same way and at the same moment as
--      verifications (section 7): the record that a cancellation happened,
--      and when, is kept. Nothing is marked while the deletion is only
--      under staff review.
--   7. A BEFORE DELETE trigger on profiles (guard_profile_deletion):
--        - refuses the delete while the account still has a guardians row,
--          or while its deletion is pending staff review. Removing the login
--          account (auth.users) deletes the profile by ON DELETE CASCADE,
--          which would drop those guardians rows without filing a child
--          deletion request or locking a card; the erasure removes both
--          conditions before it deletes the profile;
--        - otherwise writes the two markers for the profile being deleted.
--          It is the only place either marker is written, so each is
--          written once, whichever path deletes the profile.
--   8. complete_pending_profile_deletion(request, reason): the explicit
--      final step for a reviewed deletion, for a signed-in staff member.
--      Refuses unless the request is pending and nothing blocks the
--      deletion any more; then runs the erasure exactly once (resolving the
--      request with the staff member as resolved_by) and records in
--      pending_auth_deletions (0043) that the sign-in identity still needs
--      deleting. A repeat reports already_completed and changes nothing.
--   9. erased_accounts: the erasure records the account; no profile can be
--      created for it again, and account_is_erased() lets the app refuse
--      its sessions at once (an issued access token outlives Auth user
--      deletion). account_deletion_staff_actions audits staff decisions
--      (and, through record_account_sign_in_removal, each sign-in removal
--      attempt), and an account's own later self-deletion of a reviewed
--      request (self_deleted). Both tables are append-only for every role.
--      Every erasure clears the email from the account's review record, and
--      no retry record (pending_auth_deletions) written here carries one;
--      pending and rejected reviews keep it while staff may need it.
--
-- No app code reads moments.verified_by (it is only written, by
-- /api/os/celebrate and /api/os/moments/verify), so NULL is already safe in
-- every reader; cancelled_by is read by no app code either. This migration
-- changes no existing row.
-- Rollback: supabase/rollback/0097_rollback.sql (restores the defect, and
-- refuses once any account deletion has used any of the new markers).

begin;

-- ---------------------------------------------------------------------------
-- 0. Precondition (before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  v_problems text[] := '{}';
  v_def text;
  v_body text;
begin
  if to_regclass('public.moments') is null then
    raise exception '0097 refused: public.moments is missing';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'moments' and column_name = 'verifier_account_deleted_at') then
    raise exception '0097 refused: moments.verifier_account_deleted_at already exists (0097 already applied)';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and column_name = 'cancelled_by_account_deleted_at'
               and table_name in ('player_deletion_requests', 'squad_invite_participation_deletion_requests')) then
    raise exception '0097 refused: cancelled_by_account_deleted_at already exists (0097 already applied)';
  end if;
  if to_regprocedure('public.guard_profile_deletion()') is not null
     or exists (select 1 from pg_trigger where tgname = 'profiles_account_deletion_guard')
     or to_regprocedure('public.account_deletion_blocking_reason(uuid)') is not null
     or to_regprocedure('public.erase_account_for_deletion(uuid, text, uuid)') is not null
     or to_regprocedure('public.complete_pending_profile_deletion(uuid, text)') is not null
     or to_regclass('public.erased_accounts') is not null
     or to_regclass('public.account_deletion_staff_actions') is not null
     or to_regprocedure('public.account_is_erased()') is not null
     or to_regprocedure('public.refuse_erased_account_profile()') is not null
     or to_regprocedure('public.record_account_sign_in_removal(uuid, text, text)') is not null
     or to_regprocedure('public.reject_account_deletion_record_change()') is not null then
    raise exception '0097 refused: a 0097 account-deletion function or trigger already exists (0097 already applied)';
  end if;
  if to_regclass('public.player_deletion_requests') is null or to_regclass('public.squad_invite_participation_deletion_requests') is null then
    raise exception '0097 refused: a deletion request table is missing';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.player_deletion_requests'::regclass and conname = 'player_deletion_requests_cancellation_requires_actor';
  if v_def is distinct from 'CHECK (((status <> ''cancelled''::text) OR ((cancelled_by IS NOT NULL) AND (cancelled_at IS NOT NULL))))' then
    v_problems := v_problems || ('player_deletion_requests_cancellation_requires_actor is not the 0041 rule: ' || coalesce(v_def, 'missing'));
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.squad_invite_participation_deletion_requests'::regclass and conname = 'sipdr_cancellation_requires_actor';
  if v_def is distinct from 'CHECK (((status <> ''cancelled''::text) OR ((cancelled_by IS NOT NULL) AND (cancelled_at IS NOT NULL))))' then
    v_problems := v_problems || ('sipdr_cancellation_requires_actor is not the original rule: ' || coalesce(v_def, 'missing'));
  end if;
  -- The cancellation markers rely on signed-in users holding no write
  -- privilege on these tables (writes go through security-definer
  -- functions and the server's service role).
  if has_table_privilege('authenticated', 'public.player_deletion_requests', 'insert')
     or has_table_privilege('authenticated', 'public.player_deletion_requests', 'update')
     or has_any_column_privilege('authenticated', 'public.player_deletion_requests', 'insert')
     or has_any_column_privilege('authenticated', 'public.player_deletion_requests', 'update')
     or has_any_column_privilege('authenticated', 'public.squad_invite_participation_deletion_requests', 'insert')
     or has_any_column_privilege('authenticated', 'public.squad_invite_participation_deletion_requests', 'update') then
    v_problems := v_problems || 'authenticated can write a deletion request table'::text;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.moments'::regclass and conname = 'moments_verification_status_consistency';
  if v_def is null then
    v_problems := v_problems || 'moments_verification_status_consistency is missing'::text;
  elsif v_def <> 'CHECK ((((verification_status = ''coach_verified''::text) AND (verified_at IS NOT NULL) AND (verified_by IS NOT NULL)) OR ((verification_status = ANY (ARRAY[''family_memory''::text, ''pending_verification''::text, ''system_generated''::text])) AND (verified_at IS NULL) AND (verified_by IS NULL))))' then
    v_problems := v_problems || ('moments_verification_status_consistency is not the 0020 rule: ' || v_def);
  end if;
  select p.prosrc into v_body from pg_proc p
  where p.oid = to_regprocedure('public.delete_own_guardian_account()');
  if v_body is null then
    v_problems := v_problems || 'public.delete_own_guardian_account() is missing'::text;
  elsif v_body not like '%update public.moments set verified_by = null where verified_by = v_uid;%'
     or v_body not like '%coach_authored_player_records%' then
    v_problems := v_problems || 'public.delete_own_guardian_account() is not the 0076 definition'::text;
  end if;
  if to_regclass('public.pending_profile_deletions') is null or to_regclass('public.pending_auth_deletions') is null
     or to_regclass('public.staff_accounts') is null
     or to_regprocedure('public.lockdown_for_player_deletion_request(uuid, uuid)') is null then
    v_problems := v_problems || 'pending_profile_deletions, pending_auth_deletions, staff_accounts or the 0076 lockdown helper is missing'::text;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'moments'
             and policyname = 'moments: only account deletion marks a verifier as deleted') then
    v_problems := v_problems || 'the 0097 restrictive insert policy already exists'::text;
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0097 refused: the expected state is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The deleted-verifier marker
-- ---------------------------------------------------------------------------
alter table public.moments add column verifier_account_deleted_at timestamptz;

comment on column public.moments.verifier_account_deleted_at is
  'Set only by the profiles delete trigger (guard_profile_deletion, 0097), as the account is actually deleted, when the coach who verified this moment deleted their account. The moment stays coach_verified with its original verified_at; verified_by is then NULL. Never set by the app.';

-- ---------------------------------------------------------------------------
-- 2. The consistency rule, with the deleted-verifier state
-- ---------------------------------------------------------------------------
alter table public.moments drop constraint moments_verification_status_consistency;

alter table public.moments add constraint moments_verification_status_consistency
  check (
    (verification_status = 'coach_verified' and verified_at is not null
      and ((verified_by is not null and verifier_account_deleted_at is null)
        or (verified_by is null and verifier_account_deleted_at is not null)))
    or
    (verification_status in ('family_memory', 'pending_verification', 'system_generated')
      and verified_at is null and verified_by is null and verifier_account_deleted_at is null)
  ) not valid;

alter table public.moments validate constraint moments_verification_status_consistency;

-- ---------------------------------------------------------------------------
-- 3. Signed-in users can never insert the marker
-- ---------------------------------------------------------------------------
-- authenticated holds table-level INSERT on moments (which covers new
-- columns), so this restrictive policy is what keeps the marker out of every
-- insert an end user can make. It adds a condition to the existing
-- permissive insert policies (guardian submission, coach recognition) and
-- widens nothing.
create policy "moments: only account deletion marks a verifier as deleted"
  on public.moments
  as restrictive
  for insert
  to authenticated
  with check (verifier_account_deleted_at is null);

-- ---------------------------------------------------------------------------
-- 5. Cancelled deletion requests whose canceller deleted their account
-- ---------------------------------------------------------------------------
alter table public.player_deletion_requests add column cancelled_by_account_deleted_at timestamptz;
alter table public.squad_invite_participation_deletion_requests add column cancelled_by_account_deleted_at timestamptz;

comment on column public.player_deletion_requests.cancelled_by_account_deleted_at is
  'Set only by the profiles delete trigger (guard_profile_deletion, 0097), as the account is actually deleted, when the account that cancelled this request was deleted. The request stays cancelled with its original cancelled_at; cancelled_by is then NULL.';
comment on column public.squad_invite_participation_deletion_requests.cancelled_by_account_deleted_at is
  'Set only by the profiles delete trigger (guard_profile_deletion, 0097), as the account is actually deleted, when the account that cancelled this request was deleted. The request stays cancelled with its original cancelled_at; cancelled_by is then NULL.';

alter table public.player_deletion_requests drop constraint player_deletion_requests_cancellation_requires_actor;
alter table public.player_deletion_requests add constraint player_deletion_requests_cancellation_requires_actor
  check (
    (status <> 'cancelled' and cancelled_by_account_deleted_at is null)
    or
    (status = 'cancelled' and cancelled_at is not null
      and ((cancelled_by is not null and cancelled_by_account_deleted_at is null)
        or (cancelled_by is null and cancelled_by_account_deleted_at is not null)))
  ) not valid;
alter table public.player_deletion_requests validate constraint player_deletion_requests_cancellation_requires_actor;

alter table public.squad_invite_participation_deletion_requests drop constraint sipdr_cancellation_requires_actor;
alter table public.squad_invite_participation_deletion_requests add constraint sipdr_cancellation_requires_actor
  check (
    (status <> 'cancelled' and cancelled_by_account_deleted_at is null)
    or
    (status = 'cancelled' and cancelled_at is not null
      and ((cancelled_by is not null and cancelled_by_account_deleted_at is null)
        or (cancelled_by is null and cancelled_by_account_deleted_at is not null)))
  ) not valid;
alter table public.squad_invite_participation_deletion_requests validate constraint sipdr_cancellation_requires_actor;

-- ---------------------------------------------------------------------------
-- 4a. What stops an account being deleted now (owner-only helper)
-- ---------------------------------------------------------------------------
-- The 0076 NOT-NULL blocker detection, unchanged, as a function so that the
-- self-service request and the staff completion decide the same way. These
-- rows cannot be nulled and are required campaign/financial/audit records
-- that must not be destroyed. Returns NULL when nothing blocks the deletion.
create function public.account_deletion_blocking_reason(p_profile_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.player_assessments where created_by = p_profile_id
    union all select 1 from public.player_goals where created_by = p_profile_id
    union all select 1 from public.player_season_focus where created_by = p_profile_id
    union all select 1 from public.player_strengths where created_by = p_profile_id
  ) then
    return 'coach_authored_player_records';
  end if;
  if exists (
    select 1 from public.squad_invite_links where created_by_profile_id = p_profile_id
    union all select 1 from public.squad_invite_organiser_ownership where organiser_profile_id = p_profile_id
    union all select 1 from public.squad_invite_requests where organiser_profile_id = p_profile_id
    union all select 1 from public.squad_invites where organiser_profile_id = p_profile_id
  ) then
    return 'squad_invite_organiser_history';
  end if;
  if exists (
    select 1 from public.squad_invite_request_declarations where actor_profile_id = p_profile_id
  ) then
    return 'squad_invite_audit_history';
  end if;
  return null;
end;
$$;

revoke all on function public.account_deletion_blocking_reason(uuid) from public, anon, authenticated, service_role;
alter function public.account_deletion_blocking_reason(uuid) owner to postgres;

-- ---------------------------------------------------------------------------
-- 4b. The account erasure (owner-only): the whole 0076 clean-up, then the
--     profile delete. Runs only when the account is actually being deleted.
-- ---------------------------------------------------------------------------
-- Callers: delete_own_guardian_account when nothing blocks the deletion
-- (auth.uid() is the account), and complete_pending_profile_deletion when
-- staff complete a reviewed deletion (auth.uid() is the staff member). The
-- card lockdown below calls suspend_card, which accepts either: the
-- account's own guardians row still exists at that point, or the caller is
-- staff. The clean-up is the 0076 block, unchanged, except that it no longer
-- clears moments.verified_by: the profiles delete trigger (section 7) marks
-- verifications and cancellations once, as the profile row is deleted.
create function public.erase_account_for_deletion(p_profile_id uuid, p_email text, p_completed_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := p_profile_id;
  v_email text := p_email;
  v_player_ids uuid[];
  v_player_id uuid;
  v_other_guardians_count int;
  v_players_unlinked uuid[] := '{}';
  v_players_deletion_requested uuid[] := '{}';
  v_request_id uuid;
  v_review_id uuid;
  v_review_status text;
begin
  -- An account already erased has nothing left to erase. A still-valid
  -- access token of that account calling delete_own_guardian_account again
  -- is refused here, so it can write no second audit event or record.
  if exists (select 1 from public.erased_accounts where profile_id = v_uid) then
    raise exception using errcode = 'EMERA', message = 'account_erased';
  end if;
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
  update public.orders set approved_by = null where approved_by = v_uid;
  update public.team_invites set created_by = null where created_by = v_uid;
  update public.team_invites set used_by = null where used_by = v_uid;
  update public.squad_invite_audit_events set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_link_audit_events set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_notification_outbox set recipient_profile_id = null where recipient_profile_id = v_uid;
  update public.squad_invite_participations set guardian_profile_id = null where guardian_profile_id = v_uid;
  update public.squad_invite_permissions set actor_profile_id = null where actor_profile_id = v_uid;
  update public.squad_invite_request_audit_events set actor_profile_id = null where actor_profile_id = v_uid;

  -- 0097: a staff review of this deletion, if one is open, is now complete
  -- (p_completed_by is the staff member, or NULL for a self-service request
  -- made again once nothing blocked it).
  -- A self-service erasure of an account that has a review record (pending,
  -- rejected, or resolved earlier) is its own append-only audit event; the
  -- review keeps its historical status (a rejected review stays rejected),
  -- and erased_accounts is the authoritative current state.
  select status, id into v_review_status, v_review_id
    from public.pending_profile_deletions where auth_user_id = v_uid;
  update public.pending_profile_deletions
     set status = 'resolved', resolved_by = p_completed_by, resolved_at = now()
   where auth_user_id = v_uid and status = 'pending';

  -- 0097: from now on no profile can be created again for this account and
  -- the app refuses its sessions (section 9).
  insert into public.erased_accounts (profile_id, completed_by, pending_deletion_id)
  values (v_uid, p_completed_by, v_review_id)
  on conflict (profile_id) do nothing;

  if p_completed_by is null and v_review_id is not null then
    insert into public.account_deletion_staff_actions (pending_deletion_id, profile_id, actor_profile_id, action, reason, outcome)
    values (v_review_id, v_uid, v_uid, 'self_deleted',
            'The account deleted itself through the app once nothing blocked the deletion',
            case v_review_status when 'pending' then 'erased_while_review_pending'
                                 when 'rejected' then 'erased_after_rejection'
                                 else 'erased_after_resolved_review' end);
  end if;

  -- 0097: the email was needed only before the erasure (it was copied above
  -- onto any child deletion request filed for a sole-guardian child, as
  -- 0076 does). The review record keeps no plaintext email for an erased
  -- account: only its id, the erased account's uuid, timestamps, the staff
  -- actor, reason, outcome and the append-only audit remain.
  update public.pending_profile_deletions set email = null
   where auth_user_id = v_uid and email is not null;

  -- The profiles delete trigger (section 7) marks this account's
  -- verifications and cancellations as the row goes.
  delete from public.profiles where id = v_uid;

  return jsonb_build_object(
    'playersUnlinked', to_jsonb(v_players_unlinked),
    'playersDeletionRequested', to_jsonb(v_players_deletion_requested)
  );
end;
$$;

revoke all on function public.erase_account_for_deletion(uuid, text, uuid) from public, anon, authenticated, service_role;
alter function public.erase_account_for_deletion(uuid, text, uuid) owner to postgres;

-- ---------------------------------------------------------------------------
-- 4c and 6. delete_own_guardian_account: decide first, then either record
--    the request for staff review (nothing else changes) or erase the account
-- ---------------------------------------------------------------------------
create or replace function public.delete_own_guardian_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_email text;
  v_blocking_reason text;
  v_review_opened_at timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- 0097: hold this account's profile row until the call ends, so a staff
  -- completion of the same account waits (and then finds nothing to do).
  perform 1 from public.profiles where id = v_uid for update;

  select email into v_email from auth.users where id = v_uid;

  -- 0097: decide before changing anything. The blocker tables are not
  -- touched by the clean-up, so deciding first gives the same answer 0076
  -- gave after it.
  v_blocking_reason := public.account_deletion_blocking_reason(v_uid);

  if v_blocking_reason is not null then
    -- 0097: staff review. Only the request is recorded. Parent links, child
    -- deletion requests, cards, moments (uploaded_by and verified_by),
    -- invites and every other reference stay exactly as they are: the
    -- account still exists, and staff may reject the deletion. The clean-up
    -- runs once, if and when staff complete it
    -- (complete_pending_profile_deletion).
    insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason)
    values (v_uid, v_email, v_blocking_reason)
    -- A request after a resolved one (resolved by hand before 0097) is
    -- pending again, as a new review round: first_detected_at becomes the
    -- time this round began, and stays unchanged while it is pending, so
    -- staff are notified once per round.
    on conflict (auth_user_id) do update
      set blocking_reason = excluded.blocking_reason, status = 'pending',
          resolved_by = null, resolved_at = null,
          first_detected_at = case when public.pending_profile_deletions.status = 'pending'
                                   then public.pending_profile_deletions.first_detected_at else now() end
    returning first_detected_at into v_review_opened_at;
    return jsonb_build_object(
      'playersUnlinked', '[]'::jsonb,
      'playersDeletionRequested', '[]'::jsonb,
      'canDeleteIdentity', false,
      'reviewOpenedAt', v_review_opened_at
    );
  end if;

  return public.erase_account_for_deletion(v_uid, v_email, null)
    || jsonb_build_object('canDeleteIdentity', true);
end;
$$;

revoke all on function public.delete_own_guardian_account() from public, anon;
grant execute on function public.delete_own_guardian_account() to authenticated;

alter function public.delete_own_guardian_account() owner to postgres;

-- ---------------------------------------------------------------------------
-- 8. Staff: complete a reviewed account deletion
-- ---------------------------------------------------------------------------
-- The explicit final step for a deletion that went to staff review. Called
-- in a signed-in staff session (auth.uid() is the staff member), as the 0076
-- child-erasure staff functions are: the card lockdown in the erasure
-- attributes each card suspension to auth.uid(). Order:
--   - staff only, with a reason;
--   - locks the account, then its request (the order delete_own_guardian_
--     account uses: it locks the account first too), so a repeated or
--     concurrent completion, or a self-service request racing it, waits and
--     then reports already_completed or finds nothing to do;
--   - a request marked resolved while the account still exists (resolved by
--     hand before 0097) is refused rather than reported as completed;
--   - only a 'pending' request; refuses a staff account and the caller's
--     own account; a request whose account was already deleted another way
--     is closed (account_already_deleted) with nothing to erase;
--   - refuses, changing nothing, while anything still blocks the deletion
--     (staff resolve those records first);
--   - runs the erasure exactly once (section 4b), which resolves the request
--     with this staff member as resolved_by and deletes the profile;
--   - records in pending_auth_deletions (0043) that the sign-in identity
--     still needs deleting; the staff route then bans and deletes it (and
--     retries idempotently), and the erased_accounts record (section 9)
--     shuts the account out meanwhile;
--   - audits the decision once (account_deletion_staff_actions); a repeat
--     writes nothing. Every result carries profileId for the staff route.
-- The tables used here are created in section 9 (later in this file); the
-- function body is only resolved when it runs.
create function public.complete_pending_profile_deletion(p_pending_deletion_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := auth.uid();
  v_uid uuid;
  v_pending public.pending_profile_deletions%rowtype;
  v_blocking_reason text;
  v_result jsonb;
begin
  if v_staff is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.staff_accounts where profile_id = v_staff) then
    raise exception 'Not authorized: staff only';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason (up to 500 characters) is required';
  end if;

  select auth_user_id into v_uid from public.pending_profile_deletions where id = p_pending_deletion_id;
  if v_uid is null then
    raise exception 'Pending profile deletion not found';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  select * into v_pending from public.pending_profile_deletions where id = p_pending_deletion_id for update;

  if v_pending.status = 'resolved' then
    if exists (select 1 from public.profiles where id = v_uid) then
      raise exception 'This profile deletion is marked resolved but a profile with this id exists (resolved by hand, or the login signed in again after completion); nothing was changed';
    end if;
    return jsonb_build_object('status', 'already_completed', 'profileId', v_uid);
  end if;
  if v_pending.status <> 'pending' then
    raise exception 'Only a pending profile deletion can be completed (it is %)', v_pending.status;
  end if;
  if v_uid = v_staff or exists (select 1 from public.staff_accounts where profile_id = v_uid) then
    raise exception 'Staff accounts are removed by the manual staff procedure, not here';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    -- Already deleted another way (before 0097, by removing the login): there
    -- is nothing left to erase, so the request is closed, not left pending.
    -- The email is cleared here too: the account is gone.
    update public.pending_profile_deletions
       set status = 'resolved', resolved_by = v_staff, resolved_at = now(), email = null,
           notes = concat_ws(E'\n', notes, 'Closed by staff (account already deleted): ' || btrim(p_reason))
     where id = p_pending_deletion_id;
    -- If the sign-in identity is still there, staff still need to remove it.
    -- The retry record never carries the email (the auth user id is enough).
    if exists (select 1 from auth.users where id = v_uid) then
      insert into public.pending_auth_deletions (auth_user_id, email, last_error)
      values (v_uid, null, 'Reviewed account deletion closed by staff (profile already gone); the sign-in identity still needs deleting')
      on conflict (auth_user_id) do update set email = null;
    end if;
    -- Recorded as erased too: a sign-in that survived cannot recreate a profile.
    insert into public.erased_accounts (profile_id, completed_by, pending_deletion_id)
    values (v_uid, v_staff, p_pending_deletion_id)
    on conflict (profile_id) do nothing;
    insert into public.account_deletion_staff_actions (pending_deletion_id, profile_id, actor_profile_id, action, reason, outcome)
    values (p_pending_deletion_id, v_uid, v_staff, 'complete', btrim(p_reason), 'account_already_deleted');
    return jsonb_build_object('status', 'account_already_deleted', 'profileId', v_uid);
  end if;
  v_blocking_reason := public.account_deletion_blocking_reason(v_uid);
  if v_blocking_reason is not null then
    raise exception 'The account still has records that block deletion (%); resolve them first', v_blocking_reason;
  end if;

  update public.pending_profile_deletions
     set notes = concat_ws(E'\n', notes, 'Completed by staff: ' || btrim(p_reason))
   where id = p_pending_deletion_id;

  v_result := public.erase_account_for_deletion(v_uid, v_pending.email, v_staff);

  -- The retry record never carries the email (the auth user id is enough);
  -- an older record for the same account loses any email it had.
  insert into public.pending_auth_deletions (auth_user_id, email, last_error)
  values (v_uid, null, 'Reviewed account deletion completed by staff; the sign-in identity still needs deleting')
  on conflict (auth_user_id) do update
    set email = null,
        notes = concat_ws(E'\n', public.pending_auth_deletions.notes,
                  'Earlier record: status ' || public.pending_auth_deletions.status
                  || coalesce(', resolved at ' || public.pending_auth_deletions.resolved_at::text, '')
                  || coalesce(' by ' || public.pending_auth_deletions.resolved_by::text, '')),
        status = 'pending', resolved_by = null, resolved_at = null, last_attempted_at = now(),
        attempts = public.pending_auth_deletions.attempts + 1, last_error = excluded.last_error;

  insert into public.account_deletion_staff_actions (pending_deletion_id, profile_id, actor_profile_id, action, reason, outcome)
  values (p_pending_deletion_id, v_uid, v_staff, 'complete', btrim(p_reason), 'completed');

  return v_result || jsonb_build_object('status', 'completed', 'profileId', v_uid);
end;
$$;

revoke all on function public.complete_pending_profile_deletion(uuid, text) from public, anon, service_role;
grant execute on function public.complete_pending_profile_deletion(uuid, text) to authenticated;
alter function public.complete_pending_profile_deletion(uuid, text) owner to postgres;

-- ---------------------------------------------------------------------------
-- 7. Every profile delete: refuse one that would skip the erasure, and mark
--    attribution for one that goes ahead
-- ---------------------------------------------------------------------------
-- Removing the login account (auth.users) deletes the profile by ON DELETE
-- CASCADE, which never runs the clean-up: the cascade would drop the
-- account's guardians rows without filing a child deletion request or
-- locking a card. So a profile delete is refused while the account still
-- has a guardians row, or while its deletion is pending staff review; the
-- erasure (section 4b) removes both before it deletes the profile. (Every
-- other reference the clean-up clears is NO ACTION or RESTRICT, so a
-- cascade that skipped it fails on its own.)
-- When the delete goes ahead, the moments this account verified keep their
-- status and verified_at, lose verified_by and gain
-- verifier_account_deleted_at; its cancellations keep their status and
-- cancelled_at, lose cancelled_by and gain cancelled_by_account_deleted_at.
-- This is the one place either marker is written.
create function public.guard_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if exists (select 1 from public.guardians where profile_id = old.id) then
    raise exception 'Profile deletion refused: the account still has parent links; delete it through account deletion or complete_pending_profile_deletion, which run the child-data clean-up first';
  end if;
  if exists (select 1 from public.pending_profile_deletions where auth_user_id = old.id and status = 'pending') then
    raise exception 'Profile deletion refused: the account deletion is under staff review; complete it with complete_pending_profile_deletion';
  end if;
  update public.moments
     set verified_by = null, verifier_account_deleted_at = now()
   where verified_by = old.id;
  update public.player_deletion_requests
     set cancelled_by = null, cancelled_by_account_deleted_at = now()
   where cancelled_by = old.id and status = 'cancelled';
  update public.squad_invite_participation_deletion_requests
     set cancelled_by = null, cancelled_by_account_deleted_at = now()
   where cancelled_by = old.id and status = 'cancelled';
  return old;
end;
$fn$;

revoke all on function public.guard_profile_deletion() from public, anon, authenticated, service_role;
alter function public.guard_profile_deletion() owner to postgres;

create trigger profiles_account_deletion_guard
  before delete on public.profiles
  for each row execute function public.guard_profile_deletion();

-- ---------------------------------------------------------------------------
-- 9. Erased accounts stay erased, and staff decisions are audited
-- ---------------------------------------------------------------------------
-- Deleting the Auth user (or banning it) does not invalidate an access token
-- already issued: it stays valid until it expires. So the erasure records the
-- account here, in the same transaction, and from then on:
--   - no profile can be created again for it, from any route or role
--     (profiles_refuse_erased_account), so an old session cannot recreate an
--     empty account;
--   - account_is_erased() (callable only for the caller's own uid) lets the
--     app refuse the session on every request.
-- profile_id is a plain uuid (never a foreign key): it must never block
-- anything, and once the Auth user is gone it identifies no one.
create table public.erased_accounts (
  profile_id uuid primary key,
  erased_at timestamptz not null default now(),
  completed_by uuid,
  pending_deletion_id uuid
);
comment on table public.erased_accounts is
  'Accounts erased by account deletion (0097). No profile may be created again for these ids; the app refuses their sessions. Written only by erase_account_for_deletion.';
alter table public.erased_accounts enable row level security;
revoke all on public.erased_accounts from public, anon, authenticated, service_role;
grant select on public.erased_accounts to service_role;

create function public.refuse_erased_account_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if exists (select 1 from public.erased_accounts where profile_id = new.id) then
    raise exception using errcode = 'EMERA', message = 'account_erased';
  end if;
  return new;
end;
$fn$;
revoke all on function public.refuse_erased_account_profile() from public, anon, authenticated, service_role;
alter function public.refuse_erased_account_profile() owner to postgres;

create trigger profiles_refuse_erased_account
  before insert or update of id on public.profiles
  for each row execute function public.refuse_erased_account_profile();

create function public.account_is_erased()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.erased_accounts where profile_id = auth.uid());
$$;
revoke all on function public.account_is_erased() from public, anon, service_role;
grant execute on function public.account_is_erased() to authenticated;
alter function public.account_is_erased() owner to postgres;

-- Every staff decision on a reviewed account deletion: who, which request,
-- why, and what happened. Written only by the staff functions, once per
-- decision that changed something (a repeat that changes nothing writes
-- nothing). Also one 'self_deleted' event when an account that has a review
-- record (pending, rejected or resolved) later erases itself through the app
-- (actor = the account itself; written by erase_account_for_deletion).
-- Plain uuids: history must never block a deletion. No email is stored.
create table public.account_deletion_staff_actions (
  id uuid primary key default gen_random_uuid(),
  pending_deletion_id uuid not null,
  profile_id uuid not null,
  actor_profile_id uuid not null,
  action text not null check (action in ('complete', 'reject', 'restore', 'remove_sign_in', 'self_deleted')),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  outcome text not null,
  created_at timestamptz not null default now()
);
comment on table public.account_deletion_staff_actions is
  'Audit of reviewed account deletions (0097/0098): staff decisions (actor, request, reason, outcome) and an account''s own later self-deletion (self_deleted). Written only by the deletion functions; service_role may read.';
alter table public.account_deletion_staff_actions enable row level security;
revoke all on public.account_deletion_staff_actions from public, anon, authenticated, service_role;
grant select on public.account_deletion_staff_actions to service_role;

-- Both tables are append-only for every role, the owner included (the
-- relationship_audit_events pattern, 0088): an erased account cannot be let
-- back in by deleting its record, and the audit cannot be rewritten.
create function public.reject_account_deletion_record_change()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception '% is append-only', tg_table_name;
end;
$fn$;
alter function public.reject_account_deletion_record_change() owner to postgres;
revoke all on function public.reject_account_deletion_record_change() from public, anon, authenticated, service_role;
create trigger erased_accounts_append_only before update or delete on public.erased_accounts
  for each row execute function public.reject_account_deletion_record_change();
create trigger erased_accounts_no_truncate before truncate on public.erased_accounts
  for each statement execute function public.reject_account_deletion_record_change();
create trigger account_deletion_staff_actions_append_only before update or delete on public.account_deletion_staff_actions
  for each row execute function public.reject_account_deletion_record_change();
create trigger account_deletion_staff_actions_no_truncate before truncate on public.account_deletion_staff_actions
  for each statement execute function public.reject_account_deletion_record_change();

-- The staff route records the outcome of removing a completed account's
-- sign-in (each attempt, including retries) here, as the signed-in staff
-- member. Only for a request that was completed and erased.
create function public.record_account_sign_in_removal(p_pending_deletion_id uuid, p_reason text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := auth.uid();
  v_uid uuid;
begin
  if v_staff is null or not exists (select 1 from public.staff_accounts where profile_id = v_staff) then
    raise exception 'Not authorized: staff only';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason (up to 500 characters) is required';
  end if;
  if p_outcome is null or p_outcome not in ('removed', 'removal_pending') then
    raise exception 'Unknown sign-in removal outcome';
  end if;
  select d.auth_user_id into v_uid
    from public.pending_profile_deletions d
   where d.id = p_pending_deletion_id and d.status = 'resolved'
     and exists (select 1 from public.erased_accounts e where e.profile_id = d.auth_user_id);
  if v_uid is null then
    raise exception 'This request is not a completed account deletion';
  end if;
  insert into public.account_deletion_staff_actions (pending_deletion_id, profile_id, actor_profile_id, action, reason, outcome)
  values (p_pending_deletion_id, v_uid, v_staff, 'remove_sign_in', btrim(p_reason), p_outcome);
end;
$$;
revoke all on function public.record_account_sign_in_removal(uuid, text, text) from public, anon, service_role;
grant execute on function public.record_account_sign_in_removal(uuid, text, text) to authenticated;
alter function public.record_account_sign_in_removal(uuid, text, text) owner to postgres;

commit;
