# Child-data deletion runbook

**Update (29 August 2026 — corrects a stale claim below):** since migration
`0076_child_data_erasure.sql`, clicking **"Mark completed"** at
`/staff/deletion-requests` is **not** an attestation that a human already
performed the deletion by hand — it is the real, authoritative execution
step. It calls `confirm_player_deletion_erasure` (deletes the player row
and every cascade, revokes every card, strips card artwork, and inventories
every S3 object that must go), then the route deletes each inventoried S3
object for real, then `finalize_player_deletion_erasure` only marks the
request `completed` once every object is confirmed deleted and no supplier
item is left outstanding — otherwise it reports exactly what's still
pending or failed, safe to retry. Everything below describing a staff
member manually running SQL and manually deleting S3 objects (§2–3) is
**superseded**: the RPCs now do that work themselves, verified per-object,
not on trust. Treat §2–3 as an explanation of *what* happens automatically,
not instructions to carry out by hand.

**One real, still-open gap this correction surfaced:** the old manual
process's step 3.1 ("back up the row(s) before deleting, keep briefly for
an immediate dispute") has **no equivalent in the automated path** — it
deletes for real, with no short-term application-level recovery net.
Supabase's own infrastructure-level backups/PITR exist regardless, but
restoring a single record from those isn't a quick "undo a same-day
mistake" operation. Whether that's an acceptable tradeoff for the
verification/reconciliation this automation gains, or whether a short-
lived pre-delete snapshot should be added back, is a genuine open product
decision — not resolved by this correction.

**What's still genuinely manual, unaffected by any of this:** §1's identity
and parental-authority verification. The RPCs correctly check that the
*caller* is a recorded guardian of the named player, but nothing here
verifies that the recorded guardian relationship itself was ever properly
established in the first place — the same parental-responsibility gap
flagged elsewhere in the DPIA. Staff must still do this step by judgment,
every time, before ever clicking "Mark completed."

A guardian can file a self-serve **request** from Player OS → Account
Settings → "Request player-data deletion" — this only files a
`player_deletion_requests` row and shows a reference number; it does not
itself trigger execution. A parent can also reach staff directly
(support email/phone) without using the in-app form — both paths land on
the same queue at `/staff/deletion-requests`, and staff must still verify
identity/authority (§1) before acting on either.

## Operational queues (pilot)

- **`/staff/deletion-requests`** — player-data deletion requests filed by
  guardians via Account Settings, or logged manually by staff for a
  request that arrived by another channel (email/phone). Each pending row
  shows the player, when it was requested, and the guardian's contact
  email at the time of the request (captured at request time — it may no
  longer match the guardian's account if they've since changed it or
  deleted their own account entirely). **"Mark completed" now performs the
  real deletion** (see the 29 August 2026 correction above) — the required
  note is a completion record, not an attestation that the work already
  happened elsewhere.
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

## Reference: what the automated steps below actually do

## 1. Identity and authority verification — still manual, do this first, every time

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

## 3. Deletion order (now performed automatically by "Mark completed")

This is what `confirm_player_deletion_erasure` → S3 delete-per-object →
`finalize_player_deletion_erasure` actually does, in this order, when
staff clicks "Mark completed" — nothing here needs to be run by hand:

1. ~~Backup first.~~ **Not performed by the automated path — see the 29
   August 2026 correction above.** No time-boxed application-level export
   happens before deletion; Supabase's own infrastructure backups/PITR are
   the only recovery net, and they are not a same-day "undo" tool.
2. **S3 keys are collected automatically** (`photo_key`,
   `moment_media.s3_key`, card-definition photo keys) and recorded in
   `player_deletion_storage_objects` before the rows referencing them are
   touched.
3. **The `players` row is deleted** as part of the same RPC, cascading
   through every table in §2's cascade column; `cards`/`card_definitions`
   rows survive with `player_id` set to null, and every card is revoked.
4. **Each collected S3 object is actually deleted**, individually, with
   the outcome (success/failure, retry count) recorded per object — a
   partial failure blocks completion and is safe to retry, it does not
   silently report success.
5. **Closing a guardian's whole account** is a separate action
   (`delete_own_guardian_account`, guardian-initiated) — it is not part of
   a single player's deletion completion and is not affected by this
   correction.

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

**Now automatic.** `player_deletion_requests` (who, when, which player,
which staff member, completion note), `card_access_audit_events` (every
card revoked as part of this), and `player_deletion_storage_objects` /
`player_deletion_supplier_status` (exactly which storage keys and
suppliers were involved, and their outcome) together are this audit
trail — none of them store the child's name, photos, or moment content,
only the fact and shape of the deletion. Staff do not need to keep a
separate manual log for this; §1's identity-verification note is still
worth recording wherever your organisation logs support contact, since
that step itself remains manual.
