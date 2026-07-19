-- Emblem OS — Phase 0 foundation schema
--
-- Run this against a fresh Supabase project (SQL Editor, or `supabase db push`
-- once you've linked the CLI to your project). Every table has Row Level
-- Security enabled — that's the actual security boundary the app relies on,
-- not optional hardening. The anon/authenticated client key can only ever
-- see what these policies allow; the service-role key (server-only, never
-- shipped to the browser) bypasses RLS for admin/migration tasks.

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user (parent/guardian or coach)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text check (role in ('parent', 'coach')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: read own row"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: update own row"
  on profiles for update
  using (auth.uid() = id);

create policy "profiles: insert own row on signup"
  on profiles for insert
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- clubs / teams
-- ---------------------------------------------------------------------------
create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  badge_url text,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null,
  season text not null,
  created_at timestamptz not null default now()
);

alter table clubs enable row level security;
alter table teams enable row level security;

-- Clubs/teams are readable by any signed-in user (badges, names — not
-- sensitive) but only writable via the service role (admin-managed for now).
create policy "clubs: readable by authenticated users"
  on clubs for select
  using (auth.role() = 'authenticated');

create policy "teams: readable by authenticated users"
  on teams for select
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- coach_team — many-to-many: which coaches can act on which teams
-- ---------------------------------------------------------------------------
create table coach_team (
  team_id uuid not null references teams (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (team_id, profile_id)
);

alter table coach_team enable row level security;

create policy "coach_team: a coach can see their own assignments"
  on coach_team for select
  using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- players — replaces the hardcoded SQUAD / PLAYER_PROFILE constants
-- ---------------------------------------------------------------------------
create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams (id) on delete set null,
  name text not null,
  "position" text,
  age int,
  height text,
  preferred_foot text check (preferred_foot in ('Left', 'Right')),
  -- the link between a physical Emblem card's NFC chip and this player record
  card_nfc_id text unique,
  created_at timestamptz not null default now()
);

alter table players enable row level security;

-- ---------------------------------------------------------------------------
-- guardians — many-to-many: which profiles (parents) can act on which
-- players. Modeled many-to-many from day one so multi-guardian support in a
-- later phase isn't a breaking migration.
-- ---------------------------------------------------------------------------
create table guardians (
  player_id uuid not null references players (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  relationship text,
  primary key (player_id, profile_id)
);

alter table guardians enable row level security;

create policy "guardians: a parent can see their own links"
  on guardians for select
  using (auth.uid() = profile_id);

-- Players are visible to their guardians and to coaches of their team.
create policy "players: visible to guardians"
  on players for select
  using (
    exists (
      select 1 from guardians g
      where g.player_id = players.id and g.profile_id = auth.uid()
    )
  );

create policy "players: visible to assigned coaches"
  on players for select
  using (
    players.team_id is not null
    and exists (
      select 1 from coach_team ct
      where ct.team_id = players.team_id and ct.profile_id = auth.uid()
    )
  );

create policy "players: guardians can update their player"
  on players for update
  using (
    exists (
      select 1 from guardians g
      where g.player_id = players.id and g.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- player_skill_snapshots — the Skills/Development data, one row per season.
-- Stored as jsonb matching playerProfile.ts's SkillCategory[] shape rather
-- than fully normalized — nothing needs to query into individual skills
-- across players yet, and this keeps the TypeScript shape a near-direct
-- hydration target instead of a multi-table join.
-- ---------------------------------------------------------------------------
create table player_skill_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  season text not null,
  overall_score int not null,
  seasonal_change int not null default 0,
  skills jsonb not null, -- SkillCategory[] — see src/app/os/playerProfile.ts
  coach_summary jsonb,   -- CoachSummary — see src/app/os/playerProfile.ts
  created_at timestamptz not null default now(),
  unique (player_id, season)
);

alter table player_skill_snapshots enable row level security;

create policy "skill snapshots: visible to guardians"
  on player_skill_snapshots for select
  using (
    exists (
      select 1 from guardians g
      where g.player_id = player_skill_snapshots.player_id and g.profile_id = auth.uid()
    )
  );

create policy "skill snapshots: visible to assigned coaches"
  on player_skill_snapshots for select
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = player_skill_snapshots.player_id and ct.profile_id = auth.uid()
    )
  );

-- Only coaches write skill assessments — matches the product rule that
-- scores are coach-assessed, never self-reported or achievement-derived.
create policy "skill snapshots: coaches can write"
  on player_skill_snapshots for insert
  with check (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = player_skill_snapshots.player_id and ct.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- moments — replaces the hardcoded MOMENTS/EVENTS table. This is the real
-- "collection" the Add-Moment flow writes into.
-- ---------------------------------------------------------------------------
create table moments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  title text not null,
  occurred_on date,
  trust text not null check (trust in ('club', 'league', 'coach', 'parent', 'player')),
  note text,
  uploaded_by uuid references profiles (id),
  verified_by uuid references profiles (id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table moment_media (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references moments (id) on delete cascade,
  s3_key text not null,
  kind text not null check (kind in ('photo', 'video')),
  created_at timestamptz not null default now()
);

alter table moments enable row level security;
alter table moment_media enable row level security;

create policy "moments: visible to guardians"
  on moments for select
  using (
    exists (
      select 1 from guardians g
      where g.player_id = moments.player_id and g.profile_id = auth.uid()
    )
  );

create policy "moments: visible to assigned coaches"
  on moments for select
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = moments.player_id and ct.profile_id = auth.uid()
    )
  );

create policy "moments: guardians can submit for their player"
  on moments for insert
  with check (
    exists (
      select 1 from guardians g
      where g.player_id = moments.player_id and g.profile_id = auth.uid()
    )
  );

create policy "moments: coaches can create recognitions for their team"
  on moments for insert
  with check (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = moments.player_id and ct.profile_id = auth.uid()
    )
  );

create policy "moments: coaches can verify/update for their team"
  on moments for update
  using (
    exists (
      select 1 from players p
      join coach_team ct on ct.team_id = p.team_id
      where p.id = moments.player_id and ct.profile_id = auth.uid()
    )
  );

create policy "moment_media: follows parent moment's visibility"
  on moment_media for select
  using (
    exists (
      select 1 from moments m
      left join guardians g on g.player_id = m.player_id and g.profile_id = auth.uid()
      left join players p on p.id = m.player_id
      left join coach_team ct on ct.team_id = p.team_id and ct.profile_id = auth.uid()
      where m.id = moment_media.moment_id
        and (g.profile_id is not null or ct.profile_id is not null)
    )
  );

create policy "moment_media: guardians can attach media to their submission"
  on moment_media for insert
  with check (
    exists (
      select 1 from moments m
      join guardians g on g.player_id = m.player_id and g.profile_id = auth.uid()
      where m.id = moment_media.moment_id
    )
  );

-- ---------------------------------------------------------------------------
-- Indexes for the lookups the app actually does
-- ---------------------------------------------------------------------------
create index idx_guardians_profile on guardians (profile_id);
create index idx_coach_team_profile on coach_team (profile_id);
create index idx_players_team on players (team_id);
create index idx_moments_player on moments (player_id);
create index idx_moment_media_moment on moment_media (moment_id);
create index idx_skill_snapshots_player_season on player_skill_snapshots (player_id, season);
