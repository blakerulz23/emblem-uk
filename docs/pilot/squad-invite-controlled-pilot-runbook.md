# Squad Invite controlled-pilot runbook

**Status:** Local implementation guide. Payment requests are disabled pending verified Shopify capability. Legal, safeguarding and security review markers remain open.

## Create and approve

1. An authenticated authorised adult creates a draft, supplies the adult consolidated-delivery recipient and accepts the versioned organiser declaration.
2. Emblem staff reviews authority, delivery scope and campaign content. Approval must be recorded before activation.
3. Do not state that DBS, employment or club authority was independently verified unless evidence was actually checked.

## Publish and share

1. Publish only after staff approval.
2. Copy the high-entropy reusable invitation link or use the device share/WhatsApp action. The raw link credential is shown only when created or replaced; the database stores its hash.
3. Check that share text contains team name, deadline and incentive only—never a child name.
4. The campaign page is `noindex`, contains aggregates only and displays no participant list or child photograph.
5. Pause or revoke the invitation link to stop new entry without deleting the campaign or existing private participations. Replacement permanently revokes the old link and creates a new credential.
6. Invalid, expired, paused and revoked links use the same unavailable response. Do not troubleshoot by disclosing whether a campaign exists.

## Parent completion

1. Parent opens the reusable link, verifies the minimum email session if needed, and starts or resumes their one isolated participation before the deadline. Repeated opens must not create duplicates.
2. Parent builds the card in the same production builder every normal order uses (`/builder?squadParticipation=<id>`, `ProductionBuilder.tsx` with `squadInviteContext` set) — the real templates, photo upload/crop, background removal and personalisation, not a separate or lookalike tool. Order-type and team selection are not offered: the mode is locked to exactly one child, and the club/team field is locked to the campaign's own club name.
3. Parent supplies only one child’s card fields and an authorised photograph.
4. Parent separately accepts child-information authority, photograph manufacture, consolidated delivery and payment-neutral commitment versions. Private registration remains deferred.
5. Commitment wording must say no charge is taken and production begins only after payment.
6. At deadline, block new builders. Existing builders may complete for 24 hours; do not advertise the grace as an invitation to delay.

## Card production integration

1. Saving the card calls the authenticated commit route (`POST /api/squad-invite-participations/[id]/commit`), never the normal `/api/order-enquiry` enquiry pipeline and never Shopify. The route re-derives the builder-credential hash itself from the httpOnly cookie server-side — it never accepts a token or hash from the request body — and verifies the uploaded photo genuinely exists in storage before writing anything.
2. Persistence is one atomic database transaction, `commit_squad_invite_participation_order` (migration `0055_squad_invite_order_commitment.sql`, `security definer`, `service_role`-only). It re-verifies guardian ownership and the builder credential inside the transaction (never trusts the caller alone), re-checks the campaign is still active or within its grace window, then creates one order/player/card/card_definition row — the same tables and staff queues a normal paid order uses, not a parallel table set — and links `squad_invite_participations.order_id`.
3. Every order this function creates starts at `payment_status = 'order_intent'`, identical to a normal order before staff review. It is never created as `'paid'` or `'fulfilled'`. Per-order pricing columns are left null — Squad Invite pricing stays campaign-level, set later by staff (see Close and price).
4. A repeat commit attempt for the same participation is idempotent: it returns the existing order/card rather than creating a second one. Ownership and credential mismatches, and campaigns outside their active/grace window, are rejected before any write.

## Close and price

1. After grace ends, close through the server-authoritative transition.
2. Count distinct completed eligible commitments once; print quantity does not change the count.
3. Freeze policy `squad_invite_commitment_pricing_v1`, tier and unit price. Do not later increase it because of unpaid parents.
4. Display “Squad price unlocked” separately from “Free coach card confirmed.”

## Staff approval (source-aware)

1. A Squad Invite order reaches the same staff card-approval queue as normal orders (`/staff/queue`), clearly labelled "Squad Invite · payment disabled." The approve action for it reads "Approve for pilot production," never "Approve" alone — nothing in the label or copy may claim or imply payment was received.
2. `POST /api/orders/[id]/approve` branches on `orders.source`. Normal orders keep their exact existing behaviour, including the guardian/team claim invitation email. A `squad_invite` order takes a separate branch that: confirms the order is linked to exactly one participation that itself owns it; confirms the campaign hasn't been cancelled or exceptioned; and **never calls the general claim-invitation path** (`createGuardianInvite`/`createTeamInvite`) and **never sends an email** — the guardian already holds the authenticated participation relationship the card came from, so a second claim flow would be confusing and redundant, not additive.
3. The Squad Invite branch records its own audit event (`squad_invite_audit_events`, `event_type = 'fulfilment_started'`, `metadata.paymentStatus = 'unpaid_pilot'`) in place of an invitation, so the unpaid nature of the approval is explicit in the trail, not inferred.
4. Approving a Squad Invite order still flips the same `orders.payment_status` column to `'fulfilled'` to enter the existing Profile Setup production queue — this is a known, deliberate schema-semantic mismatch (the column's only other meaning elsewhere in this codebase is "paid and approved"). It is mitigated by the staff-facing labelling above and the audit metadata, never hidden. Do not "fix" this by inventing a new payment_status value without also auditing every other consumer of that column.
5. The Resend-invitation action is not offered for a Squad Invite order — none was ever sent, so there is nothing to resend.

## Payment boundary

1. The adapter is disabled. Do not claim requests can be issued until Shopify price, VAT, included delivery, permissions and paid/cancelled/refunded/expired webhooks are verified.
2. Once an adapter is separately approved, each request lasts exactly 72 hours and retains the frozen price.
3. Late payment enters staff exception; it never automatically enters production.
4. Reissue is staff-only, audited and cannot reprice.
5. A single server-only function, `squad_invite_payment_mode_enabled()`, is the one policy boundary for whether payment is required before a Squad Invite order can be approved for production. It is hardcoded `false` for the entire pilot — no environment variable, request header or client-supplied flag can change it; changing it requires a new, separately reviewed migration. While `false`, the staff approval branch above may move an order straight from `order_intent` to `fulfilled` with no payment. Once flipped to `true`, that same branch must reject approval unless `payment_status = 'paid'` first — this is already implemented and tested, just inert until the boundary changes.

## Coach card

1. Organiser may configure one proposed adult coach card before close.
2. Lock configuration at close.
3. Confirm production eligibility only after ten distinct successful, non-refunded player payments.
4. A missing configuration does not automatically delay paid player cards; follow up separately.

## Consolidated fulfilment

1. Staff creates exactly one batch from eligible paid orders only, after payment and frozen-price checks.
2. Reconcile paid participation → approved design → manufactured card → internal NFC/card ID → sealed package → shipment.
3. Use `First name + surname initial + optional squad number + opaque package reference`. Ambiguity becomes a staff packaging exception; do not expose more automatically.
4. Never put parent contact, consent, DOB, internal IDs or claim secrets on manifests/outer packaging.
5. Dispatch one standard UK shipment to the approved adult recipient. Non-UK, split, replacement, unsupported-postcode or address-error delivery requires staff review.
6. Record dispatch, delivery and distribution confirmation. Organiser access must expire after the support window; exact expiry needs security review.

## Exceptions

- Cancelled/refunded/reversed/unpaid: exclude from production and batch.
- Lost team shipment, damaged package, missing/wrong card: move affected batch/item to exception and restrict details to staff.
- Wrong-family card: keep guardian claiming disabled; revoke/reassign/replace only after the security-reviewed workflow exists.
- Organiser unavailable/change: staff-authorised reassignment with audit; never automatically transfer child/order information.
- Disputed photograph/authority: freeze production and access, preserve minimal evidence, and escalate. The final safeguarding process requires specialist review.
- Uncollected card: keep sealed up to 30 days after confirmed receipt using existing club communications. Then contact Emblem for return/secure-destruction instructions; never ordinary household waste.

## Rollback and incident handling

1. A failed commit is a rolled-back transaction, not a partial record: `commit_squad_invite_participation_order` is one Postgres function body, so an error at any step (order, player, card, card_definition, line item, participation link, permissions, audit event) rolls every one of those writes back together. There is no state where an order exists without its card, or a card without its definition.
2. Migration 0055 is additive-only. Rolling it back means: dropping `commit_squad_invite_participation_order` and `squad_invite_payment_mode_enabled`, and reverting the `orders.source` check constraint to its pre-0055 form (`team_order`, `standalone_order`). Any order already created with `source = 'squad_invite'` would then violate that constraint on any future update — do not roll back the constraint while such rows exist without first deciding what `source` they should carry instead.
3. A guardian reporting a stuck or duplicated card: check `squad_invite_participations.order_id` for that participation first. A repeat commit is idempotent by design (see Card production integration §4) — if two orders somehow exist for one participation, that is a genuine data-integrity incident, not expected behaviour, and should be escalated rather than resolved by deleting either order directly (cards/card_definitions/line items reference it).
4. A Squad Invite order stuck in the approval queue with no participation link, or linked to more than one, is rejected by the approval route rather than silently approved — treat that rejection as the signal to investigate the underlying data, not as a bug to route around.
5. If the payment-mode boundary is ever flipped to `true` outside a reviewed migration, or a Squad Invite order is found at `payment_status = 'paid'`/`'fulfilled'` without a corresponding real payment event, stop the pilot immediately and treat it as a payment-integrity incident, not a display bug.

## Known open issues

- **Nested `<main>` landmark on `/builder`.** `ConditionalChrome` wraps every `/builder` route in its own `<main className="min-h-screen">`, and `ProductionBuilder`'s wizard shell independently renders its own `<main className="uk-wizard-screen">` inside that — two "main content" landmarks on one page, confirmed via live rendering (Playwright, both the normal and Squad Invite entry points). This is a real accessibility defect, pre-existing on the general `/builder` route and not introduced by the Squad Invite integration; it was found, not fixed, while verifying that integration, since a general `/builder` chrome/layout change is out of this task's scope. Track and fix separately — likely by removing the wizard's own `<main>` in favour of a `<div>`, the same correction already applied to `/squad-invite/join`'s `JoinSquadInvite.tsx` for the same class of defect. Do not expand that fix into a wider `/builder` redesign while resolving it.

## Pilot monitoring and stop

Review campaign transitions, isolated access, commitments, payment exceptions, batches, misdistribution, support and deletion failures. Pause on unauthorised disclosure, unresolved disputed authority, real child data in non-production, unsafe payment behaviour or inability to revoke a misissued NFC card.
