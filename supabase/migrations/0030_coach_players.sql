-- coach_players — the direct, team-independent coach↔player relationship.
--
-- Permanent sibling to coach_team, not a fallback: a coach's football-
-- development access to a player is granted by EITHER path (widened onto
-- players/moments/player_assessments/player_season_focus/player_strengths
-- in migration 0032, once this table exists and is populated). This table
-- never carries a team_id, club_id, or league concept — that's the whole
-- point. A row here can only ever authorize access to the one player_id it
-- names, so it structurally cannot grant roster/club/league access or
-- reach a sibling, no matter what future code reads it.
--
-- Modeled on guardians (0001_init.sql) — same composite-PK, no-status
-- shape. No status/soft-delete column: nothing downstream (player_
-- assessments, player_strengths, moments, player_season_focus) references
-- coach_players at all, so deleting a row here can never cascade into or
-- affect any historical content — "access ends, history remains" is a
-- property of the schema, not something this table needs to encode.
create table coach_players (
  player_id uuid not null references players (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  connected_at timestamptz not null default now(),
  -- Single allowed value today — this milestone ships exactly one way a
  -- direct connection can be created (a guardian-initiated email invite,
  -- see coach_invites below). Narrowed deliberately so a future second
  -- origin (e.g. a coach-generated code) is a one-line constraint widen,
  -- not a silent gap in what this column is allowed to claim happened.
  created_via text not null check (created_via in ('guardian_invite')),
  created_by uuid references profiles (id),
  primary key (player_id, profile_id)
);

alter table coach_players enable row level security;

-- select-only, explicitly — same defense-in-depth style as
-- 0025_story_updates.sql. No insert/update/delete grant, and (the real
-- enforcement boundary, since RLS denies by default) no insert/update/
-- delete POLICY either: every write (redeem on connect, guardian-or-self
-- on disconnect — milestone 2) goes through the service-role client
-- after the calling route has already verified the actor's authority
-- itself.
grant select on coach_players to authenticated;

create policy "coach_players: a coach can see their own connections"
  on coach_players for select
  using (auth.uid() = profile_id);

create policy "coach_players: guardians can see their player's connections"
  on coach_players for select
  using (exists (
    select 1 from guardians g
    where g.player_id = coach_players.player_id and g.profile_id = auth.uid()
  ));
-- No separate index on player_id — the composite primary key (player_id,
-- profile_id) already serves lookups filtered by its leading column.
