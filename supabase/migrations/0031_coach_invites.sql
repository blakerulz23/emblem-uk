-- coach_invites — a guardian invites a specific coach, by email, to a
-- specific player. Same shape as player_invites/team_invites (code +
-- expires_at + used_at/used_by), reused deliberately rather than
-- inventing a third invite convention.
--
-- First-release scope is guardian-initiated and email-first only: the
-- guardian is always the one who creates a row here (RLS below only ever
-- grants insert to a guardian of player_id). invited_email is expected to
-- be set on every row this milestone creates — the code itself still
-- exists and is copyable as a secondary option (e.g. to send over
-- WhatsApp if the email is delayed or missed), but there is no
-- coach-generated or QR-originated invite in this milestone. Nothing
-- about this schema forecloses that later — it would just be a second
-- creator of the same row shape, the same way team_invites and
-- player_invites already coexist without a shared origin column.
create table coach_invites (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  code text unique not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid not null references profiles (id),
  invited_email text,
  used_at timestamptz,
  used_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table coach_invites enable row level security;

grant select, insert on coach_invites to authenticated;

create policy "coach_invites: guardians can view/create for their player"
  on coach_invites for select
  using (exists (
    select 1 from guardians g
    where g.player_id = coach_invites.player_id and g.profile_id = auth.uid()
  ));

create policy "coach_invites: guardians can create for their player"
  on coach_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from guardians g
      where g.player_id = coach_invites.player_id and g.profile_id = auth.uid()
    )
  );

-- Redeeming a code (a coach with no relationship to the player yet) goes
-- through the service-role client in the API route — RLS has no policy
-- for that case by design, identical reasoning to player_invites' own
-- comment at 0003_claiming_and_rosters.sql:159-161 and team_invites'
-- equivalent redemption route.

create index idx_coach_invites_player on coach_invites (player_id);
