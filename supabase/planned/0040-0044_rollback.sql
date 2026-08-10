-- Rollback reference for the Account Settings deletion feature
-- (0040-0044). NOT applied anywhere — this repo has no established
-- down-migration convention (none of the other 39 migrations have one);
-- drafted here per the migration-review checklist as a documented,
-- reviewable reference for whoever would need to revert this feature,
-- applied in this exact order (reverse of forward application).
--
-- Every forward migration in this feature is purely additive relative to
-- anything already live in production (new tables, new functions, one
-- new nullable column) — none of it can be safely rolled back "for free"
-- if real player_deletion_requests/pending_auth_deletions rows already
-- exist by the time a rollback is needed; the DROP TABLE statements below
-- destroy that data. Review for real rows first.

-- Reverse of 0044
drop function if exists public.request_player_deletion(uuid, text, text);
-- restores the pre-0044 request_player_deletion(uuid, text) signature —
-- copy the CREATE OR REPLACE body from 0041 verbatim if reverting.
alter table player_deletion_requests drop column if exists requester_email;
revoke select, update on player_deletion_requests from service_role;
-- restores delete_own_guardian_account to its pre-0044 body (no
-- requester_email lookup/snapshot) — copy 0042's CREATE OR REPLACE
-- verbatim if reverting; do not just drop the function, 0042's own
-- forward migration still expects it to exist for the app to function.

-- Reverse of 0043
drop table if exists pending_auth_deletions;

-- Reverse of 0042
drop function if exists public.delete_own_guardian_account();

-- Reverse of 0041
drop function if exists public.request_player_deletion(uuid, text);
drop function if exists public.cancel_own_player_deletion_request(uuid);
-- Table first: it still carries the player_deletion_requests_enforce_
-- transition trigger, which depends on the function below — dropping the
-- function first fails with a dependency error. Dropping the table takes
-- the trigger with it; the standalone function is only safe to drop once
-- nothing references it.
drop table if exists player_deletion_requests;
drop function if exists public.enforce_player_deletion_request_transition();

-- Reverse of 0040
drop function if exists public.delete_own_moment(uuid);
