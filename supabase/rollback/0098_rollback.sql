-- ============================================================================
-- EMERGENCY ONLY: THIS ROLLBACK LETS COACHES KEEP ACCESS DURING DELETION REVIEW,
-- LETS STAFF SELF-DELETE, AND LETS A SIGNED-IN USER NAME ANOTHER PERSON AS VERIFIER.
-- ============================================================================
-- Reverses 0098_deletion_review_suspension_and_verifier_identity.sql
-- (including the section 4 guards that stop an account under deletion review
-- gaining coach access),
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

-- 4 reversed: the access guards, then the three granting functions'
-- 0088 bodies, exactly.
drop trigger deletion_review_access_guard on public.coach_team_requests;
drop trigger deletion_review_access_guard on public.coach_players;
drop trigger deletion_review_access_guard on public.coach_team;
drop function public.refuse_coach_access_during_deletion_review();
drop function public.profile_has_pending_deletion_review(uuid);

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
