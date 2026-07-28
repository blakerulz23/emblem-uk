-- The legacy season-foundation cleanup deploy stopped writing to the
-- legacy teams.season text column, but that column was never made
-- nullable (Migration C, dropping it entirely, stays deferred) — it was
-- still NOT NULL from 0001_init.sql. Every new team insert started
-- violating that constraint (discovered live via a failed squad-order
-- approval). Relaxing it now is just doing the eventual column removal's
-- first step sooner, not reintroducing anything.
alter table teams alter column season drop not null;
