# Squad Invite pre-implementation audit and architecture report

**Version:** 0.1

**Date:** 13 August 2026

**Status:** Pre-implementation report; payment and consolidated-delivery pricing decisions outstanding

**Implementation state:** No Squad Invite branch, schema, route, UI or external-service change has been made

## Evidence method

- **VERIFIED** — directly supported by cited repository evidence.
- **INFERRED** — reasonable interpretation requiring operational confirmation.
- **UNKNOWN** — not established by repository evidence.
- **FOUNDER DECISION REQUIRED** — Blake must select the commercial/product rule.
- **SPECIALIST REVIEW REQUIRED** — data-protection, safeguarding or security validation is required.

## Executive recommendation

**VERIFIED:** The current system prices and atomically persists one order containing one or more paid players. It does not aggregate separately paid orders into a campaign tier. Shopify integration is a fixed-variant cart permalink followed by an HMAC-verified `orders/paid` webhook; the repository contains no Shopify Draft Order creation, delayed payment capture, automatic refund, campaign repricing or refund/cancellation webhook implementation ([pricing engine](../../src/lib/pricing-engine.ts), [Shopify link builder](../../src/lib/shopify.ts), [paid webhook](../../src/app/api/webhooks/shopify/orders-paid/route.ts), [authoritative order route](../../src/app/api/order-enquiry/route.ts)).

**Recommended controlled-pilot payment model: model 3 — each parent completes a payment-neutral card commitment, then receives an individual payment request after campaign closure at the final achieved tier.** This is closest to the existing manual “we’ll email a payment link” operating path and avoids inventing card authorisation, delayed capture or automatic refunds. The payment request must still be generated and reconciled through an approved implementation; the existing fixed-price cart permalink is not sufficient evidence that arbitrary final campaign pricing or consolidated shipping can be represented safely.

**FOUNDER DECISION REQUIRED:** Approve model 3, or select another model, before checkout/payment integration. Also decide consolidated-delivery pricing: whether shipping is included, charged once and to whom, or allocated across parents. The shared pricing engine explicitly excludes delivery ([pricing engine](../../src/lib/pricing-engine.ts)).

**Safe implementation boundary:** A payment-neutral foundation can be designed for campaigns, isolated parent participation, versioned permissions, lifecycle, audit, aggregate progress and consolidated fulfilment. It must not mark commitments as paid, determine a final paid tier from unpaid commitments, issue a payment request, create a fulfilment batch, or unlock the free coach card until the payment model and shipping rule are approved.

## 1. Existing functionality that can be reused

- **VERIFIED:** Version-1 GBP pricing rules and thresholds are centralised in `priceOrder`: single £24.99, multi £21.99, squad £18.99; tier follows distinct paid players; quantity affects subtotal; squad unlocks one £0 coach card; delivery is excluded ([pricing engine](../../src/lib/pricing-engine.ts), [tests](../../src/lib/pricing-engine.test.ts)).
- **VERIFIED:** Server-authoritative quote generation already derives price from trusted counts and returns typed line items ([quote controller](../../src/lib/pricing-quote-controller.ts), [quote route](../../src/app/api/pricing/quote/route.ts)).
- **VERIFIED:** The existing production builder supports per-player details, photograph/crop, club badge, template, position, squad number, quantity, print capture, S3 uploads, contact details and coach-card configuration ([ProductionBuilder](../../src/components/emblem-uk/ProductionBuilder.tsx), [coach-card UI](../../src/components/emblem-uk/CoachCardSection.tsx)).
- **VERIFIED:** Asset upload and authoritative order submission validate file namespaces, types/sizes, S3 existence, print-file bijection, badges, canonical pricing, idempotency and atomic persistence ([asset route](../../src/app/api/order-assets/route.ts), [validation](../../src/lib/order-enquiry-validation.ts), [order route](../../src/app/api/order-enquiry/route.ts), [migration 0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql)).
- **VERIFIED:** Orders, paid player lines and a separate coach-card row/line already exist. The coach card never creates a player/card/card-definition row ([migrations 0045–0049](../../supabase/migrations/0045_order_pricing_schema.sql), [coach-card schema](../../supabase/migrations/0047_order_coach_cards.sql)).
- **VERIFIED:** Shopify paid webhook verification, order-reference extraction and idempotent paid transition exist ([webhook helpers](../../src/lib/shopify-webhook.ts), [paid webhook](../../src/app/api/webhooks/shopify/orders-paid/route.ts)).
- **VERIFIED:** Guardian authentication/claiming, unique claim tokens, rate limiting and private guardian relationships exist ([claim route](../../src/app/api/os/claim/route.ts), [claim-code utility](../../src/lib/claim-code.ts), [rate limit](../../src/lib/rate-limit.ts)).
- **VERIFIED:** Staff authentication and least-privilege checks can be reused for sensitive operational views ([staff guard](../../src/lib/require-staff.ts), [migration 0008](../../supabase/migrations/0008_staff_auth_and_invite_audit.sql), [migration 0037](../../supabase/migrations/0037_service_role_least_privilege.sql)).
- **VERIFIED:** The application has reusable Emblem styling and mobile-oriented builder components, although the current production builder is a large monolith ([ProductionBuilder](../../src/components/emblem-uk/ProductionBuilder.tsx), [global styles](../../src/app/globals.css)).
- **VERIFIED:** Player/account deletion requests, media deletion and operational runbooks provide patterns for lifecycle and exception handling ([migrations 0041–0044](../../supabase/migrations/0041_player_deletion_requests.sql), [deletion runbook](../pilot/child-data-deletion-runbook.md)).

## 2. Existing functionality that must be adapted

- The current builder creates multiple player records inside one purchaser’s order. Squad Invite needs one isolated parent participation and one child/order per parent while reusing player-card editing primitives.
- The existing authoritative RPC derives tier from players within one order. Campaign qualification must instead count distinct eligible paid participant orders, without weakening the existing order boundary.
- The current squad coach card is mandatory within a qualifying multi-player order. Campaign coach configuration must be campaign-level, remain separate, and become eligible only after final paid qualification.
- The current Shopify permalink passes quantity and an order reference to one fixed variant. Campaign payments need the final campaign unit price and consolidated-delivery rule without trusting client values.
- The paid webhook only moves an order to `paid`; it does not link a participation, recompute campaign qualification, handle refunds/cancellations or guard fulfilment finalisation.
- Existing claim tokens are rate-limited and unguessable, but no complete lost/replaced-card revocation workflow was found. Private registration cannot be represented as fully pilot-ready until revocation exists.
- Staff queue treats individual cards/orders, not a locked consolidated batch with package reconciliation and minimal distribution manifest.
- Current logs include contact and submission metadata. Squad Invite routes need explicit log-safe shapes with no child names, photos, claim secrets or parent contact in campaign analytics.

## 3. Missing functionality

- Campaign creation, publish/share token, deadline/status lifecycle and organiser ownership.
- Parent-isolated campaign participation/builder session.
- Versioned organiser authority, parent authority/photo permission, private-registration choice and team-delivery acknowledgement.
- Aggregate progress derived from qualifying distinct paid participations.
- Organiser aggregate dashboard with no participant roster or private data.
- Campaign-specific payment orchestration and reconciliation.
- Refund/cancellation effect on qualification and race-safe finalisation.
- Exactly one campaign coach-card configuration and eligibility transition.
- Consolidated fulfilment batch, locked order membership, package reconciliation, staff manifest and minimal organiser distribution list.
- Delivery-recipient reassignment, dispatch/delivery/distribution states and exception handling.
- Campaign audit event ledger and privacy-preserving internal product-event interface.
- Campaign-specific rate limits, expiry behaviour, noindex/cache metadata and support/takedown routes.
- Card revoke/replace/reassign workflow independent of private player records.

## 4. Current data model relevant to Squad Invite

**VERIFIED:** Core tables include `profiles`, `clubs`, `teams`, `players`, `cards`, `guardians`, `orders`, `claim_attempts`, invite tables, `card_definitions`, `order_line_items`, `order_coach_cards`, deletion requests and visibility audit records (migrations [0001](../../supabase/migrations/0001_init.sql)–[0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql)).

**VERIFIED:** `orders` carries purchaser/intended-guardian emails, source, payment status, print files and canonical pricing snapshot columns. It has no campaign, fulfilment-batch, shipping-recipient or refund-event relationship ([migration 0001](../../supabase/migrations/0001_init.sql), [migration 0045](../../supabase/migrations/0045_order_pricing_schema.sql)).

**VERIFIED:** `cards.order_id` associates a physical card with its order. `order_line_items` provides immutable commercial snapshots. `order_coach_cards` is a production-only adult row separate from players ([migrations 0045–0047](../../supabase/migrations/0045_order_pricing_schema.sql)).

**VERIFIED:** Player fields include more data than the MVP permits, but Squad Invite can constrain its own request shape to display name, football age group, squad number, position, club/team and authorised photo. It must not populate exact DOB, school, child address or precise location.

## 5. Current payment and Shopify capabilities

### Verified capabilities

- A Shopify cart permalink can add a configured UK card variant and carry an Emblem order reference as a cart attribute ([shopify.ts](../../src/lib/shopify.ts)).
- `orders/paid` webhook signatures are validated with HMAC-SHA256 over raw bytes; duplicate paid events are harmless; cancelled orders are not flipped back to paid ([shopify-webhook.ts](../../src/lib/shopify-webhook.ts), [paid route](../../src/app/api/webhooks/shopify/orders-paid/route.ts)).
- The builder can fall back to a manual emailed-payment-link message when the variant environment variable is absent ([ProductionBuilder](../../src/components/emblem-uk/ProductionBuilder.tsx)).
- `orders` can store delivery, tax and total amounts, but these are nullable and not currently resolved by the campaign flow ([migration 0045](../../supabase/migrations/0045_order_pricing_schema.sql)).

### Unsupported or unverified capabilities

- **VERIFIED ABSENT IN REPOSITORY:** Shopify Draft Order API creation, price overrides for a final campaign tier, deferred capture, saved card authorisation, automatic partial refunds, refund/cancel webhooks, delivery-fee allocation, VAT computation and campaign payment requests.
- **UNKNOWN:** Shopify Admin product/variant configuration, tax settings, shipping profiles, Draft Order permissions and actual payment-link operating process.
- **FOUNDER DECISION REQUIRED:** Payment model and consolidated-delivery pricing.

### Model comparison

| Model | Repository fit | Customer/commercial risk | Pilot recommendation |
|---|---|---|---|
| 1. Collect at deadline at final tier | No delayed-capture/payment-request implementation | Requires a new compliant payment request or authorisation flow | Viable only after Shopify capability and customer journey are approved |
| 2. Immediate maximum then partial refund | No refund integration or refund qualification ledger | Highest complexity; customers fund maximum; refund/VAT/support burden | Do not use for controlled pilot |
| 3. Commitment then individual payment request at close | Closest to existing manual emailed-link fallback | Requires clear non-binding/binding wording and payment deadline | **Recommended**, subject to founder and specialist review |
| 4. Immediate single price with later non-financial squad reward | Fits current fixed cart best | Does not preserve approved final tier pricing; changes commercial promise | Not recommended without a new pricing decision |

## 6. Current pricing-engine behaviour

**VERIFIED:** `priceOrder` accepts trusted `paidPlayerCount` and `totalPrintQuantity`, rejects invalid quantities, chooses single for 1, multi for 2–9 and squad for 10+, applies the tier unit price to every paid print, and includes at most one £0 coach card. Delivery is explicitly separate. Version is pinned to 1 ([pricing-engine.ts](../../src/lib/pricing-engine.ts), [tests](../../src/lib/pricing-engine.test.ts)).

**Architecture rule:** Do not create campaign price constants. A campaign qualification service should call the same engine with distinct eligible paid participations and their total print quantity. The database must enforce the corresponding versioned result at finalisation.

## 7. Guardian, coach-card and player-creation behaviour

- **VERIFIED:** Authoritative team-order persistence creates order → distinct player → card/claim token → card definition → player-card line; it creates the coach card separately ([migration 0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql)).
- **VERIFIED:** Existing parent claim creates a guardian relationship after authentication and rate-limited claim lookup; authentication is not independent proof of parental responsibility ([claim route](../../src/app/api/os/claim/route.ts)).
- **VERIFIED:** Public profile enablement is separate and guardian-controlled; Squad Invite must never call it ([migration 0039](../../supabase/migrations/0039_guardian_public_profile_control.sql)).
- **VERIFIED:** Current coach-card UI is tied to squad-tier eligibility inside one builder order. Campaign configuration must not reuse that eligibility assumption directly ([coach-card-draft](../../src/lib/coach-card-draft.ts), [CoachCardSection](../../src/components/emblem-uk/CoachCardSection.tsx)).
- **SPECIALIST REVIEW REQUIRED:** Exact parent-authority wording/evidence and disputed-authority handling.

## 8. Privacy and security risks introduced

1. Share-link enumeration or leakage exposes campaign affiliation. Keep the permanent campaign ID separate from a high-entropy, hashed, expiring and revocable invitation credential; use uniform unavailable responses, opaque rate-limit buckets and no child metadata.
2. Cross-parent access exposes child photos/orders. Enforce server ownership and RLS; never rely on UI hiding.
3. Organiser role creep creates a child roster. Return aggregates only until staff-approved fulfilment requires minimal labels.
4. Threshold pressure may shame families. Never identify participants/non-participants or use manipulative countdowns.
5. Campaign metadata can reveal child age/location. Use display team and broad football age group only; no precise venue/location.
6. Consent bundling undermines choice. Store separate versioned authority, manufacture/photo, team-delivery and optional private-registration records.
7. Consolidated delivery reveals association and creates misdistribution risk. Seal/labelling must be minimal and organiser access time-limited.
8. Payment retries/refunds can incorrectly qualify a campaign. Use idempotent event records and database-locked recomputation.
9. Fulfilment races can include unpaid/duplicate orders. Create one locked batch from eligible orders in one transaction.
10. Lost/misissued NFC cards can expose a child-linked route. Revocation/reassignment is a pilot blocker for private registration.
11. Photographs can include other children, school badges or location clues. Provide safety guidance, replace/remove and takedown paths.
12. Audit/analytics can become a personal-data ledger. Use allowlisted event types and non-personal campaign/order references only.
13. Adult delivery address/contact could leak publicly or to parents. Restrict to staff/recipient and return only a non-sensitive delivery summary.
14. Real child data in non-production creates excess exposure. Use synthetic fixtures only.

**SPECIALIST REVIEW REQUIRED:** DPIA update, parent/organiser wording, authority evidence, consolidated delivery safeguards, organiser distribution access and pilot stop criteria.

## 9. Proposed architecture and data flow

```text
Authenticated organiser
  -> create draft campaign + adult delivery recipient + authority record
  -> publish (separate reusable invitation credential, deadline, audit event)
  -> share sanitised URL via native/WhatsApp share

Public parent
  -> read active campaign projection (team, age group, deadline, aggregates only)
  -> authenticate or establish isolated resumable participation
  -> build one child's card using campaign-constrained builder
  -> record separate authority/photo/private-registration/team-delivery choices
  -> create payment-neutral commitment and authoritative assets
  -> [PAYMENT MODEL BOUNDARY — not implemented until approved]

Verified payment event
  -> idempotently associate one order/participation
  -> recompute distinct paid-player count and tier under DB lock
  -> update aggregate projection; never reveal identities

Deadline/manual close
  -> block new starts; define in-progress grace explicitly
  -> wait for approved payment rule
  -> atomically freeze final tier
  -> configure exactly one coach card if eligible
  -> staff creates exactly one fulfilment batch from eligible paid orders

Fulfilment staff
  -> review protected print assets
  -> produce individual sealed packages and reconcile card/NFC/package
  -> ship consolidated batch to adult recipient
  -> record dispatch/delivery/exceptions

Organiser
  -> sees aggregate status and time-limited minimal distribution labels
  -> confirms receipt/distribution; reports exceptions

Guardian
  -> independently claims private card through existing authenticated flow
  -> no public profile and no organiser access
```

Campaign state should be derived request-time for deadline expiry where possible, with an explicit transition on the next trusted read/write; no new scheduler is required for MVP. Finalisation and fulfilment transitions must be explicit, transactional and auditable.

## 10. Proposed migrations

Use one additive migration after the current latest migration; do not alter historical migrations.

1. `squad_invites`: internal UUID, organiser profile, role, display team/club, age group, optional approved badge reference, expected size, status/timestamps/deadline, terms/privacy versions, final pricing snapshot, coach eligibility/configuration state, delivery-recipient adult fields and fulfilment status. Its permanent IDs are never invitation credentials.
2. `squad_invite_links`: campaign association, SHA-256 token hash, active/paused/revoked state, expiry, replacement chain, last use, aggregate use count, optional participation limit and audit history. Raw tokens are returned only when created/replaced.
3. `squad_invite_participations`: campaign, guardian/customer where authenticated, private builder credential, one order link, status/timestamps and a unique campaign + guardian rule. No participant is readable by another participant or organiser; link rotation does not delete participations.
4. `squad_invite_permissions`: participation/campaign scope, actor, purpose enum, exact version, granted/declined/withdrawn timestamps and minimal evidence. Separate rows for organiser authority, child/order authority, photo manufacture, private registration and consolidated delivery.
4. `squad_invite_audit_events`: campaign, actor/role, allowlisted event type, timestamp and minimised JSON metadata; service/staff access only.
5. `campaign_fulfilment_batches` and `campaign_fulfilment_items`: exactly one active batch per campaign, final tier/version, payment gate, staff transitions, order uniqueness, package reference/inclusion/reconciliation and exception state.

**Alternative considered:** Extending `orders` alone cannot safely represent organiser controls, public campaign projection, independent permissions, one-to-many participations or fulfilment batch membership. New narrowly scoped tables are justified.

All tables require explicit FKs/delete actions, checks, actual-query indexes, RLS, revoked PUBLIC/anon/authenticated table access unless a narrow policy is needed, and SECURITY DEFINER RPCs with empty search path for cross-row aggregate/finalisation operations. No destructive backfill.

## 11. Proposed routes, APIs, services and UI

### Routes/APIs

- `POST /api/squad-invites` — authenticated organiser creates draft.
- `GET/PATCH /api/squad-invites/:id` — owner-safe management; aggregate projection only.
- `POST /api/squad-invites/:id/publish|close|cancel` — idempotent lifecycle mutations.
- `GET /squad-invite/join/:token` — rate-limited credential resolution into a clean HttpOnly cookie-backed context; uniform unavailable response.
- `GET /api/squad-invite-links/context` — allowlisted safe projection only.
- `POST /api/squad-invite-links/participation` — authenticated, idempotent isolated participation start/resume.
- `POST/PATCH /api/squad-invites/:id/invitation-link` — authorised replacement, pause, resume or revocation.
- `GET/PATCH /api/squad-invite-participations/:id` — actor-owned state only.
- `POST /api/squad-invite-participations/:id/permissions` — versioned acknowledgements.
- `POST /api/squad-invite-participations/:id/commit` — payment-neutral commitment and asset/order association.
- `GET /api/squad-invites/:id/dashboard` — organiser aggregates/fulfilment summary.
- Staff-only batch review, transition, manifest and exception endpoints.
- Payment adapter interface and webhook application service, with no checkout implementation until approved.

### Services

- Campaign token/lifecycle and deadline service.
- Campaign qualification service wrapping `priceOrder`.
- Permission-recording service.
- Aggregate projection service.
- Audit/product-event interface with allowlisted non-personal payloads.
- Payment adapter interface (`createPaymentRequest`, `applyPaymentEvent`, `applyRefundEvent`) initially unimplemented.
- Fulfilment batch/manifest/reconciliation service.
- Card revocation/replacement service required before private registration pilot.

### UI

Create, review/publish, share, public invitation, constrained one-child builder entry, permissions, payment-boundary status, parent confirmation, organiser aggregate dashboard, lifecycle states, coach configuration and staff batch view. Reuse design tokens and extract safe builder primitives rather than duplicating the entire `ProductionBuilder`.

## 12. Proposed permission model

- **Public:** resolve one valid active reusable invitation credential; view only display name, broad age group, deadline, aggregate tier/progress, delivery summary, authorised official badge and coach incentive; begin authentication for an isolated participation. The credential grants no campaign membership or builder access. No enumeration, participants, children, photos, contacts, internal IDs or address.
- **Parent:** own participation, builder, order/payment status and private registration only. No other participation or full recipient address.
- **Organiser:** own campaign settings within lifecycle rules, aggregate counts, share/close/cancel, one coach configuration, fulfilment status and time-limited minimal distribution labels after staff approval. No photos, parent contacts/accounts, payment instruments, consent history, private OS or roster export.
- **Staff:** existing authenticated staff boundary plus purpose-specific operations. Sensitive access/override is logged and reviewable.
- **Database:** RLS on every new table; narrow RPCs for public projection, parent mutation, aggregate recomputation and finalisation. No client service-role credentials.

## 13. Test plan

1. Pure qualification tests at 1, 2, 9, 10 and >10 distinct paid players; multiple prints for one player; duplicate/refund/cancel events; one coach card; threshold races.
2. Migration/static contract tests for constraints, indexes, grants, RLS, fixed search path and qualified relations.
3. Transactional database tests for public/parent/organiser/staff isolation and concurrent finalisation.
4. Lifecycle tests for draft, active, request-time expiry, close, cancel, in-progress grace, late events and fulfilment lock.
5. Privacy tests for metadata, no roster/photo/DOB/public-profile creation, permission separation, minimal manifest and address secrecy.
6. Security tests for token entropy/uniform failures, rate limiting, CSRF conventions, upload validation, idempotency, webhook signatures and log payloads.
7. Fulfilment tests listed in the confirmed decision: one batch, eligible orders only, unique card/package membership, minimal manifest, exceptions, reassignment and access expiry.
8. Existing focused pricing/order/claim tests, full Vitest, `tsc --noEmit`, lint changed files and production build.

Use synthetic children/parents only. No remote database or external-service calls.

## 14. Rollback and forward-correction approach

- Keep the feature behind an application flag and do not publish campaigns until schema and operational review are complete.
- Use additive tables/nullable links; do not alter historical order semantics or pricing snapshots.
- Application rollback disables routes/UI while preserving campaign/audit records for review.
- Migration rollback before real data may drop new objects in reverse dependency order. After real use, prefer a forward migration that closes campaigns, revokes route grants and preserves auditable commercial records rather than destructive rollback.
- Payment/fulfilment adapters remain isolated so a provider/model correction does not rewrite campaign identity, permissions or parent data.
- Never roll back a fulfilment lock automatically after production begins; use a staff-reviewed exception/forward correction.

## 15. Open founder decisions and blockers

### Blocking before checkout implementation

1. **FOUNDER DECISION REQUIRED — payment model:** approve recommended model 3 or select models 1, 2 or 4 with revised requirements.
2. **FOUNDER DECISION REQUIRED — consolidated delivery pricing:** Is delivery included in card prices, charged once, or allocated? Who pays? What happens below threshold/cancellation? Do not invent a charge.
3. **FOUNDER DECISION REQUIRED — commitment semantics:** Is pre-close submission non-binding, and how long does each parent have to pay after close?
4. **UNKNOWN:** Which Shopify capability will create a correctly priced individual request, and can it represent VAT/shipping accurately? Confirm Admin configuration and API permissions without exposing secrets.

### Blocking before private registration or fulfilment pilot

5. **FOUNDER DECISION REQUIRED:** Is optional private registration included in the first controlled pilot or deferred?
6. **PILOT BLOCKER / SECURITY REVIEW REQUIRED:** Approve and implement card-token revocation, replacement and wrong-family reassignment.
7. **FOUNDER DECISION REQUIRED:** In-progress builder and late-payment grace periods at campaign deadline.
8. **FOUNDER DECISION REQUIRED:** Minimum organiser distribution label—default first name + surname initial + squad number—and whether full name is ever operationally necessary.
9. **FOUNDER DECISION REQUIRED:** Uncollected-card retention and destruction period.
10. **FOUNDER DECISION REQUIRED:** Who may create a campaign and what authority evidence is required?
11. **FOUNDER DECISION REQUIRED:** Whether the free coach card must be configured before publish, before close or only after eligibility.
12. **SPECIALIST REVIEW REQUIRED:** Authority/photo wording, team-delivery acknowledgement, organiser disclosure, safeguarding/takedown process and DPIA update.
13. **SECURITY REVIEW REQUIRED:** Public rate limits, organiser/staff access expiry, audit retention and fulfilment manifest handling.

## Pre-implementation conclusion

The payment-neutral architecture is feasible using existing conventions without public profiles, child accounts, coach OS access, rosters or external integrations. Checkout, final paid qualification, coach-card unlock and fulfilment initiation are not safe to implement until Blake resolves decisions 1–3 and confirms the Shopify mechanism. No application implementation should imply that a submitted commitment is paid or that a campaign has earned a tier.
