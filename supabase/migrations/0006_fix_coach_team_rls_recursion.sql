-- Emblem OS — fixes infinite RLS recursion introduced by 0005.
--
-- players' own pre-existing "visible to assigned coaches" policy (0001)
-- reads coach_team to check `ct.profile_id = auth.uid()`. 0005 then added
-- a coach_team policy that reads players (via guardians -> players) to
-- check `p.team_id = coach_team.team_id`. Together that's a genuine
-- cycle: evaluating RLS on players can require evaluating RLS on
-- coach_team, which can require evaluating RLS on players again —
-- Postgres correctly refuses this as "infinite recursion detected in
-- policy for relation players" the moment both tables are touched in
-- the same query (which happens on every normal coach roster read, not
-- just the new Phase 2 screens).
--
-- Fix: move the guardian-relationship check into a SECURITY DEFINER
-- function. `postgres` (the role these migrations run as) has BYPASSRLS
-- in Supabase projects, so the function's internal reads of `guardians`
-- and `players` skip RLS entirely rather than re-entering it — breaking
-- the cycle without changing what the policy actually allows.
create or replace function is_guardian_of_team_player(check_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from guardians g
    join players p on p.id = g.player_id
    where g.profile_id = auth.uid() and p.team_id = check_team_id
  );
$$;

drop policy if exists "coach_team: guardians of a player on this team can view" on coach_team;
create policy "coach_team: guardians of a player on this team can view"
  on coach_team for select
  using (is_guardian_of_team_player(coach_team.team_id));
