set transaction read only;
-- Read-only pre-check for 0098_deletion_review_suspension_and_verifier_identity.sql:
-- service_role's privileges on public.pending_profile_deletions.
--
-- 0098 section 7 revokes exactly four privileges from service_role on this
-- table (INSERT, UPDATE, DELETE, TRUNCATE), and its rollback grants exactly
-- those four back. If the production state differs, the rollback would
-- widen or narrow access unexpectedly. 0098's own precondition refuses in
-- that case too; this file shows the state before anyone tries.
--
-- RUN BEFORE APPLYING 0098 (production and staging). STOP unless
-- expected_four_present is true. Report the figures; do not "fix" a
-- mismatch by granting or revoking by hand without a reviewed decision.
--
-- NOT a migration. It changes nothing: the first statement makes the
-- transaction read only, and read_only_guard must read 'on'. Paste the whole
-- file into the Supabase SQL Editor; every figure is in the one row below.
-- It reads only the catalog (no table rows).
select
  current_setting('transaction_read_only') as read_only_guard,
  has_table_privilege('service_role', 'public.pending_profile_deletions', 'insert') as service_role_insert,
  has_table_privilege('service_role', 'public.pending_profile_deletions', 'update') as service_role_update,
  has_table_privilege('service_role', 'public.pending_profile_deletions', 'delete') as service_role_delete,
  has_table_privilege('service_role', 'public.pending_profile_deletions', 'truncate') as service_role_truncate,
  (has_table_privilege('service_role', 'public.pending_profile_deletions', 'insert')
   and has_table_privilege('service_role', 'public.pending_profile_deletions', 'update')
   and has_table_privilege('service_role', 'public.pending_profile_deletions', 'delete')
   and has_table_privilege('service_role', 'public.pending_profile_deletions', 'truncate')) as expected_four_present,
  -- For the record (not part of the stop rule): 0098 leaves SELECT in place.
  has_table_privilege('service_role', 'public.pending_profile_deletions', 'select') as service_role_select;
