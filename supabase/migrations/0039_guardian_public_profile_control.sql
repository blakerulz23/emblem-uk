-- Pre-pilot reliability and privacy fix pack — guardian-controlled public
-- profiles.
--
-- Closes the gap found in this milestone's audit: players.public_id_enabled
-- (0028_public_player_identity.sql) defaults to true, so a player's public
-- profile (/player/[publicPlayerId]) has been reachable by anyone with the
-- link the moment a card is claimed — never an explicit guardian decision.
-- The required product behaviour is that a new child's profile stays
-- private until a guardian explicitly turns it on via Share Profile, and
-- can be turned off again later; a disabled link must keep returning the
-- same safe not-found response it already does today
-- (getPublicPlayerProfile / page.tsx already handle that part correctly —
-- nothing to change there).
--
-- Real lifecycle, confirmed by reading every player-creation and claim
-- call site before writing this (src/app/api/order-enquiry/route.ts for
-- both single- and squad-order players, src/app/api/os/players/route.ts
-- for a coach's own "+Add Player", src/lib/public-player-id.ts for
-- claiming): a player row is created with NO public_player_id and no
-- explicit public_id_enabled — it silently takes whichever the column
-- DEFAULT was at that moment. public_player_id is set later, exactly
-- once, the first time a guardian claims the player
-- (ensurePublicPlayerId, called from POST /api/os/claim and POST
-- /api/os/invites/redeem) — and that claim path has never touched
-- public_id_enabled at all. So changing only the column DEFAULT (as an
-- earlier version of this migration did) is not enough: every player
-- created before this migration under the old true default, but not yet
-- claimed, already sits in the table with public_id_enabled = true —
-- claiming them would silently make their profile public the moment
-- ensurePublicPlayerId gives them a public_player_id, with no guardian
-- ever having made that decision. "Claimed" is identified the same way
-- claim-player.ts itself defines it: a guardians row exists for that
-- player.
--
-- Compatibility / backfill decision (reported, with the row count this
-- predicate matched on staging, before this ran anywhere): change the
-- column DEFAULT for future inserts, AND backfill public_id_enabled to
-- false for exactly the players that are BOTH currently enabled AND
-- currently unclaimed (no guardians row) — never touching any player
-- that already has a guardian, regardless of that player's current
-- enabled/disabled value. This is deliberately narrower than "every
-- non-claimed-and-shared row": an unclaimed player can only ever have
-- reached enabled=true via the old default or a staff override, never a
-- guardian's own Share Profile action (the guardian-only RPC below
-- requires a guardians row to exist at all) — so there is no real
-- "deliberately shared" unclaimed link this could break, unlike an
-- already-claimed player's setting, which this backfill leaves alone in
-- every case.
alter table players alter column public_id_enabled set default false;

update players
set public_id_enabled = false
where public_id_enabled = true
  and not exists (
    select 1 from guardians g where g.player_id = players.id
  );

-- The guardian-facing toggle. `authenticated` already has table-scoped
-- SELECT on public_player_id/public_id_enabled (0036, Part 6) but no
-- UPDATE grant on either (only service_role has that, 0037) — same
-- situation update_primary_position solved for `position`, same fix here:
-- a SECURITY DEFINER RPC that enforces its own guardian-authorization
-- check rather than widening the raw column grant to every authenticated
-- user for every player.
create or replace function public.update_player_public_visibility(p_player_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to change this player''s public profile visibility';
  end if;

  update public.players set public_id_enabled = p_enabled where id = p_player_id;

  return p_enabled;
end;
$$;

revoke all on function public.update_player_public_visibility(uuid, boolean) from public;
revoke all on function public.update_player_public_visibility(uuid, boolean) from anon;
grant execute on function public.update_player_public_visibility(uuid, boolean) to authenticated;
