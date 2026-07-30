-- Coach Player Detail — Milestone 1: coach-only Secondary Position.
--
-- Secondary Position is a coach's football judgement based on training and
-- matches, not family information — a guardian may view it but must never
-- write it. Primary Position stays exactly as it is today: guardian-managed
-- through Profile, via the existing "players: guardians can update their
-- player" policy (0001_init.sql). This migration does NOT add any coach
-- UPDATE policy on `players` — a broad row-level UPDATE grant would be
-- column-blind (Postgres RLS is row-level, not column-level) and would let
-- a coach touch any column on the row, not just this one. There is no
-- shared, last-write-wins ownership of `players.position` — that field
-- remains guardian-only.
--
-- Instead, Secondary Position gets its own narrowly-scoped write boundary:
-- a SECURITY DEFINER function that (a) explicitly checks the caller is a
-- coach of this specific player's team, (b) validates and normalizes the
-- submitted value, and (c) can only ever write `secondary_position` —
-- there is no other column it is capable of touching, by construction, not
-- by convention.
--
-- SECURITY DEFINER functions run with the definer's privileges and bypass
-- RLS internally, which is why the authorization check has to be explicit
-- and done first, inside the function itself. Two further hardenings
-- beyond that check:
--   - `search_path = ''` (not just `public`) so name resolution can't be
--     hijacked by a search-path manipulation; every referenced object is
--     therefore schema-qualified below. `auth.uid()` and built-ins
--     (trim/length/nullif, all pg_catalog) are unaffected — pg_catalog is
--     always implicitly searched regardless of search_path, and auth.uid()
--     is already schema-qualified.
--   - Postgres grants EXECUTE on a new function to PUBLIC by default —
--     explicitly revoked below (from both `public` and `anon`) before
--     granting only to `authenticated`, so an unauthenticated request can't
--     even reach the authorization check.
alter table players add column secondary_position text;

create or replace function public.update_secondary_position(p_player_id uuid, p_secondary_position text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text;
begin
  if not exists (
    select 1 from public.players p
    join public.coach_team ct on ct.team_id = p.team_id
    where p.id = p_player_id and ct.profile_id = auth.uid()
  ) then
    raise exception 'Not authorized to update this player''s secondary position';
  end if;

  -- Normalize: trim whitespace, blank becomes null (never an empty string),
  -- reject anything unreasonably long rather than silently truncating it.
  v_value := nullif(trim(p_secondary_position), '');
  if v_value is not null and length(v_value) > 60 then
    raise exception 'Secondary position must be 60 characters or fewer';
  end if;

  update public.players set secondary_position = v_value where id = p_player_id;
end;
$$;

revoke all on function public.update_secondary_position(uuid, text) from public;
revoke all on function public.update_secondary_position(uuid, text) from anon;
grant execute on function public.update_secondary_position(uuid, text) to authenticated;
