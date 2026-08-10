-- Recovery record for the one genuinely hard case in guardian account
-- deletion: the operation crosses two systems (Postgres, then the
-- Supabase Auth admin API) and only the second one can fail in a way
-- that isn't cleanly retryable by the client itself. If DB cleanup
-- (delete_own_guardian_account, 0042) succeeds but the Auth user delete
-- then fails, the account/delete route now signs the session out
-- immediately regardless (closing the "still logged in, data already
-- gone" risk) — which means the client can no longer retry itself, since
-- its session is deliberately dead. This table is what stands in for
-- that retry: a plain record for staff to finish the one remaining step
-- (serviceRole.auth.admin.deleteUser(auth_user_id)) via direct DB/Auth
-- admin access, same operational model as player_deletion_requests until
-- a real staff UI exists. Not a job queue — no worker, no retry
-- scheduling, just a durable "this still needs doing" record, per the
-- explicit instruction to stop and report rather than add broader
-- infrastructure.
create table pending_auth_deletions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email text,
  first_attempted_at timestamptz not null default now(),
  last_attempted_at timestamptz not null default now(),
  attempts int not null default 1,
  -- The real error message from the failed deleteUser() call — staff's
  -- only diagnostic signal for why this needs manual finishing, since
  -- there's no automated retry loop to have already tried the obvious
  -- fixes.
  last_error text,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  notes text,
  -- Who (a staff profile) finished the Auth deletion by hand, and when —
  -- the completion acknowledgement, same shape as player_deletion_requests'
  -- own completed_by/completed_at below.
  resolved_by uuid references profiles (id) on delete set null,
  resolved_at timestamptz
);

alter table pending_auth_deletions enable row level security;
-- Deliberately zero RLS policies — no client role (authenticated, anon)
-- can read or write this table under any condition; only service_role
-- (which bypasses RLS entirely) ever touches it, exclusively from
-- src/app/api/os/account/delete/route.ts's own failure branch. A
-- guardian whose deletion is pending here has no way to see this row and
-- no need to — their own session is already revoked.
revoke all on pending_auth_deletions from authenticated, anon;
grant select, insert, update, delete on pending_auth_deletions to service_role;
