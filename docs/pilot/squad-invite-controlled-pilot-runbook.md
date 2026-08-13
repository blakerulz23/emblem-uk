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
2. Parent supplies only one child’s card fields and an authorised photograph.
3. Parent separately accepts child-information authority, photograph manufacture, consolidated delivery and payment-neutral commitment versions. Private registration remains deferred.
4. Commitment wording must say no charge is taken and production begins only after payment.
5. At deadline, block new builders. Existing builders may complete for 24 hours; do not advertise the grace as an invitation to delay.

## Close and price

1. After grace ends, close through the server-authoritative transition.
2. Count distinct completed eligible commitments once; print quantity does not change the count.
3. Freeze policy `squad_invite_commitment_pricing_v1`, tier and unit price. Do not later increase it because of unpaid parents.
4. Display “Squad price unlocked” separately from “Free coach card confirmed.”

## Payment boundary

1. The adapter is disabled. Do not claim requests can be issued until Shopify price, VAT, included delivery, permissions and paid/cancelled/refunded/expired webhooks are verified.
2. Once an adapter is separately approved, each request lasts exactly 72 hours and retains the frozen price.
3. Late payment enters staff exception; it never automatically enters production.
4. Reissue is staff-only, audited and cannot reprice.

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

## Pilot monitoring and stop

Review campaign transitions, isolated access, commitments, payment exceptions, batches, misdistribution, support and deletion failures. Pause on unauthorised disclosure, unresolved disputed authority, real child data in non-production, unsafe payment behaviour or inability to revoke a misissued NFC card.
