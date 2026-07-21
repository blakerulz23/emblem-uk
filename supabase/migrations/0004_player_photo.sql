-- Emblem OS — Phase 2, Milestone 1: real player photo.
--
-- Stores the private S3 key, never a public URL — a signed download URL
-- is generated on read (getSignedDownloadUrl), same pattern moment_media
-- already uses. Writable by the existing "players: guardians can update
-- their player" policy from 0001_init.sql — no new RLS needed here.
alter table players add column photo_key text;

-- ---------------------------------------------------------------------------
-- Phase 2, Milestone 3: real guardian/coach names.
--
-- profiles.display_name and guardians.relationship already exist as
-- columns but nothing ever wrote to them. The only SELECT policy on
-- profiles is "read own row" — showing a co-guardian's or a coach's real
-- name requires deliberately opening a small, narrow slice of visibility,
-- scoped strictly to a shared player relationship (never a global
-- "look up any profile"). Mirrors the exact join shape cards/player_invites
-- already use in 0003_claiming_and_rosters.sql.
-- ---------------------------------------------------------------------------
create policy "profiles: guardians can view co-guardians of a shared player"
  on profiles for select
  using (
    exists (
      select 1 from guardians g1
      join guardians g2 on g2.player_id = g1.player_id
      where g1.profile_id = auth.uid() and g2.profile_id = profiles.id
    )
  );

create policy "profiles: guardians can view coaches of their player's team"
  on profiles for select
  using (
    exists (
      select 1 from guardians g
      join players p on p.id = g.player_id
      join coach_team ct on ct.team_id = p.team_id
      where g.profile_id = auth.uid() and ct.profile_id = profiles.id
    )
  );

-- ---------------------------------------------------------------------------
-- Phase 2, Milestone 4: favourite player / football ambition.
-- Writable by the existing "players: guardians can update their player"
-- policy from 0001_init.sql — no new RLS needed here.
-- ---------------------------------------------------------------------------
alter table players add column favourite_player text;
alter table players add column football_ambition text;

-- ---------------------------------------------------------------------------
-- Phase 2, Milestone 6: season goals.
-- Either a guardian or a coach can create a goal for a player they have a
-- real relationship to; only the creator can update its own goal's
-- progress — RLS can't see "who created this claim," but it can see who
-- created this *row*, so creator-only update is enforced structurally here,
-- not just in the route.
-- ---------------------------------------------------------------------------
create table player_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  created_by uuid not null references profiles (id),
  label text not null,
  target int not null check (target > 0),
  current int not null default 0 check (current >= 0),
  unit text, -- e.g. 'clean sheets', 'matches'; null for percentage/binary goals
  status text not null default 'in-progress' check (status in ('in-progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table player_goals enable row level security;
grant select, insert, update, delete on player_goals to authenticated;

create policy "player_goals: visible to guardians of the player"
  on player_goals for select
  using (exists (
    select 1 from guardians g
    where g.player_id = player_goals.player_id and g.profile_id = auth.uid()
  ));

create policy "player_goals: visible to coaches of the player's team"
  on player_goals for select
  using (exists (
    select 1 from players p
    join coach_team ct on ct.team_id = p.team_id
    where p.id = player_goals.player_id and ct.profile_id = auth.uid()
  ));

create policy "player_goals: guardians can create for their player"
  on player_goals for insert
  with check (
    created_by = auth.uid()
    and exists (select 1 from guardians g where g.player_id = player_goals.player_id and g.profile_id = auth.uid())
  );

create policy "player_goals: coaches can create for their team"
  on player_goals for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from players p join coach_team ct on ct.team_id = p.team_id
      where p.id = player_goals.player_id and ct.profile_id = auth.uid()
    )
  );

create policy "player_goals: creator can update their own goal"
  on player_goals for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "player_goals: creator can delete their own goal"
  on player_goals for delete using (created_by = auth.uid());

create index idx_player_goals_player on player_goals (player_id);
