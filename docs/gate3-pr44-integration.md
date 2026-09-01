# Gate 3 → PR #44 integration note

**Status:** documentation only. No code in PR #44 (guardian-controlled
card-front sharing) is touched by Gate 3.

**Correction (26 August 2026):** an earlier version of this note proposed
adding a `payment_status = 'paid'` check to PR #44's
`get_card_share_eligibility` (migration 0078). That was wrong and has
been fully retracted — see "Founder's confirmed product decision" below.
It was never implemented in any migration or code; only this document
described it, and only this document needed correcting.

## Founder's confirmed product decision

Payment does **not** enable or gate card sharing. After a successfully
submitted and authority-approved request, the eligible parent/legal
guardian may **share the card design** or **continue to Shopify
checkout** — two fully independent actions, in either order. Payment
gates only physical production and fulfilment, never sharing.

The following are mandatory, and are all already true of PR #44's
existing design with **zero code change required**:

- Sharing does not require `payment_status = 'paid'`.
- Sharing eligibility (`get_card_share_eligibility`, migration 0078)
  does not read `payment_status` at all, and must not start doing so.
- Payment creates no sharing-consent event — `apply_gate3_payment_event`
  (migration 0080) never writes to `card_share_consent_events` and has
  no knowledge that table exists.
- Sharing creates no payment event — `record_card_share_consent`
  (migration 0078) never writes to `orders.payment_status`,
  `payment_state_events`, or anything Gate 3 owns.
- Paying does not grant a coach, organiser, other adult, or unrelated
  guardian sharing rights — eligibility is still gated entirely on
  `authority_status` and `adult_user_id` matching the declaring adult,
  which a payment event never touches.
- Adult Permission being confirmed does not imply payment has occurred
  — these are two separate columns (`authority_status`,
  `payment_status`) with two separate, independent write paths.
- Sharing does not move a request into production — only
  `apply_gate3_payment_event` (via a verified Shopify webhook) and
  staff approval do that.

## What integration actually means here

Given the above, there is **no SQL or eligibility-logic integration
required at all**. The only real integration point is presentational:
both PR #44's share control and Gate 3's "Continue to secure checkout"
button are meant to appear together on the same post-submission screen,
as two independent actions the guardian can take in either order. That
is a `ProductionBuilder.tsx` JSX concern for whichever branch merges
second (both branches currently edit that file in different,
non-overlapping regions), not a database or authorization concern.

## What PR #45 (Gate 3) proves about its own boundary, in the absence of PR #44 in this codebase

Since PR #44 is not part of PR #45's branch, PR #45 cannot exercise
PR #44's real eligibility RPC directly. Instead, PR #45's own test suite
proves the *shape* of the boundary from its own side:

- No Gate 3 migration, RPC, or route references
  `card_share_consent_events`, `get_card_share_eligibility`,
  `record_card_share_consent`, or any other PR #44 sharing object, by
  name, anywhere.
- No Gate 3 route or RPC accepts or reads a "consent"/"sharing"-shaped
  parameter.
- `apply_gate3_payment_event` and `begin_gate3_checkout` touch only
  `orders`, `payment_state_events`, and `shopify_webhook_events` —
  confirmed by direct review of migration 0080, which is the complete
  list of tables this work package writes to.

See `src/lib/gate3-sharing-independence-contract.test.ts` for the
executable version of these assertions.

## What this note deliberately does not do

- It does not merge, rebase, or edit PR #44.
- It does not propose any change to migration 0078 or
  `get_card_share_eligibility` — the earlier version of this note did,
  and that proposal has been withdrawn as incorrect.
- It does not change Gate 3's own scope: Gate 3 ships with sharing
  completely untouched, and PR #44 ships with payment completely
  untouched. The only future work is a small, purely presentational
  merge (both controls on one screen), not a new authorization rule.
