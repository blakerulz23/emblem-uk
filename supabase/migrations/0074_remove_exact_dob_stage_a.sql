-- ============================================================================
-- Gate 2 — exact date of birth removal, Stage A of two.
--
-- Founder declaration (Blake, on behalf of Lauda Cartoons Ltd, recorded in
-- this migration verbatim as the authorization for this change):
--
--   "Lauda Cartoons Ltd has identified no printing, NFC, delivery, payment,
--   safeguarding or football-card purpose requiring Emblem to store a
--   child's exact date of birth. Football age group is sufficient for
--   Emblem's product. Any club registration requirement remains outside
--   Emblem."
--
-- WHY exact DOB is unnecessary: a full Gate 2 discovery pass (read-only,
-- documented separately) traced every occurrence of players.date_of_birth
-- in this codebase. It was written by exactly one atomic RPC
-- (update_player_coach_fields, below), read by exactly two RPCs
-- (get_player_age / get_player_date_of_birth, below), and displayed in
-- exactly two places in the whole app: a coach-only input on Coach Player
-- Details, and a calculated-age tile on the guardian-facing Card "About"
-- face. No printing, PDF, artwork, NFC activation, Shopify/payment,
-- fulfilment or Squad Invite code path was found to read or depend on it —
-- Squad Invite has in fact never accepted DOB at all
-- (squad-invite-mvp-contract.test.ts already asserts this). The DPIA's own
-- risk register (docs/compliance/childrens-dpia-v0.1.md, risk R19 and the
-- data-inventory table in section 5) already flagged exact DOB as a
-- minimisation gap, recommending derivation of an age band with DOB
-- deletion where possible — this migration acts on that recommendation.
--
-- WHY football_age_group is retained: it is a fully independent,
-- coach-assigned classification (U7..U18), never derived from DOB or the
-- current date, already sufficient for every legitimate football-product
-- need identified (team grouping, "playing up" cases, card display). This
-- migration does not touch its column definition, its CHECK constraint, or
-- its grants at all.
--
-- WHY the players.date_of_birth column remains for now (Stage A only): this
-- is a two-stage removal. Stage A (this migration) erases every existing
-- value, disables every application-role path that could read or write a
-- new one, and drops both read RPCs outright. It deliberately leaves the
-- now-permanently-null column in place so Stage A can be released and
-- independently verified (application behaviour, disposable database
-- checks, a full deploy cycle) before anything structural changes. Stage B
-- — a separate, later migration — drops players.date_of_birth and its
-- CHECK constraint once Stage A has been confirmed safe in production.
-- Stage B is explicitly out of scope for this migration; nothing here
-- assumes or depends on it happening on any particular timeline.
--
-- This migration never selects, returns, logs or otherwise exposes an
-- individual date_of_birth value. The erase step below is a blind
-- unconditional UPDATE ... WHERE date_of_birth IS NOT NULL with no
-- RETURNING clause; verification of its effect is done exclusively via
-- COUNT(*), never by reading a row.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Part 1 — securely erase every existing exact-DOB value. Deterministic,
-- idempotent (a second run affects zero rows), and safe to run once in a
-- single transaction alongside the RPC changes below — a partially applied
-- state (values erased but old RPCs still reachable, or vice versa) is
-- exactly the broken state this migration exists to make impossible, so
-- both happen together or neither does.
-- ----------------------------------------------------------------------------
update public.players
set date_of_birth = null
where date_of_birth is not null;

-- ----------------------------------------------------------------------------
-- Part 2 — disable and drop the two read-only DOB RPCs. Neither is called
-- anywhere in the application any more (the coach-only date-of-birth field
-- on Coach Player Details and the guardian-facing calculated-age tile on
-- Card.tsx were both removed in this same release, replaced by the
-- existing football_age_group field) — dropped outright rather than left
-- reachable-but-unused, so no future code, direct RPC probe, or stale
-- client build can read a date of birth through them again.
-- ----------------------------------------------------------------------------
revoke execute on function public.get_player_age(uuid) from authenticated;
revoke execute on function public.get_player_date_of_birth(uuid) from authenticated;
drop function if exists public.get_player_age(uuid);
drop function if exists public.get_player_date_of_birth(uuid);

-- ----------------------------------------------------------------------------
-- Part 3 — replace update_player_coach_fields with a 4-parameter signature
-- that no longer accepts a date of birth at all. The old 5-parameter
-- signature (uuid, date, text, int, text, text) is dropped, not merely
-- superseded — in Postgres a different parameter list is a distinct
-- function, so dropping it is what actually makes the old call shape
-- unreachable, rather than leaving a second, still-callable overload
-- sitting alongside the new one.
--
-- Every other line below — the authorization check, the
-- football_age_group/height_cm/preferred_foot/secondary_position
-- validation, the primary-position collision check, the update statement,
-- the grant shape — is reproduced unchanged from
-- 0036_player_coach_fields_secure_expand.sql's Part 5, with only the
-- date-of-birth parameter and its own validation block removed. Football
-- age group, height, preferred foot and secondary position behave
-- identically to before this migration.
-- ----------------------------------------------------------------------------
drop function if exists public.update_player_coach_fields(uuid, date, text, int, text, text);

create function public.update_player_coach_fields(
  p_player_id uuid,
  p_football_age_group text,
  p_height_cm int,
  p_preferred_foot text,
  p_secondary_position text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_primary_position text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.players p
    join public.coach_team ct on ct.team_id = p.team_id
    where p.id = p_player_id and ct.profile_id = auth.uid()
  ) or exists (
    select 1 from public.coach_players cp
    where cp.player_id = p_player_id and cp.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to update this player''s details';
  end if;

  if p_football_age_group is not null
     and p_football_age_group not in ('U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18') then
    raise exception 'Unsupported football age group: %', p_football_age_group;
  end if;

  if p_height_cm is not null and (p_height_cm < 80 or p_height_cm > 220) then
    raise exception 'Height must be between 80 and 220cm';
  end if;

  if p_preferred_foot is not null and p_preferred_foot not in ('Left', 'Right', 'Both') then
    raise exception 'Unsupported preferred foot: %', p_preferred_foot;
  end if;

  if p_secondary_position is not null
     and p_secondary_position not in ('GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST') then
    raise exception 'Unsupported secondary position: %', p_secondary_position;
  end if;

  select "position" into v_primary_position from public.players where id = p_player_id;
  if p_secondary_position is not null and p_secondary_position = v_primary_position then
    raise exception 'Secondary position cannot match the primary position';
  end if;

  update public.players
  set
    football_age_group = p_football_age_group,
    height_cm = p_height_cm,
    preferred_foot = p_preferred_foot,
    secondary_position = p_secondary_position,
    coach_fields_updated_at = now()
  where id = p_player_id;
end;
$$;

revoke all on function public.update_player_coach_fields(uuid, text, int, text, text) from public;
revoke all on function public.update_player_coach_fields(uuid, text, int, text, text) from anon;
grant execute on function public.update_player_coach_fields(uuid, text, int, text, text) to authenticated;

commit;
