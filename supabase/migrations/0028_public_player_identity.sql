-- Permanent public player identity — separate from players.id (internal
-- PK, never exposed) and cards.claim_token (secret, one-time activation
-- only). Generated exactly once, inside the claim transaction
-- (POST /api/os/claim) — never lazily on a later read. Nullable: an
-- unclaimed player has no public identity and never will unless a real
-- claim happens.
alter table players add column public_player_id text unique;
alter table players add column public_id_enabled boolean not null default true;
alter table players add column public_id_rotated_at timestamptz;

create index idx_players_public_player_id on players (public_player_id) where public_player_id is not null;

-- One-time backfill for players claimed before this migration existed.
-- Going forward, generation only ever happens inside the claim
-- transaction (per amendment 1) — this is the one and only bulk
-- generation this system will ever do. 128 bits of entropy per id makes a
-- collision across even thousands of rows astronomically unlikely; the
-- unique constraint still guards it — a real collision fails this
-- migration loudly rather than silently overwriting anything.
update players
set public_player_id = rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
where public_player_id is null
  and exists (select 1 from cards c where c.player_id = players.id and c.status = 'claimed');
