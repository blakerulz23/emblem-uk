# Manual child-data deletion runbook

**Update (Account Settings MVP):** a guardian can now file a
self-serve **request** for this from Player OS → Account Settings →
"Request player-data deletion" — this does *not* perform the deletion
itself, only files a `player_deletion_requests` row and shows the
guardian a reference number. Staff still carry out every actual deletion
by hand, following this runbook exactly, then record completion at
`/staff/deletion-requests` (requires a short attestation note — see
"Operational queues" below). A parent can also still reach staff directly
(support email/phone) without having used the in-app request form at
all — both paths land on the same manual runbook.

Do not improvise the order of operations — see "Safe deletion order"
below for why it matters.

## Operational queues (pilot)

- **`/staff/deletion-requests`** — player-data deletion requests filed by
  guardians via Account Settings, or logged manually by staff for a
  request that arrived by another channel (email/phone). Each pending row
  shows the player, when it was requested, and the guardian's contact
  email at the time of the request (captured at request time — it may no
  longer match the guardian's account if they've since changed it or
  deleted their own account entirely). "Mark completed" requires an
  explicit attestation checkbox plus a short note/reference — it records
  that the runbook below was carried out, it does not perform any
  deletion itself.
- **`/staff/pending-auth-deletions`** — a separate, smaller queue for the
  one hard edge case in guardian *account* deletion: the guardian's own
  profile/guardian-link data was already removed automatically, but
  Supabase Auth couldn't delete their sign-in credential (a transient API
  issue). Finish it via the Supabase dashboard's Auth admin panel using
  the user id shown, then confirm on that page.
- Both queues are linked from `/staff/queue`, with a live pending count.

**Pilot operational target** (internal service target, not a statutory
deadline): staff check both queues **daily**. Aim to review and
acknowledge a new request within **2 working days** of it being filed —
"acknowledge" means either starting the runbook or replying to the
guardian to confirm receipt; full completion may reasonably take longer
if identity verification (§1) is still in progress. Revisit this target
once real request volume during the pilot gives a better sense of what's
sustainable.

## Original manual process

## 1. Identity and authority verification

Before touching any data:

- Confirm the request comes from the account holder — reply to the email
  address already on file for that guardian (`profiles`/`auth.users`), or
  call a phone number already associated with the club/order, never a
  number or address supplied fresh in the request itself.
- Confirm the requester is an actual guardian of the specific player named
  (`guardians` table — `profile_id`/`player_id`), not merely a coach or a
  guardian of a different child on the same team.
- If a player has more than one guardian, confirm all guardians agree
  before deleting shared data (moments, goals) that a second guardian may
  still want. Deleting the requesting guardian's own account/connection
  only (see §3, partial case) does not require the other guardian's
  consent.
- Record the request itself (date, requester, method of verification) in
  whatever ticketing/support log the club uses — this record is kept
  deliberately separate from the child's data being deleted (§5).

## 2. Records affected

**Full player deletion** (a `delete from players where id = ...`) cascades
automatically to, per the schema's own foreign keys:

| Table | Behaviour on player delete |
|---|---|
| `guardians` | cascade delete |
| `moments` (+ `moment_media`, cascading again) | cascade delete |
| `player_assessments` | cascade delete |
| `player_season_focus` | cascade delete |
| `player_strengths` | cascade delete |
| `player_goals` | cascade delete |
| `player_skill_snapshots` | cascade delete |
| `story_updates` (`player_id`) | cascade delete |
| `coach_players` | cascade delete |
| `coach_invites` | cascade delete |
| `moment_visibility`-related rows | cascade delete |
| `cards.player_id` | **set null**, row otherwise kept — preserves order/production/financial history, no longer resolves to a player |
| `card_definitions.player_id` | **set null**, row otherwise kept, same reasoning |

**Media in S3** is *not* touched by any database cascade — object storage is
independent of Postgres. Before deleting the player row, collect every
`photo_key` (`players.photo_key`) and `moment_media.s3_key` for that
player, so the matching S3 objects can be removed as a separate step (§3).

**Auth identity**: the guardian's `auth.users` row and `profiles` row are
a separate decision — only delete these if the guardian is closing their
whole account, not merely removing one child (a guardian with multiple
claimed children who asks to remove one child keeps their account).

## 3. Safe deletion order

Run as a single transaction where the database steps allow it (the player
delete's cascades are already atomic); S3 deletion cannot be part of that
transaction, so do it in this order specifically — deleting S3 objects
*before* confirming the database transaction committed risks losing the
only record of what needed deleting if the transaction later fails:

1. **Backup first.** Export the player's row and every cascading table's
   rows (a plain `select * from <table> where player_id = ...` for each,
   saved outside the production database) before deleting anything — kept
   only long enough to handle an immediate dispute or mistaken request,
   then itself deleted per your organisation's retention policy. This is
   the one intentional, time-boxed exception to "don't retain deleted
   child data" (§5) — a safety net for the deletion process itself, not
   a substitute for actually deleting the live data.
2. **Collect S3 keys** (`photo_key`, every `moment_media.s3_key` for this
   player) from the backup taken in step 1, before deleting the rows that
   reference them.
3. **Delete the `players` row** (`delete from players where id = ...`) —
   this single statement cascades through every table listed in §2's
   cascade column automatically; `cards`/`card_definitions` rows survive
   with `player_id` set to null.
4. **Delete the collected S3 objects** using the keys from step 2, only
   after step 3's transaction is confirmed committed.
5. **If this was the guardian's only child and they're closing their
   account**, delete their `profiles` row and (via the Supabase Auth
   admin API, not a raw table delete) their `auth.users` row.

**Partial case** — a guardian wants their *own* access removed but the
child continues on the team (e.g. custody change, a second guardian
remains): delete only that guardian's `guardians` row, not the player.
Nothing else in §2 is affected.

## 4. Confirmation to the parent

Once deletion is complete, reply confirming: what was deleted (player
profile, moments/media, assessments, goals — name them, don't just say
"your data"); that any physical card in circulation no longer resolves to
a live profile (`public_player_id` lookup fails the moment the player row
is gone); and the retention window (if any) for the safety backup from
step 1, after which it too is gone.

## 5. Audit record without retaining deleted child data

Keep a record that a deletion *happened* — who requested it, when, which
player ID, which staff member carried it out, confirmed via which
verification method (§1) — but this audit entry must never contain the
child's name, photos, moment content, or any other deleted personal data
itself, only the fact and metadata of the deletion event. This is the
same distinction §1's request log already draws: record that the event
occurred, not the content that was removed.
