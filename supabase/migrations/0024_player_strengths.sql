-- Coach Player Detail — Milestone 1: Recognised Strengths.
--
-- Coach-only to add ("Coach feedback will build this throughout the
-- season"), append-only by design — no update/delete policy at all.
-- Uncapped; guardian sees the growing list read-only.
create table player_strengths (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  created_by uuid not null references profiles (id),
  label text not null,
  created_at timestamptz not null default now()
);

alter table player_strengths enable row level security;
grant select, insert on player_strengths to authenticated;

create policy "player_strengths: visible to guardians of the player"
  on player_strengths for select
  using (exists (
    select 1 from guardians g
    where g.player_id = player_strengths.player_id and g.profile_id = auth.uid()
  ));

create policy "player_strengths: visible to coaches of the player's team"
  on player_strengths for select
  using (exists (
    select 1 from players p
    join coach_team ct on ct.team_id = p.team_id
    where p.id = player_strengths.player_id and ct.profile_id = auth.uid()
  ));

create policy "player_strengths: coaches can add for their team"
  on player_strengths for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from players p join coach_team ct on ct.team_id = p.team_id
      where p.id = player_strengths.player_id and ct.profile_id = auth.uid()
    )
  );

create index idx_player_strengths_player on player_strengths (player_id);
