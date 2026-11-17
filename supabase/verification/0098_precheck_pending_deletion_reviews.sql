set transaction read only;
-- Read-only pre-check for 0098_deletion_review_suspension_and_verifier_identity.sql.
--
-- 0098 suspends coach access when an account deletion goes to staff review
-- from 0098 onwards, and blocks new coach access while a review is pending.
-- It does NOT suspend access already held by accounts whose review was
-- pending before 0098 is applied. Run this before applying 0098 (and again
-- after any manual suspension) to see whether any such account exists.
--
-- NOT a migration (it lives outside supabase/migrations). It changes
-- nothing: the first statement makes the transaction read only, and
-- read_only_guard must read 'on'. Paste the whole file into the Supabase
-- SQL Editor; the editor shows only the last statement's result, so every
-- figure is in the one row below.
--
-- COUNTS ONLY. It returns no ids, emails or names. Do not change it to
-- list rows; identify accounts in the SQL Editor only as the manual
-- procedure describes, and never export them.
--
-- Columns:
--   pending_reviews                       pending_profile_deletions rows with status 'pending'
--   pending_accounts_with_active_team     of those accounts, how many hold an active coach_team assignment
--   active_team_assignments               how many active coach_team assignments they hold in total
--   pending_accounts_with_open_team       accounts holding a not-ended assignment (active or merely expired;
--                                         0098 ends every not-ended one, so this is the figure to bring to 0)
--   open_team_assignments                 not-ended coach_team assignments they hold in total
--   pending_accounts_with_direct_links    accounts holding coach_players (direct coach) links
--   direct_links                          coach_players links they hold in total
--   pending_accounts_with_team_requests   accounts with a coach_team_requests row still 'pending'
--   pending_staff_accounts                pending reviews belonging to staff accounts (staff_accounts)
-- Expected before 0098 is applied: every figure except pending_reviews is 0.
select
  current_setting('transaction_read_only') as read_only_guard,
  (select count(*) from public.pending_profile_deletions d where d.status = 'pending') as pending_reviews,
  (select count(distinct ct.profile_id) from public.coach_team ct
     join public.pending_profile_deletions d on d.auth_user_id = ct.profile_id and d.status = 'pending'
     where ct.ended_at is null and (ct.expires_at is null or ct.expires_at > now())) as pending_accounts_with_active_team,
  (select count(*) from public.coach_team ct
     join public.pending_profile_deletions d on d.auth_user_id = ct.profile_id and d.status = 'pending'
     where ct.ended_at is null and (ct.expires_at is null or ct.expires_at > now())) as active_team_assignments,
  (select count(distinct ct.profile_id) from public.coach_team ct
     join public.pending_profile_deletions d on d.auth_user_id = ct.profile_id and d.status = 'pending'
     where ct.ended_at is null) as pending_accounts_with_open_team,
  (select count(*) from public.coach_team ct
     join public.pending_profile_deletions d on d.auth_user_id = ct.profile_id and d.status = 'pending'
     where ct.ended_at is null) as open_team_assignments,
  (select count(distinct cp.profile_id) from public.coach_players cp
     join public.pending_profile_deletions d on d.auth_user_id = cp.profile_id and d.status = 'pending') as pending_accounts_with_direct_links,
  (select count(*) from public.coach_players cp
     join public.pending_profile_deletions d on d.auth_user_id = cp.profile_id and d.status = 'pending') as direct_links,
  (select count(distinct r.requester_profile_id) from public.coach_team_requests r
     join public.pending_profile_deletions d on d.auth_user_id = r.requester_profile_id and d.status = 'pending'
     where r.status = 'pending') as pending_accounts_with_team_requests,
  (select count(*) from public.pending_profile_deletions d
     join public.staff_accounts s on s.profile_id = d.auth_user_id
     where d.status = 'pending') as pending_staff_accounts;
