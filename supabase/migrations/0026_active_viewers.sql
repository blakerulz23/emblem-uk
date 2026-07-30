-- Presence for Story Updates' "were they already watching this happen"
-- check (src/lib/story-updates.ts). A plain heartbeat table, not Supabase
-- Realtime Presence: the generation helper runs inside a stateless
-- serverless API route and needs one fast, synchronous Postgres read, not a
-- websocket join/sync round trip. TTL-only liveness (no "leaving" signal is
-- required for correctness) — see 0027's realtime note and
-- src/app/os/usePresenceHeartbeat.ts for the ~10s heartbeat / ~25s
-- present-window convention.
create table active_viewers (
  profile_id uuid not null references profiles (id),
  scope text not null,
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, scope)
);

alter table active_viewers enable row level security;

grant select, insert, update, delete on active_viewers to authenticated;

-- A user only ever manages their own presence row — same shape as
-- player_season_focus's "creator can update their own entry"
-- (0023_player_season_focus.sql). The generation helper's cross-user READ of
-- other people's presence goes through the service-role client, which
-- bypasses RLS entirely, so no separate read policy for other profiles is
-- needed here.
create policy "active_viewers: manage own presence"
  on active_viewers for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
