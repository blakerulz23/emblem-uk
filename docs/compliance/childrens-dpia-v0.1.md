# Emblem Children's Data Protection Impact Assessment — first draft

**Version:** 0.1

**Date:** 12 August 2026

**Status:** Draft for Blake, safeguarding, security and UK data-protection specialist review

**Assessment owner:** UNKNOWN — Blake to assign

**Review trigger:** Before the controlled pilot; before any material change to public sharing, NFC, AI/photo processing, Coach OS permissions, suppliers, or age range

> This document is an evidence-led first draft, not legal advice or a compliance certificate. It does not conclude that Emblem is compliant, approved, certified or safe. Legal, safeguarding, contractual and operational statements marked **REQUIRES SPECIALIST REVIEW** must be resolved by suitably qualified people. Repository evidence describes intended implementation, not necessarily production configuration or operational practice.

## Controlled-pilot Squad Invite implementation note — 14 August 2026

**Status: implementation evidence only; DPIA remains unapproved.**

- **VERIFIED IN LOCAL SOURCE:** organiser access uses Supabase email OTP to establish control of an email address. The interface expressly states that this does not verify club authority, employment, DBS status or safeguarding clearance.
- **VERIFIED IN LOCAL SOURCE:** Squad Invite review and approval are separated from ordinary staff membership through explicit `squad_invite_reviewer` and `squad_invite_approver` permissions. No existing staff account is granted either permission automatically.
- **VERIFIED IN LOCAL SOURCE:** the initial organiser request excludes child information, rosters, parent contact lists and the full delivery address. Adult delivery address, postcode and courier contact are deferred until after approval.
- **VERIFIED IN LOCAL SOURCE:** the non-secret public request reference is not an access credential. Organiser management requires the authenticated organiser identity; the parent invitation remains a separate high-entropy credential stored only as a hash.
- **VERIFIED IN LOCAL SOURCE:** lifecycle notifications use a disabled/test outbox and synthetic renderer. No real email adapter is enabled by this checkpoint.
- **STATICALLY VERIFIED ONLY — NOT EXECUTED:** migration 0052 designs submission and approval as database transactions and designs approval to create the request decision, setup-required campaign, organiser ownership, paused parent-link reservation, audit event and one disabled outbox event together. No local database runtime was available, so atomicity, concurrency, rollback, grants, RLS and RPC behaviour are not runtime-proven.
- **VERIFIED IN LOCAL SOURCE:** parent participation and the production one-child builder remain disabled pending a later checkpoint. Payment requests and Shopify integration remain disabled.
- **VERIFIED OPERATIONAL LIMIT FOR THIS TASK:** migration 0052 has not been applied to local, staging or production databases, and no remote service was contacted.

**REQUIRES SPECIALIST REVIEW:** delivery-address retention and field-level encryption. The repository contains no established field-level encryption convention for this data; the current design relies on server-only access, ownership checks, RLS denial and data minimisation.

## Controlled-pilot Squad Invite implementation note — 17 August 2026

**Status: implementation evidence only; DPIA remains unapproved. Supersedes the 14 August note's outbox line above.**

- **VERIFIED IN LOCAL SOURCE:** the four organiser-facing lifecycle notifications (request received, changes requested, approved, rejected) now send a real email via Resend — the same integration already disclosed as a supplier elsewhere in this document (see the supplier list and the data table's "Invite codes" row). This is activation of an already-disclosed processor for a new event category, not a new third party.
- **VERIFIED IN LOCAL SOURCE:** these emails carry only the organiser's own email, the team display name, and a link back to the organiser's own authenticated manage page — never a child's name, photo, delivery address, internal ID or the parent-facing invitation link itself. The approval email in particular never contains that link, since it doesn't exist yet at the point staff approve (it's generated later, once the organiser separately completes delivery setup) — see `send-squad-invite-notification-email.ts`'s header comment.
- **VERIFIED OPERATIONAL LIMIT FOR THIS TASK:** no `RESEND_API_KEY` is configured on the disposable pilot's Vercel project (checked: Preview environment has neither `RESEND_API_KEY` nor `RESEND_FROM_EMAIL`). The send function is designed to no-op safely when the key is absent (returns `{ok:false}`, never throws), so this has not been exercised as a live send in any environment reachable from this task — only the code path, typechecking and unit assertions are verified. It activates automatically wherever `RESEND_API_KEY` is already configured (e.g. the main `emblem-uk` Vercel project's Production environment, per the existing guardian-invite email feature).

## Approval note — 18 August 2026

**Status: approved for the controlled pilot by Blake, 18 August 2026.** This
supersedes the "DPIA remains unapproved" status in the 14 and 17 August
notes above. Recorded here as told to the engineering agent working this
session, at Blake's direction, immediately before production deployment of
the Squad Invite feature — this document does not itself independently
verify that safeguarding/security/DPO specialist review took place; it
records that Blake, as assessment owner and the project's final business
sign-off authority (see "Assessment owner" and "Who's who" in this
project's own handoff notes), confirmed approval to proceed. The risk
register below and its **REQUIRES SPECIALIST REVIEW** markers remain the
accurate, current record of residual risk and open mitigation work — this
note records authorization to launch the controlled pilot with that risk
accepted, not that every marker has since been resolved.

## Gate 2 — exact date of birth removal, Stage A — 24 August 2026

**Status: implementation evidence only; this is not an ICO approval, ICO
certification, formal compliance sign-off, or a statement that Emblem is
pilot-ready. Independent DPIA and safeguarding specialist review remain
outstanding, exactly as section 12 and the risk register below already
state.**

Founder decision (Blake, on behalf of Lauda Cartoons Ltd):

> Lauda Cartoons Ltd has identified no printing, NFC, delivery, payment,
> safeguarding or football-card purpose requiring Emblem to store a child's
> exact date of birth. Football age group is sufficient for Emblem's
> product. Any club registration requirement remains outside Emblem.

This acts directly on the minimisation gap this DPIA's own risk register
already identified (risk R19, and the "Exact DOB and physical/sporting
attributes" row of the section 8 lawful-basis table) — it is not a new
finding, and this note does not claim the DPIA recommended this specific
implementation in advance, only that the direction is consistent with it.

## Work Package B — guardian-controlled card-front sharing, draft — 25 August 2026

**Status: implementation evidence only; unreleased. This feature is not
enabled for customers, is stacked as a separate draft PR on top of the
still-unmerged Adult Permission fix (PR #43), and requires this note's own
review — plus a DPO/safeguarding sign-off separate from the approval
recorded on 18 August 2026 above — before any release decision. Nothing
below is a statement that sharing is safe to launch.**

This is a genuinely new processing purpose distinct from every other
purpose this DPIA already covers: **optional, guardian-initiated
distribution of an image containing the child's photograph and card design
outside Emblem's own systems, to recipients of the guardian's choosing.**
None of Emblem's existing lawful bases for creating/printing/delivering a
card were assessed against this purpose, because this purpose did not
exist until now.

- **VERIFIED IN LOCAL SOURCE:** sharing is gated behind a separate,
  explicit confirmation ("I understand and choose to share this card image
  outside Emblem outside Emblem.", unticked by default) shown alongside a
  plain-language warning that the image contains the child's photograph
  and club/team branding and that recipients may re-save or re-share it,
  and a truthful statement that Emblem cannot recall copies already
  downloaded, sent, saved or reposted elsewhere. Cancelling records no
  image and no confirmed-consent event (migration 0078,
  record_card_share_consent).
- **VERIFIED IN LOCAL SOURCE:** the generated image is rendered client-side
  only, in memory, from the same on-screen CardFace component already used
  for review/print (unmodified — see the protected-areas byte-identity
  test), captured via the same existing captureElementToPng (also
  unmodified) at a lower resolution than print. No server copy, public
  page, public storage object, or long-lived signed URL is ever created —
  confirmed by direct code reading: neither new API route uploads or
  persists image bytes anywhere.
- **VERIFIED IN LOCAL SOURCE:** the consent-event table
  (card_share_consent_events) never stores the generated image, a name, an
  email, or a phone number — only profile/order/card ids, a reference to
  the exact card_definitions row shown at consent time, a consent-wording
  version, a result, and a timestamp. RLS enabled, no policies, explicit
  revoke of the default grant set before granting only service-role
  select/insert — the same discipline as every other audit table this
  DPIA already covers (0071, 0075, 0076).
- **VERIFIED IN LOCAL SOURCE, DELIBERATELY NARROW SCOPE:** eligibility
  (get_card_share_eligibility, migration 0078) is enabled ONLY for a direct
  parent/legal guardian's own single-child order (authority_status=
  'confirmed', the current session's auth.uid() matching the verified
  adult who completed Adult Permission, and a server-side row count
  proving exactly one card exists on that order). It is explicitly NOT
  enabled for:
  - **The other-adult/coach/organiser journey** (authority_status=
    'guardian_approved'): the approving guardian's own journey
    (src/app/builder-approval/[token]/page.tsx) never establishes an
    authenticated session at all — confirmed by direct reading: no
    signInWithOtp, no auth.uid() anywhere on that page. There is currently
    no browser session belonging to that guardian to safely grant sharing
    control to. Enabling this would require a new, separate guardian-
    authentication step on that page — a materially different piece of
    work, not attempted here.
  - **Whole-team / multi-player orders** under the ordinary builder: the
    same authority declaration covers the entire order, not each child
    individually, so the schema cannot prove which child a given adult is
    actually the guardian of. Hidden entirely, proven by a server-side
    count of cards per order, not trusted from any client-supplied order
    "type".
  - **Squad Invite:** squad_invite_participations.guardian_profile_id IS a
    real, session-backed identity (confirmed by direct reading of
    commit/route.ts — set from a server-verified auth.getUser() call), so
    this table could support a parallel eligibility path in principle. Not
    wired in this pass: Squad Invite has its own separate success screen
    and its own active in-flight workstream this session (payment
    activation); adding sharing there needs its own dedicated review of
    its existing permissions/rights evidence, not a bolt-on here.
- **UNRESOLVED RIGHTS QUESTION — REQUIRES SPECIALIST REVIEW:** sharing is
  enabled only for the Custom Collection template ids (an explicit
  allowlist: custom-solar, custom-galaxy, custom-comic), never for Official
  Collection or any licensed/third-party design (EMJFL official badge,
  Hollinwood partner variants) — no repository evidence was found (docs/
  and the template-classification source were searched directly) that
  Emblem holds social-distribution rights for those licensed assets. This
  is the safe default the product spec itself requires when such evidence
  is absent; it is not a finding that Emblem lacks those rights, only that
  this task did not find them recorded anywhere, and no supplier or rights
  holder was contacted (out of scope for this task). Separately: the
  existing Adult Permission confirmation guardians already give
  ("permission to upload and process this photograph") is being treated,
  for this initial safe policy, as also covering any club/team crest the
  same guardian separately chose to upload in the same builder session —
  its exact wording does not name uploaded branding specifically. Both
  points require specialist/founder review before this is relied on beyond
  a draft implementation.
- **UNRESOLVED RETENTION QUESTION — REQUIRES SPECIALIST REVIEW:** this
  migration does not itself extend the existing child-data erasure runbook
  (0076) to card_share_consent_events. On a player/guardian deletion, this
  table should participate in the same erasure design as
  builder_authority_audit_events/card_access_audit_events (retain the fact,
  null or remove the guardian reference per the approved retention design)
  — that extension has not been implemented or reviewed as part of this
  work package and is recorded here as an open gap, not an oversight to be
  silently assumed closed.
- **VERIFIED OPERATIONAL LIMIT FOR THIS TASK:** migration 0078 has not been
  applied to any database in this task beyond disposable verification with
  fictional data, and no remote service was contacted for rights
  information.

Six decisions were treated as approved requirements for this work:

1. The guardian-facing chronological "Age" tile on the Player OS card is
   replaced with "Football age group" (e.g. U8, U10).
2. There is no exceptional workflow anywhere in Emblem for a guardian,
   coach or staff member to store a child's exact date of birth.
3. Clubs that need date of birth for their own registration purposes must
   manage it outside Emblem — this is explicitly out of Emblem's scope.
4. A player with no football age group set continues to work normally
   (loads, displays, is printable and NFC-usable); the field is never
   inferred from date of birth or the current date.
5. Active application storage was searched for a second copy of exact DOB
   beyond `players.date_of_birth` — none was found (see below).
6. Supplier/third-party involvement was checked — no evidence was found
   that exact DOB was ever sent to Resend, Shopify, Google Gemini, Meshy,
   AWS or any other third party; no supplier deletion request is required
   as a result of this work.

**Removal status (Stage A of two):** `players.date_of_birth` values were
erased (`UPDATE ... SET date_of_birth = NULL`, migration
`0073_remove_exact_dob_stage_a.sql`, aggregate counts only — no individual
value was read at any point in this work). Both DOB-reading functions
(`get_player_age`, `get_player_date_of_birth`) were revoked and dropped.
`update_player_coach_fields` was replaced with a signature that no longer
accepts a date of birth at all. The coach-only date-of-birth input field
and the guardian-facing calculated-age tile were removed from the
application. The `players.date_of_birth` column itself, and its CHECK
constraint, are deliberately still present after Stage A — column removal
is Stage B, a separate, later migration, planned only after Stage A has
been released and independently verified in production.

**Second-copy / backup search:** no second copy of exact DOB was found in
application-reachable storage (no cache, export, log, audit-metadata
field, email template or test fixture was found to include it — see the
Gate 2 discovery report for the full inventory). This work did **not**
check Supabase's own database backups or point-in-time-recovery snapshots
— those exist outside application code and outside this task's reach;
whether any pre-migration backup retains a since-erased date-of-birth
value is genuinely **unknown** and is not resolved by this migration. This
is the same "UNKNOWN — backup/DR copies" gap this DPIA's section 13
(item 18) already recorded before this work began; Stage A narrows it
(no *new* backups will contain the value once retained backups age out
under Supabase's own retention window) but does not close it.

**Residual risk after Stage A:** the `players.date_of_birth` column
remains in the schema, permanently null, pending Stage B's drop; no
application-role path can currently read or write it, but the column's
mere continued existence is itself a smaller residual footprint than
before Stage A, not a fully closed one. Backup-retention exposure (above)
is unresolved. All other section 12 "required before the pilot" items are
unaffected by this work and remain open.

## Work Package B addendum — same-origin photo route and rights matrix — 26 August 2026

**Status: implementation evidence only; unreleased. Supplements, does not replace, the 25 August 2026 Work Package B note above — all of that note's unresolved rights/retention questions remain open exactly as recorded there.**

**VERIFIED IN LOCAL SOURCE — same-origin photo retrieval (migration 0079,
`/api/card-share/photo`).** A live manual preview test found that the
shared image omitted the player's photograph. Root cause: by the time
sharing is available, the photo (and any uploaded club crest) has already
moved to a private, signed S3 URL — the correct behaviour of the existing,
unmodified upload pipeline. That URL displays fine as an ordinary `<img>`
(no cross-origin restriction applies to that), but the browser cannot draw
a cross-origin image onto a `<canvas>` without the bucket's CORS
cooperation, which this bucket correctly does not grant, since these are
private, non-public child photographs — loosening that would have been a
privacy regression, not a fix, and was explicitly rejected as an option.

The corrected design adds one same-origin server route:
`/api/card-share/photo` re-derives the exact same authorisation
`get_card_share_eligibility` already performs (never trusts a client-
supplied key, order id, or URL), resolves the private S3 key itself
server-side via a new function (`get_card_share_asset_key`, migration
0079), fetches the object bytes server-to-server (no CORS restriction
applies between servers — only browsers enforce CORS), and returns them
from the app's own origin. The browser never receives the raw S3 key or a
fetchable S3 URL of any kind. No new public route, public object, or
long-lived credential is created by this fix; the route is authenticated
and rate-limited the same as the existing eligibility/consent routes.

**VERIFIED OPERATIONAL LIMIT FOR THIS TASK:** during preview testing of
the pre-fix build, the isolated preview deployment's AWS credentials
silently fell through to the same S3 bucket and credentials Production
uses, because this Vercel project scopes `AWS_S3_BUCKET`/
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` identically across Production
and Preview — a pre-existing infrastructure gap, not something this task
introduced, but one this task's own testing surfaced concretely. One
fictional test image was, as a direct result, briefly written to the real
production bucket during that test; no other production system was
touched, and no real customer/child data was read, written, or exposed.
This gap is recorded here as an open infrastructure item requiring a
genuinely separate non-production S3 bucket/credential scope for Preview,
not resolved by this DPIA note itself.

### Rights matrix — visible design assets eligible for guardian-initiated social sharing

Sharing recreates exactly the visible card front already approved for
production — it does not introduce any new asset into the design. This
matrix records, for each category of visible asset that can appear on a
card front, whether the *additional* act of guardian-initiated social
distribution (beyond Emblem's own printing/production use) is currently
supported by recorded rights evidence. **Printing rights are not assumed
to include social-sharing rights** — each row is assessed for sharing
specifically, independent of whatever printing basis already exists.

| Asset category | Emblem-owned? | Printing permission? | Social-sharing permission? | Evidence location | Reviewer/owner | Current sharing decision |
|---|---|---|---|---|---|---|
| Emblem-designed Custom Collection backgrounds/templates (`custom-solar`, `custom-galaxy`, `custom-comic`) | Yes — created for Emblem's own product | Yes (existing product use) | **Assumed yes** — Emblem's own original artwork, no third-party rights holder involved | Template source under `src/components/builder/emblem/` | UNKNOWN — Blake to assign | **Eligible** (subject to the guardian's own upload/branding permission below) |
| User-uploaded club/team badge (Custom Collection only) | No — guardian/coach-supplied | Guardian/coach asserts permission at upload (existing Adult Permission "confirmed_photo_permission" declaration, not badge-specific wording) | **UNRESOLVED — REQUIRES SPECIALIST REVIEW.** The existing declaration's exact wording covers the uploaded *photograph*; it does not separately name uploaded club/team branding. Treated, as an initial safe policy, as covering both because the same authenticated adult chose every visible asset in one continuous session — not a settled legal position | `builder_order_authority_declarations.confirmed_photo_permission` (migration 0071); DPIA 25 August 2026 note above | UNKNOWN — Blake to assign | **Eligible, provisionally** — pending the specialist review already flagged on 25 August 2026 |
| Player photograph | No — guardian-supplied, child's own image | Guardian permission via Adult Permission | Same Adult Permission declaration as above | Same as above | UNKNOWN — Blake to assign | **Eligible** — this is the asset the whole feature exists to let the guardian share |
| Official Collection templates | Likely Emblem-owned design, but the collection references real club/league identity | Yes (existing product use) | **No evidence found** that Emblem holds social-distribution rights for the associated club/league identity | No repository evidence found — `docs/` and template-classification source searched directly, nothing located | UNKNOWN — Blake to assign | **Not eligible** — excluded by explicit template allowlist in `get_card_share_eligibility` (migration 0078) |
| Licensed/partner badges (e.g. EMJFL official badge, Hollinwood partner variants) | No — third-party/licensed marks | Yes, under whatever licence permits printing | **No evidence found** of a separate social-distribution licence | No repository evidence found | UNKNOWN — Blake to assign | **Not eligible** — same allowlist exclusion as above |
| League/competition artwork | No — third-party marks | Context-dependent, not fully documented | **No evidence found** | No repository evidence found | UNKNOWN — Blake to assign | **Not eligible** — excluded (not part of the Custom Collection allowlist) |
| Third-party design templates outside Custom Collection/Official Collection | Not established | Not established | **No evidence found** | Not established | UNKNOWN — Blake to assign | **Not eligible** — excluded by the same allowlist |
| Fonts and other embedded design assets (card chrome, layout, typography) | Yes — assumed licensed for Emblem's own product use, not independently re-verified for redistribution in a shared social image | Yes (existing product use) | **UNKNOWN — not independently reviewed for this task.** No evidence was found either way; assumed low risk as non-identifying design chrome, not asserted as cleared | Not established | UNKNOWN — Blake to assign | **Included by default** wherever a Custom Collection card is otherwise eligible — flagged here as an unreviewed assumption, not a confirmed clearance |

**Fail-closed policy recorded here, matching the actual implementation:**
Custom Collection sharing remains eligible only because (a) the guardian
who uploaded any branding is the same authenticated adult who completed
Adult Permission for that exact order, and (b) the remaining Emblem-owned
template/background assets are treated as cleared for this internal
product use. Official Collection and every licensed/rights-uncertain
category are disabled at the database layer (the explicit
`custom_template_ids` allowlist in `get_card_share_eligibility`), not by
UI convention alone — confirmed by direct reading of migration 0078 and
re-verified this task via role-impersonated RPC calls against the
disposable database (see this task's own verification report on PR #44
for the exact scenarios exercised).

**This rights matrix does not itself grant, confirm, or imply that any
"UNKNOWN"/"REQUIRES SPECIALIST REVIEW" row has been cleared.** It records
the current, honest state of evidence so that a decision-maker can see
precisely what remains open before treating this feature as launch-ready.

### Data-flow, retention, and consent-record update

**VERIFIED IN LOCAL SOURCE.** The complete share data flow is:

```text
Guardian (authenticated, Adult-Permission-confirmed, single-child order)
  -> browser fetches eligibility (get_card_share_eligibility, read-only)
  -> guardian opens the share overlay, actively ticks the separate consent
  -> browser records consent (record_card_share_consent) BEFORE any image
     is generated
  -> browser renders the same on-screen CardFace component, off-screen,
     fetching the private photo/badge via the same-origin
     /api/card-share/photo route (never a direct cross-origin S3 fetch)
  -> browser captures that render to an in-memory image (captureElementToPng)
  -> Web Share API (with a File) if supported, otherwise a direct browser
     download — both are the SAME generated bytes, never a second copy
  -> nothing is uploaded, stored server-side, or given a public URL at any
     point in this flow
```

- **No server-stored share image, ever.** Confirmed by direct reading:
  neither `/api/card-share/eligibility`, `/api/card-share/consent`, nor
  `/api/card-share/photo` writes image bytes anywhere — the two former
  routes never handle image bytes at all, and the latter only ever reads
  the pre-existing production asset to return it, once, to the requesting
  browser.
- **No public URL is ever created** for the shared image or for the
  underlying private photo — `/api/card-share/photo` requires the same
  authenticated, eligibility-checked session as the rest of this feature
  on every single call; it is not a stable or guessable link, and it
  never appears in the generated image or in the Web Share
  title/text.
- **Local downloads and Web-Share-delivered files cannot be recalled by
  Emblem once they leave the browser** — the guardian-facing warning and
  recall notice already say this in plain language, and this DPIA
  reiterates it here for the record: a recipient, or any social platform
  the guardian shares to, may retain, re-share, or re-post their own copy
  indefinitely, entirely outside Emblem's systems and knowledge.
- **Card suspension, revocation, and deletion requests stop future
  sharing, not past copies.** `get_card_share_eligibility` re-checks
  `access_status` on every call (a pending/active deletion request already
  sets this via migration 0076), so a card that becomes suspended, revoked,
  or subject to a deletion request immediately stops resolving eligible —
  and therefore stops resolving a photo key via
  `get_card_share_asset_key` too, since that function re-derives the same
  eligibility check. This is a real, verified technical control; it is
  not, and cannot be, a means of retracting a copy already shared before
  that point.
- **Consent audit records remain append-only and minimal**, unchanged
  from the 25 August 2026 note: `card_share_consent_events` stores only
  ids, a card-definition version reference, a consent-wording version, a
  result, and a timestamp — never the image, a name, an email, or a phone
  number.
- **Rights-based eligibility restrictions** are the allowlist described in
  the rights matrix above, enforced server-side, not merely hidden in the
  UI.
- **Deliberately unsupported order modes** (whole-team orders, the
  other-adult/guardian-approved journey, Squad Invite) remain exactly as
  recorded in the 25 August 2026 note — hidden entirely, not shown in a
  blocked state, and not broadened by this addendum.

This addendum does not change the DPIA's overall recommendation recorded
above (**REQUIRES SPECIALIST REVIEW — paused pending completion of
section 12 "Required before the pilot"**), and does not itself constitute
safeguarding or legal approval for this feature.

## Work Package B — founder decision on rights allowlist and scope — 26 August 2026

**This is a founder business decision, not a specialist legal, safeguarding,
or compliance sign-off.** It resolves the two open items this feature's own
verification explicitly left to Blake ("Blake to assign" in the rights
matrix, and confirmation that the 25–26 August notes above accurately
describe the shipped scope). It does **not** discharge any
`REQUIRES SPECIALIST REVIEW` marker in this document, and it does not
change the DPIA's overall recommendation above or in section 12.

- **Rights allowlist:** Blake has reviewed the rights matrix above and
  confirms the Custom Collection–only allowlist (`custom-solar`,
  `custom-galaxy`, `custom-comic`) as the current, intended sharing policy —
  not merely a provisional placeholder. Official Collection and every
  licensed/third-party-mark category remain excluded, unchanged. The two
  rows still marked `UNRESOLVED — REQUIRES SPECIALIST REVIEW` in the matrix
  (uploaded club/team badge wording; the Article 9/special-category and
  children's-code questions elsewhere in this document) remain open exactly
  as recorded — this decision accepts the matrix's existing fail-closed
  provisional treatment of those rows as good enough to proceed with
  engineering work, without asserting they are legally resolved.
- **Sharing-specific DPIA scope (25–26 August 2026 notes):** Blake has read
  both Work Package B notes above and confirms they accurately describe what
  was built and its deliberately narrower-than-spec scope (single direct
  guardian order only; Official Collection, whole-team, and Squad Invite
  excluded).

**What this does not do:** it does not clear this feature, or any other
part of this product, for a real-child pilot. Section 12's "required before
the pilot" controls, and every `REQUIRES SPECIALIST REVIEW` marker in this
document — including delivery-address encryption, parental-responsibility
verification, international transfers, special-category data, Children's
Code classification, and the formal best-interests assessment — remain open
and are unaffected by this note.

## Correction — lost/stolen card deactivation is implemented, not an open gap — 29 August 2026

**Status: implementation evidence only; corrects a stale finding elsewhere
in this document. Does not change the overall recommendation below, and
does not itself constitute safeguarding or legal sign-off.**

Section 3's "Lost-card deactivation" note, section 10's risk R2, and
section 12 item 5 all describe this as an unresolved high gap with "no
route or documented workflow" to revoke a claimed card's access. That
description is now stale: it predates, and was never updated after,
migration `0075_card_lifecycle_controls.sql` (the Gate 2 "card suspension,
revocation and replacement" package). **VERIFIED IN LOCAL SOURCE, this
task:**

- `cards.access_status` (`NULL` / `suspended` / `revoked`) is a state axis
  independent of claim progress. `suspend_card` (guardian, own card only —
  or staff, any card) and `revoke_card` (staff only, terminal) are real,
  authorized, idempotent RPCs with reasons including `lost` and `stolen`
  explicitly in the check constraint. `create_replacement_card` (staff
  only) revokes the old card and issues a fresh claim token under the same
  `player_id` in one transaction — existing guardians see the replacement
  automatically, since guardians link to players, not to cards.
- **Enforcement is at the point that actually matters:** `resolveCardCode`
  — the function behind every NFC tap — checks `access_status` before any
  preview data is read out of the row, and returns a generic
  `card_unavailable` result for a suspended or revoked card. A found lost
  card, or one still linked to an incorrect claimant, stops resolving
  immediately once acted on; this is not a UI-only restriction.
- A full append-only audit trail (`card_access_audit_events`) records every
  suspend/unsuspend/revoke/replacement event with actor and reason, never a
  child's name or photo.
- **Staff-facing UI exists and is wired up**
  (`src/app/staff/cards/[id]/CardLifecycleActions.tsx`) to actually operate
  suspend/revoke/replace. Guardian self-service currently covers
  *un*suspending their own card (`UnsuspendCardButton.tsx`); there is no
  guardian-facing "report my card lost" button yet — today that report
  would go to staff, who have the tool to act on it immediately. That is a
  reasonable, arguably safer, pilot-stage design (a self-suspend button is
  also a self-service tool for falsely disabling someone else's claimed
  card, absent further authority checks), not an unaddressed safety hole.
- 36 existing tests (`migration-0075-contract.test.ts`,
  `card-lifecycle-protected-areas.test.ts`) pass unmodified, confirming
  this is live, tested code, not a dead or abandoned migration.

**Net effect:** risk R2 and section 12 item 5 should be read as
substantially closed by existing, verified, enforced code — not as an open
gap requiring new engineering. The one remaining, genuinely open piece is a
product decision (whether to add guardian self-service reporting, and if
so, what additional authority check that would need), not a missing
safety mechanism. This correction does not touch or resolve any other
`REQUIRES SPECIALIST REVIEW` marker in this document.

## Correction — deletion execution is now automated and reconciled, with one real gap found — 29 August 2026

**Status: implementation evidence only; corrects a stale finding elsewhere
in this document, and surfaces one genuine remaining gap the correction
itself found. Does not change the overall recommendation below.**

Section 6 describes "actual player deletion and S3 erasure" as "manual
staff operations," and risk R16 / section 12 item 13 describe converting
this into a verifiable, reconciled workflow as still required. That is now
largely stale: migration `0076_child_data_erasure.sql` (already merged)
replaced the manual runbook's execution step with real, staff-triggered,
database-enforced RPCs. **VERIFIED IN LOCAL SOURCE, this task:**

- Clicking "Mark completed" at `/staff/deletion-requests` is not an
  attestation — it calls `confirm_player_deletion_erasure` (deletes the
  player row and every cascade, revokes every card, inventories every S3
  object that must go), the route then performs a real S3 delete per
  object with the outcome recorded individually, and
  `finalize_player_deletion_erasure` only marks the request `completed`
  once every object is confirmed deleted and no supplier item is left
  outstanding — otherwise it reports exactly what's still pending or
  failed, safe to retry. The route's own header comment states this
  directly: "this used to be a bare attestation... it is now the actual
  authoritative execution step."
- Guardian account deletion (`delete_own_guardian_account`) was similarly
  extended to check every profile-referencing foreign key found in the
  live catalog, not just the original six, deferring genuinely blocked
  cases (Squad Invite organiser/audit history, coach-authored records) to
  a staff review queue (`pending_profile_deletions`) instead of failing
  outright or silently skipping them.
- Squad Invite participations get a structurally separate, tested erasure
  path (anonymise display fields, never delete the row, so campaign and
  payment totals stay correct) — confirmed necessary because
  `squad_invite_participations` has no `player_id` column at all.
- 51 existing tests across four files pass unmodified, confirming this is
  live, tested code.
- `docs/pilot/child-data-deletion-runbook.md` itself is corrected in the
  same commit as this note, for the same reason: staff reading it could
  otherwise believe clicking "Mark completed" is a harmless attestation
  when it now triggers real, irreversible deletion.

**One genuine gap this correction found, not previously recorded
anywhere:** the old manual runbook's step 3.1 required backing up a
player's rows before deletion, kept briefly to handle an immediate
dispute or mistaken request. **The automated path has no equivalent** —
it deletes for real, with no short-term, application-level recovery net.
Supabase's own infrastructure-level backups/point-in-time-recovery exist
regardless (the same standing "backup/DR copies" unknown section 13 item
18 already records), but restoring a single record from those is not a
practical same-day "undo." Whether this tradeoff is acceptable given the
verification/reconciliation gained, or whether a short-lived pre-delete
snapshot should be reintroduced, is a genuine open product decision.

**Also unaffected by this correction:** section 1's identity and
parental-authority verification remains entirely manual, unresolved, and
is the same gap already tracked elsewhere in this document (section 12
item 4, risk R4) — the RPCs correctly check that the caller is a
*recorded* guardian, not that the guardian relationship was ever properly
established in the first place.

## Evidence labels and risk method

- **VERIFIED** — directly supported by repository evidence cited in this document.
- **INFERRED** — reasonable conclusion from the available evidence, but not confirmed operationally.
- **UNKNOWN** — requires confirmation from Blake or another accountable owner.
- **REQUIRES SPECIALIST REVIEW** — legal, safeguarding or security judgement.

Risk ratings use likelihood and severity of harm to people, not corporate impact: Low (1), Medium (2), High (3), Critical (4). Overall risk is expressed qualitatively after considering both. “Residual” assumes the stated mitigation is implemented and evidenced.

## Executive decision summary

**VERIFIED — DPIA required.** Emblem intentionally processes children's identity, photographs, exact dates of birth, sporting development information, relationships and public-sharing choices across an online service and a passive NFC product. Children are vulnerable data subjects; the service includes public disclosure, coach assessment, persistent physical identifiers and third-party photo processing. ICO guidance says children are vulnerable for DPIA purposes and a DPIA is legally required where processing is likely to be high risk. The Children's Code also treats a DPIA and child best-interests assessment as foundational for in-scope services. See [ICO DPIA guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/) and [ICO Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/).

**REQUIRES SPECIALIST REVIEW — provisional decision: do not begin or expand a real-child pilot until the “required before pilot” controls in section 12 are closed.** Highest-priority unresolved matters are: verified parental-responsibility/authority design; child-appropriate transparency and consultation; formal retention schedules and deletion assurance; supplier contracts/transfers for Supabase, AWS, Vercel, Google Gemini, Resend and Shopify; production/staging data rules; safeguarding/moderation for uploads and public content; and review of exact date-of-birth necessity and coach access.

## 1. Project and product description

Emblem produces custom sporting trading cards, principally featuring youth athletes. The product combines:

- a public website and card builder for individual or team orders;
- player and coach photographs, card artwork and print-file generation;
- staff production and fulfilment workflows;
- a passive NFC card containing a URL with a claim token;
- guardian claim, activation and invitation flows;
- Player OS and Coach OS for profiles, moments, achievements, assessments, goals and team relationships;
- Staff OS for order approval, production, public-profile administration and deletion queues; and
- optional public player profiles.

**VERIFIED.** The authoritative order RPC atomically creates orders, paid players, cards, card definitions, line items, print-file mappings and an optional separate coach card ([0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql); [order route](../../src/app/api/order-enquiry/route.ts)).

**VERIFIED.** The NFC URL embeds the card's claim token in `/os?card=...`; the card is passive and the repository contains no telemetry from an NFC chip ([nfc-link.ts](../../src/lib/nfc-link.ts); [card-lookup.ts](../../src/lib/card-lookup.ts)).

**VERIFIED.** Player OS data includes player identity and sporting fields, goals, moments/media, assessments, season focus and recognised strengths ([0001](../../supabase/migrations/0001_init.sql), [0004](../../supabase/migrations/0004_player_photo.sql), [0022](../../supabase/migrations/0022_player_assessments.sql)–[0024](../../supabase/migrations/0024_player_strengths.sql), [0036](../../supabase/migrations/0036_player_coach_fields_secure_expand.sql)).

**UNKNOWN.** The legal entity operating Emblem, registered address, ICO registration status, DPO/representative, pilot clubs, target ages, volumes and launch dates are not established in the repository. The public privacy and terms pages still contain placeholders for date, company details, currency and NFC wording ([privacy](../../src/app/privacy/page.tsx); [terms](../../src/app/terms/page.tsx)).

## 2. Why this DPIA is required

**VERIFIED.** The processing combines multiple high-risk indicators:

1. children and potentially young children (the database accepts calculated ages 3–19);
2. photographs and videos capable of identifying children;
3. exact dates of birth and physical/sporting attributes;
4. systematic coach assessment and longitudinal development records;
5. public sharing and link-based access;
6. persistent physical NFC access tokens that may be lost, copied or shared;
7. third-party AI processing of photographs; and
8. linked datasets across orders, authentication, production, profiles, relationships and audit logs.

Repository evidence: [0036](../../supabase/migrations/0036_player_coach_fields_secure_expand.sql), [public-player-profile.ts](../../src/lib/public-player-profile.ts), [bgRemoval.ts](../../src/components/builder/emblem/bgRemoval.ts), [ai-mockup route](../../src/app/api/ai-mockup/route.ts).

**REQUIRES SPECIALIST REVIEW.** The service is likely an “information society service likely to be accessed by children”, even if adults place orders, because Player OS and the NFC experience are designed around children. The ICO says the Code covers wide-ranging for-profit online services likely to be accessed by children, not only those aimed exclusively at them. Confirm the exact service/user model and whether children use guardian credentials. [ICO introduction](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code).

## 3. Scope and processing boundaries

### In scope

- marketing site, builder and pricing quote;
- order submission, production asset upload, print generation and fulfilment metadata;
- Supabase Auth, database, RLS, RPCs and audit/operational records;
- S3 private object storage and signed delivery;
- guardian, coach, team, staff and player relationships;
- claim, activation, recovery and invitations;
- Player OS, Coach OS and Staff OS;
- moments, photos/videos, assessments, goals, strengths, season focus and presence;
- public player profiles and public moments;
- Shopify webhook/order linkage, Resend email, Google Gemini image processing, Meshy routes, Vercel hosting and AWS;
- correction, visibility, coach removal, player deletion and guardian-account deletion; and
- development, staging and production boundaries where documented.

### Out of scope or unverified

**UNKNOWN.** Physical printer/courier identities and their actual data exchange, customer-support tooling, accounting/tax systems, supplier contract terms, backup systems, observability/log retention, cookie/platform analytics configuration, incident response and staff device controls are not fully documented.

**VERIFIED.** Environment names reveal Supabase, AWS S3, Vercel/public site URL, Shopify, Resend, Gemini and Meshy dependencies; no secret values were inspected or reproduced. Relevant names include `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, AWS variables, `SHOPIFY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY` and `MESHY_API_KEY` (repository-wide environment reference inspection).

**INFERRED.** Production and staging are separate Supabase projects because repository verification material and deployment records use separate project references. **UNKNOWN:** whether either contains copied real-child data, whether developer machines hold exports, and whether retention/access controls differ.

## 4. Categories of users

| User | Typical role | Material considerations |
|---|---|---|
| Child players | Subject displayed on card/profile; may view Player OS or tap card | Vulnerability, evolving capacity, potential peer/social harm; account-use model UNKNOWN |
| Parents/guardians | Claim player, control profile visibility, upload/delete photos and moments, invite others, request deletion | “Guardian” database link is not proof of parental responsibility |
| Coaches | Create teams/players, access rosters, add assessments/strengths/focus/moments, receive updates | Power imbalance; access must end promptly on role/team change |
| Club officials | May order, coordinate teams or act as coaches/staff | Exact permissions and controller role UNKNOWN |
| Emblem staff | Approve orders, production, invites, public identity and deletion queues | Privileged access and insider risk |
| Public visitors | View enabled profile and public moments via link/tapped claimed card | No authentication; can copy, scrape or identify a child |

## 5. Data inventory and proposed retention

All retention periods below are **proposals**, not verified policy, and require legal, tax, safeguarding and operational approval. “DB” means Supabase Postgres/Auth; “S3” means private AWS object storage; “browser” means transient local state before submission.

| Data field/category | Child? | Source and purpose | Storage / access / recipients | Public status | Proposed retention and deletion |
|---|---:|---|---|---|---|
| Player name, position, secondary position, squad number | Yes | Adult order/coach/guardian; card production and profile | DB; guardians, eligible coaches, staff; selected fields public if enabled | Private by default; name/positions/number public when enabled | Active relationship + defined dormant period (propose 12 months), then delete/anonymise; player deletion cascades where configured |
| Football age group (exact date of birth and derived age removed, Gate 2 Stage A, 24 August 2026 — see the dated note above) | Yes | Coach-entered; age-group context for coaching | DB; coach-authorised RPC only | Excluded from public DTO | Active profile; delete with player. Column removal (Stage B) still pending |
| Height/height_cm, preferred foot, favourite player, football ambition | Yes | Guardian/coach; sporting profile | DB; guardians/eligible coaches | Excluded from public DTO | Review each field; active profile only; delete with player |
| Player and coach photographs, crop/background-removal state | Yes for player; coach personal data | Order/builder/OS; card/profile/production | Browser, Gemini when invoked, S3, DB keys/card-definition JSON; staff/guardian/coach according to workflow | Public player/card photo via 15-minute signed URL if sharing enabled; coach card production-only | Original and derivatives: fulfilment + short dispute window (propose 30–90 days) unless retained for active OS with explicit purpose; delete S3 keys and DB references |
| Moment title, date, note, trust/source, verification status | Yes | Guardian/coach/system; memories and achievements | DB; guardian/eligible coach; selected entries public | Default private; guardian can choose public | Active profile; per-moment deletion available; delete with player; consider age-based review |
| Moment photo/video and S3 key | Yes | Guardian upload; memory/evidence | S3 + DB; signed URLs | Only public where moment public/eligible; 15-minute signed URL | Same as moment; verify object deletion and backups |
| Assessments, skill snapshots, scores, coach summary, strengths, focus, goals | Yes | Coaches and guardians; development features | DB; guardian and eligible coaches | Excluded from public DTO | Season + defined review window (propose one following season); append-only assessment retention requires justification |
| Club, team, season, badge | Indirectly | Order/staff/coach; grouping/context | DB/static assets; authenticated users can read club/team | Team/club/season may be public with profile | Retain while team exists; sever player links on transfer; historic display snapshot policy needed |
| Guardian/coach profile ID, role, display name, relationship | Often adult | Auth/onboarding; authorisation and attribution | Supabase Auth + DB; scoped relationship visibility | Not in public DTO | Account/relationship life + necessary audit period; account deletion workflow removes or nulls references |
| Guardian/coach email and OTP/auth metadata | Adult | Sign-in, invitations, fulfilment/contact | Supabase Auth, DB snapshots, Resend; order purchaser email | Private | Account life; invitation expiry plus short audit window; statutory order records separately |
| Order data: purchaser/intended guardian emails, order reference, source, pricing, club/team text, status | Adult plus child linkage | Buyer/builder; fulfilment and finance | DB, staff, Shopify as applicable | Private | Tax/contract period determined by specialist (commonly years, not asserted here); minimise child linkage after fulfilment |
| Card definition: child name, number, team, position, photo key/crop, optional stats | Yes | Builder; print and digital card | DB/S3; staff, linked guardian/coach; portions public | Potentially public via card/profile | Active product/profile; unlink/anonymise on player deletion; production file deletion schedule required |
| Print PDFs and print-file mappings | Yes | Server render; manufacture | S3 + order JSON; production staff/processor | Private signed access | Fulfilment + reprint/dispute window; propose 90 days unless contract requires otherwise |
| Claim token, NFC UID (reserved), public player ID, enable/rotation time | Yes-linked identifier | Generated; activation/access | DB and physical card URL | Claim token physically exposed; public ID exposed when shared | Claim token until claimed/revoked; public ID until disabled/rotated; delete/unlink with player; lost-card revocation needed |
| Invite codes, invited email, creator/user, expiry/use/email status | Child-linked | Guardian/coach/staff; relationship handoff | DB, Resend/email | Secret link/code | Seven-day functional expiry is VERIFIED; propose purge/tokenise code shortly after expiry/use, retain minimal audit metadata |
| Claim attempts: IP/equivalent, attempted code, success, timestamp | Adult/child user possible | Automatic abuse prevention | DB service-role only | Private | VERIFIED no policy; retention UNKNOWN; propose 30–90 days with code hashing/redaction |
| Public-profile visibility and moment visibility audit | Yes-linked | Guardian/staff action; accountability | DB; scoped guardian/staff | Current result public/private; audit private | Keep minimal audit for defined accountability period; remove content, retain event metadata only where justified |
| Active viewers/presence scope and heartbeat | User account; child-linked context | Automatic UI presence | DB, authenticated scoped users | Private | Very short TTL required (minutes/hours); cleanup job UNKNOWN |
| Story updates/read times | Child-linked | System from relationship/content events | DB; recipient only | Private | Propose 90 days or user-cleared; delete with player/account where applicable |
| Player deletion requests: IDs, requester, email snapshot, notes, status/attestation | Child-linked/adult | Guardian/staff; rights workflow | DB; guardian's own rows and staff | Private | Statutory/accountability period after completion, with child content excluded; define schedule |
| Pending Auth deletion: user ID, email, error, attempts, notes | Adult | Failure recovery | DB service-role/staff only | Private | Delete soon after resolution plus short audit record |
| Staff account and approval/production actions | Adult; child-linked actions | Admin workflow | DB | Private | Employment/security and audit schedule required |
| Request/server logs, Vercel logs, S3 access logs, email delivery logs | May include identifiers | Operations/security | Supplier systems | Private | UNKNOWN; configure minimised retention and prevent tokens/URLs/photo payloads entering logs |

**VERIFIED.** Exact DOB exists even though the public DTO excludes it. It is protected by specific RPC authorisation and omitted from ordinary player SELECT grants ([0036](../../supabase/migrations/0036_player_coach_fields_secure_expand.sql)).

**VERIFIED.** Private media are stored as durable S3 keys; readers generate signed URLs. Public-profile URLs expire after 15 minutes ([s3-client.ts](../../src/lib/s3-client.ts); [public-player-profile.ts](../../src/lib/public-player-profile.ts)). A signed URL can nevertheless be downloaded during validity.

## 6. End-to-end data-flow map

```text
Adult/club purchaser
  -> browser builder (child/player + coach details and photos)
  -> optional Gemini image processing
  -> S3 private uploads + print PDFs
  -> order-enquiry validation and object checks
  -> atomic Supabase RPC
       -> order -> paid players -> cards/claim tokens -> card definitions
       -> print mappings/line items -> optional separate coach card
  -> staff production/approval
  -> Shopify/payment and Resend invitation paths where invoked

Physical NFC card (/os?card=<claim token>)
  -> rate-limited server lookup
  -> unclaimed: signed-in adult confirms claim -> guardian link -> card locked claimed
  -> claimed guardian: private Player OS
  -> claimed non-guardian: optional public profile if enabled, otherwise not found

Player OS / Coach OS
  -> RLS/RPC-authorised player, relationship and sporting content
  -> private S3 signed media
  -> guardian visibility choices -> optional public allowlisted profile/moments
  -> correction, unpublish, coach removal, deletion request/account deletion
```

### Individual card order

**VERIFIED.** Builder collects player/card details, uploads namespaced source assets and one print file, verifies S3 existence/type/size, then calls the atomic order RPC. One player/card/definition is created with an assigned claim token ([ProductionBuilder.tsx](../../src/components/emblem-uk/ProductionBuilder.tsx); [order validation](../../src/lib/order-enquiry-validation.ts); [0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql)).

### Team order

**VERIFIED.** Multiple paid players are independently mapped to cards, definitions and print files. A squad may add one complete production-only coach card; it is not inserted as a player or OS identity ([0047](../../supabase/migrations/0047_order_coach_cards.sql); [0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql)). Staff later resolves team/club identity rather than trusting checkout free text ([0009](../../supabase/migrations/0009_team_invites.sql)).

### Guardian claiming and activation

**VERIFIED.** A seven-character-style claim code/token is looked up server-side using service role. Attempts are rate-limited to ten per identifier per 15 minutes and logged. Claiming requires an authenticated user, inserts a guardian link and changes the card to `claimed` ([claim-code.ts](../../src/lib/claim-code.ts), [rate-limit.ts](../../src/lib/rate-limit.ts), [claim-player.ts](../../src/lib/claim-player.ts), [claim route](../../src/app/api/os/claim/route.ts)).

**REQUIRES SPECIALIST REVIEW.** Authentication proves control of an email account, not parental responsibility for the named child. The repository has no independent authority-verification evidence before the first guardian link.

### Coach access

**VERIFIED.** Access derives from `coach_team` or direct `coach_players` relationships; RLS and RPCs scope reads/writes. A guardian or the connected coach can remove a direct connection ([player-capabilities.ts](../../src/lib/player-capabilities.ts); [coach removal route](../../src/app/api/os/players/[id]/coach-connections/[coachProfileId]/route.ts); [0030](../../supabase/migrations/0030_coach_players.sql)).

**UNKNOWN.** There is no verified automatic expiry/review of team-coach assignments or club-transfer workflow.

### Photograph processing

**VERIFIED.** Browser code resizes a photo and sends it to `/api/ai-mockup`; the server sends base64 image content to Google's Generative Language API for background removal/stylisation where configured. A failure falls back to local canvas processing ([bgRemoval.ts](../../src/components/builder/emblem/bgRemoval.ts); [ai-mockup route](../../src/app/api/ai-mockup/route.ts)). Final production/profile media are stored under private S3 keys.

### Moments and achievements

**VERIFIED.** Guardians and eligible coaches can create moments under RLS; verification status and visibility are distinct. Assessments are coach-authored append-only; goals/focus/strengths have scoped authorisation ([0001](../../supabase/migrations/0001_init.sql), [0011](../../supabase/migrations/0011_moments_verification_status.sql), [0022](../../supabase/migrations/0022_player_assessments.sql)–[0024](../../supabase/migrations/0024_player_strengths.sql)).

### Optional public sharing

**VERIFIED.** New/unclaimed players default to public sharing disabled. A guardian RPC can enable/disable it; staff can enable/disable/rotate the public ID. Only allowlisted fields and moments explicitly `public` with eligible verification status are returned. Internal IDs, DOB, age, height, foot, ambitions, guardians, assessments, focus, strengths and claim token are excluded ([0039](../../supabase/migrations/0039_guardian_public_profile_control.sql); [public-player-profile.ts](../../src/lib/public-player-profile.ts)).

**UNKNOWN.** No `robots`/`noindex` protection was identified on the public profile page; search-engine behaviour must be tested and controlled.

### Lost-card deactivation

**RESOLVED — see the 29 August 2026 correction note below.** This was recorded as an unknown/high gap based on repository state that predates migration `0075_card_lifecycle_controls.sql`. Staff (any card) or a guardian (their own card) can suspend a card with reason `lost` or `stolen`; staff can revoke and issue a replacement with a fresh claim token under the same player. `resolveCardCode` — the function behind every NFC tap — checks this status before returning any data, so a suspended or revoked card stops resolving immediately, not merely at the public-profile layer ([nfc-link.ts](../../src/lib/nfc-link.ts); [card-lookup.ts](../../src/lib/card-lookup.ts); [0075](../../supabase/migrations/0075_card_lifecycle_controls.sql)).

### Consent withdrawal, correction and deletion

**VERIFIED.** Guardians can disable sharing, change moment visibility, unpublish all moments, remove a player photo, delete their own moment, update some player fields, remove direct coaches, request/cancel player deletion and delete their own guardian account. **Player deletion and S3 erasure are staff-triggered but database-enforced and reconciled, not manual staff operations** (migration 0076, see the 29 August 2026 correction note below — the runbook doc itself is corrected in the same commit); account deletion spans DB and Supabase Auth with a pending-failure queue ([0039](../../supabase/migrations/0039_guardian_public_profile_control.sql)–[0044](../../supabase/migrations/0044_player_deletion_request_contact.sql), [0076](../../supabase/migrations/0076_child_data_erasure.sql); [deletion runbook](../pilot/child-data-deletion-runbook.md)).

## 7. Controller and processor analysis — provisional

**REQUIRES SPECIALIST REVIEW.** Likely allocation:

- Emblem operating entity: controller for product, order, profile, sharing, safety and staff purposes because it determines purposes and essential means.
- Clubs/leagues: potentially independent controllers, joint controllers or customers whose coaches act under Emblem's authority, depending on contracts and who decides purposes, roster population, assessment and disclosure.
- Parent/guardian: normally data subject/authorised user, not a processor; household exemption should not be assumed for processing carried out through Emblem.
- Coaches/club officials: authorised users under the relevant controller(s), unless their organisation determines independent purposes.
- Supabase, AWS, Vercel, Resend and possibly Google/Meshy: likely processors/subprocessors for defined operations, subject to actual terms and product configuration.
- Shopify: may be processor for some merchant functions and independent controller for payment/platform purposes; confirm contract and data flows.
- Couriers/printers: role UNKNOWN.

Article 28 contracts, subprocessor lists, hosting regions, breach support, deletion/return commitments and audit rights must be documented. ICO guidance confirms controller-processor relationships require binding terms: [ICO contracts guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/when-is-a-contract-needed-and-why-is-it-important/).

**REQUIRES SPECIALIST REVIEW.** Determine restricted transfers using the current ICO three-step approach and supplier legal entities, not server-region assumptions alone. [ICO international transfers guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-guide-to-international-transfers/).

## 8. Preliminary lawful-basis analysis — for legal review

No basis below is final. Record one basis per distinct purpose in the Article 30 record and privacy information; do not switch opportunistically.

| Purpose | Provisional Article 6 basis | Key review points |
|---|---|---|
| Adult order, custom production, delivery and customer service | Contract with adult purchaser; legal obligation for required financial records | Contract with adult does not automatically justify all child-profile processing |
| Create child card/profile and retain production identity | Legitimate interests, possibly contract where strictly necessary | Complete child-weighted LIA; minimise post-fulfilment retention |
| Guardian account and requested Player OS features | Contract and/or legitimate interests | Confirm whether child directly uses service; provide age-appropriate notice |
| Claim/activation security, abuse logs, audit | Legitimate interests | Hash/redact codes/IPs, short retention, child-weighted balancing |
| Coach roster access and development records | Legitimate interests; possibly consent for optional features | Power imbalance means consent may not be freely given; define club/Emblem roles |
| Physical/sporting attributes (exact DOB removed, Gate 2 Stage A — see the dated note above) | Legitimate interests only if necessity demonstrated; consent may be considered for genuinely optional fields | Exact DOB collection/storage/derivation stopped; column removal (Stage B) still pending |
| Public player profile and public moments | Consent is likely candidate because optional and withdrawable; alternatively specialist-approved legitimate interests is difficult | Verify parental responsibility and involve capable child; withdrawal must be as easy and effective as enablement |
| AI processing/background removal | Consent for optional AI feature or narrowly assessed legitimate interests | Provide non-AI alternative; confirm Google terms, reuse/training, retention and transfers |
| Safeguarding/moderation | Legitimate interests; legal obligation only where a specific law applies | Do not label safeguarding as “legal obligation” without identifying law |
| Tax/accounting records | Legal obligation | Separate and minimise child data in retained financial records |
| Rights/deletion request audit | Legal obligation and/or legitimate interests | Retain minimal evidence, not deleted content |

**REQUIRES SPECIALIST REVIEW.** Special-category data are not expressly designed into the schema, but photographs, free-text notes and uploads may reveal health, ethnicity, religion or biometric characteristics. A photograph is not automatically biometric special-category data; it becomes so where technically processed for unique identification. Confirm whether any AI/provider processing performs face recognition or biometric templating. If special-category processing is intended, identify an Article 9 condition and DPA 2018 requirements before processing.

**REQUIRES SPECIALIST REVIEW.** If the ISS is offered directly to children and consent is relied upon, UK rules generally permit a child aged 13+ to consent, while under-13 consent must be authorised by a holder of parental responsibility and reasonable efforts made to verify that authority. Consent is not the only lawful basis. [ICO lawful-basis guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/how-do-the-lawful-bases-apply-to-children-s-personal-information/) and [DPA 2018 explanatory notes](https://www.legislation.gov.uk/ukpga/2018/12/notes/division/6/index.htm).

## 9. Children's Code assessment

| Principle | Assessment |
|---|---|
| Best interests | **PARTIAL / REQUIRES SPECIALIST REVIEW.** Guardian-centred access, private defaults and no public leaderboard support child interests, but no completed best-interests assessment or consultation exists. Commercial printing/social sharing must not override safety. |
| DPIA | **IN PROGRESS.** This is a first draft and requires consultation, actions and approval. |
| Age-appropriate application | **GAP.** Supported ages appear 3–19, but no verified age-banded design or assurance of who actually operates the account. Apply high protections to all until proportionate age design is approved. |
| Transparency | **HIGH GAP.** Public privacy/terms contain placeholders and do not fully explain OS, public profiles, exact DOB, coaches, AI, suppliers, retention or child rights. Create layered child and adult notices. |
| Detrimental use | **PARTIAL.** No ads/behavioural marketing found; assessments/rank-like scores may affect self-esteem, opportunity or coach treatment. Define prohibited uses. |
| Policies/community standards | **GAP.** Terms prohibit inappropriate content, but moderation, reporting, appeals and safeguarding response are not evidenced. |
| Privacy by default | **STRONG TECHNICAL CONTROL, operational review needed.** Public profile defaults false; moments default private; RLS is widespread; media are private signed links. |
| Data minimisation | **PARTIAL.** Public allowlist is narrow, but exact DOB, height, ambition, full name/photo and append-only assessments need necessity review. |
| Sharing/disclosure | **PARTIAL/HIGH RISK.** Guardian controls public sharing and eligible moments, but public pages expose identifiable combinations and downloadable photos. |
| Geolocation | **VERIFIED not intentionally collected in schema.** IP/equivalent identifiers in claim logs can indicate approximate location; supplier logs may do likewise. Geolocation features should remain off/absent. |
| Parental involvement | **PARTIAL.** Guardian relationships and controls exist, but first-claim authority is not independently verified; capable children's views/assent are not recorded. |
| Profiling | **REQUIRES SPECIALIST REVIEW.** No automated behavioural targeting found. Coach assessments/scores are still structured evaluation/profiling in ordinary data-protection language even if human-authored; document impacts and contestability. |
| Nudge techniques | **INFERRED low current concern.** No XP/coins/public leaderboard found. Test UI so children/parents are not nudged to publish or provide optional data. |
| Connected-device considerations | **PARTIAL.** NFC is passive, but the physical token is persistent, shareable and currently lacks a lost-card revocation workflow. Clearly communicate what a tap exposes. |
| Online rights tools | **PARTIAL.** Visibility, unpublish, photo/moment removal, coach removal, correction and deletion-request tools exist. Export/access, complaint/reporting, child-facing help and fully automated erasure do not. |

ICO age bands (0–5, 6–9, 10–12, 13–15, 16–17) are useful design guides but not substitutes for individual capacity assessment: [ICO age-appropriate application](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/3-age-appropriate-application/).

## 10. Child-specific risk register

| ID / risk | Users and harm | Cause/threat | Existing verified controls | L / S / overall | Required mitigation / owner | Residual |
|---|---|---|---|---|---|---|
| R1 Unauthorised child photograph | Child; loss of dignity, safeguarding risk, misuse | Purchaser/uploader lacks authority | Terms require permission; guardian-scoped OS writes; private S3 keys | M / Critical / High | Verify authority; child assent where appropriate; reporting/takedown; moderation; supplier review. Owner: DPO + Safeguarding | Medium |
| R2 Lost/stolen NFC card | Child; stranger discovers identity/profile | (Resolved by migration 0075, Gate 2 pilot controls — see the 29 August 2026 correction note above.) | `suspend_card`/`revoke_card`/`create_replacement_card`, enforced in `resolveCardCode` before any data is read, full audit trail | Was H / High / **High** | Guardian self-service *reporting* (today staff-mediated) remains a product decision, not a missing mechanism. Owner: Product | Low |
| R3 Guessing/sharing claim codes | Child; incorrect claim or disclosure | Human-readable codes and pre-auth lookup | 10 attempts/15 min/IP-equivalent; attempt log; unique tokens; approval gate | M / High / High | Increase entropy; never log raw attempted code; adaptive/global throttling; alerting; one-time activation token; security testing. Owner: Security | Low–Medium |
| R4 Incorrect guardian claim | Child/family; unauthorised control and disclosure | Email authentication is not parental-responsibility verification | Claimed card locks; guardian relation controls later actions | M / Critical / **High** | Define evidence/club-mediated verification, dispute/recovery, co-guardian notification, emergency freeze. Owner: Safeguarding + DPO | Medium |
| R5 Excessive coach access | Child; privacy invasion, unfair evaluation | Team-wide access and rich fields including DOB | RLS; coach relationship checks; exact DOB special RPC | M / High / High | Role/field matrix, least privilege, purpose-specific views, access logging/review, remove DOB unless essential. Owner: Product + Club Welfare | Medium |
| R6 Former coach retains access | Child; ongoing unauthorised access | No automatic assignment expiry/season review | Direct connection can be removed by guardian/self | H / High / **High** | Season expiry, club offboarding, periodic guardian review, revoke all coach sessions/links on removal. Owner: Club admin + Product | Low–Medium |
| R7 Private Player OS exposed through public profile | Child; broad disclosure | Service-role public query bypasses RLS; implementation error | Explicit DTO allowlist, visibility gate, eligible public moments only, 15-min URLs | M / Critical / High | Independent security tests; deny-by-default regression tests; cache headers; monitor route changes; child-friendly preview. Owner: Security | Low–Medium |
| R8 Search-engine indexing | Child; durable discoverability | Public stable URLs, identifiable content | Random public ID; guardian disable/rotation | M / High / High | `noindex,nofollow`, robots controls, cache removal/runbook, avoid sitemaps, search-engine de-index request process. Owner: Web + DPO | Low |
| R9 Identification by name/club/team/age/location | Child; stalking, unwanted contact | Combined public attributes and image | Public DTO excludes DOB/age/height; visibility opt-in | H / High / **High** | Pseudonym/first-name default; omit team/season/squad number; granular preview/choices; forbid location; safeguarding review. Owner: Product | Medium |
| R10 Scraping/downloading photos | Child; copying, facial misuse | Public signed URL can be downloaded; stable page | 15-minute URL; private S3 bucket | H / High / **High** | Default no public photo; transformed low-resolution/watermarked derivative; CSP/hotlink controls; takedown monitoring; warn that technical prevention is limited. Owner: Security + Product | Medium–High |
| R11 Bullying/comparison/public ranking | Children; distress, exclusion, lost opportunity | Stats, scores, assessments, strengths, moments | Assessments excluded publicly; no public leaderboard/XP found | M / High / High | Prohibit ranking; age-appropriate presentation; contest/correct controls; safeguarding reporting; test with children. Owner: Product + Safeguarding | Low–Medium |
| R12 Inappropriate uploads | Children/public/staff; harmful content or unlawful imagery | Free text/photo/video; no moderation workflow evidenced | Terms prohibit inappropriate content; coach verification states | M / Critical / High | Upload rules, scanning/moderation, report/block/escalation, CSAM response advice, staff training, minimal access. Owner: Safeguarding | Medium |
| R13 Staff misuse | Children/families; broad unauthorised access | Service-role/staff production capability | `staff_accounts`, `requireStaff`, approval attribution, RLS/no client access | M / Critical / High | MFA, least privilege, joiner/mover/leaver, audit every sensitive view/action, periodic review, dual control for export/public override. Owner: Security | Low–Medium |
| R14 Compromised guardian/coach account | Child; disclosure or harmful edits | Email OTP/session compromise | Server `getUser`; recent OTP reauth for account deletion; scoped RLS | M / Critical / High | MFA/passkeys for staff/coaches, session/device controls, security notifications, recovery/freeze, anomaly detection. Owner: Security | Medium |
| R15 Insecure third party/transfer | Children/adults; breach, reuse, overseas access | Cloud/AI/email/commerce suppliers | Server-held keys; private S3; no secret values client-side identified | M / Critical / High | Article 28/transfer review, UK regions where suitable, AI no-training/retention confirmation, supplier register, incident terms. Owner: DPO + Procurement | Medium |
| R16 Deletion failure/orphaned media | Child; data persists after valid request | (Substantially resolved by migration 0076 — see the 29 August 2026 correction note above. One real residual: no pre-delete backup/dispute window in the automated path.) | `confirm_player_deletion_erasure`/S3 delete-per-object/`finalize_player_deletion_erasure`, per-object retry tracking, per-supplier status, 51 tests passing | Was H / High / High | Product decision: reintroduce a short-lived pre-delete snapshot, or accept none exists. Owner: Product + Operations | Low |
| R17 Withdrawn consent not propagated | Child; continued public/AI processing | Copies, caches, supplier retention, printed card | Guardian disable/unpublish and delete tools | M / High / High | Map consent dependencies; supplier deletion; cache purge; explain irreversible physical copies/downloads; record withdrawal. Owner: DPO + Product | Medium |
| R18 Club transfer | Child; old coach/team access and wrong public identity | `team_id`/coach relations persist; historic snapshots | Direct coach removal exists | H / High / **High** | Atomic transfer workflow: end old access, review content visibility, notify guardian, preserve only justified history. Owner: Club admin + Product | Low–Medium |
| R19 Full DOB disclosure | Child; identity theft/safeguarding | (Gate 2 Stage A, 24 August 2026: exact DOB is no longer collected, stored, read or write-accessible by any application role — see the dated note above.) | Every value erased; both read RPCs dropped; write path no longer accepts a date of birth | Was M / Critical / High | Column drop (Stage B), production release + independent verification of Stage A, backup-retention exposure still open. Owner: DPO + Product | Lower, not yet closed |
| R20 Excessive retention | All; increased breach and future-use risk | No comprehensive schedules/jobs | Cascades and some deletion tools; invite expiry | H / High / High | Approved schedule per inventory, automated expiry, backup/log coverage, annual review. Owner: DPO + Engineering | Low–Medium |
| R21 Real child data in staging/dev | Child; weaker environment exposure | Copies, screenshots, local exports | Separate project references inferred | M / Critical / High | Written prohibition; synthetic data; masked refresh only; separate keys/access; scanning and deletion attestations. Owner: Security | Low |
| R22 AI changes/misrepresents child photo | Child; dignity, bias, stereotyping | Generative model creates edited/stylised image | User chooses feature; fallback exists | M / High / High | Non-AI default; clear notice/preview/approval; prohibit sensitive inference; quality/bias tests; delete provider inputs/outputs. Owner: Product + DPO | Medium |
| R23 Claim-attempt log becomes credential dataset | Children/users; token replay and location inference | Raw code attempt + IP stored | Service-role-only table | M / High / High | Hash/tokenise attempts, never retain valid codes, short TTL, restricted incident access. Owner: Security | Low |
| R24 Public physical card persists after withdrawal/deletion | Child; offline identity/photo remains in circulation | Printed card cannot be remotely erased | Digital profile disable/delete breaks online resolution | H / Medium / High | Explain physical limitation, replacement/destruction process, minimal print content, safeguarding recall plan. Owner: Operations | Medium |

Where a high residual risk remains after feasible mitigation, UK GDPR Article 36 prior consultation may be required before processing. **REQUIRES SPECIALIST REVIEW.** Do not proceed on the assumption that accepting a risk internally is sufficient.

## 11. Consultation required

Before pilot sign-off, conduct and document proportionate consultation with:

- parents/guardians, including non-technical and separated/custody households;
- children in relevant ICO age bands, with accessible methods and no pressure;
- coaches and club officials;
- Club Welfare Officers;
- an independent safeguarding specialist; and
- a UK data-protection specialist/DPO or solicitor.

Consultation should test: comprehension of privacy notices and NFC behaviour; expectations about coach access; comfort with exact DOB/photos; public-profile field choices; visibility/withdrawal; bullying/comparison impacts; lost cards; account sharing; deletion; AI photo processing; and whether children can find help. Record dissent and how design changed. ICO design guidance recommends bringing children's views into design and meaningful parent-child conversations: [ICO design guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/designing-products-that-protect-privacy/childrens-code-design-guidance/).

## 12. Gaps and recommended actions

### Required before the pilot

1. **REQUIRES SPECIALIST REVIEW:** identify controller(s), legal entity, DPO/privacy contact, Article 30 purposes, lawful bases, LIAs and any Article 9 condition.
2. Complete best-interests assessment and consultation; approve this DPIA with action owners.
3. Replace placeholder privacy/terms with layered adult/child notices covering OS, NFC, exact DOB, coaches, public sharing, AI, suppliers, retention and rights.
4. Implement parental-responsibility/authority verification and incorrect-claim dispute/freeze.
5. ~~Implement lost/stolen-card token revocation/replacement distinct from public-ID rotation.~~ **Resolved — migration 0075, see the 29 August 2026 correction note.**
6. Add `noindex` and test cache/search behaviour for all public child profiles; reduce default public fields/photos.
7. Approve field-by-field minimisation; remove or tightly justify height, ambitions and append-only evaluation data. Exact DOB itself was actioned in Gate 2 Stage A (24 August 2026, see the dated note above) — collection, storage and read/write access are stopped; column removal (Stage B) and independent verification of Stage A in production remain outstanding.
8. Establish upload moderation/safeguarding/reporting and staff escalation.
9. Execute supplier due diligence, Article 28 terms, transfer assessments and AI input/output retention/training commitments.
10. Approve retention schedule and automate high-risk expiry: claim logs, presence, invites, media/prints, public caches, logs and deletion backups.
11. Prohibit real child data in development/staging; implement synthetic/masked test data and access reviews.
12. Test RLS/RPC/public DTO and staff permissions independently; enable MFA/strong staff access and sensitive-action audit.
13. ~~Convert manual player/S3 deletion into a verifiable workflow or demonstrate operational capacity, reconciliation and backup expiry.~~ **Substantially resolved — migration 0076, see the 29 August 2026 correction note.** One residual product decision remains: no pre-delete backup/dispute window exists in the automated path.

### Required during a controlled pilot

- limit clubs, children, staff and coaches; maintain named welfare contacts;
- daily deletion/auth-failure queue review as the runbook proposes;
- weekly coach-access and public-profile review;
- record claims, disputes, lost cards, takedowns, safeguarding incidents and deletion completion without unnecessary child content;
- sample child/guardian understanding and usability;
- monitor supplier/log exposure and public indexing;
- run deletion, lost-card and compromised-account exercises; and
- pause processing on material incidents or unexpected high residual risk.

### Longer-term improvements

- granular sharing controls and child-facing preview/assent;
- data export/access dashboard and privacy concern/report tools;
- season-based coach access expiry and club-transfer orchestration;
- privacy-preserving public aliases and low-resolution derivatives;
- automated retention/deletion across DB, S3, Auth, caches and suppliers;
- formal security programme, penetration testing and incident/breach playbooks;
- processor/subprocessor change monitoring; and
- periodic DPIA/best-interests reassessment using real pilot evidence.

## 13. Assumptions and unanswered questions

1. **UNKNOWN:** Who is the legal controller and who is accountable for DPIA approval?
2. **UNKNOWN:** What ages will participate, and do children directly operate Player OS or share adult accounts?
3. **UNKNOWN:** What proves parental responsibility and resolves custody/disputes?
4. **UNKNOWN:** Are clubs independent/joint controllers, and what contracts govern coaches?
5. **UNKNOWN:** What are production hosting regions, supplier legal entities, subprocessors and transfer safeguards?
6. **UNKNOWN:** Do Google Gemini or Meshy retain inputs/outputs or use them for model improvement under the chosen terms?
7. **UNKNOWN:** Which photos/products actually invoke AI, and is a clear non-AI choice offered before upload?
8. **UNKNOWN:** Who prints and ships cards, what data they receive, and how they delete it?
9. **UNKNOWN:** Are public profiles indexed today, and what cache/CDN headers apply?
10. **RESOLVED — migration 0075 (see 29 August 2026 correction note):** staff can suspend/revoke/replace on report; guardians can self-service unsuspend their own card. What remains unknown is purely operational (who staffs this, what SLA), not technical.
11. **UNKNOWN:** What retention applies to DB rows, S3 objects, Auth, Vercel/Supabase/AWS logs, email logs, backups and exports?
12. **UNKNOWN:** Are production data ever copied to staging, development, support tickets or staff devices?
13. **UNKNOWN:** Are analytics, error monitoring, cookies or third-party scripts enabled outside repository code/config?
14. **UNKNOWN:** What age/identity/safeguarding training and background checks apply to staff/coaches?
15. **UNKNOWN:** Are public-profile views, sensitive staff reads and exact-DOB reads auditable?
16. **UNKNOWN:** What is the lawful need for exact DOB, height and structured assessment history?
17. **UNKNOWN:** How will a child correct, contest or object to a coach assessment?
18. **UNKNOWN:** Are backup/DR copies included in erasure and retention processes?
19. **UNKNOWN:** Is the passive NFC token writable/locked, cloneable, or replaceable in the physical production process?
20. **UNKNOWN:** What is the pilot stop criterion and incident escalation chain?

## Gate 3 addendum — direct Shopify checkout, server-verified payment — 26 August 2026

**Status: implementation evidence only; unreleased. This work is a separate,
narrowly-scoped draft PR, based on `main` plus the still-unmerged Adult
Permission fix (PR #43) — deliberately not stacked on, and not merging,
PR #44's guardian card-sharing work. Nothing below is a statement that
payment is safe to launch, and this note does not change the DPIA's
standing recommendation in section 14 below.**

**VERIFIED IN LOCAL SOURCE.** This replaces the previous manual "we will
email you a payment link" journey with a direct Shopify checkout for the
single-child pricing tier, gated on server-verified payment before staff
can move an order into production:

- **No new third-party processor.** Shopify was already a disclosed
  supplier in this DPIA's data inventory and controller/processor
  analysis (§7) before this work — Gate 3 activates an existing,
  already-partially-wired integration (a cart-permalink handoff,
  `src/lib/shopify.ts`) for the ordinary builder order, the same
  mechanism already live for Squad Invite orders. No Shopify Admin API
  token exists anywhere in this repository's environment — confirmed by
  direct search before any code was written — so this remains a
  browser-redirect handoff to Shopify's own hosted checkout, never a
  server-to-server Shopify API integration holding a broader credential.
- **Emblem never receives card/payment details.** The customer enters
  payment and delivery information entirely on Shopify's own hosted
  checkout page; Emblem's server only ever receives Shopify's own
  signature-verified webhook confirming the outcome (paid, cancelled,
  refunded) — never card numbers, never a CVV, never a billing address
  beyond what Shopify's webhook payload itself includes for
  reconciliation.
- **What Emblem stores** (migration 0080): `shopify_order_id` (Shopify's
  own order id, for reconciliation), `paid_at`, `paid_amount_pence`,
  `paid_currency` (the verified card subtotal only — never delivery/tax,
  which Shopify computes and Emblem does not set or store), and an
  append-only `payment_state_events` audit trail (status transitions and
  a Shopify event id only — never payment-card data, never an amount
  beyond what already exists on the order). A second table,
  `shopify_webhook_events`, exists purely for exactly-once webhook
  processing (one row per Shopify webhook delivery id) and holds no
  personal data at all.
- **No child data reaches Shopify.** The cart-permalink handoff carries
  only a product variant, a print quantity, and Emblem's own internal
  order reference — never the child's name, photograph, club/team
  branding, NFC claim token, or any other player/guardian detail. This
  was true of the pre-Gate-3 handoff already in place and is unchanged
  by this work.
- **Payment is never treated as consent for anything else.** In
  particular, this work explicitly does not and cannot grant, infer, or
  substitute for the separate guardian card-sharing consent PR #44
  implements — see that PR's own eligibility RPC, which Gate 3 does not
  modify, weaken, or bypass. A minimal, documented integration point for
  PR #44 (requiring `payment_status = 'paid'` in addition to its own
  existing eligibility check) is recorded in
  `docs/gate3-pr44-integration.md`, added by this same commit, for
  implementation once both branches are ready to be sequenced — no code
  in PR #44 itself is touched by this work.
- **Verified operational limit for this task:** no live Shopify
  development/test store, Admin API credential, or test-mode/Bogus
  Gateway configuration exists anywhere in this repository's accessible
  environment (confirmed directly: only a production-scoped webhook
  secret and Squad-Invite-specific product variant ids are configured at
  all, and neither a store domain nor an Admin API token exists in any
  environment). All verification in this work package is therefore unit
  and role-impersonation-level (migration 0080's functions were verified
  directly against the disposable Supabase project via real Postgres
  role/RLS impersonation, and every new route is covered by mocked
  contract tests) — a genuine end-to-end test payment against a live
  Shopify test store has not been performed and could not be performed
  in this environment. This is recorded here as an open verification gap
  requiring a real Shopify development store before this work is relied
  upon, not a claim that end-to-end payment has been proven safe.
- **Multi-player/whole-team and Squad Invite orders are unaffected.**
  Gate 3's checkout route and payment gate apply only to the single-child
  pricing tier, which is the only tier with a verified Shopify product/
  variant/price mapping — see `gate3CheckoutSupportsTier`'s own comment
  in `src/lib/shopify.ts`. Multi/squad-tier orders keep their pre-Gate-3
  behaviour (authority-only gate, no payment requirement) unchanged until
  their own variant mapping is separately resolved and reviewed.

**UNRESOLVED — REQUIRES SPECIALIST/FOUNDER REVIEW:** whether Shopify's
own checkout, order, and refund records (which this integration reads
from, via webhook, but does not control the retention of) are covered by
an existing Shopify data-processing agreement/subprocessor review, and
what Shopify's own retention period is for an order containing a child's
name printed on record (the card design's team/kit text, which the
webhook's own payload may include as line-item properties depending on
what the customer entered at Shopify's checkout) — this was not
independently reviewed as part of this task and remains open.

## 14. Sign-off

### Decision

- [ ] Approved to proceed without further action
- [ ] Approved only subject to the actions below
- [ ] Paused pending mitigation/specialist advice
- [ ] Processing must not begin/continue because high residual risk remains

**Draft recommendation:** **REQUIRES SPECIALIST REVIEW — paused pending completion of section 12 “Required before the pilot”.**

### Risk acceptance

| Risk IDs accepted | Rationale and evidence | Acceptance expiry | Accountable approver |
|---|---|---|---|
| UNKNOWN |  |  |  |

Risk acceptance must not be used to bypass mandatory legal obligations or ICO prior consultation where required.

### Action owners

| Action | Owner | Due date | Evidence of completion |
|---|---|---|---|
| Assign controller/DPIA owner and specialist reviewer | Blake (interim, self-assigned — see independence note below) | 2026-08-17 | This entry |
| Complete before-pilot actions in section 12 | UNKNOWN | Before pilot |  |
| Conduct child/parent/coach/welfare consultation | UNKNOWN | Before final sign-off |  |
| Verify supplier contracts/transfers | UNKNOWN | Before live processing |  |
| Security and safeguarding acceptance | UNKNOWN | Before live processing |  |

### Review date and approval roles

**Next review date:** UNKNOWN — set before pilot and no later than three months after pilot begins.

**Required approval roles:** accountable controller executive; DPO/UK data-protection specialist; safeguarding lead; security lead; product owner; operations lead; relevant Club Welfare Officer(s).

**Independence note (added 2026-08-17):** Blake has provisionally named himself to the DPO/UK data-protection specialist, safeguarding lead and security lead roles below, as an interim placeholder so these roles are no longer blank — not as a substitute for genuinely independent review. This DPIA itself explains why that independence matters (§7, §11, §13 item 1): the person accountable for the product deciding whether the product is safe is exactly the conflict of interest a DPO/safeguarding/security function exists to check. Section 12's required-before-pilot actions remain open regardless of who is named here, and the draft recommendation below is unchanged by this update — assigning an owner to a gap is not the same as closing it.

| Role | Name | Decision | Date/signature |
|---|---|---|---|
| Controller accountable executive |  |  |  |
| DPO / UK data-protection specialist | Blake (interim, self-assigned) | Not yet decided — role filled, review not yet conducted | 2026-08-17 |
| Safeguarding lead | Blake (interim, self-assigned) | Not yet decided — role filled, review not yet conducted | 2026-08-17 |
| Security lead | Blake (interim, self-assigned) | Not yet decided — role filled, review not yet conducted | 2026-08-17 |
| Product owner |  |  |  |
| Operations lead |  |  |  |

## Primary regulatory sources consulted

- [ICO: Children's Code introduction](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code)
- [ICO: Age appropriate design code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/)
- [ICO: Best interests assessment guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/how-to-use-our-guidance-for-standard-one-best-interests-of-the-child/best-interests-assessment/)
- [ICO: DPIAs and vulnerable individuals](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/)
- [ICO: Children and lawful bases](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/how-do-the-lawful-bases-apply-to-children-s-personal-information/)
- [ICO: International transfers](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-guide-to-international-transfers/)
- [Data Protection Act 2018 explanatory notes, including age 13 and section 123](https://www.legislation.gov.uk/ukpga/2018/12/notes/division/6/index.htm)
