-- Contract phase of the Season foundation expand-and-contract migration.
-- Only runs after production verification confirmed zero null season_id
-- rows on both tables and clean dual-write behavior end-to-end.

alter table teams alter column season_id set not null;
alter table player_skill_snapshots alter column season_id set not null;

-- Superseded by player_skill_snapshots_player_season_id_key (added in
-- migration 0014) now that every row has a real season_id.
alter table player_skill_snapshots drop constraint player_skill_snapshots_player_id_season_key;
