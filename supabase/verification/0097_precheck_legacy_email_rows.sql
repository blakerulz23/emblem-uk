set transaction read only;
-- Read-only pre-check (R0) for 0097_coach_account_deletion_verified_moments.sql:
-- rows written before 0097's email rules that still hold an address those
-- rules would have removed.
--
-- 0097 removes an address at the moment a rule applies (an erasure, or a
-- child-deletion request closing). It changes no row written earlier. Run
-- this before applying 0097 (staging and production) and again just before
-- release. It works before and after 0097 is applied (it reads only columns
-- that already existed).
--
-- RELEASE RULE: every figure marked STOP must be 0. Any non-zero STOP
-- figure stops the release until a separately reviewed one-off clean-up has
-- run and this check reads 0. Nothing here, and nothing in 0097, deletes or
-- clears these rows automatically.
--
-- NOT a migration (it lives outside supabase/migrations). It changes
-- nothing: the first statement makes the transaction read only, and
-- read_only_guard must read 'on'. Paste the whole file into the Supabase SQL
-- Editor; every figure is in the one row below.
--
-- COUNTS ONLY. It returns no ids, emails or names. Do not change it to list
-- rows, and never export them.
--
-- Columns:
--   STOP auth_retry_rows_with_email        pending_auth_deletions rows holding an email (from 0097 no retry
--                                          row is written with one; the auth user id is enough)
--   STOP resolved_reviews_with_email       pending_profile_deletions rows resolved but still holding an email
--                                          (from 0097 every erasure clears it)
--   STOP closed_child_requests_with_contact
--                                          player_deletion_requests completed, rejected or cancelled with a
--                                          requester_email (from 0097 cleared when the request closes)
--   STOP closed_participation_requests_with_contact
--                                          the same for squad_invite_participation_deletion_requests
--   STOP used_invites_redeemer_gone_with_email
--                                          player/coach/team invites used by an account since deleted
--                                          (used_at set, used_by cleared) that still hold invited_email
--   STOP invites_to_deleted_accounts       player/coach/team invites, used or not, still holding an address that a
--                                          deletion record (pending_profile_deletions or pending_auth_deletions)
--                                          holds for an account whose sign-in no longer exists: invites 0097 would
--                                          have revoked or cleared at the erasure
--   info pending_reviews_with_email        pending reviews (they keep the email while pending: expected)
--   info open_child_requests_with_contact  pending child-deletion requests (both tables) with a contact (expected)
--   info unused_invites_with_email_no_account
--                                          unused invites addressed to an address no current sign-in has.
--                                          Cannot be told apart from a person who has not signed up yet, so
--                                          it is reported, not a stop figure.
select
  current_setting('transaction_read_only') as read_only_guard,
  (select count(*) from public.pending_auth_deletions where email is not null) as auth_retry_rows_with_email,
  (select count(*) from public.pending_profile_deletions where status = 'resolved' and email is not null) as resolved_reviews_with_email,
  (select count(*) from public.player_deletion_requests where status <> 'pending' and requester_email is not null) as closed_child_requests_with_contact,
  (select count(*) from public.squad_invite_participation_deletion_requests where status <> 'pending' and requester_email is not null) as closed_participation_requests_with_contact,
  (select count(*) from public.player_invites where used_at is not null and used_by is null and invited_email is not null)
    + (select count(*) from public.coach_invites where used_at is not null and used_by is null and invited_email is not null)
    + (select count(*) from public.team_invites where used_at is not null and used_by is null and invited_email is not null) as used_invites_redeemer_gone_with_email,
  (select count(*) from (
     select invited_email from public.player_invites where invited_email is not null
     union all select invited_email from public.coach_invites where invited_email is not null
     union all select invited_email from public.team_invites where invited_email is not null) i
   where lower(btrim(i.invited_email)) in (
     select lower(btrim(d.email)) from public.pending_profile_deletions d
      where d.email is not null and not exists (select 1 from auth.users u where u.id = d.auth_user_id)
     union
     select lower(btrim(a.email)) from public.pending_auth_deletions a
      where a.email is not null and not exists (select 1 from auth.users u where u.id = a.auth_user_id))) as invites_to_deleted_accounts,
  (select count(*) from public.pending_profile_deletions where status = 'pending' and email is not null) as pending_reviews_with_email,
  (select count(*) from public.player_deletion_requests where status = 'pending' and requester_email is not null)
    + (select count(*) from public.squad_invite_participation_deletion_requests where status = 'pending' and requester_email is not null) as open_child_requests_with_contact,
  (select count(*) from (
     select invited_email from public.player_invites where used_at is null and invited_email is not null
     union all select invited_email from public.coach_invites where used_at is null and invited_email is not null
     union all select invited_email from public.team_invites where used_at is null and invited_email is not null) i
   where not exists (select 1 from auth.users u where lower(btrim(u.email::text)) = lower(btrim(i.invited_email)))) as unused_invites_with_email_no_account;
