-- Collection OS Phase 1 — Season foundation. Migration A (expand): purely
-- additive schema + a deterministic backfill using an already human-
-- reviewed, approved mapping (see the discovery query + review this
-- migration was built from — not derived at run time). season_id stays
-- nullable on both tables; the legacy free-text `season` columns and the
-- old unique(player_id, season) constraint are left untouched. This is
-- not the whole migration: application code dual-writes both the new
-- and legacy columns until every row is confirmed to have a non-null
-- season_id, only then does Migration B set NOT NULL and drop the old
-- constraint.
create table seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  normalized_label text not null unique,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

alter table seasons enable row level security;

-- No insert/update policy at all — matches cards' existing "secure by
-- default" convention. Every write goes through POST /api/os/seasons or
-- the staff approve route, both using the service-role client.
create policy "seasons: readable by authenticated users"
  on seasons for select
  using (auth.role() = 'authenticated');

alter table teams add column season_id uuid references seasons (id);
alter table player_skill_snapshots add column season_id uuid references seasons (id);

create index teams_season_id_idx on teams (season_id);
create index player_skill_snapshots_season_id_idx on player_skill_snapshots (season_id);

-- Coexists with the existing unique(player_id, season) for the whole
-- expand phase — Postgres unique constraints treat NULL as distinct, so
-- this is safe before every row has season_id populated. The old
-- constraint is dropped only in Migration B, once this one has taken
-- over.
alter table player_skill_snapshots
  add constraint player_skill_snapshots_player_season_id_key unique (player_id, season_id);

-- Deterministic backfill from the approved mapping (discovery run
-- 2026-07-27; "2026" confirmed to be legacy dev/test data with no
-- production historical meaning, canonicalized to the standard
-- Aug-Jul season format rather than preserved as its own season).
insert into seasons (label, normalized_label, starts_on, ends_on) values
  ('2025/26', '2025/26', '2025-08-01', '2026-07-31'),
  ('2026/27', '2026/27', '2026-08-01', '2027-07-31');

update teams set season_id = (select id from seasons where normalized_label = '2025/26') where season = '2025/26';
update teams set season_id = (select id from seasons where normalized_label = '2026/27') where season = '2026';

update player_skill_snapshots set season_id = (select id from seasons where normalized_label = '2025/26') where season = '2025/26';
update player_skill_snapshots set season_id = (select id from seasons where normalized_label = '2026/27') where season = '2026';
