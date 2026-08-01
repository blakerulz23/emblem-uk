-- Fixes a genuine, pre-existing gap found while verifying the coach-
-- connection architecture (Milestone 3): guardians has never had any
-- coach-visibility SELECT policy, only "a parent can see their own
-- links" (auth.uid() = profile_id). This silently starves every
-- coach-authored Story Update's "notify the guardians" step
-- (assessment_shared, recognition, moment_verified, season_focus_added)
-- of recipients — a coach's session query for a player's guardians has
-- always returned zero rows, for team coaches and direct coaches alike.
-- Not caused by Milestone 3 (assessments/route.ts etc. are untouched by
-- it) and not fixable by widening coach_team/coach_players themselves —
-- this is guardians' own RLS that's missing a policy entirely.
--
-- IMPORTANT — why this is a SECURITY DEFINER function, not a plain
-- inlined policy like every other coach-widening in 0032:
--
-- players' own SELECT policy ("players: visible to guardians") reads
-- guardians. coach_players' own SELECT policy ("coach_players:
-- guardians can see their player's connections") also reads guardians
-- directly. A plain policy here that inlines
-- `exists (select 1 from players p join coach_team ct ...)` or
-- `exists (select 1 from coach_players cp ...)` would therefore recurse
-- back into guardians' own RLS the moment either subquery touches
-- players or coach_players — the exact class of bug
-- 0006_fix_coach_team_rls_recursion.sql already fixed once for
-- players<->coach_team. This function is that same fix, applied here:
-- `postgres` (the role every migration and this function run as) has
-- BYPASSRLS in Supabase projects, so a SECURITY DEFINER function's
-- internal reads of players/coach_team/coach_players skip RLS entirely
-- rather than re-entering it, breaking the cycle without changing what
-- the policy actually allows. Named and shaped to sit alongside
-- is_guardian_of_team_player (0006) as its direct sibling.
create or replace function is_authorized_coach_for_player(check_player_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = check_player_id and ct.profile_id = auth.uid()
    )
    or exists (
      select 1 from coach_players cp
      where cp.player_id = check_player_id and cp.profile_id = auth.uid()
    );
$$;

-- SELECT only — no insert/update/delete grant or policy is added.
-- Narrowly scoped through guardians.player_id via the function above;
-- a coach can never see a guardian row for a player they don't coach,
-- and never a sibling merely because the same guardian owns both
-- players (the function is evaluated per-row, keyed to this exact
-- guardians.player_id, not to the guardian's profile_id).
--
-- "guardians: a parent can see their own links" (0001_init.sql) is
-- completely untouched — this is an additional policy, not a
-- replacement; Postgres evaluates all SELECT policies for a table as
-- an OR, so a guardian's own self-view is unaffected either way.
create policy "guardians: visible to assigned coaches"
  on guardians for select
  using (is_authorized_coach_for_player(guardians.player_id));
