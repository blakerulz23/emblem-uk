# Gate 3 → PR #44 integration note

**Status:** documentation only. No code in PR #44 (guardian-controlled
card-front sharing) is touched by Gate 3, and this note does not itself
implement anything — it records the minimal, precise change PR #44 will
need once both branches are ready to be sequenced together.

## Why this is needed

The product decision for Gate 3 states: *"If the guardian is eligible
under PR #44, show the separate card-sharing control on this paid
confirmation page"* and *"Payment must never count as sharing consent."*

Today, PR #44's `get_card_share_eligibility` (migration 0078) already
requires `orders.authority_status = 'confirmed'` and a single, non-
suspended/non-revoked card — but it does not check `orders.payment_status`
at all, because payment didn't yet exist as a real, enforced state when
that migration was written (the order flow it targets was the manual
"we'll email a payment link" journey). Once Gate 3 lands, an order can
legitimately sit at `authority_status = 'confirmed'` while
`payment_status` is still `order_intent` or `pending_payment` — sharing
should not be offered for a card that hasn't been paid for yet, even
though the guardian is otherwise eligible.

## The minimal change

A single additional condition in `get_card_share_eligibility`
(migration 0078, `src/lib/emblem-uk-builder.ts`'s eligibility path is
unaffected — this is entirely a database-side change), immediately
alongside the existing `authority_status` check:

```sql
if v_order.authority_status is distinct from 'confirmed' then
  return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
end if;

-- Gate 3 addition — new, not yet present in migration 0078:
if v_order.payment_status is distinct from 'paid' then
  return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
end if;
```

Using the existing `'not_authorized'` reason (not a new one) is
deliberate: `shouldHideCardShareEntirely` (`src/lib/card-share.ts`)
already treats `'not_authorized'` as a silent-hide reason, so an unpaid
order's share control simply doesn't appear at all — no new UI branch,
no new copy, no new reason vocabulary for the client to learn, and no
disclosure of *why* it's hidden (consistent with this feature's existing
"never reveal why an ineligible record failed" rule).

Everything else about PR #44's design already satisfies Gate 3's
contract without any change:

- **Payment is never sharing consent.** PR #44's separate, unticked
  confirmation checkbox and its own `record_card_share_consent` call are
  entirely independent of `payment_status` already — this addition only
  adds a further precondition to *eligibility*, it does not touch consent
  recording at all.
- **The guardian still passes PR #44's own eligibility RPC** — unchanged,
  this note only tightens one branch of it.
- **Coaches, organisers, and other adults do not gain sharing rights by
  paying** — `get_card_share_eligibility`'s existing `adult_user_id`/
  `relationship = 'parent_guardian'` checks are unaffected; a payment
  event never touches `builder_order_authority_declarations`.
- **Suspended/revoked/deletion-pending cards remain disabled** — the
  existing `access_status` check runs independently of, and before,
  this new payment check.
- **No public share page, permanent URL, or server-stored share image**
  — nothing here changes anything about how the share image itself is
  generated or transmitted (PR #44's same-origin photo route and
  in-browser capture are untouched).

## Where the UI hookup point already exists

Gate 3's own review screen (`ProductionBuilder.tsx`) reaches
`checkoutStage === 'confirmed'` only once `get_gate3_payment_status`
(migration 0080) reports `paymentStatus: 'paid'` from a real,
signature-verified Shopify webhook — never from the browser's own return
navigation. That is the same moment PR #44's `<ShareCardSheet>` should be
mounted, in place of Gate 3's own "Order confirmed" text-only state. The
exact JSX wiring is left to whichever branch merges second, since it
depends on which of PR #44's or Gate 3's `ProductionBuilder.tsx` edits
lands first — this note exists so that whoever does that merge knows
precisely what the one required SQL change is, and why it's safe.

## What this note deliberately does not do

- It does not merge, rebase, or edit PR #44.
- It does not apply migration 0078 changes to any database — the SQL
  above is illustrative, to be implemented as its own reviewed migration
  once both branches are sequenced.
- It does not change Gate 3's own scope: Gate 3 ships with sharing
  untouched, and PR #44 ships with payment untouched, until this
  integration is done as its own small, separately-reviewed follow-up.
