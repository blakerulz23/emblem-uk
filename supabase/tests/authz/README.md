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
| `catalog.mjs` | Whole-`public` catalog snapshot (relations and their ACLs, columns and column ACLs, constraints, indexes, policies, functions with ACL and body, triggers, publication membership) and a diff. ACLs are compared semantically: a NULL ACL is expanded with `acldefault`, and entries are sorted, so an ACL restored by GRANT/REVOKE to the same privileges compares equal to the original. |
| `migration_0088_test.mjs` | Migration 0088 and its rollback, on a fresh 0087 database with fictional rows. |
| `migration_0089_test.mjs` | Migration 0089 and its rollback, on fresh 0088 databases with fictional rows. |
| `migration_0090_test.mjs` | Migration 0090 (guardian-invite write lockdown) and its rollback, on a fresh 0089 database with fictional rows. |

Related: `supabase/rollback/0088_rollback.sql`, `supabase/rollback/0089_rollback.sql`,
`supabase/rollback/0090_rollback.sql`, `src/lib/migration-0088-contract.test.ts`,
`src/lib/migration-0089-contract.test.ts` and `src/lib/migration-0090-contract.test.ts`
(structural, run with `npm test`), and `scripts/check-migration-numbers.mjs`
(duplicate migration numbers).

## One-time setup (isolated tooling folder)

PGlite is not a project dependency. It's installed in its own folder,
outside every worktree. The examples below use these placeholders:

| Placeholder | Meaning |
|---|---|
| `<REPO_ROOT>` | the root of this repository's checkout |
| `<PGLITE_TOOLING_DIR>` | any folder outside every worktree, used only for PGlite |
| `<PRIVATE_EVIDENCE_DIR>` | the private folder holding the saved production catalog exports that `evidence.mjs` pins. It is never committed |

```powershell
New-Item -ItemType Directory -Force '<PGLITE_TOOLING_DIR>'
[IO.File]::WriteAllText('<PGLITE_TOOLING_DIR>\package.json', '{ "name": "emblem-authz-pglite-tooling", "private": true, "dependencies": { "@electric-sql/pglite": "0.3.16" } }')
npm install --prefix '<PGLITE_TOOLING_DIR>' --save-exact --no-audit --no-fund
```

This is the only step that uses the network (the npm registry).

## Run (Windows PowerShell, from `<REPO_ROOT>`)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
$env:EMBLEM_AUTHZ_EVIDENCE_DIR = '<PRIVATE_EVIDENCE_DIR>'
node supabase/tests/authz/production_parity_test.mjs
```

The variables last only for that PowerShell session. Exit code 0 means
every check passed; 1 means at least one `FAIL` line, or a setup error.
Only Gate 0 needs `EMBLEM_AUTHZ_EVIDENCE_DIR`; every other suite below
needs only `EMBLEM_AUTHZ_PGLITE_DIR`.

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
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
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
  (Done in 0089; see below.)
- `approve_coach_team_request` takes an extra trailing `p_season_id`. The
  season rule lives in app code (`currentUkFootballSeason`,
  `resolveOrCreateSeason`), so the staff route resolves it, as order
  approval does. Approval sets `role = 'coach'` only when the person has no
  role yet: a valid role is never overwritten.
- `created_via = 'legacy'` is allowed by the checks but nothing sets it:
  legacy rows stay NULL.
- **Trusted writes for the app.** Production's `service_role` has no
  INSERT/UPDATE on `profiles` and no UPDATE on `coach_team` (0037), so 0088
  adds `service_role`-only functions:
  - `ensure_profile_role(profile, role, display_name)`: creates the profile
    if it's missing, sets the role only when it's empty, and returns the
    effective role;
  - `activate_coach_assignment(team, profile, created_via, actor)`: inserts
    a new assignment, or reactivates an ended or expired one, attributed as
    `activate_coach_assignment:<created_via>`. No application route calls it
    any more (team invites use `redeem_team_invite`); it stays because 0089's
    precondition pins it;
  - `redeem_team_invite(code, coach, display_name)`: the whole team-invite
    redemption in one transaction (see "Atomic team-invite redemption").

  The claim, recovery and invite routes use these instead of writing as
  the signed-in user.
- **Release readiness.** See "Release readiness (Phase 4A)" below.
- **Outbox.** `staff_notification_outbox` accepts `new_coach_team_request`
  (the 0083 list plus one). The rollback restores the 0083 list; delete
  any such rows first.

## Application compatibility (Phase 3)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
node --no-warnings supabase/tests/authz/app_flows_test.mjs
```

`app_flows_test.mjs` runs the SQL the app's routes issue twice: once after
0088, and once after the real 0089 and 0090 (0089 applied after a fictional
staff account records release readiness, as the precondition requires). The flows it
covers:

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
- that ended and expired coaches lose the Coach view; that an unused team
  invite issued before the ending does not reactivate them (and stays
  unused); and that a team invite issued after the ending does;
- that claims and invites never overwrite an existing role.

View resolution uses the app's own `src/lib/os-view.ts` and
`src/lib/coach-assignment.ts` (Node strips their types). The earlier
test-local simulation of 0089 (`EXPECTED_0089`) has been replaced by the
real migration.

The team-request route now creates a missing profile with an insert that
ignores an existing row, then sets the name with an update of
`display_name` only. A PostgREST merge-upsert may also SET `id`, which the
0089 column grants no longer allow.

**Deployment order changes to 0088 → app → 0089.** The app now calls
`ensure_profile_role`, `redeem_team_invite`, `redeem_coach_invite` and the
request functions, which exist only from 0088. Deploying this app before 0088 would make every
claim and invite fail. 0088 is additive, so the current app keeps working on
it. (An earlier plan put the app first; that order is superseded.)

## Atomic team-invite redemption (`redeem_team_invite`, 0088)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
node --no-warnings supabase/tests/authz/team_invite_redemption_test.mjs
```

`POST /api/os/team-invites/redeem` makes one call:
`redeem_team_invite(code, <the session's own id>, display_name)`. The route
writes nothing itself. In one transaction the function:

1. locks the invite row (`FOR UPDATE`) and requires it unused and
   unexpired;
2. locks this coach's existing assignment to the team, if any. That is the
   row `end_coach_assignment` also locks, so an ending and a redemption are
   serialised;
3. refuses, changing nothing, when the invite was issued **at or before**
   the previous access's cutoff: `ended_at` for an ended assignment,
   `expires_at` for one whose expiry has passed, the later of the two when
   both apply;
4. otherwise sets the coach role only if the profile has none, creates or
   reactivates the assignment (audited as `redeem_team_invite`, actor = the
   coach) and consumes the invite once.

The reactivating upsert repeats step 3's rule in its own `WHERE`, so an
assignment created and ended by others after step 2 is still not restored by
an older invite. Any failure aborts the whole call. Times are the database's
`now()`. Restoring access after an ending needs staff
(`approve_coach_team_request`) or a team invite issued strictly afterwards.
Other invites are never invalidated.

| Status | Meaning | Route answer |
|---|---|---|
| `redeemed` | assignment created or reactivated; invite consumed | 200 `{ ok, teamId }`, families notified |
| `already_redeemed_by_you` | this coach consumed it and still holds the assignment | 200 `{ ok, teamId }`, nothing written or sent |
| `already_active` | the coach already holds an active assignment; invite not consumed | 409 "You're already managing this team" |
| `stale_after_end` / `stale_after_expiry` | issued at or before the cutoff; nothing changed | 400 "This invite isn't valid or has expired" |
| `invalid` | unknown, expired or consumed by someone else | 400, the same message |
| database error | everything rolled back | 500, fixed message; the log carries the code only |

The two stale statuses and `invalid` read identically, so the response never
reveals whether the account had, lost or never held access.

`team_invite_redemption_test.mjs` runs every case on a 0088 database and on
the real 0089:
- redemption, roles (parent kept, empty set to coach, missing profile
  created) and retries;
- manual endings before, exactly at and after the invite;
- a future expiry, the same invite once it elapses, and a fresh invite
  afterwards;
- staff reactivation;
- unrelated invites;
- two redeemers;
- both orders of an ending and a redemption;
- a forced failure rolling back invite, role, assignment and audit;
- permissions and the exact ACL.

**Local-test limit.** PGlite is one connection, so true simultaneity is
replayed in both orders here and proven structurally (the contract test
checks the two `FOR UPDATE` reads, the repeated rule in the upsert and the
single consuming update). The hosted rehearsal must add a real two-connection
test: a redemption and `end_coach_assignment` started together, and two
accounts redeeming one code together.

## Roster additions after 0089

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
node --no-warnings supabase/tests/authz/roster_add_test.mjs
```

`POST /api/os/players` reads the caller's own `coach_team` row for the team
and answers 403 ("You no longer have permission to add players to this
team.") unless the assignment is active. It then inserts the player as the
signed-in user, so RLS still decides. A refusal there (SQLSTATE 42501) gets
the same 403; any other failure is a generic 500 that logs only the error
code. `roster_add_test.mjs` runs both statements on the real 0089 as an
active, ended, expired, direct-link-only, role-only and unrelated account, a
dual account on each of its teams, and a request for another team. Only the
active assignments succeed. Coach OS shows "+ Add Player" only when its data
carries an active-assignment team (`canAddRosterPlayers`).

## Direct coach links (coach_players)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
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

**Redeemed coach-invite deletion (0088 §11).**
- **The key.** 0088 makes `coach_invites.used_by` `ON DELETE SET NULL`.
  `used_at` is unchanged.
- **`used_at` is the authoritative consumed marker.** An invite with
  `used_at` set stays used permanently, even after `used_by` becomes NULL
  because the redeemer deleted their account. A deleted redeemer never
  makes an invite redeemable again.
- **The in-app deletion flow already worked.** 0076's
  `delete_own_guardian_account` already clears `used_by` itself.
- **What the key change adds.** It lets other deletion paths through,
  such as deleting the auth user or the profile directly, which 0087's key
  blocked.
- **No application code change was needed.** Invite lookup and redemption
  already decide on `used_at`.

**Rollback with redeemed invites.**
- **Deleted redeemers don't block it.** The rollback succeeds when a
  consumed invite's redeemer has been deleted: `used_at` stays set and
  `used_by` stays NULL. The restored 0087 key accepts that state, which
  0076 already produces at 0087.
- **Deleted creators do.** The rollback refuses, before changing anything,
  when an invite's *creator* has deleted their account. 0087's
  `created_by NOT NULL` can't be reconstructed.
- **Resolving those rows deliberately** lets the rollback restore the 0087
  catalog exactly.

`migration_0088_test.mjs` and `account_deletion_test.mjs` cover both paths,
the redeemer deletions at 0087 and 0088, and that applying 0088 leaves
existing `used_at` and `used_by` values unchanged.

**Route tests.** `src/app/api/os/coach-invites/redeem/consumed-and-expired.test.ts`
covers four cases:
- a consumed invite with `used_at` set and `used_by` NULL is neither found
  nor redeemable;
- an expired, unused invite is neither found nor redeemable;
- neither case creates a relationship, changes a role or writes anything;
- a valid, unused invite from a current guardian still redeems normally.

**H5 (direct-link review counts).** An operator query, kept with the
private release records rather than in this repository. It returns one
counts-only aggregate row under a read-only guard, and must be run and
reviewed before 0089 is applied to production. When it was validated on
fictional PGlite data (0087 and 0088 schemas), consumed invites were
identified by `used_at`, and unknown (deleted) creators were counted
separately from known creators who are no longer guardians.

**Atomic coach-invite redemption (`redeem_coach_invite`, 0088).**

*The old race.* The route used to:
1. read the invite;
2. check it;
3. set the coach role;
4. insert the direct link;
5. mark the invite used, with an update that didn't re-check the invite
   was still unused.

Two coaches redeeming the same code at once could both pass the check and
both get a link. A failure between steps could leave a link with no
consumed invite.

*The atomic boundary.* Redemption is now one call to
`redeem_coach_invite(code, coach, display_name)`. It's `service_role`-only
and SECURITY DEFINER, with an empty `search_path`. In a single
transaction it:
- claims the invite with one conditional `UPDATE`. The invite must be
  unused (`used_at IS NULL`), unexpired, and created by someone still a
  guardian of the player;
- ensures the coach's profile, setting the `coach` role only if the profile
  has none;
- creates the direct link (`guardian_invite`, created by the inviting
  guardian, audited as `row_attribution`);
- records `used_by` on the row it has just claimed.

If anything fails after the claim, the whole call rolls back: the invite
stays unused, and no link, profile, role change or audit event remains. If
the coach is already directly connected to that player, the claim is
undone and the invite stays unused. The route passes only the session's
own coach id and writes nothing itself.

*Results.*
- `redeemed` returns the player. The route notifies the family once.
- `already_redeemed_by_you` means the same coach consumed this invite
  earlier and the link still exists. It's an idempotent retry: nothing
  changes and nobody is notified.
- `already_connected` gives 409.
- `invalid` covers unknown, expired, consumed by anyone else (including a
  since-deleted redeemer), or created by someone no longer a guardian. It
  gives the generic "isn't valid or has expired" error and no player
  information.
- A consumed invite never recreates a link that was later removed.

*What the local harness proves.* PGlite is a single embedded connection,
so two truly simultaneous transactions can't run here.
- `coach_invite_redemption_test.mjs` proves the sequential consequences:
  - two coaches redeeming one invite get exactly one winner, one link and
    one audit event;
  - retries;
  - invalid cases with no writes;
  - a forced failure after the claim rolls everything back;
  - permissions.
- The 0088 contract test proves structurally that the only statement which
  consumes an invite is that single conditional `UPDATE`. Under real
  concurrency, PostgreSQL row locking makes a second redemption re-check
  the condition and find the invite consumed. That's standard PostgreSQL
  behaviour, but it isn't executed here.

```powershell
node supabase/tests/authz/coach_invite_redemption_test.mjs
```

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

**0089 precondition.** Implemented in 0089 and described in "Migration
0089 (lockdown)" below.

## Migration 0089 (lockdown)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
node supabase/tests/authz/migration_0089_test.mjs
```

0089 closes every path by which a signed-in account could give itself a
role or a relationship, and makes team-coach access depend on an active
assignment. It runs in one transaction.

**Precondition (section 0, before any change).** 0089 raises
`0089 refused: …` and changes nothing unless:
- every required 0088 object is present: the three tables, the history
  columns on `coach_team` and `guardians`, the one-pending-request index,
  the enabled audit, transition and readiness triggers, and the eleven
  0088 functions with their exact signatures, `SECURITY DEFINER`, empty
  `search_path` and execute grants (no `anon`; trusted functions
  `service_role` only);
- exactly one `release_readiness_confirmations` row exists for
  `authorization_relationships_v1`;
- all six of its checks are true;
- its `app_commit` is 7–40 lowercase hex characters;
- its `confirmed_by` is still in `staff_accounts`.

`migration_0089_test.mjs` breaks each condition on its own (dropping a 0088
constraint where needed to create the invalid state) and shows a full
catalog snapshot and a full data snapshot are identical before and after
the refusal.

**Access model after 0089.**

| Who | Players and their child data |
|---|---|
| anon | nothing (no table privileges at all) |
| signed-in, no relationship (whatever the stored role) | nothing |
| guardian | their own children |
| active team coach | the players of that team |
| ended or expired team coach | nothing through that team |
| direct coach (`coach_players`) | that one player, whatever their team assignments |
| guardian and coach | the union of both |
| staff | through the staff routes (service role), unchanged |

"Active" is `coach_assignment_is_active(ended_at, expires_at)`: not ended,
and not past `expires_at`. It's required on all 24 coach-access policies,
the two `coach_team` read policies, `is_authorized_coach_for_player`,
`update_player_coach_fields`, `update_secondary_position` and
`create_season_focus`. The direct-link (`coach_players`) branches in the
same policies and functions are deliberately unchanged: a direct link is an
independent relationship (see "Direct coach links").

**What 0089 changes.**
- `profiles`: signed-in users may insert only their own row with `id` and
  `display_name` (the policy also requires `role IS NULL`), and update only
  their own `display_name`. No DELETE. The role is set only by
  `ensure_profile_role` and staff approval.
- `coach_team`, `guardians`, `clubs`, `teams`: the policies
  `a coach can attach themselves`, `a parent can link themselves` and the
  two `coaches can create` are dropped, and signed-in INSERT, UPDATE and
  DELETE are revoked. Reads are unchanged.
- `coach_invites`: signed-in INSERT is limited to `player_id`, `code`,
  `created_by` (RLS still forces it to the caller) and `invited_email`.
  `used_at`, `used_by`, `expires_at`, `id` and `created_at` are always the
  database's.
- `is_authorized_coach_for_player` and `is_guardian_of_team_player`: no
  longer executable by `anon` (or `PUBLIC`); `authenticated` keeps EXECUTE
  because its policies call them. `coach_assignment_is_active` becomes
  executable by `authenticated` for the same reason.
- TRUNCATE, REFERENCES, TRIGGER and (on PostgreSQL 17) MAINTAIN are revoked
  from `anon` and `authenticated` on the 27 public tables that had them.

Exact catalog change against 0088, asserted by the test: nothing added; the
four policies removed; 67 entries changed (27 table ACLs, 28 policies, 6
functions, 6 column ACLs). No row in any table changes and no audit event is
written.

**Legitimate write paths after 0089** (all from 0088, all used by the
compatible application): card claim and recovery, guardian invite, team
invite, coach-invite redemption, the team-request lifecycle with staff
approval or rejection, staff ending an assignment, direct-link removal by
the guardian, the coach or staff, order approval, account deletion,
display-name edits, and recording release readiness (once only).
`app_flows_test.mjs` and `migration_0089_test.mjs` cover them on the real
0089.

**Not changed (by decision).**
- **Decision B:** club and team read visibility.
- **Decision C:** default privileges for future objects.
- `service_role` grants.

**Known follow-ups, not in 0089.**
- `player_invites` still had a table-level signed-in INSERT, so a guardian or
  active coach could forge an invite's status and attribution. Closed by
  0090 (below), which ships with 0089.
- `POST /api/os/seasons` is unused but still lets any signed-in user create
  a season.
- `supabase/tests/full_migration_test` can't import PGlite without
  repository dependency changes, so it isn't run here.

**Rollback: emergency only.** `supabase/rollback/0089_rollback.sql` REOPENS
authorization access that 0089 closes: it restores every signed-in role and
relationship write listed in "What 0089 changes", and ended or expired
coaches regain team access. Prefer fixing forward. It refuses, changing
nothing, unless the same session first runs:

```sql
select set_config('emblem.acknowledge_0089_rollback', 'REOPEN-AUTHORIZATION-VULNERABILITY', false);
```

With the acknowledgement it restores the exact 0088 catalog and changes no
data. 0089 can then be re-applied, since its readiness record is still in
place. The test proves the refusal, the exact restore, the unchanged data
and the re-apply.

**Local-test limits.** PGlite is one embedded PostgreSQL 17 connection.
Concurrency, PostgREST, Supabase Auth and real JWTs aren't exercised (see
"Not represented"). Signed-in calls are simulated with
`set local role authenticated` and `request.jwt.claim.sub`.

**Production sequence.** Each step needs explicit approval.
1. Apply 0088.
2. Deploy the compatible application.
3. Run the six smoke checks: card claim, guardian invite, team invite,
   coach invite (with a removal), dual view, and a team request with a
   staff decision. The `teamInvite` check now covers the atomic flow and the
   stale-invitation rule: redeem a fresh team invite as a test coach; have
   staff end that assignment; confirm an unused invite issued before the
   ending is refused with the generic message and stays unused; confirm an
   invite issued after the ending reactivates the coach.
4. A staff member records readiness through `POST /api/staff/release-readiness`.
5. Run H5 (direct-link review counts) read-only and review the results.
6. Apply 0089. It refuses by itself if steps 1–4 are incomplete.
7. Apply 0090 immediately after, in the same maintenance window. It
   refuses by itself unless 0089 is in place.
8. Verify: repeat the smoke checks, and confirm that signed-in role and
   relationship writes, and forged guardian-invite fields, are refused.
   Production is not protected until both 0089 and 0090 pass verification.
9. Rollback only in an emergency, with the acknowledgement above (0090's
   first, then 0089's), and re-apply as soon as possible.

## Migration 0090 (guardian-invite write lockdown)

```powershell
$env:EMBLEM_AUTHZ_PGLITE_DIR = '<PGLITE_TOOLING_DIR>'
node --no-warnings supabase/tests/authz/migration_0090_test.mjs
```

Until 0090, a signed-in user could INSERT every column of `player_invites`.
RLS limited the player (their own child, or a player on a team they actively
coach) and required `created_by` to be them, but nothing stopped them writing
`used_at`, `used_by`, `created_at`, `expires_at`, `order_id`, `email_status`
or the id. A guardian or coach could create a guardian invite that looked
already consumed by someone else, backdated, never expiring or tied to an
order. It granted no access, but it could fake the record of how a guardian
link came about.

**What 0090 changes.** After a precondition (it refuses, changing nothing,
unless 0089 is in place):
- `anon` and `authenticated` lose INSERT, UPDATE and DELETE on the table
  (neither held UPDATE or DELETE; the revoke makes it explicit);
- `authenticated` may INSERT only `player_id`, `code`, `created_by`,
  `invited_email` and `origin`: exactly what `createGuardianInvite` sends for
  a signed-in guardian or coach. It sends `order_id` only for a trusted
  (service-role) order caller.

Existing policies, SELECT, `service_role` and every trusted path (order
approval, resend, recovery, redemption, account deletion, child erasure) are
unchanged. No row changes. The catalog change from 0089 is exactly the table
ACL and the five column ACLs of `player_invites`.

`migration_0090_test.mjs` reproduces the forgery at 0089, then proves the
legitimate insert (including the app's own column list, read from
`create-guardian-invite.ts`) still works; every forged column, update and
delete is refused with no partial write; trusted redemption and single use
are unchanged; and applying 0090 changes no data.

**Rollback: emergency only.** `supabase/rollback/0090_rollback.sql` REOPENS
guardian-invite forgery. It refuses, changing nothing, unless the same
transaction first runs:

```sql
begin;
select set_config('emblem.acknowledge_0090_rollback', 'REOPEN-GUARDIAN-INVITE-FORGERY', true);
-- then the rollback file
```

It restores the exact 0089 catalog, changes no data, and clears the
acknowledgement before committing, so it never persists. 0090 can then be
re-applied. The test proves all of this, including a re-apply to the
identical catalog.

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
