-- Schema supports all four tiers; only private/public are enforced or
-- selectable in phase one (family/club are reserved, not fabricated).
-- Default is private — guardian silence must never become publication.
alter table moments add column visibility text not null default 'private'
  check (visibility in ('private', 'family', 'club', 'public'));

-- Column-scoped grant — RLS can't see *which* column an UPDATE touches,
-- only which rows, so this is what actually stops the existing coach
-- verify/update policy from being usable to flip visibility as a side
-- effect. Same reasoning as story_updates.read_at earlier this project.
-- The route remains the authoritative check; this is defense-in-depth.
revoke update on moments from authenticated;
grant update (verification_status, verified_by, verified_at, visibility) on moments to authenticated;

create policy "moments: guardians can set visibility"
  on moments for update
  using (exists (select 1 from guardians g where g.player_id = moments.player_id and g.profile_id = auth.uid()))
  with check (exists (select 1 from guardians g where g.player_id = moments.player_id and g.profile_id = auth.uid()));

-- Publication audit trail — every visibility change, individual or bulk
-- ("Unpublish All"), gets one row. Service-role writes only, from the
-- visibility-mutation routes themselves — this codebase has zero
-- triggers by design; logic lives in routes, not the database.
create table moment_visibility_changes (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references moments (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  changed_by uuid references profiles (id) on delete set null,
  previous_visibility text not null,
  new_visibility text not null,
  created_at timestamptz not null default now()
);

alter table moment_visibility_changes enable row level security;
grant select on moment_visibility_changes to authenticated;

create policy "moment_visibility_changes: visible to guardians of the player"
  on moment_visibility_changes for select
  using (exists (select 1 from guardians g where g.player_id = moment_visibility_changes.player_id and g.profile_id = auth.uid()));
-- No insert/update/delete grant — every write goes through the
-- service-role client, from the visibility routes, right after the
-- moments.visibility update itself succeeds.

create index idx_moment_visibility_changes_player on moment_visibility_changes (player_id, created_at desc);
