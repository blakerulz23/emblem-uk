-- Account-deletion safeguards: suspend coach access during staff review,
-- keep staff accounts out of self-service deletion, and stop anyone naming
-- another person as a moment's verifier.
--
-- 1. Suspension during staff review. When delete_own_guardian_account
--    cannot finish (coach-authored records, Squad Invite history) it keeps
--    the profile and files pending_profile_deletions for staff. Until now
--    the coach's coach_team assignments and direct coach_players links
--    stayed live, so signing in again still gave full coach access. From
--    0098 the same call, in the same transaction:
--      - ends every not-yet-ended coach_team row (ended_at = now(),
--        ended_by = the account, end_reason = 'account_deletion_review'),
--        the ended-assignment state end_coach_assignment produces, so
--        coach_assignment_is_active is false everywhere;
--      - deletes every coach_players link, as remove_direct_coach_link does;
--      - snapshots exactly what it ended or removed in the new table
--        deletion_review_access_suspensions, keyed to the
--        pending_profile_deletions row;
--      - attributes all of it in relationship_audit_events through the
--        existing trigger (actor_source trusted_function, operation and
--        reason 'account_deletion_review').
--    Staff decide a request explicitly:
--      - reject_pending_profile_deletion(id, staff, reason): pending ->
--        rejected, recording who, when and why (new status and column).
--      - restore_coach_access_after_deletion_rejection(id, staff, reason):
--        only for a rejected request; restores exactly the snapshotted
--        assignments and links that are still restorable (team, player and
--        account still exist; the assignment is still the one this
--        suspension ended; no link exists already); records the staff
--        member, the reason and the outcome per row; audited; repeat calls
--        change nothing. Restoration is never automatic.
--    A later deletion request from the same account reopens the same
--    pending_profile_deletions row as pending and suspends again.
-- 2. Staff accounts: delete_own_guardian_account refuses, changing nothing,
--    for any account in staff_accounts. Staff removal stays manual.
-- 3. Verifier identity: two RESTRICTIVE policies on moments for
--    authenticated. An insert may set verified_by only to the caller. An
--    update that changes verified_by may set it only to NULL, or to the
--    caller when the moment had no verifier and the caller is an active
--    coach of the player (team assignment or direct link): nobody can name
--    someone else, and nobody can take over another coach's verification. Updates that leave verified_by unchanged
--    (a guardian changing visibility) are unaffected. Security-definer
--    functions and service_role are unaffected.
-- 4. No new coach access while a deletion is under review: while the
--    account's pending_profile_deletions row is 'pending', coach-invite and
--    team-invite redemption return 'account_deletion_review_pending' without
--    using the invite, staff approval of its team request and a new team
--    request are refused, and triggers on coach_team / coach_players refuse
--    any new or reactivated assignment or link for it from any function or
--    role (SQLSTATE EMDRP, message 'account_deletion_review_pending'). Once
--    staff reject the deletion everything works as before, including the
--    restore. Reviews pending before 0098 are not suspended retroactively;
--    see supabase/verification/0098_precheck_pending_deletion_reviews.sql.
--
--   0. Precondition: refuses, changing nothing, unless the exact 0097 state
--      is in place and 0098 has not been applied.
--
-- Rollback: supabase/rollback/0098_rollback.sql (emergency only; refuses
-- once any suspension or rejection has been recorded).

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
  if to_regclass('public.deletion_review_access_suspensions') is not null then
    raise exception '0098 refused: deletion_review_access_suspensions already exists (0098 already applied)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'moments' and column_name = 'verifier_account_deleted_at') then
    v_problems := v_problems || 'moments.verifier_account_deleted_at is missing (0097 not applied)'::text;
  end if;
  select p.prosrc into v_body from pg_proc p where p.oid = to_regprocedure('public.delete_own_guardian_account()');
  if v_body is null
     or v_body not like '%set verified_by = null, verifier_account_deleted_at = now()%'
     or v_body not like '%set cancelled_by = null, cancelled_by_account_deleted_at = now()%'
     or v_body not like '%on conflict (auth_user_id) do update set blocking_reason = excluded.blocking_reason;%'
     or v_body like '%account_deletion_review%' then
    v_problems := v_problems || 'public.delete_own_guardian_account() is not the 0097 definition'::text;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.pending_profile_deletions'::regclass and conname = 'pending_profile_deletions_status_check';
  if v_def is distinct from 'CHECK ((status = ANY (ARRAY[''pending''::text, ''resolved''::text])))' then
    v_problems := v_problems || ('pending_profile_deletions_status_check is not the 0076 rule: ' || coalesce(v_def, 'missing'));
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pending_profile_deletions' and column_name = 'rejection_reason') then
    v_problems := v_problems || 'pending_profile_deletions.rejection_reason already exists'::text;
  end if;
  if to_regclass('public.staff_accounts') is null or to_regclass('public.relationship_audit_events') is null then
    v_problems := v_problems || 'staff_accounts or relationship_audit_events is missing'::text;
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'relationship_audit' and tgrelid = 'public.coach_team'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'relationship_audit' and tgrelid = 'public.coach_players'::regclass) then
    v_problems := v_problems || 'the relationship_audit triggers on coach_team / coach_players are missing'::text;
  end if;
  if to_regprocedure('public.restore_coach_access_after_deletion_rejection(uuid, uuid, text)') is not null
     or to_regprocedure('public.reject_pending_profile_deletion(uuid, uuid, text)') is not null
     or to_regprocedure('public.moment_verifier_unchanged(uuid, uuid)') is not null then
    v_problems := v_problems || 'a 0098 function already exists'::text;
  end if;
  if to_regprocedure('public.profile_has_pending_deletion_review(uuid)') is not null
     or to_regprocedure('public.refuse_coach_access_during_deletion_review()') is not null
     or exists (select 1 from pg_trigger where tgname = 'deletion_review_access_guard') then
    v_problems := v_problems || 'a 0098 access guard already exists'::text;
  end if;
  if to_regprocedure('public.redeem_coach_invite(text, uuid, text)') is null
     or to_regprocedure('public.redeem_team_invite(text, uuid, text)') is null
     or to_regprocedure('public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid)') is null
     or to_regclass('public.coach_team_requests') is null
     or exists (select 1 from pg_proc p where p.oid in (
                  to_regprocedure('public.redeem_coach_invite(text, uuid, text)'),
                  to_regprocedure('public.redeem_team_invite(text, uuid, text)'),
                  to_regprocedure('public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid)'))
                and p.prosrc like '%account_deletion_review_pending%') then
    v_problems := v_problems || 'the redeem / approve functions are not in their 0088 state'::text;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'moments'
             and policyname in ('moments: a signed-in user can only name themselves as verifier',
                                'moments: a verifier change can only name the caller as coach')) then
    v_problems := v_problems || 'a 0098 moments policy already exists'::text;
  end if;
  if array_length(v_problems, 1) > 0 then
    raise exception '0098 refused: the expected 0097 state is not in place: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1a. Staff decisions on a pending profile deletion
-- ---------------------------------------------------------------------------
-- resolved_by/resolved_at record who decided and when, for 'rejected' as for
-- 'resolved'. The rule does not require resolved_by: it references profiles
-- ON DELETE SET NULL, and a rule on it would block removing that staff
-- profile later (the defect class 0097 fixed). The deciding functions
-- require a staff actor instead.
alter table public.pending_profile_deletions add column rejection_reason text;

alter table public.pending_profile_deletions drop constraint pending_profile_deletions_status_check;
alter table public.pending_profile_deletions add constraint pending_profile_deletions_status_check
  check (status in ('pending', 'resolved', 'rejected'));
alter table public.pending_profile_deletions add constraint pending_profile_deletions_rejection_check
  check (
    (status = 'rejected' and resolved_at is not null and rejection_reason is not null
      and char_length(btrim(rejection_reason)) between 1 and 500)
    or (status <> 'rejected' and rejection_reason is null)
  );

-- ---------------------------------------------------------------------------
-- 1b. What a staff review suspended, and what became of it
-- ---------------------------------------------------------------------------
-- profile_id, team_id, player_id and resolved_by are plain uuids, not
-- foreign keys: this is history, and it must never block deleting the
-- account, team, player or staff profile it mentions.
create table public.deletion_review_access_suspensions (
  id uuid primary key default gen_random_uuid(),
  pending_deletion_id uuid not null references public.pending_profile_deletions (id) on delete restrict,
  profile_id uuid not null,
  relationship text not null check (relationship in ('coach_team', 'coach_players')),
  team_id uuid,
  player_id uuid,
  original_row jsonb not null,
  suspended_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('restored', 'not_restorable', 'superseded')),
  resolved_by uuid,
  resolution_reason text,
  resolution_note text,
  constraint deletion_review_access_suspensions_target_check check (
    (relationship = 'coach_team' and team_id is not null and player_id is null)
    or (relationship = 'coach_players' and player_id is not null and team_id is null)
  ),
  constraint deletion_review_access_suspensions_resolved_state_check check (
    (resolved_at is null and resolution is null and resolved_by is null and resolution_reason is null and resolution_note is null)
    or (resolved_at is not null and resolution = 'superseded')
    or (resolved_at is not null and resolution in ('restored', 'not_restorable') and resolved_by is not null
        and resolution_reason is not null and char_length(btrim(resolution_reason)) between 1 and 500)
  )
);

comment on table public.deletion_review_access_suspensions is
  'One row per coach_team assignment ended / coach_players link removed when an account deletion went to staff review (0098). Restored only by restore_coach_access_after_deletion_rejection after staff reject the deletion. No app role writes it directly.';

-- At most one open suspension per relationship.
create unique index deletion_review_access_suspensions_open_key
  on public.deletion_review_access_suspensions (profile_id, relationship, coalesce(team_id, player_id))
  where resolved_at is null;
create index deletion_review_access_suspensions_pending_idx
  on public.deletion_review_access_suspensions (pending_deletion_id);

alter table public.deletion_review_access_suspensions enable row level security;
revoke all on public.deletion_review_access_suspensions from public, anon, authenticated, service_role;
grant select on public.deletion_review_access_suspensions to service_role;

-- ---------------------------------------------------------------------------
-- 1c. Staff: reject a pending profile deletion
-- ---------------------------------------------------------------------------
create function public.reject_pending_profile_deletion(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_staff_profile_id is null or not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    raise exception 'Not authorized: staff only';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason (up to 500 characters) is required';
  end if;
  select status into v_status from public.pending_profile_deletions where id = p_pending_deletion_id for update;
  if v_status is null then
    raise exception 'Pending profile deletion not found';
  end if;
  if v_status = 'rejected' then
    return 'already_rejected';
  end if;
  if v_status <> 'pending' then
    raise exception 'This profile deletion is already %', v_status;
  end if;
  update public.pending_profile_deletions
     set status = 'rejected', resolved_by = p_staff_profile_id, resolved_at = now(), rejection_reason = btrim(p_reason)
   where id = p_pending_deletion_id;
  return 'rejected';
end;
$$;
alter function public.reject_pending_profile_deletion(uuid, uuid, text) owner to postgres;
revoke all on function public.reject_pending_profile_deletion(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_pending_profile_deletion(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 1d. Staff: restore suspended coach access after a rejected deletion
-- ---------------------------------------------------------------------------
create function public.restore_coach_access_after_deletion_rejection(p_pending_deletion_id uuid, p_staff_profile_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending public.pending_profile_deletions%rowtype;
  v_s public.deletion_review_access_suspensions%rowtype;
  v_ct public.coach_team%rowtype;
  v_outcome text;
  v_note text;
  v_restored int := 0;
  v_not_restorable int := 0;
  v_open int := 0;
  v_created_by uuid;
begin
  if p_staff_profile_id is null or not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    raise exception 'Not authorized: staff only';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason (up to 500 characters) is required';
  end if;
  select * into v_pending from public.pending_profile_deletions where id = p_pending_deletion_id for update;
  if v_pending.id is null then
    raise exception 'Pending profile deletion not found';
  end if;
  if v_pending.status <> 'rejected' then
    raise exception 'Coach access can be restored only after the deletion is rejected (it is %)', v_pending.status;
  end if;
  if not exists (select 1 from public.profiles where id = v_pending.auth_user_id) then
    raise exception 'The account no longer exists';
  end if;

  perform set_config('emblem.trusted_operation', 'restore_coach_access_after_deletion_rejection', true);
  perform set_config('emblem.actor_profile_id', p_staff_profile_id::text, true);
  perform set_config('emblem.trusted_reason', btrim(p_reason), true);

  for v_s in
    select * from public.deletion_review_access_suspensions
    where pending_deletion_id = p_pending_deletion_id and resolved_at is null
    order by suspended_at, id
    for update
  loop
    v_open := v_open + 1;
    v_outcome := 'not_restorable';
    v_note := null;
    if v_s.relationship = 'coach_team' then
      select * into v_ct from public.coach_team where team_id = v_s.team_id and profile_id = v_s.profile_id for update;
      if not exists (select 1 from public.teams where id = v_s.team_id) then
        v_note := 'team no longer exists';
      elsif v_ct.team_id is null then
        v_note := 'assignment no longer exists';
      elsif v_ct.ended_at is null then
        v_note := 'assignment is already active';
      elsif v_ct.end_reason is distinct from 'account_deletion_review' then
        v_note := 'assignment was ended again for another reason';
      else
        update public.coach_team
           set ended_at = (v_s.original_row ->> 'ended_at')::timestamptz,
               ended_by = (v_s.original_row ->> 'ended_by')::uuid,
               end_reason = v_s.original_row ->> 'end_reason'
         where team_id = v_s.team_id and profile_id = v_s.profile_id;
        v_outcome := 'restored';
      end if;
    else
      if not exists (select 1 from public.players where id = v_s.player_id) then
        v_note := 'player no longer exists';
      elsif exists (select 1 from public.coach_players where player_id = v_s.player_id and profile_id = v_s.profile_id) then
        v_note := 'link already exists';
      else
        v_created_by := (v_s.original_row ->> 'created_by')::uuid;
        if v_created_by is not null and not exists (select 1 from public.profiles where id = v_created_by) then
          v_created_by := null;
        end if;
        insert into public.coach_players (player_id, profile_id, connected_at, created_via, created_by)
        values (v_s.player_id, v_s.profile_id, (v_s.original_row ->> 'connected_at')::timestamptz,
                v_s.original_row ->> 'created_via', v_created_by);
        v_outcome := 'restored';
      end if;
    end if;
    update public.deletion_review_access_suspensions
       set resolved_at = now(), resolution = v_outcome, resolved_by = p_staff_profile_id,
           resolution_reason = btrim(p_reason), resolution_note = v_note
     where id = v_s.id;
    if v_outcome = 'restored' then
      v_restored := v_restored + 1;
    else
      v_not_restorable := v_not_restorable + 1;
    end if;
  end loop;

  perform set_config('emblem.trusted_operation', '', true);
  perform set_config('emblem.actor_profile_id', '', true);
  perform set_config('emblem.trusted_reason', '', true);

  return jsonb_build_object('restored', v_restored, 'notRestorable', v_not_restorable, 'nothingToRestore', v_open = 0);
end;
$$;
alter function public.restore_coach_access_after_deletion_rejection(uuid, uuid, text) owner to postgres;
revoke all on function public.restore_coach_access_after_deletion_rejection(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.restore_coach_access_after_deletion_rejection(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Verifier identity
-- ---------------------------------------------------------------------------
-- True when moment p_moment_id currently has verified_by p_verified_by. Run
-- inside an UPDATE's WITH CHECK it reads the row as it was before the
-- statement (a STABLE function uses the statement's snapshot), so it tells
-- an unchanged verifier from a changed one. SECURITY INVOKER: it reads
-- moments under the caller's own RLS, so it reveals nothing the caller
-- cannot already see.
create function public.moment_verifier_unchanged(p_moment_id uuid, p_verified_by uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.moments m
    where m.id = p_moment_id and m.verified_by is not distinct from p_verified_by
  );
$$;
alter function public.moment_verifier_unchanged(uuid, uuid) owner to postgres;
revoke all on function public.moment_verifier_unchanged(uuid, uuid) from public, anon;
grant execute on function public.moment_verifier_unchanged(uuid, uuid) to authenticated;

create policy "moments: a signed-in user can only name themselves as verifier"
  on public.moments
  as restrictive
  for insert
  to authenticated
  with check (verified_by is null or verified_by = auth.uid());

create policy "moments: a verifier change can only name the caller as coach"
  on public.moments
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    public.moment_verifier_unchanged(id, verified_by)
    or verified_by is null
    or (verified_by = auth.uid() and public.moment_verifier_unchanged(id, null) and (
      exists (select 1 from public.players p join public.coach_team ct on ct.team_id = p.team_id
              where p.id = moments.player_id and ct.profile_id = auth.uid()
                and public.coach_assignment_is_active(ct.ended_at, ct.expires_at))
      or exists (select 1 from public.coach_players cp
                 where cp.player_id = moments.player_id and cp.profile_id = auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- 1e and 2. delete_own_guardian_account: the 0097 body with the staff
--    refusal and the staff-review suspension added (marked "0098" below)
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
  v_player_ids uuid[];
  v_player_id uuid;
  v_other_guardians_count int;
  v_players_unlinked uuid[] := '{}';
  v_players_deletion_requested uuid[] := '{}';
  v_request_id uuid;
  v_blocked boolean;
  v_blocking_reason text;
  v_pending_id uuid;
  v_row record;
  v_suspended int := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- 0098: staff accounts are never removed here; staff removal is a manual,
  -- two-person procedure. Refuses before any change.
  if exists (select 1 from public.staff_accounts where profile_id = v_uid) then
    raise exception 'Staff accounts cannot be deleted from the app';
  end if;

  -- 0098: hold this account's profile row until the call ends, so a coach
  -- grant racing this call either commits first (and is suspended below)
  -- or waits and then sees the pending review (section 4).
  perform 1 from public.profiles where id = v_uid for update;

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
    -- 0098: a new request after a rejected (or resolved) one is pending again.
    insert into public.pending_profile_deletions (auth_user_id, email, blocking_reason)
    values (v_uid, v_email, v_blocking_reason)
    on conflict (auth_user_id) do update
      set blocking_reason = excluded.blocking_reason, status = 'pending',
          resolved_by = null, resolved_at = null, rejection_reason = null
    returning id into v_pending_id;

    -- 0098: suspend coach access while staff review the deletion. Ends every
    -- not-yet-ended assignment and removes every direct link, snapshotting
    -- each first; the relationship_audit trigger records each change as
    -- trusted_function 'account_deletion_review'. A still-open suspension
    -- of the same relationship from an earlier request is superseded.
    perform set_config('emblem.trusted_operation', 'account_deletion_review', true);
    perform set_config('emblem.actor_profile_id', v_uid::text, true);
    perform set_config('emblem.trusted_reason', 'account_deletion_review', true);
    for v_row in
      select * from public.coach_team where profile_id = v_uid and ended_at is null order by team_id for update
    loop
      update public.deletion_review_access_suspensions
         set resolved_at = now(), resolution = 'superseded', resolution_note = 'suspended again by a later deletion request'
       where profile_id = v_uid and relationship = 'coach_team' and team_id = v_row.team_id and resolved_at is null;
      insert into public.deletion_review_access_suspensions (pending_deletion_id, profile_id, relationship, team_id, original_row)
      values (v_pending_id, v_uid, 'coach_team', v_row.team_id, to_jsonb(v_row));
      update public.coach_team
         set ended_at = now(), ended_by = v_uid, end_reason = 'account_deletion_review'
       where team_id = v_row.team_id and profile_id = v_uid;
      v_suspended := v_suspended + 1;
    end loop;
    for v_row in
      select * from public.coach_players where profile_id = v_uid order by player_id for update
    loop
      update public.deletion_review_access_suspensions
         set resolved_at = now(), resolution = 'superseded', resolution_note = 'suspended again by a later deletion request'
       where profile_id = v_uid and relationship = 'coach_players' and player_id = v_row.player_id and resolved_at is null;
      insert into public.deletion_review_access_suspensions (pending_deletion_id, profile_id, relationship, player_id, original_row)
      values (v_pending_id, v_uid, 'coach_players', v_row.player_id, to_jsonb(v_row));
      delete from public.coach_players where player_id = v_row.player_id and profile_id = v_uid;
      v_suspended := v_suspended + 1;
    end loop;
    perform set_config('emblem.trusted_operation', '', true);
    perform set_config('emblem.actor_profile_id', '', true);
    perform set_config('emblem.trusted_reason', '', true);
  else
    delete from public.profiles where id = v_uid;
  end if;

  return jsonb_build_object(
    'playersUnlinked', to_jsonb(v_players_unlinked),
    'playersDeletionRequested', to_jsonb(v_players_deletion_requested),
    'canDeleteIdentity', not v_blocked,
    'coachAccessSuspended', v_suspended
  );
end;
$$;

revoke all on function public.delete_own_guardian_account() from public, anon;
grant execute on function public.delete_own_guardian_account() to authenticated;


alter function public.delete_own_guardian_account() owner to postgres;

-- ---------------------------------------------------------------------------
-- 4. No new coach access while a deletion is under staff review
-- ---------------------------------------------------------------------------
-- Section 1e ends access when a deletion goes to staff review; this keeps
-- it ended until staff decide. While the account has a
-- pending_profile_deletions row with status 'pending':
--   - redeem_coach_invite and redeem_team_invite return the new status
--     'account_deletion_review_pending' before the invite is read or used;
--   - approve_coach_team_request refuses before the request changes;
--   - a new coach_team_requests row for the account is refused: a request
--     staff could not approve would only wait in the queue;
--   - underneath every function and role (service_role and the table owner
--     included), triggers refuse any coach_team insert for the account, an
--     update that makes an assignment active again (or moves an active one
--     to the account), and a coach_players insert (or re-keying) for it.
-- Every refusal that raises uses SQLSTATE EMDRP, message
-- 'account_deletion_review_pending'. Ending an assignment, removing a link
-- and the 1e suspension writes are never refused. Once staff reject (or
-- resolve) the request it is no longer 'pending', nothing here applies, and
-- restore_coach_access_after_deletion_rejection and the normal invite and
-- request routes work again.
-- A grant racing a deletion: delete_own_guardian_account locks the account's
-- profiles row FOR UPDATE first, and each guard takes FOR KEY SHARE on it
-- before checking, so the grant either commits first (and 1e then suspends
-- it) or waits and then sees the pending review.
-- Reviews already pending before 0098 are blocked from new access here, but
-- the access they already hold is not suspended retroactively; staff do
-- that before applying 0098 (see supabase/verification/0098_precheck_pending_deletion_reviews.sql).

-- True while the account's deletion awaits staff review. Owner-only: the
-- guards below and the 0098 functions are its only callers.
create function public.profile_has_pending_deletion_review(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pending_profile_deletions
    where auth_user_id = p_profile_id and status = 'pending'
  );
$$;
alter function public.profile_has_pending_deletion_review(uuid) owner to postgres;
revoke all on function public.profile_has_pending_deletion_review(uuid) from public, anon, authenticated, service_role;
comment on function public.profile_has_pending_deletion_review(uuid) is
  'True while the account has a pending_profile_deletions row with status pending (0098). While true no coach access may be granted to it.';

create function public.refuse_coach_access_during_deletion_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_grants boolean;
begin
  if tg_table_name = 'coach_team' then
    v_profile_id := new.profile_id;
    if tg_op = 'INSERT' then
      v_grants := true;
    else
      -- Active afterwards, and not the same active assignment as before.
      v_grants := public.coach_assignment_is_active(new.ended_at, new.expires_at)
        and (not public.coach_assignment_is_active(old.ended_at, old.expires_at)
             or new.profile_id is distinct from old.profile_id
             or new.team_id is distinct from old.team_id);
    end if;
  elsif tg_table_name = 'coach_players' then
    v_profile_id := new.profile_id;
    if tg_op = 'INSERT' then
      v_grants := true;
    else
      v_grants := new.profile_id is distinct from old.profile_id
        or new.player_id is distinct from old.player_id;
    end if;
  elsif tg_table_name = 'coach_team_requests' then
    v_profile_id := new.requester_profile_id;
    v_grants := tg_op = 'INSERT';
  else
    raise exception 'refuse_coach_access_during_deletion_review: unexpected table %', tg_table_name;
  end if;

  if v_grants and v_profile_id is not null then
    -- Waits for a deletion in progress on this account (it holds FOR UPDATE).
    perform 1 from public.profiles where id = v_profile_id for key share;
    if public.profile_has_pending_deletion_review(v_profile_id) then
      raise exception using errcode = 'EMDRP', message = 'account_deletion_review_pending';
    end if;
  end if;
  return new;
end;
$$;
alter function public.refuse_coach_access_during_deletion_review() owner to postgres;
revoke all on function public.refuse_coach_access_during_deletion_review() from public, anon, authenticated, service_role;

create trigger deletion_review_access_guard
  before insert or update on public.coach_team
  for each row execute function public.refuse_coach_access_during_deletion_review();
create trigger deletion_review_access_guard
  before insert or update on public.coach_players
  for each row execute function public.refuse_coach_access_during_deletion_review();
create trigger deletion_review_access_guard
  before insert on public.coach_team_requests
  for each row execute function public.refuse_coach_access_during_deletion_review();

-- The three granting functions: their 0088 bodies, each with one early
-- refusal added (marked "0098"). Statuses of the two redeem functions gain
-- 'account_deletion_review_pending' (nothing changed, invite not used).

create or replace function public.approve_coach_team_request(
  p_request_id uuid,
  p_staff_profile_id uuid,
  p_team_id uuid default null,
  p_expires_at timestamptz default null,
  p_season_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.coach_team_requests%rowtype;
  v_club_id uuid;
  v_team_id uuid;
begin
  if p_staff_profile_id is null or not exists (select 1 from public.staff_accounts where profile_id = p_staff_profile_id) then
    raise exception 'Not authorized: staff only';
  end if;

  select * into v_request from public.coach_team_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Team request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This team request is already %', v_request.status;
  end if;
  -- 0098: never while the requester's account deletion is under staff
  -- review. Refuses before the request, a club, a team or an assignment is
  -- touched.
  if public.profile_has_pending_deletion_review(v_request.requester_profile_id) then
    raise exception using errcode = 'EMDRP', message = 'account_deletion_review_pending';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  if p_team_id is not null then
    select id into v_team_id from public.teams where id = p_team_id;
    if v_team_id is null then
      raise exception 'Team not found';
    end if;
  else
    if p_season_id is null or not exists (select 1 from public.seasons where id = p_season_id) then
      raise exception 'A season is required to create a new team';
    end if;
    insert into public.clubs (name) values (btrim(v_request.club_name)) returning id into v_club_id;
    insert into public.teams (club_id, name, season_id)
      values (v_club_id, btrim(v_request.team_name), p_season_id)
      returning id into v_team_id;
  end if;

  perform set_config('emblem.trusted_operation', 'approve_coach_team_request', true);
  perform set_config('emblem.actor_profile_id', p_staff_profile_id::text, true);

  insert into public.coach_team (team_id, profile_id, created_at, created_via, created_by, expires_at)
  values (v_team_id, v_request.requester_profile_id, now(), 'staff_team_request', p_staff_profile_id, p_expires_at)
  on conflict (team_id, profile_id) do update
    set ended_at = null, ended_by = null, end_reason = null, expires_at = excluded.expires_at;

  perform set_config('emblem.trusted_operation', '', true);
  perform set_config('emblem.actor_profile_id', '', true);

  update public.profiles set role = 'coach' where id = v_request.requester_profile_id and role is null;

  update public.coach_team_requests
    set status = 'approved', decided_by = p_staff_profile_id, decided_at = now(), resulting_team_id = v_team_id
    where id = p_request_id;

  return v_team_id;
end;
$$;
alter function public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid) owner to postgres;
revoke all on function public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.approve_coach_team_request(uuid, uuid, uuid, timestamptz, uuid) to service_role;

create or replace function public.redeem_coach_invite(p_code text, p_coach_profile_id uuid, p_display_name text default null)
returns table (status text, player_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_created_by uuid;
begin
  if p_code is null or p_coach_profile_id is null then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- 0098: no new coach access while this account's deletion is under staff
  -- review. Refuses before the invite is read or touched.
  if public.profile_has_pending_deletion_review(p_coach_profile_id) then
    return query select 'account_deletion_review_pending'::text, null::uuid;
    return;
  end if;

  begin
    -- The claim: the one conditional statement that consumes the invite and
    -- row-locks it for the rest of this transaction. used_by is filled in
    -- below, once the coach's profile is sure to exist (foreign key).
    update public.coach_invites ci
      set used_at = now()
      where ci.code = p_code
        and ci.used_at is null
        and ci.expires_at > now()
        and ci.created_by is not null
        and exists (select 1 from public.guardians g where g.player_id = ci.player_id and g.profile_id = ci.created_by)
      returning ci.player_id, ci.created_by into v_player_id, v_created_by;

    if v_player_id is null then
      -- Not claimable. The only non-invalid case: this same coach already
      -- consumed it and their link still exists (a retry). A consumed invite
      -- is never used to recreate a missing link.
      select ci.player_id into v_player_id
        from public.coach_invites ci
        where ci.code = p_code and ci.used_at is not null and ci.used_by = p_coach_profile_id
          and exists (select 1 from public.coach_players cp where cp.player_id = ci.player_id and cp.profile_id = p_coach_profile_id);
      if v_player_id is not null then
        return query select 'already_redeemed_by_you'::text, v_player_id;
      else
        return query select 'invalid'::text, null::uuid;
      end if;
      return;
    end if;

    -- The profile must exist before the link (foreign key). 'coach' is set
    -- only if the profile has no role yet.
    perform public.ensure_profile_role(p_coach_profile_id, 'coach', p_display_name);

    insert into public.coach_players (player_id, profile_id, created_via, created_by)
      values (v_player_id, p_coach_profile_id, 'guardian_invite', v_created_by)
      on conflict on constraint coach_players_pkey do nothing;
    if not found then
      raise exception using errcode = 'EM409', message = 'coach already directly connected to this player';
    end if;

    -- Same row, already claimed and locked by this transaction.
    update public.coach_invites ci set used_by = p_coach_profile_id where ci.code = p_code and ci.used_by is null;
  exception when sqlstate 'EM409' then
    -- Undoes the claim, profile and role changes made in this block.
    return query select 'already_connected'::text, null::uuid;
    return;
  end;

  return query select 'redeemed'::text, v_player_id;
end;
$$;
alter function public.redeem_coach_invite(text, uuid, text) owner to postgres;
revoke all on function public.redeem_coach_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_coach_invite(text, uuid, text) to service_role;

create or replace function public.redeem_team_invite(p_code text, p_coach_profile_id uuid, p_display_name text default null)
returns table (status text, team_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_team_id uuid;
  v_issued_at timestamptz;
  v_invite_expires_at timestamptz;
  v_used_at timestamptz;
  v_used_by uuid;
  v_has_assignment boolean := false;
  v_ended_at timestamptz;
  v_expires_at timestamptz;
  v_cutoff timestamptz;
  v_refusal text;
begin
  if p_code is null or p_coach_profile_id is null then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- 0098: no new coach access while this account's deletion is under staff
  -- review. Refuses before the invite is read or touched.
  if public.profile_has_pending_deletion_review(p_coach_profile_id) then
    return query select 'account_deletion_review_pending'::text, null::uuid;
    return;
  end if;

  select ti.id, ti.team_id, ti.created_at, ti.expires_at, ti.used_at, ti.used_by
    into v_invite_id, v_team_id, v_issued_at, v_invite_expires_at, v_used_at, v_used_by
    from public.team_invites ti
    where ti.code = p_code
    for update;

  if v_invite_id is null then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  if v_used_at is not null then
    -- A retry by the coach who consumed it, while that access still stands.
    -- A consumed invite never restores an assignment that has since ended.
    if v_used_by = p_coach_profile_id and exists (
      select 1 from public.coach_team ct
      where ct.team_id = v_team_id and ct.profile_id = p_coach_profile_id
        and public.coach_assignment_is_active(ct.ended_at, ct.expires_at)
    ) then
      return query select 'already_redeemed_by_you'::text, v_team_id;
    else
      return query select 'invalid'::text, null::uuid;
    end if;
    return;
  end if;
  if v_invite_expires_at <= now() then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  select true, ct.ended_at, ct.expires_at
    into v_has_assignment, v_ended_at, v_expires_at
    from public.coach_team ct
    where ct.team_id = v_team_id and ct.profile_id = p_coach_profile_id
    for update;

  if coalesce(v_has_assignment, false) then
    if public.coach_assignment_is_active(v_ended_at, v_expires_at) then
      return query select 'already_active'::text, null::uuid;
      return;
    end if;
    v_cutoff := greatest(v_ended_at, case when v_expires_at <= now() then v_expires_at end);
    if v_issued_at <= v_cutoff then
      v_refusal := case when v_ended_at is not null and v_ended_at >= v_cutoff then 'stale_after_end' else 'stale_after_expiry' end;
      return query select v_refusal, null::uuid;
      return;
    end if;
  end if;

  begin
    -- The profile must exist before the assignment (foreign key). 'coach'
    -- is set only if the profile has no role yet.
    perform public.ensure_profile_role(p_coach_profile_id, 'coach', p_display_name);

    perform set_config('emblem.trusted_operation', 'redeem_team_invite', true);
    perform set_config('emblem.actor_profile_id', p_coach_profile_id::text, true);

    -- The update branch repeats the rules above against the row as it is
    -- now: an assignment created and ended by others since the check above
    -- is still not restored by an older invite.
    insert into public.coach_team (team_id, profile_id, created_at, created_via, created_by)
      values (v_team_id, p_coach_profile_id, now(), 'team_invite', p_coach_profile_id)
      -- By constraint name: the output column team_id would make a column
      -- list ambiguous inside this function.
      on conflict on constraint coach_team_pkey do update
        set ended_at = null, ended_by = null, end_reason = null,
            expires_at = case when public.coach_team.expires_at <= now() then null else public.coach_team.expires_at end
        where not public.coach_assignment_is_active(public.coach_team.ended_at, public.coach_team.expires_at)
          and v_issued_at > coalesce(greatest(public.coach_team.ended_at,
                case when public.coach_team.expires_at <= now() then public.coach_team.expires_at end), '-infinity'::timestamptz);
    if not found then
      select case
               when public.coach_assignment_is_active(ct.ended_at, ct.expires_at) then 'already_active'
               when ct.ended_at is not null
                    and ct.ended_at >= coalesce(case when ct.expires_at <= now() then ct.expires_at end, '-infinity'::timestamptz)
                 then 'stale_after_end'
               else 'stale_after_expiry'
             end
        into v_refusal
        from public.coach_team ct
        where ct.team_id = v_team_id and ct.profile_id = p_coach_profile_id;
      raise exception using errcode = 'EM409', message = 'team invite refused';
    end if;

    update public.team_invites ti
      set used_at = now(), used_by = p_coach_profile_id
      where ti.id = v_invite_id;

    perform set_config('emblem.trusted_operation', '', true);
    perform set_config('emblem.actor_profile_id', '', true);
  exception when sqlstate 'EM409' then
    -- Undoes the role and profile changes made in this block.
    perform set_config('emblem.trusted_operation', '', true);
    perform set_config('emblem.actor_profile_id', '', true);
    return query select coalesce(v_refusal, 'already_active'), null::uuid;
    return;
  end;

  return query select 'redeemed'::text, v_team_id;
end;
$$;
alter function public.redeem_team_invite(text, uuid, text) owner to postgres;
revoke all on function public.redeem_team_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_team_invite(text, uuid, text) to service_role;

commit;
