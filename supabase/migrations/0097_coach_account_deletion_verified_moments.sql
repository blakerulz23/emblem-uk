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
--  10. Invites addressed to an erased account (player_invites,
--      coach_invites, team_invites). The final erasure, in its own
--      transaction, matches invited_email case-insensitively against the
--      address the deletion was given and the Auth account's current one:
--        - every unused invite addressed to it (expired or not) is revoked
--          for good: revoked_at / revoked_reason 'recipient_account_erased'
--          set, expires_at cut to now at the latest, invited_email cleared,
--          and its code replaced by a random value no one holds, so the
--          token that was sent can never match an invite again;
--        - every used invite addressed to it, or redeemed by it, loses
--          invited_email.
--      What stays is non-identifying: ids, player/team, order, creator,
--      created/used/expiry times, email delivery status, revoked_at and
--      the reason code. A trigger refuses any later change that would
--      reopen a revoked invite (code, used_at/used_by, a later expiry, an
--      email, or the revocation itself), for every role. The step
--      (revoke_invites_addressed_to) runs on both final-erasure paths: the
--      erasure, and staff closing a review whose account was already
--      deleted another way. It changes nothing on a repeat. Only a final
--      erasure revokes: an account whose deletion is under staff review
--      keeps its invites.
--  11. Child-deletion contact emails (requester_email on
--      player_deletion_requests and
--      squad_invite_participation_deletion_requests) are kept only while
--      the request is pending: a trigger clears the address in the same
--      write that moves the request to completed, rejected or cancelled
--      (by any path), and on any write to a row already closed. A CHECK
--      (NOT VALID, so it does not judge rows written before 0097) refuses
--      a closed request with an address. Staff still get the address once,
--      at the moment they close a request, to reply: the player-deletion
--      staff page shows it, and the Squad Invite staff routes return it.
--  12. A named guardian's address on an order. At the final erasure, in
--      the same transaction and with the same address matching as section
--      10 (redact_order_guardian_addresses, on both final paths):
--        - orders.intended_guardian_email that matches is cleared, and
--          orders.intended_guardian_erased_at records (permanently) that a
--          named guardian's account was erased, so the profile invite never
--          falls back to the buyer instead;
--        - builder_guardian_approval_requests.guardian_email that matches is
--          cleared. The approval evidence stays, without the address: the
--          request, its status, times, token hash and declaration version,
--          plus guardian_email_redacted_at and guardian_distinct_from_buyer
--          (whether the approving address differed from the buyer's, by
--          0101's rule, worked out before the address goes). A pending
--          request is revoked: its emailed link can no longer be used;
--        - every affected order not yet finished (payment_status
--          order_intent, pending_payment or paid, and not guardian_declined)
--          is held: held_at / held_reason 'named_guardian_account_erased'.
--          A trigger refuses approving or fulfilling a held order, for every
--          role; there is no release by staff (see below).
--        - a gift order whose live approval came from someone else (still
--          genuine) is not held just because its named-guardian address
--          matched: its profile invite goes to the approving guardian.
--      Nothing on an order changes because its buyer erased their account,
--      unless the named guardian's address is the same address. A trigger
--      refuses putting an address back on a redacted approval request.
--      A hold has no release override: it lifts only after a fresh, genuine
--      guardian approval of the still unpaid order (0102 restarts the
--      approval through the normal flow); a paid held order is refunded or
--      cancelled. Checkout and payment refuse a held order (0102).
--      Matching (sections 10 and 12): one normalisation (email_match_key),
--      and a time boundary: if another sign-in now holds the address, only
--      rows created before that sign-in are the erased account's. The
--      erasure locks the invite and approval-request tables against
--      concurrent writes until it commits, and a trigger lets an order's
--      profile invite go only to the order's confirmed recipient (never an
--      erased guardian, never a held order), so an approval or invite racing
--      the erasure is either revoked by it or refused after it.
--  Order purchaser emails (orders.purchaser_email) are NOT changed by any
--  erasure: they are kept with the order for financial, contractual and
--  audit purposes (docs/order-email-retention.md).
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
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and column_name in ('revoked_at', 'revoked_reason')
               and table_name in ('player_invites', 'coach_invites', 'team_invites'))
     or to_regprocedure('public.refuse_revoked_invite_reuse()') is not null
     or to_regprocedure('public.revoke_invites_addressed_to(uuid, text)') is not null
     or to_regprocedure('public.redact_closed_deletion_request_contact()') is not null then
    raise exception '0097 refused: the 0097 invite revocation or contact redaction already exists (0097 already applied)';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and ((table_name = 'orders' and column_name in ('intended_guardian_erased_at', 'held_at', 'held_reason'))
                 or (table_name = 'builder_guardian_approval_requests'
                     and column_name in ('guardian_email_redacted_at', 'guardian_distinct_from_buyer'))))
     or to_regprocedure('public.redact_order_guardian_addresses(uuid, text)') is not null
     or to_regprocedure('public.refuse_held_order_progress()') is not null
     or to_regprocedure('public.refuse_redacted_approval_change()') is not null
     or to_regprocedure('public.email_match_key(text)') is not null
     or to_regprocedure('public.erased_account_addresses(uuid, text)') is not null
     or to_regprocedure('public.refuse_unconfirmed_order_invite()') is not null
     or to_regprocedure('public.refuse_unattested_guardian_approval()') is not null then
    raise exception '0097 refused: the 0097 order guardian redaction already exists (0097 already applied)';
  end if;
  -- Address matching places rows in time (4a1): every table it reads must
  -- have a creation time, and Auth sign-ins theirs.
  if (select count(*) from information_schema.columns
       where column_name = 'created_at'
         and ((table_schema = 'public' and table_name in ('player_invites', 'coach_invites', 'team_invites', 'orders', 'builder_guardian_approval_requests'))
           or (table_schema = 'auth' and table_name = 'users'))) <> 6
     or (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'player_invites' and column_name in ('origin', 'order_id')) <> 2 then
    v_problems := v_problems || 'a created_at column (invites, orders, approval requests, auth.users) or player_invites.origin/order_id is missing'::text;
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'orders' and column_name in ('intended_guardian_email', 'purchaser_email', 'payment_status',
                                                          'authority_status', 'approved_at', 'approved_by'))
           or (table_name = 'builder_guardian_approval_requests' and column_name in ('order_id', 'guardian_email', 'status'))
           or (table_name = 'builder_order_authority_declarations' and column_name in ('order_id', 'adult_email')))) <> 11 then
    v_problems := v_problems || 'an order, guardian approval request or authority declaration column is not as expected'::text;
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name in ('player_invites', 'coach_invites', 'team_invites')
         and column_name in ('code', 'invited_email', 'used_at', 'used_by', 'expires_at')) <> 15
     or (select count(*) from information_schema.columns
          where table_schema = 'public' and column_name = 'requester_email'
            and table_name in ('player_deletion_requests', 'squad_invite_participation_deletion_requests')) <> 2 then
    v_problems := v_problems || 'an invite table or a deletion request contact column is not as expected'::text;
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
-- 4a1. Address matching for an account being erased (sections 10 and 12),
--      owner-only.
-- ---------------------------------------------------------------------------
-- email_match_key: the one normalisation every 0097 address comparison uses.
-- Lower-cased, with leading and trailing whitespace removed, including tabs,
-- newlines, no-break and zero-width no-break spaces: the same rule as 0101's
-- gift_order_checkout_block_reason and the app's normaliseEmail. NULL for no
-- address.
create function public.email_match_key(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(p_email, '^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$', '', 'g')), '')
$$;
revoke all on function public.email_match_key(text) from public, anon, authenticated, service_role;
alter function public.email_match_key(text) owner to postgres;

-- erased_account_addresses: the addresses an erasure may match, each with a
-- time boundary. The addresses are the one the caller holds (possibly older:
-- a staff review's record) and the Auth account's current one. If another
-- sign-in now holds the same address, that address was free again before
-- that sign-in was created, so only rows created before that moment can be
-- the erased account's (created_before). Rows from then on belong to the
-- current holder and are never matched. A holder with no creation time
-- cannot be placed, so no boundary is set for it (the rows are matched:
-- redaction and holds fail closed).
create function public.erased_account_addresses(p_profile_id uuid, p_email text)
returns table (match_key text, created_before timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.match_key,
         (select min(u.created_at) from auth.users u
           where u.id is distinct from p_profile_id
             and public.email_match_key(u.email::text) = k.match_key)
    from (select distinct public.email_match_key(a) as match_key
            from unnest(array[p_email, (select u.email::text from auth.users u where u.id = p_profile_id)]) as a) k
   where k.match_key is not null
$$;
revoke all on function public.erased_account_addresses(uuid, text) from public, anon, authenticated, service_role;
alter function public.erased_account_addresses(uuid, text) owner to postgres;

-- ---------------------------------------------------------------------------
-- 4a2. Invites addressed to an account being erased (section 10), owner-only.
-- ---------------------------------------------------------------------------
-- Called first by both final-erasure paths: erase_account_for_deletion, and
-- staff closing a review whose account was already deleted another way
-- (complete_pending_profile_deletion, account_already_deleted). Matching:
-- erased_account_addresses (4a1). Changes nothing on a repeat.
--
-- It first locks the three invite tables and the guardian approval requests
-- against concurrent writes (SHARE ROW EXCLUSIVE) until the erasure commits:
-- an invite or approval request being created at the same moment either
-- commits first (and is then matched here) or waits until the erasure has
-- committed. After that, an order's invite is checked against the erased
-- state (section 12's invite guard); a new approval request to the same
-- address is simply a new request to a mailbox that no account holds (the
-- address is not kept, so it cannot be recognised), and only a genuine
-- response through its emailed token can approve it. Plain reads are not
-- blocked. 0102's approval-request functions take their table lock first,
-- so they cannot deadlock with this; any other deadlock aborts one
-- transaction, never leaving either half-done.
create function public.revoke_invites_addressed_to(p_profile_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := p_profile_id;
begin
  lock table public.player_invites, public.coach_invites, public.team_invites,
             public.builder_guardian_approval_requests in share row exclusive mode;
  -- Unused (expired or not): revoked for good; the sent code can never match again.
  update public.player_invites i
     set revoked_at = now(), revoked_reason = 'recipient_account_erased', invited_email = null,
         expires_at = least(i.expires_at, now()), code = 'revoked:' || gen_random_uuid()::text
    from public.erased_account_addresses(v_uid, p_email) a
   where i.used_at is null and i.revoked_at is null
     and public.email_match_key(i.invited_email) = a.match_key
     and (a.created_before is null or i.created_at < a.created_before);
  update public.coach_invites i
     set revoked_at = now(), revoked_reason = 'recipient_account_erased', invited_email = null,
         expires_at = least(i.expires_at, now()), code = 'revoked:' || gen_random_uuid()::text
    from public.erased_account_addresses(v_uid, p_email) a
   where i.used_at is null and i.revoked_at is null
     and public.email_match_key(i.invited_email) = a.match_key
     and (a.created_before is null or i.created_at < a.created_before);
  update public.team_invites i
     set revoked_at = now(), revoked_reason = 'recipient_account_erased', invited_email = null,
         expires_at = least(i.expires_at, now()), code = 'revoked:' || gen_random_uuid()::text
    from public.erased_account_addresses(v_uid, p_email) a
   where i.used_at is null and i.revoked_at is null
     and public.email_match_key(i.invited_email) = a.match_key
     and (a.created_before is null or i.created_at < a.created_before);
  -- Used: the recipient's address goes; the record of the use stays.
  update public.player_invites i set invited_email = null
   where i.invited_email is not null
     and (i.used_by = v_uid or exists (select 1 from public.erased_account_addresses(v_uid, p_email) a
                                        where public.email_match_key(i.invited_email) = a.match_key
                                          and (a.created_before is null or i.created_at < a.created_before)));
  update public.coach_invites i set invited_email = null
   where i.invited_email is not null
     and (i.used_by = v_uid or exists (select 1 from public.erased_account_addresses(v_uid, p_email) a
                                        where public.email_match_key(i.invited_email) = a.match_key
                                          and (a.created_before is null or i.created_at < a.created_before)));
  update public.team_invites i set invited_email = null
   where i.invited_email is not null
     and (i.used_by = v_uid or exists (select 1 from public.erased_account_addresses(v_uid, p_email) a
                                        where public.email_match_key(i.invited_email) = a.match_key
                                          and (a.created_before is null or i.created_at < a.created_before)));
end;
$$;
revoke all on function public.revoke_invites_addressed_to(uuid, text) from public, anon, authenticated, service_role;
alter function public.revoke_invites_addressed_to(uuid, text) owner to postgres;

-- ---------------------------------------------------------------------------
-- 4a3. A named guardian's address on orders (section 12), owner-only.
-- ---------------------------------------------------------------------------
-- Same callers, matching and boundary as 4a2 (which runs first and holds the
-- table locks). The buyer's own address (orders.purchaser_email,
-- builder_order_authority_declarations.adult_email) is never changed here.
-- Changes nothing on a repeat: nothing matches once the addresses are gone,
-- so a hold that a fresh guardian approval released is not set again.
create function public.redact_order_guardian_addresses(p_profile_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := p_profile_id;
  v_live_orders uuid[];
  v_named_orders uuid[];
begin
  -- Gift orders whose live approval request (pending or approved) names
  -- this guardian: held below.
  select coalesce(array_agg(distinct r.order_id), '{}') into v_live_orders
    from public.builder_guardian_approval_requests r
    join public.erased_account_addresses(v_uid, p_email) a
      on public.email_match_key(r.guardian_email) = a.match_key
     and (a.created_before is null or r.created_at < a.created_before)
   where r.status in ('pending', 'approved');

  -- The approval evidence stays without the address. Whether the approving
  -- address was the buyer's is worked out first, by the same rule as 0101
  -- (against the purchaser and every declaring adult). A pending request is
  -- revoked: its emailed link can no longer be used.
  update public.builder_guardian_approval_requests r
     set guardian_distinct_from_buyer = (
           public.email_match_key(r.guardian_email)
             is distinct from (select public.email_match_key(o.purchaser_email) from public.orders o where o.id = r.order_id)
           and not exists (select 1 from public.builder_order_authority_declarations d
                            where d.order_id = r.order_id
                              and public.email_match_key(d.adult_email) = public.email_match_key(r.guardian_email))),
         guardian_email = null,
         guardian_email_redacted_at = now(),
         status = case when r.status = 'pending' then 'revoked' else r.status end
    from public.erased_account_addresses(v_uid, p_email) a
   where public.email_match_key(r.guardian_email) = a.match_key
     and (a.created_before is null or r.created_at < a.created_before);

  -- Orders that named this guardian: the address goes, the fact stays.
  with redacted as (
    update public.orders o
       set intended_guardian_email = null,
           intended_guardian_erased_at = coalesce(o.intended_guardian_erased_at, now())
      from public.erased_account_addresses(v_uid, p_email) a
     where public.email_match_key(o.intended_guardian_email) = a.match_key
       and (a.created_before is null or o.created_at < a.created_before)
     returning o.id)
  select coalesce(array_agg(id), '{}') into v_named_orders from redacted;

  -- Every affected order not yet finished is held. A gift order is held
  -- only through its live approval request: its profile invite goes to the
  -- approving guardian, so a matching named-guardian address alone does not
  -- hold it.
  update public.orders o
     set held_at = now(), held_reason = 'named_guardian_account_erased'
   where (o.id = any(v_live_orders)
          or (o.id = any(v_named_orders)
              and (o.authority_status is null
                   or o.authority_status not in ('guardian_approval_pending', 'guardian_approved', 'guardian_declined'))))
     and o.held_at is null
     and o.payment_status in ('order_intent', 'pending_payment', 'paid')
     and o.authority_status is distinct from 'guardian_declined';
end;
$$;
revoke all on function public.redact_order_guardian_addresses(uuid, text) from public, anon, authenticated, service_role;
alter function public.redact_order_guardian_addresses(uuid, text) owner to postgres;
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
  v_erased_now int;
begin
  -- An account already erased has nothing left to erase. A still-valid
  -- access token of that account calling delete_own_guardian_account again
  -- is refused here, so it can write no second audit event or record.
  if exists (select 1 from public.erased_accounts where profile_id = v_uid) then
    raise exception using errcode = 'EMERA', message = 'account_erased';
  end if;

  -- 0097 (section 10): invites addressed to this account, first, while
  -- used_by still names the account.
  perform public.revoke_invites_addressed_to(v_uid, v_email);
  -- 0097 (section 12): this account's address where an order names it as
  -- the child's guardian.
  perform public.redact_order_guardian_addresses(v_uid, v_email);

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
  -- Locked (profile first, then review, as every deletion function locks),
  -- so a staff decision cannot change the status between this read and the
  -- update below.
  select status, id into v_review_status, v_review_id
    from public.pending_profile_deletions where auth_user_id = v_uid for update;
  update public.pending_profile_deletions
     set status = 'resolved', resolved_by = p_completed_by, resolved_at = now()
   where auth_user_id = v_uid and status = 'pending';

  -- 0097: from now on no profile can be created again for this account and
  -- the app refuses its sessions (section 9).
  insert into public.erased_accounts (profile_id, completed_by, pending_deletion_id)
  values (v_uid, p_completed_by, v_review_id)
  on conflict (profile_id) do nothing;
  -- Exactly once comes from the unique key: only the call that recorded the
  -- erasure writes the self-deletion event (a concurrent duplicate, possible
  -- only when no profile row exists to lock, writes nothing).
  get diagnostics v_erased_now = row_count;

  if p_completed_by is null and v_review_id is not null and v_erased_now = 1 then
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
  -- Nor does any Auth-removal retry record for it (an older 0043-era row
  -- written by a failed self-deletion may still hold one).
  update public.pending_auth_deletions set email = null
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
    -- Invites addressed to it are revoked first (section 10), while the
    -- review still holds the address; then the email is cleared: the account
    -- is gone. Likewise its address where an order names it as guardian
    -- (section 12).
    perform public.revoke_invites_addressed_to(v_uid, v_pending.email);
    perform public.redact_order_guardian_addresses(v_uid, v_pending.email);
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
  -- Append-only, so it must never hold an email address (it could never be
  -- removed): a reason containing one is refused, and with it the decision.
  constraint account_deletion_staff_actions_reason_no_email
    check (reason !~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+'),
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

-- ---------------------------------------------------------------------------
-- 10. Invites addressed to an erased account are revoked for good
-- ---------------------------------------------------------------------------
-- (In these CHECKs "x is not null and x = '...'" is deliberate: a bare
-- comparison with NULL is unknown, and a CHECK lets unknown through.)
-- Written only by revoke_invites_addressed_to (section 4a2). Every existing row
-- gets NULL in both columns. The revocation cuts the expiry to now at the
-- latest; the trigger below refuses any later expiry in the future. Signed-in users' column-level INSERT grants
-- (0089, 0090) do not include them.
alter table public.player_invites
  add column revoked_at timestamptz,
  add column revoked_reason text,
  add constraint player_invites_revoked_state check (
    (revoked_at is null and revoked_reason is null)
    or (revoked_reason is not null and revoked_reason = 'recipient_account_erased' and revoked_at is not null
        and used_at is null and invited_email is null));
alter table public.coach_invites
  add column revoked_at timestamptz,
  add column revoked_reason text,
  add constraint coach_invites_revoked_state check (
    (revoked_at is null and revoked_reason is null)
    or (revoked_reason is not null and revoked_reason = 'recipient_account_erased' and revoked_at is not null
        and used_at is null and invited_email is null));
alter table public.team_invites
  add column revoked_at timestamptz,
  add column revoked_reason text,
  add constraint team_invites_revoked_state check (
    (revoked_at is null and revoked_reason is null)
    or (revoked_reason is not null and revoked_reason = 'recipient_account_erased' and revoked_at is not null
        and used_at is null and invited_email is null));
comment on column public.player_invites.revoked_at is
  'Set when the invite''s recipient account was erased (0097): the code was replaced and the invite can never be redeemed.';
comment on column public.coach_invites.revoked_at is
  'Set when the invite''s recipient account was erased (0097): the code was replaced and the invite can never be redeemed.';
comment on column public.team_invites.revoked_at is
  'Set when the invite''s recipient account was erased (0097): the code was replaced and the invite can never be redeemed.';

-- A revoked invite can never be reopened, by any role (the owner included):
-- no new code, no use, no expiry in the future, no address, no change to the
-- revocation (setting the expiry to now, as a retirement does, is harmless
-- and allowed). Clearing created_by / used_by (account deletion) and email
-- delivery status still work; deleting the row (child erasure) is unaffected.
create function public.refuse_revoked_invite_reuse()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.revoked_at is not null and (
       new.revoked_at is distinct from old.revoked_at
    or new.revoked_reason is distinct from old.revoked_reason
    or new.code is distinct from old.code
    or new.used_at is distinct from old.used_at
    or (new.used_by is not null and new.used_by is distinct from old.used_by)
    or new.expires_at > greatest(old.expires_at, now())
    or new.invited_email is not null) then
    raise exception using errcode = 'EMRVK', message = 'invite_revoked';
  end if;
  return new;
end;
$fn$;
alter function public.refuse_revoked_invite_reuse() owner to postgres;
revoke all on function public.refuse_revoked_invite_reuse() from public, anon, authenticated, service_role;
create trigger player_invites_revoked_guard before update on public.player_invites
  for each row execute function public.refuse_revoked_invite_reuse();
create trigger coach_invites_revoked_guard before update on public.coach_invites
  for each row execute function public.refuse_revoked_invite_reuse();
create trigger team_invites_revoked_guard before update on public.team_invites
  for each row execute function public.refuse_revoked_invite_reuse();

-- ---------------------------------------------------------------------------
-- 11. A child-deletion request keeps its contact address only while pending
-- ---------------------------------------------------------------------------
-- The address is needed while staff may have to contact the requester or
-- act on the request. Cleared in the same write that closes it (completed,
-- rejected or cancelled, by whichever function or role), and on any later
-- write to a closed row. Idempotent: a closed row stays without an address.
create function public.redact_closed_deletion_request_contact()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.status <> 'pending' then
    new.requester_email := null;
  end if;
  return new;
end;
$fn$;
alter function public.redact_closed_deletion_request_contact() owner to postgres;
revoke all on function public.redact_closed_deletion_request_contact() from public, anon, authenticated, service_role;
create trigger player_deletion_requests_redact_closed_contact
  before insert or update on public.player_deletion_requests
  for each row execute function public.redact_closed_deletion_request_contact();
create trigger sipdr_redact_closed_contact
  before insert or update on public.squad_invite_participation_deletion_requests
  for each row execute function public.redact_closed_deletion_request_contact();
-- NOT VALID: rows closed before 0097 are not judged here; the R0 pre-check
-- (supabase/verification/0097_precheck_legacy_email_rows.sql) counts them,
-- and any found are cleared only by a separately reviewed one-off change.
alter table public.player_deletion_requests
  add constraint player_deletion_requests_closed_has_no_contact
  check (status = 'pending' or requester_email is null) not valid;
alter table public.squad_invite_participation_deletion_requests
  add constraint sipdr_closed_has_no_contact
  check (status = 'pending' or requester_email is null) not valid;

-- ---------------------------------------------------------------------------
-- 12. A named guardian's address on an order goes with their account
-- ---------------------------------------------------------------------------
-- Written by redact_order_guardian_addresses (section 4a3). A hold is
-- lifted only by a fresh, genuine guardian approval (0102's
-- respond_to_builder_guardian_approval); staff cannot release it. Every
-- existing row gets NULL in the new columns.
alter table public.orders
  add column intended_guardian_erased_at timestamptz,
  add column held_at timestamptz,
  add column held_reason text,
  add constraint orders_hold_state check (
    (held_at is null and held_reason is null)
    or (held_at is not null and held_reason is not null and held_reason = 'named_guardian_account_erased'));
comment on column public.orders.intended_guardian_erased_at is
  'Set (permanently) when the account of the guardian this order named was erased and intended_guardian_email was cleared (0097). The profile invite then never falls back to the buyer.';
comment on column public.orders.held_at is
  'Set when the guardian this order depends on (intended guardian or approving guardian) had their account erased before the order finished (0097). A held order cannot be approved, fulfilled, checked out or paid for (0102). It is lifted only by a fresh, genuine guardian approval through the token flow while unpaid and with no refused payment; otherwise it is cancelled or refunded.';

-- Existing rows all hold an address (the column was NOT NULL), so the CHECK
-- is validated, and the NOT NULL is relaxed only for redacted rows.
alter table public.builder_guardian_approval_requests
  add column guardian_email_redacted_at timestamptz,
  add column guardian_distinct_from_buyer boolean,
  add constraint builder_guardian_approval_requests_redaction_state check (
    (guardian_email is not null and guardian_email_redacted_at is null and guardian_distinct_from_buyer is null)
    or (guardian_email is null and guardian_email_redacted_at is not null and guardian_distinct_from_buyer is not null));
alter table public.builder_guardian_approval_requests alter column guardian_email drop not null;
comment on column public.builder_guardian_approval_requests.guardian_email_redacted_at is
  'Set when the approving (or asked) guardian''s account was erased and guardian_email was cleared (0097). The request stays as evidence, without the address.';
comment on column public.builder_guardian_approval_requests.guardian_distinct_from_buyer is
  'Worked out at redaction (0097): whether guardian_email differed from the buyer''s addresses (purchaser and declaring adults), by 0101''s rule.';

-- A held order cannot be approved or fulfilled, by any role (payment events
-- that close it, refunded / cancelled / failed, still apply; a 'paid' event
-- is refused by 0102). There is no release override:
--   - a hold is lifted only inside respond_to_builder_guardian_approval (the
--     emailed-token flow): the release must be written by that function's
--     owner (this trigger runs as the writing role, so a direct write by
--     service_role or any other role is refused);
--   - and only after a fresh, genuine approval of the still unpaid order:
--     guardian_approved, an approved request with an address answered after
--     the hold, from an address that is neither the purchaser's nor a
--     declaring adult's (0101 rule), and no refused payment ever recorded
--     for the order (money may have been taken: cancel, never restart).
-- A paid held order is refunded or cancelled, never released. The hold
-- cannot be rewritten (a new time could make an older approval look
-- fresh). Once a named guardian's account was erased, that record is
-- permanent and no new named-guardian address can be written.
create function public.refuse_held_order_progress()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.intended_guardian_erased_at is not null
     and new.intended_guardian_erased_at is distinct from old.intended_guardian_erased_at then
    raise exception using errcode = 'EMHLD', message = 'intended_guardian_erasure_is_permanent';
  end if;
  if old.intended_guardian_erased_at is not null and new.intended_guardian_email is not null
     and new.intended_guardian_email is distinct from old.intended_guardian_email then
    raise exception using errcode = 'EMHLD', message = 'intended_guardian_erasure_is_permanent';
  end if;
  if old.held_at is not null and new.held_at is not null
     and (new.held_at is distinct from old.held_at or new.held_reason is distinct from old.held_reason) then
    raise exception using errcode = 'EMHLD', message = 'hold_cannot_be_rewritten';
  end if;
  if old.held_at is not null and new.held_at is null then
    if current_user::text is distinct from (select pg_get_userbyid(p.proowner)::text from pg_proc p where p.oid = to_regprocedure('public.respond_to_builder_guardian_approval(text, text)')) then
      raise exception using errcode = 'EMHLD', message = 'hold_release_only_by_guardian_approval';
    end if;
    if (new.payment_status in ('order_intent', 'pending_payment')
        and new.authority_status = 'guardian_approved'
        and not exists (select 1 from public.payment_state_events e
                         where e.order_id = new.id and e.reason like 'paid\_refused\_%')
        and exists (
          select 1 from public.builder_guardian_approval_requests r
           where r.order_id = new.id and r.status = 'approved'
             and public.email_match_key(r.guardian_email) is not null
             and r.responded_at > old.held_at
             and public.email_match_key(r.guardian_email) is distinct from public.email_match_key(new.purchaser_email)
             and not exists (select 1 from public.builder_order_authority_declarations d
                              where d.order_id = new.id
                                and public.email_match_key(d.adult_email) = public.email_match_key(r.guardian_email)))) is not true then
      raise exception using errcode = 'EMHLD', message = 'hold_release_requires_fresh_guardian_approval';
    end if;
  end if;
  if new.held_at is not null and (
       (new.payment_status = 'fulfilled' and old.payment_status is distinct from 'fulfilled')
    or (new.approved_at is not null and new.approved_at is distinct from old.approved_at)
    or (new.approved_by is not null and new.approved_by is distinct from old.approved_by)) then
    raise exception using errcode = 'EMHLD', message = 'order_held';
  end if;
  return new;
end;
$fn$;
alter function public.refuse_held_order_progress() owner to postgres;
revoke all on function public.refuse_held_order_progress() from public, anon, authenticated, service_role;
create trigger orders_held_guard before update on public.orders
  for each row execute function public.refuse_held_order_progress();

-- A redacted approval request never gets an address back or changes what
-- it records (staff may still revoke it).
create function public.refuse_redacted_approval_change()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.guardian_email_redacted_at is not null and (
       new.guardian_email is not null
    or new.guardian_email_redacted_at is distinct from old.guardian_email_redacted_at
    or new.guardian_distinct_from_buyer is distinct from old.guardian_distinct_from_buyer
    or new.order_id is distinct from old.order_id
    or new.token_hash is distinct from old.token_hash
    or (new.status is distinct from old.status and new.status <> 'revoked')) then
    raise exception using errcode = 'EMRDA', message = 'guardian_approval_redacted';
  end if;
  return new;
end;
$fn$;
alter function public.refuse_redacted_approval_change() owner to postgres;
revoke all on function public.refuse_redacted_approval_change() from public, anon, authenticated, service_role;
create trigger builder_guardian_approval_requests_redacted_guard before update on public.builder_guardian_approval_requests
  for each row execute function public.refuse_redacted_approval_change();

-- A guardian approval is recorded only by the emailed-token flow
-- (respond_to_builder_guardian_approval, owner-run): a request written as
-- 'approved', or changed to 'approved', by any other role is refused. This
-- keeps the hold release above from being satisfied by a forged approval.
-- Revoking, expiring and declining are unaffected.
create function public.refuse_unattested_guardian_approval()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved')
     and current_user::text is distinct from (select pg_get_userbyid(p.proowner)::text from pg_proc p where p.oid = to_regprocedure('public.respond_to_builder_guardian_approval(text, text)')) then
    raise exception using errcode = 'EMAPR', message = 'guardian_approval_only_by_token';
  end if;
  return new;
end;
$fn$;
alter function public.refuse_unattested_guardian_approval() owner to postgres;
revoke all on function public.refuse_unattested_guardian_approval() from public, anon, authenticated, service_role;
create trigger builder_guardian_approval_requests_approval_guard
  before insert or update of status on public.builder_guardian_approval_requests
  for each row execute function public.refuse_unattested_guardian_approval();

-- An order's profile invite (player_invites, origin order_approval) may only
-- go to the order's confirmed recipient, decided in the same transaction as
-- the write, by the same rule as the app (gift-order-guardian.ts):
--   - a gift order: only once guardian_approved, and only to the address of
--     its latest approved request, which must still hold an address and be
--     neither the purchaser's nor a declaring adult's (0101 rule);
--   - any other order: its named guardian; if the named guardian's account
--     was erased (intended_guardian_erased_at), nobody; if none was ever
--     named, the purchaser.
-- Never while the order is held, never without an address, and fail closed
-- when the order cannot be read. Any other guardian invite that carries an
-- order (a purchaser-recovery handoff, origin second_guardian) is refused
-- when the order names a separate guardian, or its named guardian's account
-- was erased: the named guardian sets the profile up, not the buyer. The order row and the approval rows are
-- read FOR SHARE, so a concurrent erasure (which updates them) either
-- commits first and is seen here, or waits for this write and then revokes
-- the invite it created (section 4a2 locks the table first). Clearing the
-- address (an erasure) is always allowed.
create function public.refuse_unconfirmed_order_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_order record;
  v_key text := public.email_match_key(new.invited_email);
  v_expected text;
begin
  if new.order_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.invited_email is null then
    return new;
  end if;
  select o.id, o.held_at, o.authority_status, o.purchaser_email, o.intended_guardian_email, o.intended_guardian_erased_at
    into v_order
    from public.orders o where o.id = new.order_id for share;
  if new.origin is distinct from 'order_approval' then
    if v_order.id is not null
       and (v_order.intended_guardian_erased_at is not null
            or (public.email_match_key(v_order.intended_guardian_email) is not null
                and public.email_match_key(v_order.intended_guardian_email) is distinct from public.email_match_key(v_order.purchaser_email))) then
      raise exception using errcode = 'EMINV', message = 'order_invite_recipient_unconfirmed';
    end if;
    return new;
  end if;
  if v_order.id is null or v_order.held_at is not null or v_key is null then
    raise exception using errcode = 'EMINV', message = 'order_invite_recipient_unconfirmed';
  end if;
  if v_order.authority_status in ('guardian_approval_pending', 'guardian_approved', 'guardian_declined') then
    if v_order.authority_status is distinct from 'guardian_approved' then
      raise exception using errcode = 'EMINV', message = 'order_invite_recipient_unconfirmed';
    end if;
    select public.email_match_key(r.guardian_email) into v_expected
      from public.builder_guardian_approval_requests r
     where r.order_id = new.order_id and r.status = 'approved'
     order by r.responded_at desc nulls first, r.created_at desc
     limit 1
     for share;
    if v_expected is null
       or v_expected = public.email_match_key(v_order.purchaser_email)
       or exists (select 1 from public.builder_order_authority_declarations d
                   where d.order_id = new.order_id and public.email_match_key(d.adult_email) = v_expected) then
      raise exception using errcode = 'EMINV', message = 'order_invite_recipient_unconfirmed';
    end if;
  elsif v_order.intended_guardian_erased_at is not null then
    raise exception using errcode = 'EMINV', message = 'order_invite_recipient_unconfirmed';
  elsif v_order.intended_guardian_email is not null then
    v_expected := public.email_match_key(v_order.intended_guardian_email);
  else
    v_expected := public.email_match_key(v_order.purchaser_email);
  end if;
  if v_key is distinct from v_expected then
    raise exception using errcode = 'EMINV', message = 'order_invite_recipient_unconfirmed';
  end if;
  return new;
end;
$fn$;
alter function public.refuse_unconfirmed_order_invite() owner to postgres;
revoke all on function public.refuse_unconfirmed_order_invite() from public, anon, authenticated, service_role;
create trigger player_invites_order_recipient_guard
  before insert or update of invited_email, order_id, origin on public.player_invites
  for each row execute function public.refuse_unconfirmed_order_invite();

commit;
