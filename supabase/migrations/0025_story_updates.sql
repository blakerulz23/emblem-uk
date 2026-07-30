create table story_updates (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references profiles (id),
  actor_profile_id uuid references profiles (id) on delete set null,
  player_id uuid not null references players (id) on delete cascade,
  event_type text not null check (event_type in (
    'assessment_shared','recognition','moment_verified','season_focus_added',
    'coach_connected','moment_uploaded','verification_required','guardian_connected'
  )),
  category text not null check (category in ('coach','collection','family')),
  title text not null,
  body text not null,
  related_moment_id uuid references moments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table story_updates enable row level security;

grant select on story_updates to authenticated;
grant update (read_at) on story_updates to authenticated;
-- Deliberately no insert/delete grant to authenticated at all — every insert
-- goes through the service-role helper (src/lib/story-updates.ts), after the
-- calling route has already authorized the underlying write via normal RLS
-- on the source table. This sidesteps "a guardian's action must write a
-- coach's row" without a bespoke RPC. The column-scoped update grant (only
-- read_at, not the whole row) is what stops a recipient rewriting their own
-- row's title/body/event_type — RLS alone is row-level, not column-level,
-- and can't express that restriction (same reasoning as
-- update_secondary_position in 0021_players_coach_fields.sql, just a plain
-- GRANT here since no relationship/business-rule check is needed beyond
-- "is this your row", which RLS already covers).

create policy "story_updates: recipient can select their own"
  on story_updates for select
  using (recipient_profile_id = auth.uid());

create policy "story_updates: recipient can mark their own read"
  on story_updates for update
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

create index idx_story_updates_recipient_created on story_updates (recipient_profile_id, created_at desc);
create index idx_story_updates_recipient_unread on story_updates (recipient_profile_id) where read_at is null;
