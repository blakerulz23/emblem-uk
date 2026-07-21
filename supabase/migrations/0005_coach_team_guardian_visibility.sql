-- Emblem OS — Phase 2 follow-up: coach_team's only SELECT policy
-- ("a coach can see their own assignments") blocks a guardian from
-- reading it at all, which silently zeroed out the coach side of
-- "Connections & Privacy" — RLS rejected the coach_team row before the
-- nested profiles join ever ran. Mirrors the same relationship shape as
-- "profiles: guardians can view coaches of their player's team" (0004),
-- applied to coach_team itself.
create policy "coach_team: guardians of a player on this team can view"
  on coach_team for select
  using (
    exists (
      select 1 from guardians g
      join players p on p.id = g.player_id
      where g.profile_id = auth.uid() and p.team_id = coach_team.team_id
    )
  );
