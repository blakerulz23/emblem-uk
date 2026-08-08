-- Manual verification script for 0036_player_coach_fields_secure_expand.sql.
--
-- SCOPE — read this before trusting anything below: every one of these
-- checks has already been proven once, mechanically, against a disposable
-- pglite database seeded with this repo's full migration history (47/47
-- checks passing — see the report). That proves real PostgreSQL grant/
-- constraint/SECURITY DEFINER behaviour, on real Postgres. It does NOT
-- prove anything about Supabase Auth issuing real JWTs, or about
-- PostgREST's own request handling and privilege caching in the actual
-- hosted platform — those are a different code path than a raw `set local
-- role` psql session, and neither has been exercised anywhere yet. This
-- script is what closes that gap: run it against a Supabase-hosted staging
-- branch (not production first — see the report's rollback/verification
-- plan) before treating date_of_birth's authorization boundary as
-- verified in the environment that actually matters.
--
-- NOT a migration — never picked up by `supabase db push`/CLI migration
-- tooling (lives outside supabase/migrations/ specifically so it can't be).
-- Not executed as part of this implementation: migration 0036 has not been
-- applied to any database yet. Run this against a Supabase-hosted staging
-- branch after 0036 is applied there, before it is ever applied to
-- production.
--
-- Requires: two real auth.users/profiles rows to impersonate — a guardian
-- of some test player, and a coach with NO connection to that player, plus
-- the already-connected coach. `set local role authenticated; set local
-- request.jwt.claims = ...` is the standard way to exercise RLS/SECURITY
-- DEFINER logic as a specific user from the SQL editor (mirrors how
-- PostgREST itself sets the session for a real request) — substitute real
-- UUIDs for the placeholders below. This still isn't a substitute for
-- check #5 (the real HTTP surface) and its equivalent for #7 below —
-- those two are the only checks here that exercise PostgREST itself
-- rather than a raw SQL session, and should not be skipped.

-- ============================================================================
-- 1. Guardian/player-facing: calculated age yes, raw DOB no
-- ============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<guardian_profile_id>')::text, true);

-- Expect: a number (or null if DOB unset) — never an error.
select public.get_player_age('<their_player_id>');

-- Expect: ERROR — permission denied for column date_of_birth.
select date_of_birth from players where id = '<their_player_id>';

-- Expect: ERROR — permission denied for column date_of_birth (Postgres
-- refuses `*` outright if the caller lacks privilege on any column it
-- would reference).
select * from players where id = '<their_player_id>';

rollback;

-- ============================================================================
-- 2. Authorised coach (team or direct connection to this exact player):
--    can retrieve DOB via the dedicated RPC, and can write via
--    update_player_coach_fields
-- ============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<authorised_coach_profile_id>')::text, true);

-- Expect: the real date (or null if unset) — never an error.
select public.get_player_date_of_birth('<their_player_id>');

-- Expect: succeeds silently.
select public.update_player_coach_fields(
  '<their_player_id>', '2016-03-20', 'U10', 138, 'Left', 'CM'
);

-- Expect: the row now reflects the write above.
select date_of_birth, football_age_group, height_cm, preferred_foot, secondary_position
from players where id = '<their_player_id>';

rollback;

-- ============================================================================
-- 3. Unrelated coach (no coach_team row for this player's team, no
--    coach_players row for this player): every coach-only path rejects
-- ============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<unrelated_coach_profile_id>')::text, true);

-- Expect: ERROR — "Not authorized to view this player's date of birth".
select public.get_player_date_of_birth('<some_other_coachs_player_id>');

-- Expect: ERROR — "Not authorized to update this player's details". The
-- row must be UNCHANGED after this (compare against a pre-call snapshot).
select public.update_player_coach_fields(
  '<some_other_coachs_player_id>', '2015-01-01', 'U11', 140, 'Right', 'ST'
);

-- get_player_age still succeeds IF this same profile also happens to be a
-- guardian of the player (age is not coach-restricted) — but if this
-- profile has *no* relationship to the player at all (not guardian, not
-- coach), expect ERROR — "Not authorized to view this player" here too.
select public.get_player_age('<some_other_coachs_player_id>');

rollback;

-- ============================================================================
-- 4. Anonymous / public Share Profile path never touches date_of_birth at
--    all — this is a service-role code-path check, not an RLS check (the
--    public profile route bypasses RLS entirely via createServiceRoleClient,
--    same as every other public.player-profile.ts query) — verify by
--    inspecting the query itself, not by impersonating anon in SQL.
-- ============================================================================
-- Confirms src/lib/public-player-profile.ts's explicit column allowlist
-- (grep the file, don't rely on this comment) never names date_of_birth,
-- age, football_age_group, height_cm, or preferred_foot — none of the five
-- fields this migration touches were ever in that allowlist, and this
-- migration does not add any of them. No SQL to run for this one; it's a
-- source-review check, listed here so it isn't silently skipped.

-- ============================================================================
-- 5. Direct Supabase REST rejects DOB regardless of role — the same check
--    as #1/#3 above but via the actual HTTP surface, not psql impersonation
--    (belt-and-braces: confirms the REVOKE is really in effect against
--    PostgREST's own privilege cache, not just in a raw SQL session).
-- ============================================================================
-- curl "$SUPABASE_URL/rest/v1/players?id=eq.<player_id>&select=date_of_birth" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer <a real guardian JWT>"
-- Expect: HTTP 400/42501, "permission denied for column date_of_birth" (or
-- similar PostgREST-wrapped Postgres error) — not 200 with the date, and
-- not silently omitted with a 200 and no error.

-- ============================================================================
-- 6. get_player_age / get_player_date_of_birth / update_player_coach_fields
--    reject an unauthenticated (anon) caller outright
-- ============================================================================
begin;
set local role anon;
select public.get_player_age('<any_player_id>'); -- Expect: ERROR — permission denied for function get_player_age
rollback;

-- ============================================================================
-- 7. update_primary_position — the only effective write path for primary
--    position (raw UPDATE on "position" is revoked), and the atomic
--    collision-clear behaviour when the new primary matches an existing
--    coach-set secondary_position.
-- ============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<guardian_profile_id>')::text, true);

-- Expect: ERROR — permission denied for column position.
update players set "position" = 'CB' where id = '<their_player_id>';

-- Pre-condition for the next call: their_player_id's secondary_position is
-- already set to some value, e.g. via update_player_coach_fields above —
-- substitute that same value as p_position here to exercise the collision
-- path; substitute a different value to exercise the non-collision path.

-- Non-collision: expect `false`, secondary_position preserved.
select public.update_primary_position('<their_player_id>', '<a_position_not_equal_to_their_secondary>');

-- Collision: expect `true`, and — checked by the SELECT after — that
-- secondary_position is now null and position is the new value, with no
-- raw constraint-violation error surfaced at any point.
select public.update_primary_position('<their_player_id>', '<their_current_secondary_position>');
select "position", secondary_position from players where id = '<their_player_id>';

rollback;

-- Real HTTP surface, mirroring check #5 — confirms the app's own route
-- (players/[id]/position/route.ts) gets a clean { ok: true,
-- secondaryPositionCleared } response, never a raw Postgres error body.
-- curl -X PATCH "$APP_URL/api/os/players/<their_player_id>/position" \
--   -H "Content-Type: application/json" --cookie "<a real guardian session cookie>" \
--   -d '{"position":"<their_current_secondary_position>"}'
-- Expect: 200, { "ok": true, "secondaryPositionCleared": true }.
