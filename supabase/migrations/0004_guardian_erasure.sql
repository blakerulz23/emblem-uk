-- Emblem OS — guardian right-to-erasure
--
-- Adds the RLS policies needed to let a guardian delete their linked
-- player through /api/os/guardian/delete-player/[playerId]. Cascade
-- deletion (0001_init.sql) already handles removing linked moments,
-- media rows, and skill snapshots when the player row goes.
--
-- Also adds a delete policy on moments so a guardian can remove a
-- single moment (not the whole player) — a lighter-weight erasure
-- for "please delete this one photo" requests.

create policy "players: guardians can delete their linked player"
  on players for delete
  using (
    exists (
      select 1 from guardians g
      where g.player_id = players.id and g.profile_id = auth.uid()
    )
  );

create policy "moments: guardians can delete their submissions"
  on moments for delete
  using (
    exists (
      select 1 from guardians g
      where g.player_id = moments.player_id and g.profile_id = auth.uid()
    )
  );
