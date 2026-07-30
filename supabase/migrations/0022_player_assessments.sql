-- Coach Player Detail — Milestone 1: Coach's Assessment.
--
-- A real history, not a single mutable field — every assessment a coach
-- ever shares is preserved, never overwritten, consistent with how every
-- other real-facing record in this product works (moments are never
-- silently edited either). Card/Coach Player Detail always show the most
-- recent row; nothing here stops a coach from sharing an updated read
-- later as a fresh entry. Coach-only to write ("a trusted coach's current
-- read of this player"), append-only by design — no update/delete policy
-- at all, same shape as player_strengths.
create table player_assessments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  created_by uuid not null references profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table player_assessments enable row level security;
grant select, insert on player_assessments to authenticated;

create policy "player_assessments: visible to guardians of the player"
  on player_assessments for select
  using (exists (
    select 1 from guardians g
    where g.player_id = player_assessments.player_id and g.profile_id = auth.uid()
  ));

create policy "player_assessments: visible to coaches of the player's team"
  on player_assessments for select
  using (exists (
    select 1 from players p
    join coach_team ct on ct.team_id = p.team_id
    where p.id = player_assessments.player_id and ct.profile_id = auth.uid()
  ));

create policy "player_assessments: coaches can add for their team"
  on player_assessments for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from players p join coach_team ct on ct.team_id = p.team_id
      where p.id = player_assessments.player_id and ct.profile_id = auth.uid()
    )
  );

create index idx_player_assessments_player on player_assessments (player_id, created_at desc);
