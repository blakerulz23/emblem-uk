-- Enables client-side postgres_changes subscriptions on these four tables.
-- Realtime respects each table's existing RLS, so a browser subscription
-- using the authenticated session key only ever receives rows that role
-- could already SELECT — this is an additional live-delivery channel on top
-- of RLS, not a bypass of it.
--
-- player_strengths and active_viewers are deliberately omitted: nothing
-- needs to *subscribe* to either (strengths has no live-viewing surface
-- yet; presence is read on-demand only, never pushed).
alter publication supabase_realtime add table story_updates;
alter publication supabase_realtime add table player_assessments;
alter publication supabase_realtime add table player_season_focus;
alter publication supabase_realtime add table moments;
