-- Platform hardening — explicit, least-privilege service_role grants.
-- Applied at Stage 1, alongside 0036_player_coach_fields_secure_expand.sql
-- — bundled there for scheduling convenience only (both are additive and
-- independent; see that file's own header for why). Not itself one of the
-- coach-fields feature's own Stage 0/1/2/2.5/3 sequence — this corrects a
-- separate, pre-existing, unrelated gap (see the report: no migration in
-- this repo's history had ever explicitly granted `service_role` anything).
--
-- ============================================================================
-- ROOT CAUSE (confirmed read-only against a disposable staging project, see
-- the report): every migration in this repo runs as the `postgres` role.
-- Postgres's default ACL for tables created by `postgres` (as opposed to
-- `supabase_admin`, which the Supabase Table Editor UI uses) grants
-- `service_role` only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on those tables —
-- never real data access. Confirmed via `has_table_privilege`, `pg_default_acl`,
-- and a real PostgREST request, all agreeing. `0002_grants.sql` explicitly
-- grants `authenticated` full access; no migration before this one has ever
-- explicitly granted `service_role` anything. Any access `service_role` has
-- on any existing project (including production) is therefore either this
-- migration, or undocumented, out-of-band drift this migration intentionally
-- supersedes — see Part 0 below.
--
-- This migration is deliberately explicit rather than relying on
-- `alter default privileges` or any other project-level default: the entire
-- point is that service_role's permissions must be readable from version
-- control alone, not from however a given Supabase project happened to be
-- provisioned. A future table or route that needs service_role access
-- requires its own deliberate migration — this file does not, and must not,
-- grant anything to tables that do not yet exist.
--
-- SCOPE: derived from an exhaustive audit of every createServiceRoleClient()
-- call site in src/ (32 files) — see the report for the full per-route
-- breakdown. No sequences, views, or RPC/function calls run via the
-- service-role client anywhere in this codebase (confirmed: every table uses
-- a uuid primary key with gen_random_uuid(), no views exist, and every
-- .rpc() call in the app runs on the session-scoped client, never
-- service-role) — so this migration contains table/column grants only.
--
-- date_of_birth, football_age_group, height_cm, preferred_foot, and
-- coach_fields_updated_at are deliberately absent from every grant below:
-- the audit found zero service-role code paths that read or write any of
-- them. Per the standing rule for this feature, service-role access to a
-- coach-owned field — DOB above all — is added only when a real, audited,
-- trusted server process needs it, never preemptively or by default.
--
-- Idempotent and safe to re-run: every REVOKE/GRANT below is naturally
-- idempotent in Postgres (revoking a privilege that isn't held, or granting
-- one that already is, is a no-op, not an error) — re-running this migration
-- through the migration system produces the same end state every time.
-- Every statement is schema-qualified (`public.<table>`) so it cannot
-- silently resolve against the wrong schema. If any table named below does
-- not exist, the GRANT/REVOKE against it fails loudly with a plain Postgres
-- "relation does not exist" error and the whole transaction rolls back —
-- deliberately not wrapped in existence checks that would swallow that.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- Part 0 — canonicalise: revoke whatever service_role's DML privileges on
-- these tables currently are (documented or not) before granting the
-- audited set. This is what makes this migration authoritative rather than
-- additive — it produces the same end state whether the starting point is a
-- fresh project with zero grants (staging, before this migration) or a
-- project with undocumented broad grants already in place (production may
-- be exactly this — its current service_role access is not explained by
-- any migration file). REVOKE here is scoped to SELECT/INSERT/UPDATE/DELETE
-- specifically — TRUNCATE/REFERENCES/TRIGGER/MAINTAIN are structural
-- privileges, not DML, and are left untouched (service_role already had
-- them from the default ACL and no audited route needs them changed).
-- ---------------------------------------------------------------------------
revoke select, insert, update, delete on public.players from service_role;
revoke select, insert, update, delete on public.cards from service_role;
revoke select, insert, update, delete on public.orders from service_role;
revoke select, insert, update, delete on public.card_definitions from service_role;
revoke select, insert, update, delete on public.moments from service_role;
revoke select, insert, update, delete on public.moment_media from service_role;
revoke select, insert, update, delete on public.guardians from service_role;
revoke select, insert, update, delete on public.coach_team from service_role;
revoke select, insert, update, delete on public.coach_players from service_role;
revoke select, insert, update, delete on public.player_invites from service_role;
revoke select, insert, update, delete on public.coach_invites from service_role;
revoke select, insert, update, delete on public.team_invites from service_role;
revoke select, insert, update, delete on public.profiles from service_role;
revoke select, insert, update, delete on public.seasons from service_role;
revoke select, insert, update, delete on public.teams from service_role;
revoke select, insert, update, delete on public.clubs from service_role;
revoke select, insert, update, delete on public.claim_attempts from service_role;
revoke select, insert, update, delete on public.story_updates from service_role;
revoke select, insert, update, delete on public.active_viewers from service_role;
revoke select, insert, update, delete on public.moment_visibility_changes from service_role;
revoke select, insert, update, delete on public.staff_accounts from service_role;

grant usage on schema public to service_role;

-- ---------------------------------------------------------------------------
-- Part 1 — public.players: column-restricted, not table-level. This is the
-- one table where a table-level grant would defeat the entire point (it
-- would silently include date_of_birth). No table-level SELECT/INSERT/
-- UPDATE/DELETE on players is granted to service_role anywhere in this
-- migration — only the explicit column grants below.
-- ---------------------------------------------------------------------------
-- SELECT — public player-profile page (id, name, position,
-- secondary_position, squad_number, photo_key, public_id_enabled), staff
-- production queue (team_id via embed, created_at), card/order flows
-- (favourite_player/football_ambition are read back via bare .select()
-- after writes elsewhere in the app, card_nfc_id is part of the card/claim
-- surface).
grant select (
  id, team_id, name, "position", secondary_position, squad_number, photo_key,
  created_at, favourite_player, football_ambition, card_nfc_id,
  public_player_id, public_id_enabled, public_id_rotated_at
) on public.players to service_role;

-- INSERT — roster/order-flow player creation (order-enquiry, orders/intent):
-- team_id, name, position, squad_number only.
grant insert (team_id, name, "position", squad_number) on public.players to service_role;

-- UPDATE — order approval (team_id), staff public-profile admin controls
-- (public_player_id, public_id_enabled, public_id_rotated_at).
grant update (
  team_id, public_player_id, public_id_enabled, public_id_rotated_at
) on public.players to service_role;

-- No DELETE on players: no audited service-role route ever deletes a
-- player row.

-- ---------------------------------------------------------------------------
-- Part 2 — remaining tables: table-level grants are appropriate (no column
-- on any of these carries the same sensitivity as players.date_of_birth),
-- scoped to exactly the operations the audit found in use. No GRANT ALL
-- anywhere in this file.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.cards to service_role; -- claim_token issuance, card_definition_id linking, production_status admin actions; no DELETE (soft-delete via UPDATE only)
grant select, insert, update on public.orders to service_role; -- order-enquiry/intent creation, Shopify webhook payment_status update, staff approval
grant select, insert on public.card_definitions to service_role; -- order-enquiry creation, embedded in players/cards/moments SELECTs; no UPDATE/DELETE observed
grant select, insert on public.moments to service_role; -- public-profile reads, visibility-audit source rows, system card_created moment insert; visibility UPDATEs run on the session client against real RLS, deliberately not here
grant select on public.moment_media to service_role; -- read-only embed under moments/public-profile
grant select, insert on public.guardians to service_role; -- authorization checks, recipient fan-out, claim/redeem flows (no client-facing insert policy exists for this table)
grant select, insert on public.coach_team to service_role; -- team-invite redemption
grant select, insert, delete on public.coach_players to service_role; -- the only table service_role may DELETE from: no client policy exists for inserting or deleting these rows at all
grant select, insert, update on public.player_invites to service_role; -- creation, redemption lookup, single-use marking (used_at/used_by/email_status/email_sent_at)
grant select, insert, update on public.coach_invites to service_role; -- same pattern, coach invites
grant select, insert, update on public.team_invites to service_role; -- same pattern, team invites
grant select on public.profiles to service_role; -- display_name/id for notification and audit content only; profile upserts happen on the session client elsewhere, never here
grant select, insert on public.seasons to service_role; -- resolve-or-create season flow (order approval, season resolution); no UPDATE/DELETE observed
grant select, insert on public.teams to service_role; -- order approval team resolution/creation; no UPDATE/DELETE observed
grant select, insert on public.clubs to service_role; -- order approval club resolution/creation; no UPDATE/DELETE observed
grant select, insert on public.claim_attempts to service_role; -- rate-limit ledger, exercised by every anonymous-reachable route audited
grant insert on public.story_updates to service_role; -- append-only fan-out notifications; never read back via service_role (recipients read their own via RLS + the session client)
grant select on public.active_viewers to service_role; -- presence-window lookup for notification fan-out
grant insert on public.moment_visibility_changes to service_role; -- append-only audit trail
grant select on public.staff_accounts to service_role; -- this table has RLS enabled with zero policies (0008_staff_auth_and_invite_audit.sql) — this grant is the ONLY way anything ever reads staff membership; require-staff.ts depends on it

-- ---------------------------------------------------------------------------
-- Part 3 — explicitly NOT done here, on purpose:
--   - No `alter default privileges` of any kind — a future table gets
--     nothing automatically; it needs its own migration, the same
--     discipline this file itself follows.
--   - No sequence grants — no table in this schema uses a sequence-backed
--     column (uuid + gen_random_uuid() throughout); confirmed by grep
--     against the full migration history before writing this file.
--   - No function EXECUTE grants — no .rpc() call anywhere in the
--     application runs on the service-role client; every RPC call (
--     get_player_age, get_player_date_of_birth, update_player_coach_fields,
--     update_primary_position, update_secondary_position, and any other
--     SECURITY DEFINER function) runs on the session-scoped client,
--     confirmed by inspecting every call site.
--   - No change to service_role's role attributes (BYPASSRLS/INHERIT
--     unchanged) and no change to `anon`/`authenticated` grants — this
--     migration touches service_role's table/column privileges only.
-- ---------------------------------------------------------------------------

commit;
