-- Rollback procedure for 0036_player_coach_fields_secure_expand.sql
-- (Stage 1). NOT a migration — run manually, deliberately, only if Stage 1
-- needs to be undone.
--
-- ============================================================================
-- THE RULE THIS FILE ENFORCES: never restore broad table-level SELECT/
-- UPDATE/INSERT on `players`, and never drop the columns/functions that
-- protect it, while date_of_birth is populated on any row. This is not
-- left to whoever runs the script to notice and respect — the guard below
-- is real SQL, is the first statement inside the transaction, and RAISES
-- an exception that aborts the whole transaction if it finds any
-- non-null date_of_birth. Nothing after it — no GRANT, no DROP, no ALTER
-- — executes unless the guard passes. Tested both ways (zero rows with a
-- stored DOB, and at least one) in the disposable database — see
-- supabase/verification (or the report) for the results; the
-- populated-DOB run leaves the schema and grants provably unchanged.
-- ============================================================================
begin;

do $rollback_guard$
declare
  v_dob_count int;
begin
  select count(*) into v_dob_count from players where date_of_birth is not null;
  if v_dob_count > 0 then
    raise exception
      'Stage 1 rollback aborted: % row(s) have a stored date_of_birth. Restoring broad table-level privileges or dropping the protecting columns/functions here would expose real, previously-protected data. Do not proceed down this path — see this file''s own header for Path B (roll the application back to Stage 0 instead, or export the sensitive values under service-role access before any schema change).',
      v_dob_count;
  end if;
end;
$rollback_guard$;

-- If the guard above raised, this session is now in Postgres's standard
-- "current transaction is aborted" state: every command below (and any
-- other command you try) will be rejected until you run ROLLBACK or
-- disconnect. That is expected and correct — it is the fail-closed
-- guarantee itself, not a malfunction. Run ROLLBACK; then read Path B
-- below before doing anything else. Do not attempt to "fix and retry"
-- inside this same aborted transaction.

-- Everything below only runs if the guard above did not raise — i.e. only
-- when every row's date_of_birth is still null, the state Stage 1 left
-- behind before Stage 2 ever wrote a real value.

-- Restore the pre-Stage-1 grant shape (Supabase's own project-default
-- privileges already provide table-level SELECT/INSERT/UPDATE/DELETE to
-- `authenticated` outside any migration — these three GRANTs simply undo
-- Stage 1's column-level narrowing back to that default, they do not need
-- to reference `default privileges` themselves).
grant select on players to authenticated;
grant update on players to authenticated;
grant insert on players to authenticated;

-- Drop the functions Stage 1 added/replaced. update_secondary_position is
-- NOT dropped — it predates Stage 1 (migration 0021) and this rollback
-- only reverts what Stage 1 itself introduced; if reverting Stage 1 in
-- isolation, restore its pre-Stage-1 function body from
-- 0021_players_coach_fields.sql rather than leaving Stage 1's version in
-- place.
drop function if exists public.get_player_age(uuid);
drop function if exists public.get_player_date_of_birth(uuid);
drop function if exists public.update_player_coach_fields(uuid, date, text, int, text, text);
drop function if exists public.update_primary_position(uuid, text);

-- Drop the constraints and columns Stage 1 added.
alter table players drop constraint if exists players_secondary_position_not_primary;
alter table players drop constraint if exists players_secondary_position_valid;
alter table players drop constraint if exists players_preferred_foot_check;
alter table players
  add constraint players_preferred_foot_check
  check (preferred_foot is null or preferred_foot in ('Left', 'Right')); -- pre-Stage-1 shape
alter table players drop constraint if exists players_height_cm_plausible;
alter table players drop constraint if exists players_football_age_group_valid;
alter table players drop constraint if exists players_date_of_birth_not_future;
alter table players drop column if exists coach_fields_updated_at;
alter table players drop column if exists height_cm;
alter table players drop column if exists football_age_group;
alter table players drop column if exists date_of_birth;

commit;

-- ============================================================================
-- PATH B — what to do if the guard above aborted (rows_with_dob > 0).
-- Restoring broad access is not an option here, at any point, even
-- temporarily. Choose one of the following instead:
--
--   B1 (preferred) — roll the APPLICATION back to its Stage 0 state
--      (redeploy the previous build) while LEAVING Stage 1's schema and
--      grants exactly as they are. Stage 0's app never references
--      date_of_birth or any coach-owned field at all, so it works
--      unmodified against the still-locked-down Stage 1 schema — this is
--      the entire reason Stage 0 was built to be forward-compatible with
--      Stage 1 in the first place. No SQL to run for this path; it is an
--      application deploy, not a database change. The stored data stays
--      exactly as protected as it was before the rollback decision.
--
--   B2 — if the schema itself must change (e.g. a genuine bug in a
--      constraint or function, not just an app-level issue), export the
--      populated date_of_birth values to an operator-controlled, access-
--      logged location first (e.g. a service-role-only query result saved
--      outside the database, or a temporary table with grants at least as
--      restrictive as `players.date_of_birth`'s current ones), then either
--      null the column out or drop it, THEN make the schema change, THEN
--      decide separately and deliberately whether/how to restore the
--      exported values later. Never widen `players`' own grants as a step
--      in this process — the export step exists specifically so the fix
--      never needs to.
--
--   B3 — if neither is acceptable, stop and escalate rather than guessing.
--      A wrong call here is a real data-exposure incident, not a bug to
--      quietly patch around.
-- ============================================================================
