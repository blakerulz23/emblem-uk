# Production-matched authorization harness (PGlite)

A disposable, in-memory PostgreSQL 17 (PGlite) that is built to match the
production catalog, so authorization tests run against the same policies,
grants and functions production has.

It proves PostgreSQL-level behaviour only. It doesn't exercise PostgREST,
Supabase Auth or real JWTs; see "Not represented" below.

## Files

| File | Purpose |
|---|---|
| `pglite-loader.mjs` | Loads PGlite **only** from the folder in `EMBLEM_AUTHZ_PGLITE_DIR`, and only version `0.3.16`. Stops with a setup message otherwise. No fallback to the repository's `node_modules`, a global install or `NODE_PATH`. |
| `harness.mjs` | `createDatabase()`: platform stand-ins plus production default privileges. `applyMigrations(db, { through })`: applies `supabase/migrations` in filename order. `readOnly(db, fn)`: runs `fn` in a read-only transaction that is rolled back. |
| `evidence.mjs` | Reads the saved production catalog exports from `EMBLEM_AUTHZ_EVIDENCE_DIR`. Each file's sha256 is pinned here; the files themselves are private and never committed. |
| `production_parity_test.mjs` | Gate 0. Applies 0001–0087 and checks the result against the evidence. |
| `catalog.mjs` | Whole-`public` catalog snapshot (relations and their ACLs, columns and column ACLs, constraints, indexes, policies, functions with ACL and body, triggers, publication membership) and a diff. |
| `migration_0088_test.mjs` | Migration 0088 and its rollback, on a fresh 0087 database with fictional rows. |

Related: `supabase/rollback/0088_rollback.sql`, `src/lib/migration-0088-contract.test.ts`
(structural, runs with `npm test`), and `scripts/check-migration-numbers.mjs`
(duplicate migration numbers).

## One-time setup (isolated tooling folder)

PGlite is not a project dependency. It's installed in its own folder,
outside every worktree:

```powershell
New-Item -ItemType Directory -Force 'C:\Users\blake\OneDrive\Desktop\vscode-demo\_tooling\emblem-authz-pglite'
[IO.File]::WriteAllText('C:\Users\blake\OneDrive\Desktop\vscode-demo\_tooling\emblem-authz-pglite\package.json', '{ "name": "emblem-authz-pglite-tooling", "private": true, "dependencies": { "@electric-sql/pglite": "0.3.16" } }')
npm install --prefix 'C:\Users\blake\OneDrive\Desktop\vscode-demo\_tooling\emblem-authz-pglite' --save-exact --no-audit --no-fund
```

This is the only step that uses the network (the npm registry).

## Run (Windows PowerShell, from the worktree root)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = 'C:\Users\blake\OneDrive\Desktop\vscode-demo\_tooling\emblem-authz-pglite'
$env:EMBLEM_AUTHZ_EVIDENCE_DIR = 'C:\Users\blake\OneDrive\Desktop\vscode-demo\_audit\2026-10-20-authz-relationship-escalation\production-evidence'
node supabase/tests/authz/production_parity_test.mjs
```

The variables last only for that PowerShell session. Exit code 0 means
every check passed; 1 means at least one `FAIL` line, or a setup error.

## What Gate 0 checks

The local queries are the same SELECTs used for the production capture.
Rows are compared exactly (whitespace normalisation is allowed for policy
expressions, and the output says if it was ever needed).

| Check | Compared |
|---|---|
| P8 | The 87 migration files `0001`–`0087` equal the production ledger's versions and names, in order, with no duplicates. The local database has no ledger of its own; the files are compared with the evidence. |
| P1 | 58 policies on the relationship and child-data tables: name, command, permissive, roles, `USING`, `WITH CHECK`. |
| P2 | RLS enabled and forced flags on all 64 public tables. |
| P3 | Table privileges of `anon` and `authenticated` on every public table. |
| P4 | Column privileges of `anon` and `authenticated` on `profiles`, `players`, `moments`. |
| P5 | All 84 public functions: identity arguments, SECURITY DEFINER, owner, settings (`search_path`), execute rights for `authenticated` and `anon`. |
| P6 | No triggers on `profiles`, `teams`, `players`, `coach_team`, `guardians`, `moments` (production returned 0 rows). |
| P7 | The default-privilege rows for role `postgres` in `public`, and no others locally. |

## Simulated, and how

- **Production default privileges (P7).** Set before any migration, as the
  same three per-schema `pg_default_acl` rows production has (tables,
  sequences, functions for `postgres` in `public`). P7 has no global row,
  so PostgreSQL's built-in global defaults still apply, as in production.
  This replaces the older assumption in `full_migration_test.mjs`
  (`authenticated` gets select/insert/update/delete on new tables), which
  doesn't match production.
- **Roles.** `anon`, `authenticated` (`nologin`) and `service_role`
  (`bypassrls`) are local stand-ins with the same names. Migrations run as
  the PGlite superuser `postgres`, which matches the production owner in P5.
- **`auth` schema.** Only `auth.users (id, email)` and `auth.uid()`,
  `auth.role()`, `auth.email()`. The functions read the
  `request.jwt.claim.sub` / `.role` / `.email` settings, as in the
  repository's other PGlite harnesses.
- **Extensions.** `pgcrypto` installed in schema `extensions`, and the
  session `search_path` is `"$user", public, extensions` (production's
  Data API extra search path, P9).
- **Realtime.** An empty `supabase_realtime` publication, so the
  `alter publication` statements in 0027 and later apply.

## Not represented

- PostgREST request handling and schema exposure (P9), Supabase Auth, real
  JWT issuance and the `anon`/`authenticated` key mechanism.
- Platform-owned default privileges (`supabase_admin`,
  `supabase_auth_admin`, and schemas other than `public` in P7). They
  apply to objects those roles create; no migration creates any.
- Function bodies. P5 holds attributes only, so bodies come from the
  repository migrations.
- The production PostgreSQL minor version. P7's `MAINTAIN` privilege
  implies PostgreSQL 17; PGlite 0.3.16 is 17.5 (32-bit WASM).

## Migration 0088 (additive foundation)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = 'C:\Users\blake\OneDrive\Desktop\vscode-demo\_tooling\emblem-authz-pglite'
node supabase/tests/authz/migration_0088_test.mjs
node scripts/check-migration-numbers.mjs
npx vitest run src/lib/migration-0088-contract.test.ts scripts/check-migration-numbers.test.ts
```

`migration_0088_test.mjs` builds 0001–0087, seeds fictional pre-existing
coach and guardian rows, applies 0088 alone (`applyMigrations(db, { from: '0088', through: '0088' })`)
and checks:

- **Additive only.** Every 0087 catalog entry is still present. The only
  redefined entries are `is_authorized_coach_for_player` and
  `is_guardian_of_team_player`: search_path `public` → `''`, with the same
  logic, owner and ACL. Every 0087 policy is unchanged.
- **New objects** exist with their intended grants and RLS.
- **History is not invented.** Pre-existing rows are unchanged, every new
  column on them is NULL, and the legacy coach row is active.
- **Active rule** `coach_assignment_is_active(ended_at, expires_at)` covers
  legacy, expiring, expired and ended. No existing policy or helper uses it
  yet, so access doesn't change until 0089.
- **Team requests.** Submission defaults, one pending per person, column
  grants, visibility, cancellation, staff approve (new team, existing team,
  expiry, reactivation), reject, and that decided requests are final.
- **Audit attribution.** A named staff operation, a signed-in identity, an
  account carried on a service-role row, and an unattributed write are each
  recorded distinctly. The table is append-only, even for the owner.
- **Rollback** returns the whole catalog to its exact 0087 state, keeps the
  pre-existing rows, and 0088 re-applies afterwards.

### Design notes for later phases

- **Attribution order** (see the 0088 header): trusted function marker →
  `auth.uid()` → the row's `created_by`/`ended_by` → `unattributed`. The
  service-role app paths in Phase 3 should set `created_via` and
  `created_by` on every `coach_team`/`guardians` write, so their audit rows
  name the real account.
- **Until 0089**, `authenticated` keeps its table-level grants on
  `coach_team` and `guardians`. Those grants cover the new columns too, so
  any insert the existing policies allow can set `created_via` or
  `created_by` to any value. Treat those two columns as trustworthy only
  after 0089. The audit row's `auth_uid` and `db_role` are always recorded
  independently of the row.
- **Deferred to 0089 by decision:** revoking `anon` EXECUTE on the two
  helpers, and adding the active-assignment check to the helpers, the coach
  policies and `update_player_coach_fields` / `update_secondary_position` /
  `create_season_focus`. 0089 should use `coach_assignment_is_active` and
  grant its EXECUTE to `authenticated` when policies start calling it.
- `approve_coach_team_request` takes an extra trailing `p_season_id` (not in
  FIX-PLAN's signature). The season rule lives in app code
  (`currentUkFootballSeason`, `resolveOrCreateSeason`), so the staff route
  resolves it, as order approval does. Approval sets `role = 'coach'` only
  when the person has no role yet (HANDOFF: never overwrite a valid role).
- `created_via = 'legacy'` is allowed by the checks but nothing sets it:
  legacy rows stay NULL.
- **Trusted writes for the app.** Production's `service_role` has no
  INSERT/UPDATE on `profiles` and no UPDATE on `coach_team` (0037), so 0088
  adds two `service_role`-only functions:
  - `ensure_profile_role(profile, role, display_name)`: creates the profile
    if it's missing, sets the role only when it's empty, and returns the
    effective role;
  - `activate_coach_assignment(team, profile, created_via, actor)`: inserts
    a new assignment, or reactivates an ended or expired one, attributed as
    `activate_coach_assignment:<created_via>`.

  The claim, recovery and invite routes use these instead of writing as
  the signed-in user.
- **Release readiness.** See "Release readiness (Phase 4A)" below.
- **Outbox.** `staff_notification_outbox` accepts `new_coach_team_request`
  (the 0083 list plus one). The rollback restores the 0083 list; delete
  any such rows first.

## Application compatibility (Phase 3)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = 'C:\Users\blake\OneDrive\Desktop\vscode-demo\_tooling\emblem-authz-pglite'
node --no-warnings supabase/tests/authz/app_flows_test.mjs
```

`app_flows_test.mjs` runs the SQL the app's routes issue twice: once after
0088, and once after 0088 plus `EXPECTED_0089`. `EXPECTED_0089` is the set of
grant and policy changes FIX-PLAN §2.1/§2.2 assigns to 0089, written as a
test-local expectation (it isn't 0089). The flows it covers:

- sign-up and display-name edits;
- order approval;
- card claim and guardian invite;
- team and coach invites;
- the team-request lifecycle;
- staff approve and end;
- the account read behind the Parent/Coach views.

It checks:

- parent only, coach only, neither, and dual role in both orders;
- that switching view keeps both relationships;
- that ended and expired coaches lose the Coach view, and that a valid team
  invite reactivates them;
- that claims and invites never overwrite an existing role.

View resolution uses the app's own `src/lib/os-view.ts` and
`src/lib/coach-assignment.ts` (Node strips their types). Phase 4 replaces
`EXPECTED_0089` with the real migration.

**Deployment order changes to 0088 → app → 0089.** The app now calls
`ensure_profile_role`, `activate_coach_assignment` and the request functions,
which exist only from 0088. Deploying this app before 0088 would make every
claim and invite fail. 0088 is additive, so the current app keeps working on
it. This differs from FIX-PLAN §6, which put the app first.

## Direct coach links (coach_players)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = 'C:\Users\blake\OneDrive\Desktop\vscode-demo\_tooling\emblem-authz-pglite'
node supabase/tests/authz/direct_coach_links_test.mjs
```

A direct link is a guardian connecting one coach to one player, through a
coach invite. It's its own relationship and never depends on a team
assignment.

**What a link does**
- It grants access to that one player only.
- It survives the coach's team assignment ending or expiring, a team
  transfer, and the team being deleted.

**How a link is created**
- Coach-invite redemption, run with the service role, is the only way.
  Signed-in users have no INSERT, UPDATE or DELETE on `coach_players`.
- Redemption now also requires the invite's creator to still be a guardian
  of the player. Otherwise it refuses: the invite stays unused, no link is
  created and no role changes.
- Creation is audited as `INSERT` with `row_attribution`, naming the
  inviting guardian and `guardian_invite`.

**How a link ends**
- Only through `remove_direct_coach_link(player, coach, actor, reason)`,
  which is `service_role`-only.
- The actor must be the connected coach, a current guardian of the player,
  or staff.
- It needs a non-empty reason (up to 500 characters).
- It returns `'removed'`, or `'not_found'` for a link that no longer exists,
  so a retry is safe.
- It deletes only that one row. The audit event records `DELETE`, the
  player, the coach, the actor, `remove_direct_coach_link:<coach|guardian|staff>`,
  the reason (in the new `relationship_audit_events.reason` column) and the
  database role.
- `end_coach_assignment` now records its reason in that column too.

**Callers**
- The guardian or coach disconnect route,
  `DELETE /api/os/players/[id]/coach-connections/[coachProfileId]`.
- Staff, through `POST /api/staff/coach-player-links/remove`.
  `/staff/coach-assignments` lists direct connections separately from team
  assignments, showing the coach, the player's first name and last initial,
  their team and the date.

**History** Links that existed before 0088 get no audit events and no new
timestamps or actors from applying it.

**Account deletion (0088 §11).** Before this fix, a guardian could not
delete their account (`delete_own_guardian_account`) if they had ever
created a coach invite (`coach_invites.created_by` was NOT NULL, yet the
function sets it to NULL), or if a direct link named them as its creator
(`coach_players.created_by` had no `ON DELETE` rule). Now:
- `coach_invites.created_by` is nullable;
- `coach_players.created_by` is `ON DELETE SET NULL`.

The invite and the link remain; only the reference to the deleted account
becomes NULL. An invite whose creator is gone can no longer be redeemed.
`account_deletion_test.mjs` shows each failure at 0087 and the success at
0088:

```powershell
node supabase/tests/authz/account_deletion_test.mjs
```

**Rollback** The 0088 rollback sets `coach_invites.created_by` back to NOT
NULL. It therefore refuses, and changes nothing, once any creator has
deleted their account since 0088. Those rows have no creator to restore, so
they must be handled deliberately first.

**Release readiness** The existing `coachInvite` smoke check covers the
whole direct-link path:
- creating a coach invite as a guardian;
- redeeming it as the coach;
- confirming a removal path works (by the guardian or the coach), with its
  audit event.

No seventh readiness check is needed.

## Release readiness (Phase 4A)

0089 must not run until the compatible application is deployed and
verified. That fact is recorded rather than assumed.

**Database (0088 §10).**
- `release_readiness_confirmations` holds one row per contract. The only
  allowed contract is `authorization_relationships_v1`.
- Each row holds:
  - the deployed commit (7–40 hex characters);
  - the confirming staff account;
  - the confirmation time, which the database stamps itself;
  - six named booleans, all of which must be true: `check_card_claim`,
    `check_guardian_invite`, `check_team_invite`, `check_coach_invite`,
    `check_dual_view`, `check_team_request_flow`.
- It holds no child, player, parent or coach data.
- Access:
  - `anon` and `authenticated` have none.
  - `service_role` can SELECT only.
  - Writes go only through `confirm_release_readiness`, a SECURITY DEFINER
    function executable only by `service_role`.
- The function refuses:
  - an unknown contract;
  - a non-staff account;
  - an empty or non-commit value;
  - any check that is missing or false;
  - a second confirmation. There's no upsert or replacement, and the unique
    contract column backs this up.
- Triggers block UPDATE, DELETE and TRUNCATE, even for the owner.

**Application.**
- `src/lib/release-readiness.ts` holds the shared constant
  `AUTHORIZATION_RELATIONSHIPS_CONTRACT` and the six check names.
- `POST /api/staff/release-readiness` is staff-only:
  - the confirming account comes from the server session (`requireStaff`);
  - the commit comes from the deployment environment
    (`VERCEL_GIT_COMMIT_SHA`), never from the browser;
  - the body must send `checks: { cardClaim, guardianInvite, teamInvite,
    coachInvite, dualView, teamRequestFlow }`, each literally `true`;
  - any staff id or commit in the body is ignored.
- Only this release has the endpoint, so an older application can't create
  the record through the approved workflow.
- There's no UI. Phase 5 documents the operator's smoke checks and the call.

**Deployment sequence.**
1. Apply 0088.
2. Deploy the compatible application.
3. Verify card claims, guardian, team and coach invitations, parent/coach
   view switching, and the team request with a staff decision.
4. A staff member records readiness through `POST /api/staff/release-readiness`.
5. Apply 0089.

**0089 precondition (documented here, implemented in 0089).** 0089 will
abort, changing nothing, unless all of the following hold:
- every required 0088 table, column, function and function signature exists;
- exactly one `release_readiness_confirmations` row exists for
  `authorization_relationships_v1`;
- all six checks on it are true;
- its `app_commit` is non-empty;
- its `confirmed_by` is still in `staff_accounts`.

## Duplicate migration numbers

`node scripts/check-migration-numbers.mjs [dir]` exits 1 and names the files
when two migrations share a number, or a file isn't `NNNN_name.sql`.
`scripts/check-migration-numbers.test.ts` runs it against the real folder
and against synthetic temporary folders. There is no CI workflow in this
repository yet. Running it on every push and pull request is a follow-up.

## Later phases

Gate 0 always rebuilds 0001–0087 and must stay green: it's the proof that
later tests start from production's state. New migrations are applied on
top of that baseline by separate test files, and each phase adds its own
expectations there.
