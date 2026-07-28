-- 0014_seasons_foundation.sql added the "seasons: readable by
-- authenticated users" RLS policy but never granted the underlying
-- table-level SELECT to the authenticated role — RLS policies only
-- restrict *which rows* a grant already allows, they don't grant base
-- access. Any query embedding seasons (players/player_skill_snapshots'
-- teams(...seasons(label)) joins) returned 403 for every real parent
-- account, discovered live via a guardian whose Home/Card screens came
-- up blank despite a valid, confirmed guardian link and correct RLS
-- policy wording.
grant select on seasons to authenticated;
