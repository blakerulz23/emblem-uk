# Hosted staging verification — Coach Player Details / Milestone 2

Scope: this closes the one gap pglite cannot close — Supabase Auth issuing
real JWTs, and PostgREST's own request handling and privilege caching
against a real hosted project. pglite already proved the PostgreSQL-level
behaviour (grants, constraints, SECURITY DEFINER functions — 51/51 checks,
see `full_migration_test.mjs`). This runbook is what turns that into
evidence about the platform that actually serves production traffic.

**Never run this against the production project.** Every step below
targets a separate, disposable staging project or branch.

## Current status: BLOCKED — no hosted staging environment exists yet

Checked directly in this environment: `supabase/config.toml` is absent (no
Supabase CLI project link in this repo), and `npx supabase projects list`
fails with `LegacyPlatformAuthRequiredError` (no `supabase login` session,
no `SUPABASE_ACCESS_TOKEN`). There is no evidence anywhere in this
repository or session of a second Supabase project or branch already
existing for staging use. Creating one requires the user's own Supabase
account access (dashboard login or CLI `supabase login`) — not something
obtainable from this environment. **This is the one remaining blocker**
before any of the checks below can run; per instruction, production is not
being substituted as a first hosted test.

## 1. Create/identify the staging project or branch

Two acceptable options — either satisfies "hosted, not pglite, not
production":

- **Option A — Supabase branching** (if the project is on a plan that
  supports it): `supabase login`, `supabase link --project-ref <prod-ref>`,
  then `supabase branches create staging-milestone2`. Branching clones the
  schema (not row data, or only a configurable subset) into an isolated
  hosted Postgres + its own PostgREST/Auth endpoint.
- **Option B — a separate, standalone Supabase project** (works on any
  plan): create a new free-tier project via the dashboard, named something
  unambiguous like `emblem-uk-staging`. Slower to provision, otherwise
  equivalent for this purpose — a real hosted Postgres + PostgREST + Auth,
  fully isolated from production.

Either way, the result is a distinct project ref, its own URL, and its own
keys — never the production project's.

## 2. Required environment variables (names only)

Set these for the staging project specifically — do not reuse production
values, and do not print/log the actual values anywhere:

- `NEXT_PUBLIC_SUPABASE_URL` — the staging project's API URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the staging project's anon key.
- `SUPABASE_SERVICE_ROLE_KEY` — the staging project's service-role key.
- `SUPABASE_ACCESS_TOKEN` (CLI only, not the app) — a personal access token
  for `supabase` CLI operations against the staging project.
- `SUPABASE_DB_PASSWORD` (CLI only) — needed for `supabase db push`/direct
  `psql` access to the staging Postgres instance.

## 3. Migration order

Apply in this exact order, confirming each step before the next (this
mirrors the real rollout sequence — see the main report):

1. `supabase db push` (or `supabase migration up`) with everything through
   `0035_*.sql` — the pre-feature baseline schema.
2. Deploy Stage 0 app code (`stage0.patch` — see the report) to a staging
   Vercel deployment pointed at this project. Smoke-test: add a roster
   player, edit a primary position, load a parent's player profile.
3. Apply `0036_player_coach_fields_secure_expand.sql` AND
   `0037_service_role_least_privilege.sql` together (Stage 1 — the second
   file is an unrelated, orthogonal platform-hardening fix bundled here for
   scheduling convenience only; see 0036's own header). Only these two
   files belong on the Stage 1 release branch/commit — `0038`/`0039` must
   not exist in the checked-out migrations directory yet at this point (see
   the report's "making ordinary migration tooling safe" section for why
   that, not any CLI flag, is the actual safeguard).
4. Run verification checks #1–#6 below plus the service-role checks (still
   against the Stage 0 app — proves both the zero-exposure-window property
   and service-role least-privilege against a real hosted PostgREST, not
   just pglite).
5. Deploy Stage 2 app code on top of Stage 0 (the full current working
   tree state) to the same staging deployment. Smoke-test: Coach Player
   Details loads and saves all five fields; guardian position edit works,
   including the collision case.
6. Run verification check #7 (position/collision) below.
7. Add `0038_player_position_permission_lock.sql` to the migrations
   directory (its own commit, only once Stage 2 is confirmed live) and
   apply it (Stage 2.5). Re-run check #7's "raw UPDATE rejected" assertion.
8. (Optional, only once Stage 2 has been stable for a real window, an audit
   confirms no old query still needs `age`/`height`, and a backup exists —
   not part of this verification pass) add and apply
   `0039_player_legacy_columns_contract.sql`.

## 4. Seed identities

Create four real `auth.users` via Supabase Auth (sign-up or the dashboard's
"Add user" — real users, not `auth.users` rows inserted directly, since the
point is to get real JWTs from real Auth):

| Role | Purpose |
|---|---|
| Guardian | Linked via a `guardians` row to one seeded player |
| Team coach | Linked via `coach_team` to that player's team |
| Direct coach | Linked via `coach_players` directly to that player, no team link |
| Unrelated coach | No relationship to the player at all |

Seed one team, one player on that team, and the four `profiles` rows (role
`parent`/`coach` as appropriate) the same way `full_migration_test.mjs`
does — the exact INSERT statements there are directly reusable against a
real `psql` session on the staging database (service-role/postgres
connection, not through PostgREST, for setup only).

## 5. SQL tests (real hosted Postgres, real `set local role` impersonation)

Run `supabase/verification/0036_player_coach_fields_secure_expand_checks.sql`
in full against the staging database's SQL editor (or `psql`), substituting
the four seeded identities' real UUIDs. Expected results are documented
inline in that file, section by section (1–7). This exercises real
Postgres role/grant behaviour on the actual hosted instance — the same
thing pglite already proved, now against the real database engine
Supabase actually runs, not WASM Postgres.

## 6. HTTP/PostgREST tests (the part pglite cannot cover at all)

Using each seeded identity's real JWT (sign in via the staging app or
Supabase Auth's password/OTP flow, capture the access token):

```bash
# 1. Guardian cannot read date_of_birth via the real REST surface.
curl -s -o /dev/null -w '%{http_code}\n' \
  "$STAGING_URL/rest/v1/players?id=eq.$PLAYER_ID&select=date_of_birth" \
  -H "apikey: $STAGING_ANON_KEY" -H "Authorization: Bearer $GUARDIAN_JWT"
# Expect: 400/42501-class error, never 200 with a date.

# 2. Guardian gets a calculated age via the RPC.
curl -s "$STAGING_URL/rest/v1/rpc/get_player_age" \
  -H "apikey: $STAGING_ANON_KEY" -H "Authorization: Bearer $GUARDIAN_JWT" \
  -H "Content-Type: application/json" -d "{\"p_player_id\":\"$PLAYER_ID\"}"
# Expect: 200, a number or null — never an error for an authorized guardian.

# 3. Guardian cannot raw-UPDATE position once Stage 2.5 is applied.
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  "$STAGING_URL/rest/v1/players?id=eq.$PLAYER_ID" \
  -H "apikey: $STAGING_ANON_KEY" -H "Authorization: Bearer $GUARDIAN_JWT" \
  -H "Content-Type: application/json" -d '{"position":"CB"}'
# Expect: 400/42501-class error (post-Stage-2.5 only — succeeds pre-2.5,
# which is itself the Stage-0-compatibility property to confirm at step 4
# in the migration order above).

# 4. Position/secondary-position collision via the real app route.
curl -s -X PATCH "$STAGING_APP_URL/api/os/players/$PLAYER_ID/position" \
  --cookie "$GUARDIAN_SESSION_COOKIE" \
  -H "Content-Type: application/json" -d "{\"position\":\"$CURRENT_SECONDARY\"}"
# Expect: 200, {"ok":true,"secondaryPositionCleared":true} — never a raw
# Postgres constraint-violation body.

# 5. Anonymous cannot call any coach-field RPC.
curl -s -o /dev/null -w '%{http_code}\n' \
  "$STAGING_URL/rest/v1/rpc/get_player_age" \
  -H "apikey: $STAGING_ANON_KEY" -d "{\"p_player_id\":\"$PLAYER_ID\"}"
# Expect: 401/403-class error — no Authorization header at all.
```

## 7. Cleanup

- **Option A (branch)**: `supabase branches delete staging-milestone2` —
  removes the branch and its isolated database entirely.
- **Option B (standalone project)**: delete the staging project via the
  dashboard once verification is complete and the results are recorded, or
  keep it around as a standing staging environment for future features
  (recommended, if the plan supports the DB size — avoids repeating step 1
  next time).
- Revoke/rotate the staging service-role key if it was ever pasted anywhere
  outside a secrets manager during this process.
- Confirm no staging keys leaked into any committed file, log, or this
  conversation's history before closing out.
