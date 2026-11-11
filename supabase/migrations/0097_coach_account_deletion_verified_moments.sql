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
--   4. delete_own_guardian_account: identical to 0076 except one statement.
--      A moment this account verified keeps its status and verified_at;
--      verified_by becomes NULL and verifier_account_deleted_at is set.
--      Grants re-stated unchanged (authenticated only).
--
-- No app code reads moments.verified_by (it is only written, by
-- /api/os/celebrate and /api/os/moments/verify), so NULL is already safe in
-- every reader. This migration changes no existing row.
-- Rollback: supabase/rollback/0097_rollback.sql (restores the defect, and
-- refuses once any account deletion has used the new state).

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
  'Set only by delete_own_guardian_account (0097) when the coach who verified this moment deleted their account. The moment stays coach_verified with its original verified_at; verified_by is then NULL. Never set by the app.';

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
-- 4. delete_own_guardian_account: the 0076 body with one statement changed
--    (marked "0097" below)
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

commit;
