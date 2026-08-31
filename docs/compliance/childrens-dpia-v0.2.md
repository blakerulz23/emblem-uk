# Emblem Children's Data Protection Impact Assessment

**Version:** 0.2 (Gate 2 Work Package 1 reconciliation)

**Date:** 24 August 2026 (originally drafted 12 August 2026)

**Status:** Controlled draft. **`NOT YET FORMALLY APPROVED`.** Pending independent safeguarding and UK data-protection specialist review, the consultation described in §11, and completion of the engineering/supplier gaps recorded in this reconciliation.

**Data controller:** Lauda Cartoons Ltd, trading as Emblem.

**Interim Privacy Lead:** Blake Ugo-Ogbonna.

**Independent Safeguarding Lead:** not yet named — see the [founder decision register](./founder-decision-register-v1.md), item G3. This remains a stop condition for real-child use.

**ICO registration:** `PAID — REFERENCE/CERTIFICATE PENDING`. See [ico-registration-evidence-v1.md](./ico-registration-evidence-v1.md). Registration is a statutory notification, not an approval — do not cite it as evidence of compliance.

**Review trigger:** Before any real-child pilot use; before any material change to public sharing, NFC, AI/photo processing, Coach OS permissions, suppliers, or age range; and specifically before the items flagged `NOT YET IMPLEMENTED` in this reconciliation are closed.

---

## Reconciliation note — 24 August 2026 (Gate 2 Work Package 1)

**This section supersedes nothing below it factually — it corrects, sharpens, and cross-references it against direct code and production-schema evidence gathered this pass, working from a clean isolated worktree at `origin/main` commit `cf866a66bd2e7930541ec468ffac397cc07c9135`, not the project's dirty local working tree.** Everything below this note (§1 onward) is the original 12–18 August draft, left materially intact because most of it remains accurate; where this reconciliation found drift, that is recorded here and cross-referenced, not silently edited into the original prose.

### Pilot scope, now founder-confirmed

UK-only. 2–3 manually approved clubs, one team per club initially, no more than 30 real players, ages U8–U16, 8–12 weeks. This directly answers several of the original draft's §13 open questions (Q2.1, Q2.2) and the questionnaire's D04.

### The 23 founder decisions

Every decision Blake has made — from removing exact date of birth, through public-profile field limits, authority requirements, lost-card lifecycle, retention periods, coach access, safeguarding, and supplier minimisation — is recorded with its implementation status, evidence, residual risk and required follow-up in the **[founder decision register](./founder-decision-register-v1.md)**, cross-referenced into the **[controls-and-tests matrix](./gate2-controls-tests-matrix-v1.md)** for full technical detail. This DPIA does not duplicate those tables; it relies on them as its evidence base from this date forward.

### The two most severe findings this pass surfaced

1. **Background removal (founder decision 11, required to stay unchanged) is not a separate, offline, or non-AI process — it is a call to Google's Gemini generative-image API, sending the full uploaded child photograph, with no retention/training/subprocessor evidence found anywhere.** This is in direct, currently-live tension with founder decision 10 ("generative AI must not receive real children's data during the pilot"), because the Squad Invite pilot feature is already live in production. See the founder decision register's D10–D12 entries. **This DPIA does not resolve that tension — it surfaces it for Blake's explicit decision, per decision 12's own required supplier assessment, before treating background removal as pilot-safe for real children.**
2. **The ordinary (non-Squad-Invite) direct/team builder implements essentially none of founder decision 13's nine authority requirements** — no age confirmation, no parental-responsibility confirmation, no separated photograph/manufacture/profile agreements (the review step has zero consent checkboxes of any kind, not even a bundled one), no non-parent-purchaser guardian-approval gate, no dispute-freeze mechanism, and no consent-version/timestamp record. Only generic staff payment/production review exists. Squad Invite, by contrast, already implements strong, specific authority machinery. **If real pilot orders are expected to flow through the ordinary builder rather than Squad Invite exclusively, this is a before-real-use blocker, not a documentation note.**

A third significant, lower-severity finding: the public-profile data-transfer-object currently returns the child's full name, photograph, card artwork, team name and club name/badge — none of which founder decision 5 permits on a public profile. Founder decisions 3 (`noindex`) and 2 (guardian opt-in default-off) **are** correctly implemented. See the founder decision register's D4/D5.

### What this reconciliation changes about the original draft's own findings

- §6 "Lost-card deactivation" (below) is unchanged and re-confirmed: still a genuine, unclosed gap, now formalised as founder decision 15, still with zero implementation.
- §9's "Transparency: HIGH GAP" and "Data minimisation: PARTIAL" ratings are, if anything, understated by the two severe findings above — treat those Children's Code ratings as a floor, not a ceiling, pending the new findings' resolution.
- §10's risk register gains two new entries, R25 and R26, appended at the end of the existing table rather than renumbering it, to preserve every existing risk ID's meaning across documents that already cite them (including the founder decision register and controls-and-tests matrix):

| ID / risk | Users and harm | Cause/threat | Existing verified controls | L / S / overall | Required mitigation / owner | Residual |
|---|---|---|---|---|---|---|
| R25 Real child photographs sent to third-party generative AI by default | Child; dignity, unknown retention/training exposure, unassessed international transfer | Background removal is implemented as a Gemini API call, not a separate process; no supplier evidence gathered | None beyond standard TLS transport and server-side-only API key handling | H / High / **High** | Complete founder decision 12's six-point supplier assessment, or route real (non-synthetic) pilot photos through a genuinely non-AI path until that assessment is complete. Owner: Privacy Lead + DPO review | Unresolved — do not treat as low until closed |
| R26 Ordinary builder orders proceed with no authority/consent verification | Child/family; a purchaser with no real authority can complete a full order with no checks at all | No age, parental-responsibility, or separated-consent capture exists on this path; only Squad Invite has this machinery | Generic staff payment/production review only (not an authority check) | H / High / **High** | Either restrict real pilot orders to the Squad Invite flow exclusively as an explicit scope decision, or build the same authority machinery Squad Invite already has onto the ordinary builder before real use. Owner: Product + Privacy Lead | Unresolved — do not treat as low until closed |

### Marketing-claim verdicts, updated

Carried from the prior Gate 2 pass and **sharpened, not softened**, by this pass's findings:

| Claim | Verdict | What changed this pass |
|---|---|---|
| "Private" | PARTIALLY SUPPORTED | The public-profile field-exposure finding (D5) is a new, concrete reason the *unqualified* claim overstates reality for any guardian who opts into sharing |
| "Secure" | PARTIALLY SUPPORTED | Unchanged in substance; the still-open lost-card revocation gap remains the clearest reason not to state this without qualification |
| "Guardian controlled" | SUPPORTED, with a scope caveat | Unchanged — accurate for the public-sharing toggle specifically, not for coach-owned fields or (as of this pass) for the ordinary builder's near-total lack of any authority gate at all |
| "Parents only see their own child's details" | SUPPORTED for ongoing OS access; CANNOT PROVE at first claim | Unchanged; the ordinary-builder authority gap (R26) is a new, distinct reason to be cautious about *how* a card enters the system in the first place, separate from the original finding about claim-time authority |

**Recommended interim wording, unchanged from the prior pass and reinforced by this one:** qualify "Private" and "Secure" as describing the default, technical state rather than an unconditional guarantee; add a visible caveat near "guardian controlled" claims until the authority-verification and public-profile-field gaps above are closed.

### Careful-wording confirmations for this revision

Per this pass's explicit instructions: this document does not state Emblem is ICO approved, ICO certified, or fully compliant; does not present any founder decision as an implemented control where the evidence says otherwise (see the register's explicit `NOT YET IMPLEMENTED` markings); does not use consent as a blanket lawful basis (see §8's original per-purpose table, still the operative analysis); separates guardian permissions (an access-control fact, confirmed in code via RLS) from the organisation's lawful basis for processing (a legal question, marked for specialist review throughout); and states plainly that this DPIA is a controlled draft pending technical verification, consultation, and independent approval — not a compliance certificate.

---

*(The remainder of this document is the original 12–18 August 2026 draft, preserved intact except where the reconciliation note above records a specific update. Section numbers, risk IDs, and cross-references are unchanged so that other documents citing them — the founder decision register, the controls-and-tests matrix, the retention schedule, and the supplier register — remain accurate.)*

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
accepted, not that every marker has since been resolved. **This 18 August approval was scoped to launching the controlled pilot feature; it is not, and has never been, formal DPIA sign-off — see the "Sign-off" section (§14) below and the [independent-review checklist](./independent-review-checklist-v1.md), which remains the operative document for that separate step.**

## Evidence labels and risk method

- **VERIFIED** — directly supported by repository evidence cited in this document.
- **INFERRED** — reasonable conclusion from the available evidence, but not confirmed operationally.
- **UNKNOWN** — requires confirmation from Blake or another accountable owner.
- **REQUIRES SPECIALIST REVIEW** — legal, safeguarding or security judgement.

Risk ratings use likelihood and severity of harm to people, not corporate impact: Low (1), Medium (2), High (3), Critical (4). Overall risk is expressed qualitatively after considering both. "Residual" assumes the stated mitigation is implemented and evidenced.

## Executive decision summary

**VERIFIED — DPIA required.** Emblem intentionally processes children's identity, photographs, football age group, sporting development information, relationships and public-sharing choices across an online service and a passive NFC product. Children are vulnerable data subjects; the service includes public disclosure, coach assessment, persistent physical identifiers and third-party photo processing. ICO guidance says children are vulnerable for DPIA purposes and a DPIA is legally required where processing is likely to be high risk. The Children's Code also treats a DPIA and child best-interests assessment as foundational for in-scope services. See [ICO DPIA guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/) and [ICO Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/).

**Exact date of birth**: the founder has since decided (24 August 2026) to remove exact date of birth and retain only football age group — see the founder decision register's decision 1 and the original §12 recommendation this confirms. **Engineering to implement this removal has not yet happened** — the schema, RPCs and single "Age" display tile described below remain live as of this reconciliation.

**REQUIRES SPECIALIST REVIEW — provisional decision: do not begin or expand a real-child pilot until the "required before pilot" controls in section 12 are closed**, now superseded in operational detail by the founder decision register and controls-and-tests matrix, but the underlying conclusion is unchanged and, per this reconciliation's two severe findings, reinforced.

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

**Now named, where the original draft marked this UNKNOWN**: the legal entity is Lauda Cartoons Ltd, trading as Emblem (see this reconciliation's header). ICO registration status is `PAID — REFERENCE/CERTIFICATE PENDING`. Pilot clubs, ages and duration are confirmed in the reconciliation above. **Still UNKNOWN**: registered address, and whether the public privacy/terms pages have been updated to name the controller explicitly (not independently re-verified this pass).

## 2. Why this DPIA is required

**VERIFIED.** The processing combines multiple high-risk indicators:

1. children and potentially young children (the database accepts calculated ages 3–19; the pilot itself is scoped to U8–U16);
2. photographs and videos capable of identifying children;
3. exact dates of birth (pending removal per founder decision 1) and physical/sporting attributes;
4. systematic coach assessment and longitudinal development records;
5. public sharing and link-based access;
6. persistent physical NFC access tokens that may be lost, copied or shared;
7. third-party AI processing of photographs — **now confirmed, per this reconciliation, to be the default path for background removal, not an optional extra**; and
8. linked datasets across orders, authentication, production, profiles, relationships and audit logs.

Repository evidence: [0036](../../supabase/migrations/0036_player_coach_fields_secure_expand.sql), [public-player-profile.ts](../../src/lib/public-player-profile.ts), [bgRemoval.ts](../../src/components/builder/emblem/bgRemoval.ts), [ai-mockup route](../../src/app/api/ai-mockup/route.ts).

**REQUIRES SPECIALIST REVIEW.** The service is likely an "information society service likely to be accessed by children", even if adults place orders, because Player OS and the NFC experience are designed around children. The ICO says the Code covers wide-ranging for-profit online services likely to be accessed by children, not only those aimed exclusively at them. Confirm the exact service/user model and whether children use guardian credentials. [ICO introduction](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code).

## 3–13. Scope, users, data inventory, flow map, controller analysis, lawful basis, Children's Code assessment, risk register, consultation, gaps

**These sections are unchanged from v0.1 and remain the operative record**, with the following explicit updates from this reconciliation, each cross-referenced rather than duplicated:

- **§5 Data inventory**: the field-level corrections found this pass (exact-DOB access model precision, `football_age_group`'s actual product usage, the public-profile DTO's real field set, S3 architecture clarification) are recorded in the [founder decision register](./founder-decision-register-v1.md) and the prior Gate 2 pass's field-level inventory. Treat that register as the current, more precise version of any field this reconciliation touched; §5's original table remains accurate for everything it does not.
- **§6 End-to-end data-flow map**: unchanged and re-confirmed for the core order/claim/OS/public-sharing flow. The "Lost-card deactivation" finding is unchanged (still a confirmed gap, now founder decision 15). The AI-processing description should now be read together with this reconciliation's finding that background removal specifically is a Gemini call, not a separate mechanism.
- **§8 Lawful-basis table**: remains the operative per-purpose analysis. This reconciliation reaffirms, per this pass's explicit instructions, that consent is not used as a blanket basis here — each purpose retains its own provisional basis and review points, and the exact-DOB row now additionally notes founder decision 1 (remove it).
- **§9 Children's Code assessment**: ratings stand; "Transparency" and "Data minimisation" should be read as reinforced (not improved) by this reconciliation's findings, per the reconciliation note above.
- **§10 Risk register**: R1–R24 stand as originally rated; R25 and R26 are appended above in the reconciliation note.
- **§11 Consultation required**: unchanged; founder decision 23 confirms the specific composition (2–3 parents/guardians, 1 coach, 1 Club Welfare Officer/safeguarding professional, a small number of U8–U16 children with guardian involvement).
- **§12 Gaps and recommended actions**: superseded in operational detail by the founder decision register and controls-and-tests matrix, which should now be used as the working gap-tracking documents; §12's original text is left below as the historical record of what those newer documents grew from.

*(The full original §3 through §13 text, unedited, follows below for completeness and citation stability.)*

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

**UNKNOWN.** Physical printer/courier identities and their actual data exchange, customer-support tooling, accounting/tax systems, supplier contract terms, backup systems, observability/log retention, cookie/platform analytics configuration, incident response and staff device controls are not fully documented — see the [supplier register](./supplier-register-v1.md) for the current state of each.

**VERIFIED.** Environment names reveal Supabase, AWS S3, Vercel/public site URL, Shopify, Resend, Gemini and Meshy dependencies; no secret values were inspected or reproduced. Relevant names include `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, AWS variables, `SHOPIFY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY` and `MESHY_API_KEY` (repository-wide environment reference inspection).

**INFERRED.** Production and staging are separate Supabase projects because repository verification material and deployment records use separate project references. **UNKNOWN:** whether either contains copied real-child data, whether developer machines hold exports, and whether retention/access controls differ.

## 4. Categories of users

| User | Typical role | Material considerations |
|---|---|---|
| Child players | Subject displayed on card/profile; may view Player OS or tap card | Vulnerability, evolving capacity, potential peer/social harm; account-use model UNKNOWN |
| Parents/guardians | Claim player, control profile visibility, upload/delete photos and moments, invite others, request deletion | "Guardian" database link is not proof of parental responsibility |
| Coaches | Create teams/players, access rosters, add assessments/strengths/focus/moments, receive updates | Power imbalance; access must end promptly on role/team change |
| Club officials | May order, coordinate teams or act as coaches/staff | Exact permissions and controller role UNKNOWN |
| Emblem staff | Approve orders, production, invites, public identity and deletion queues | Privileged access and insider risk |
| Public visitors | View enabled profile and public moments via link/tapped claimed card | No authentication; can copy, scrape or identify a child |

## 5. Data inventory and proposed retention

**Superseded in specific-period detail by the [retention schedule](./retention-schedule-v1.md), which records the founder's now-confirmed periods. The table below remains accurate as a field-by-field map of what exists and why.**

| Data field/category | Child? | Source and purpose | Storage / access / recipients | Public status | Proposed retention and deletion |
|---|---:|---|---|---|---|
| Player name, position, secondary position, squad number | Yes | Adult order/coach/guardian; card production and profile | DB; guardians, eligible coaches, staff; selected fields public if enabled | Private by default; name/positions/number public when enabled — **see this reconciliation: name is currently returned in full, not truncated to first name + surname initial per founder decision 4** | See retention schedule |
| Exact date of birth, derived age, football age group | Yes | Coach-entered; age/context for coaching | DB; exact DOB via coach-authorised RPC; derived age may be visible to guardian/coach | Explicitly excluded from public DTO | **Founder decision: remove exact DOB, retain football age group only — not yet implemented, see founder decision register decision 1** |
| Height/height_cm, preferred foot, favourite player, football ambition | Yes | Guardian/coach; sporting profile | DB; guardians/eligible coaches | Excluded from public DTO | Review each field; active profile only; delete with player |
| Player and coach photographs, crop/background-removal state | Yes for player; coach personal data | Order/builder/OS; card/profile/production | Browser, **Gemini for every background-removal call, not only when invoked as a separate optional step — see this reconciliation**, S3, DB keys/card-definition JSON; staff/guardian/coach according to workflow | Public player/card photo via 15-minute signed URL if sharing enabled; coach card production-only | Original and derivatives: see retention schedule |
| Moment title, date, note, trust/source, verification status | Yes | Guardian/coach/system; memories and achievements | DB; guardian/eligible coach; selected entries public | Default private; guardian can choose public | See retention schedule |
| Moment photo/video and S3 key | Yes | Guardian upload; memory/evidence | S3 + DB; signed URLs | Only public where moment public/eligible; 15-minute signed URL | Same as moment; verify object deletion and backups |
| Assessments, skill snapshots, scores, coach summary, strengths, focus, goals | Yes | Coaches and guardians; development features | DB; guardian and eligible coaches | Excluded from public DTO | Season + defined review window (propose one following season); append-only assessment retention requires justification |
| Club, team, season, badge | Indirectly | Order/staff/coach; grouping/context | DB/static assets; authenticated users can read club/team | **Currently returned on the public profile — see this reconciliation's D5 finding; founder decision 5 says club/team must NOT be public** | Retain while team exists; sever player links on transfer; historic display snapshot policy needed |
| Guardian/coach profile ID, role, display name, relationship | Often adult | Auth/onboarding; authorisation and attribution | Supabase Auth + DB; scoped relationship visibility | Not in public DTO | Account/relationship life + necessary audit period; account deletion workflow removes or nulls references |
| Guardian/coach email and OTP/auth metadata | Adult | Sign-in, invitations, fulfilment/contact | Supabase Auth, DB snapshots, Resend; order purchaser email | Private | Account life; invitation expiry plus short audit window; statutory order records separately |
| Order data: purchaser/intended guardian emails, order reference, source, pricing, club/team text, status | Adult plus child linkage | Buyer/builder; fulfilment and finance | DB, staff, Shopify as applicable | Private | See retention schedule; minimise child linkage after fulfilment |
| Card definition: child name, number, team, position, photo key/crop, optional stats | Yes | Builder; print and digital card | DB/S3; staff, linked guardian/coach; portions public | **Photo, logo and stats are currently returned on the public profile — see this reconciliation's D5/D9 findings** | Active product/profile; unlink/anonymise on player deletion; production file deletion schedule required |
| Print PDFs and print-file mappings | Yes | Server render; manufacture | S3 + order JSON; production staff/processor | Private signed access | 90 days post-delivery per founder decision 16, not yet automated — see retention schedule |
| Claim token, NFC UID (reserved), public player ID, enable/rotation time | Yes-linked identifier | Generated; activation/access | DB and physical card URL | Claim token physically exposed; public ID exposed when shared | **Lost-card revocation remains unimplemented — founder decision 15, see controls-and-tests matrix** |
| Invite codes, invited email, creator/user, expiry/use/email status | Child-linked | Guardian/coach/staff; relationship handoff | DB, Resend/email | Secret link/code | Seven-day functional expiry is VERIFIED; propose purge/tokenise code shortly after expiry/use, retain minimal audit metadata |
| Claim attempts: IP/equivalent, attempted code, success, timestamp | Adult/child user possible | Automatic abuse prevention | DB service-role only | Private | VERIFIED no policy; retention UNKNOWN; propose 30–90 days with code hashing/redaction |
| Public-profile visibility and moment visibility audit | Yes-linked | Guardian/staff action; accountability | DB; scoped guardian/staff | Current result public/private; audit private | **See this reconciliation: the public-profile enable/disable/rotate kill switch itself has NO audit trail — controls-and-tests matrix** |
| Active viewers/presence scope and heartbeat | User account; child-linked context | Automatic UI presence | DB, authenticated scoped users | Private | Very short TTL required (minutes/hours); cleanup job UNKNOWN |
| Story updates/read times | Child-linked | System from relationship/content events | DB; recipient only | Private | Propose 90 days or user-cleared; delete with player/account where applicable |
| Player deletion requests: IDs, requester, email snapshot, notes, status/attestation | Child-linked/adult | Guardian/staff; rights workflow | DB; guardian's own rows and staff | Private | Statutory/accountability period after completion, with child content excluded; define schedule |
| Pending Auth deletion: user ID, email, error, attempts, notes | Adult | Failure recovery | DB service-role/staff only | Private | Delete soon after resolution plus short audit record |
| Staff account and approval/production actions | Adult; child-linked actions | Admin workflow | DB | Private | Employment/security and audit schedule required |
| Request/server logs, Vercel logs, S3 access logs, email delivery logs | May include identifiers | Operations/security | Supplier systems | Private | UNKNOWN; configure minimised retention and prevent tokens/URLs/photo payloads entering logs |

**VERIFIED.** Exact DOB exists even though the public DTO excludes it. It is protected by specific RPC authorisation and omitted from ordinary player SELECT grants ([0036](../../supabase/migrations/0036_player_coach_fields_secure_expand.sql)). **This reconciliation additionally confirms: guardians cannot read or write the exact value either — only coaches can, via that same RPC pair — and the value's only product use is a single derived-age display tile.** See the founder decision register's decision 1 finding.

**VERIFIED.** Private media are stored as durable S3 keys; readers generate signed URLs. Public-profile URLs expire after 15 minutes ([s3-client.ts](../../src/lib/s3-client.ts); [public-player-profile.ts](../../src/lib/public-player-profile.ts)). A signed URL can nevertheless be downloaded during validity. **This reconciliation additionally confirms: authenticated guardian/coach OS media links are not capped at 15 minutes — several call sites silently default to a 7-day signing ceiling because no explicit expiry is passed. See the controls-and-tests matrix.**

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

*("optional Gemini image processing" above should now be read as: Gemini is the default background-removal mechanism for every real photo, not an optional step a user separately opts into — see this reconciliation's headline finding.)*

### Individual card order

**VERIFIED.** Builder collects player/card details, uploads namespaced source assets and one print file, verifies S3 existence/type/size, then calls the atomic order RPC. One player/card/definition is created with an assigned claim token ([ProductionBuilder.tsx](../../src/components/emblem-uk/ProductionBuilder.tsx); [order validation](../../src/lib/order-enquiry-validation.ts); [0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql)). **This is the "ordinary builder" this reconciliation found has none of founder decision 13's authority requirements — see the founder decision register.**

### Team order

**VERIFIED.** Multiple paid players are independently mapped to cards, definitions and print files. A squad may add one complete production-only coach card; it is not inserted as a player or OS identity ([0047](../../supabase/migrations/0047_order_coach_cards.sql); [0049](../../supabase/migrations/0049_authoritative_pricing_enforcement.sql)). Staff later resolves team/club identity rather than trusting checkout free text ([0009](../../supabase/migrations/0009_team_invites.sql)).

### Guardian claiming and activation

**VERIFIED.** A seven-character-style claim code/token is looked up server-side using service role. Attempts are rate-limited to ten per identifier per 15 minutes and logged. Claiming requires an authenticated user, inserts a guardian link and changes the card to `claimed` ([claim-code.ts](../../src/lib/claim-code.ts), [rate-limit.ts](../../src/lib/rate-limit.ts), [claim-player.ts](../../src/lib/claim-player.ts), [claim route](../../src/app/api/os/claim/route.ts)).

**REQUIRES SPECIALIST REVIEW.** Authentication proves control of an email account, not parental responsibility for the named child. The repository has no independent authority-verification evidence before the first guardian link.

### Coach access

**VERIFIED.** Access derives from `coach_team` or direct `coach_players` relationships; RLS and RPCs scope reads/writes. A guardian or the connected coach can remove a direct connection ([player-capabilities.ts](../../src/lib/player-capabilities.ts); [coach removal route](../../src/app/api/os/players/[id]/coach-connections/[coachProfileId]/route.ts); [0030](../../supabase/migrations/0030_coach_players.sql)). **This reconciliation confirms coach removal produces only a one-way guardian notification (`story_updates`), not a staff-readable audit record — see the controls-and-tests matrix.**

**UNKNOWN.** There is no verified automatic expiry/review of team-coach assignments or club-transfer workflow. **Founder decision 19 now specifies season-based expiry — not yet implemented.**

### Photograph processing

**VERIFIED.** Browser code resizes a photo and sends it to `/api/ai-mockup`; the server sends base64 image content to Google's Generative Language API for background removal/stylisation where configured. A failure falls back to local canvas processing ([bgRemoval.ts](../../src/components/builder/emblem/bgRemoval.ts); [ai-mockup route](../../src/app/api/ai-mockup/route.ts)). Final production/profile media are stored under private S3 keys. **This reconciliation confirms the fallback is a passthrough of the unmodified original photo, not a genuinely different non-AI removal method — see this reconciliation's headline finding.**

### Moments and achievements

**VERIFIED.** Guardians and eligible coaches can create moments under RLS; verification status and visibility are distinct. Assessments are coach-authored append-only; goals/focus/strengths have scoped authorisation ([0001](../../supabase/migrations/0001_init.sql), [0011](../../supabase/migrations/0011_moments_verification_status.sql), [0022](../../supabase/migrations/0022_player_assessments.sql)–[0024](../../supabase/migrations/0024_player_strengths.sql)).

### Optional public sharing

**VERIFIED.** New/unclaimed players default to public sharing disabled. A guardian RPC can enable/disable it; staff can enable/disable/rotate the public ID. Only allowlisted fields and moments explicitly `public` with eligible verification status are returned. Internal IDs, DOB, age, height, foot, ambitions, guardians, assessments, focus, strengths and claim token are excluded ([0039](../../supabase/migrations/0039_guardian_public_profile_control.sql); [public-player-profile.ts](../../src/lib/public-player-profile.ts)). **This reconciliation confirms the allowlist is narrower than the original draft implies in one important respect and wider in another: name is the full stored name (not first name + initial), and photo/team/club/card-artwork ARE included — see this reconciliation's D4/D5 findings, which directly contradict founder decisions made after this original text was written.**

**RESOLVED, updating the original draft's "UNKNOWN":** `noindex`/`robots` protection IS present (`robots: { index: false, follow: false }`, `src/app/player/[publicPlayerId]/page.tsx:11`) — confirmed this pass. Search-engine behaviour should still be independently tested, but the code-level control exists.

### Lost-card deactivation

**UNKNOWN / HIGH GAP — re-confirmed unchanged this pass, now founder decision 15.** Staff can disable/rotate a *public player ID*, but the NFC URL contains the separate claim token. No route or documented workflow was found to revoke/rotate a claimed card's claim token or mark a card lost/stolen. A lost claimed card can continue resolving to private OS for an authorised logged-in guardian and otherwise to the public profile if enabled ([nfc-link.ts](../../src/lib/nfc-link.ts); [card-lookup.ts](../../src/lib/card-lookup.ts); [staff public-profile route](../../src/app/api/staff/players/[id]/public-profile/route.ts)).

### Consent withdrawal, correction and deletion

**VERIFIED.** Guardians can disable sharing, change moment visibility, unpublish all moments, remove a player photo, delete their own moment, update some player fields, remove direct coaches, request/cancel player deletion and delete their own guardian account. Actual player deletion and S3 erasure are manual staff operations; account deletion spans DB and Supabase Auth with a pending-failure queue ([0039](../../supabase/migrations/0039_guardian_public_profile_control.sql)–[0044](../../supabase/migrations/0044_player_deletion_request_contact.sql); [deletion runbook](../pilot/child-data-deletion-runbook.md)). **This reconciliation confirms, via direct production foreign-key inspection, that the cascade behaviour the runbook describes is accurate and unchanged.**

## 7. Controller and processor analysis — provisional

**Updated by this reconciliation: the controller is now named — Lauda Cartoons Ltd, trading as Emblem.** The remaining analysis below is otherwise unchanged and still **REQUIRES SPECIALIST REVIEW**:

- Emblem operating entity (Lauda Cartoons Ltd): controller for product, order, profile, sharing, safety and staff purposes because it determines purposes and essential means.
- Clubs/leagues: potentially independent controllers, joint controllers or customers whose coaches act under Emblem's authority, depending on contracts and who decides purposes, roster population, assessment and disclosure.
- Parent/guardian: normally data subject/authorised user, not a processor; household exemption should not be assumed for processing carried out through Emblem.
- Coaches/club officials: authorised users under the relevant controller(s), unless their organisation determines independent purposes.
- Supabase, AWS, Vercel, Resend and possibly Google/Meshy: likely processors/subprocessors for defined operations, subject to actual terms and product configuration. **See the supplier register — none of these has confirmed contract evidence yet, and Google specifically now carries the highest priority given the background-removal finding.**
- Shopify: may be processor for some merchant functions and independent controller for payment/platform purposes; confirm contract and data flows.
- Couriers/printers: role UNKNOWN — legal entities not identified anywhere in this repository.

Article 28 contracts, subprocessor lists, hosting regions, breach support, deletion/return commitments and audit rights must be documented. ICO guidance confirms controller-processor relationships require binding terms: [ICO contracts guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/when-is-a-contract-needed-and-why-is-it-important/).

**REQUIRES SPECIALIST REVIEW.** Determine restricted transfers using the current ICO three-step approach and supplier legal entities, not server-region assumptions alone. [ICO international transfers guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-guide-to-international-transfers/). **This reconciliation adds: the AWS S3 bucket's actual current region (UK vs. previously-documented Sydney) could not be confirmed without accessing sensitive credentials, which this pass correctly did not do — see the founder decision register's P1 entry.**

## 8. Preliminary lawful-basis analysis — for legal review

No basis below is final. Record one basis per distinct purpose in the Article 30 record and privacy information; do not switch opportunistically. **This table is the operative discipline this reconciliation was instructed to preserve: consent is not used as a blanket basis, and guardian permissions (an access-control fact) are kept distinct from the organisation's lawful basis (a legal question) throughout.**

| Purpose | Provisional Article 6 basis | Key review points |
|---|---|---|
| Adult order, custom production, delivery and customer service | Contract with adult purchaser; legal obligation for required financial records | Contract with adult does not automatically justify all child-profile processing |
| Create child card/profile and retain production identity | Legitimate interests, possibly contract where strictly necessary | Complete child-weighted LIA; minimise post-fulfilment retention |
| Guardian account and requested Player OS features | Contract and/or legitimate interests | Confirm whether child directly uses service; provide age-appropriate notice |
| Claim/activation security, abuse logs, audit | Legitimate interests | Hash/redact codes/IPs, short retention, child-weighted balancing |
| Coach roster access and development records | Legitimate interests; possibly consent for optional features | Power imbalance means consent may not be freely given; define club/Emblem roles |
| Football age group and physical/sporting attributes (exact DOB scheduled for removal — founder decision 1) | Legitimate interests only if necessity demonstrated; consent may be considered for genuinely optional fields | Strong minimisation case already accepted by the founder; implementation pending |
| Public player profile and public moments | Consent is likely candidate because optional and withdrawable; alternatively specialist-approved legitimate interests is difficult | Verify parental responsibility and involve capable child; withdrawal must be as easy and effective as enablement; **field set must first match founder decision 5, which it currently does not** |
| AI processing/background removal | Consent for optional AI feature or narrowly assessed legitimate interests | **This reconciliation finds background removal is not currently offered as a separable optional choice from the base builder flow — this materially affects whether "consent" is a valid basis for it as implemented today** |
| Safeguarding/moderation | Legitimate interests; legal obligation only where a specific law applies | Do not label safeguarding as "legal obligation" without identifying law |
| Tax/accounting records | Legal obligation | Separate and minimise child data in retained financial records; 6-year period per founder decision 16, subject to accountant confirmation |
| Rights/deletion request audit | Legal obligation and/or legitimate interests | Retain minimal evidence, not deleted content |

**REQUIRES SPECIALIST REVIEW.** Special-category data are not expressly designed into the schema, but photographs, free-text notes and uploads may reveal health, ethnicity, religion or biometric characteristics. A photograph is not automatically biometric special-category data; it becomes so where technically processed for unique identification. **Confirm specifically whether Google Gemini's processing of the uploaded photograph constitutes technical processing for unique identification** — this reconciliation did not find evidence either way and could not resolve it through code review alone. If special-category processing is intended, identify an Article 9 condition and DPA 2018 requirements before processing.

**REQUIRES SPECIALIST REVIEW.** If the ISS is offered directly to children and consent is relied upon, UK rules generally permit a child aged 13+ to consent, while under-13 consent must be authorised by a holder of parental responsibility and reasonable efforts made to verify that authority. Consent is not the only lawful basis. [ICO lawful-basis guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/how-do-the-lawful-bases-apply-to-children-s-personal-information/) and [DPA 2018 explanatory notes](https://www.legislation.gov.uk/ukpga/2018/12/notes/division/6/index.htm). The pilot's own U8–U16 age range means every participant is under 13 for at least part of that range — **this makes verified-authority (founder decision 13/14) more, not less, important, and sharpens the severity of R26.**

## 9. Children's Code assessment

| Principle | Assessment |
|---|---|
| Best interests | **PARTIAL / REQUIRES SPECIALIST REVIEW.** Guardian-centred access, private defaults and no public leaderboard support child interests, but no completed best-interests assessment or consultation exists. Commercial printing/social sharing must not override safety. |
| DPIA | **IN PROGRESS.** This reconciliation is the second draft iteration and still requires consultation, action completion and independent approval. |
| Age-appropriate application | **GAP.** Supported ages appear 3–19 in the schema; the pilot itself is scoped to U8–U16 by founder decision. No verified age-banded design or assurance of who actually operates the account beyond the pilot's own scope decision. Apply high protections to all until proportionate age design is approved. |
| Transparency | **HIGH GAP.** Public privacy/terms pages' current placeholder status was not independently re-verified this pass; the controller identity (now named) and the two severe findings above should be reflected in child/adult notices before real use. Create layered child and adult notices. |
| Detrimental use | **PARTIAL.** No ads/behavioural marketing found; assessments/rank-like scores may affect self-esteem, opportunity or coach treatment. Season statistics are disabled for the initial pilot per founder decision 9 — **this pass could not fully confirm what `card_definitions.stats` contains and whether it overlaps with "season statistics" as meant; flagged for follow-up in the founder decision register.** |
| Policies/community standards | **GAP.** Terms prohibit inappropriate content, but moderation, reporting, appeals and safeguarding response are not evidenced. A visible safeguarding contact route (founder decision 20) is not yet implemented. |
| Privacy by default | **STRONG TECHNICAL CONTROL for RLS/table access; WEAKER than assumed for the public profile specifically.** Public profile defaults false; moments default private; RLS is confirmed comprehensive in production (every table checked has RLS enabled, prior Gate 2 pass). But once a guardian does opt in, the fields shown are broader than founder decision 5 permits — see this reconciliation's D5 finding. |
| Data minimisation | **PARTIAL, improving.** The founder's own decisions (1, 4–9) push meaningfully toward minimisation; implementation has not yet caught up to those decisions in several concrete places documented in this reconciliation. |
| Sharing/disclosure | **PARTIAL/HIGH RISK, sharpened by this reconciliation.** Guardian controls public sharing and eligible moments, but the public DTO currently over-shares relative to the founder's own fresh decision. |
| Geolocation | **VERIFIED not intentionally collected in schema.** IP/equivalent identifiers in claim logs can indicate approximate location; supplier logs may do likewise. Geolocation features should remain off/absent. |
| Parental involvement | **PARTIAL, and now more precisely characterised.** Guardian relationships and controls exist for ongoing OS access, but first-claim authority and (per this reconciliation) ordinary-builder order authority are not independently verified; capable children's views/assent are not recorded. |
| Profiling | **REQUIRES SPECIALIST REVIEW.** No automated behavioural targeting found. Coach assessments/scores are still structured evaluation/profiling in ordinary data-protection language even if human-authored; document impacts and contestability. |
| Nudge techniques | **INFERRED low current concern.** No XP/coins/public leaderboard found. Test UI so children/parents are not nudged to publish or provide optional data. |
| Connected-device considerations | **PARTIAL.** NFC is passive, but the physical token is persistent, shareable and — confirmed unchanged this pass — currently lacks a lost-card revocation workflow (founder decision 15). |
| Online rights tools | **PARTIAL.** Visibility, unpublish, photo/moment removal, coach removal, correction and deletion-request tools exist. Export/access, complaint/reporting, child-facing help and fully automated erasure do not. |

ICO age bands (0–5, 6–9, 10–12, 13–15, 16–17) are useful design guides but not substitutes for individual capacity assessment: [ICO age-appropriate application](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/3-age-appropriate-application/).

## 10. Child-specific risk register

*(R1–R24 unchanged from v0.1; R25 and R26, this reconciliation's new findings, are recorded in the reconciliation note at the top of this document to keep this section's original numbering and content stable for cross-referencing documents.)*

| ID / risk | Users and harm | Cause/threat | Existing verified controls | L / S / overall | Required mitigation / owner | Residual |
|---|---|---|---|---|---|---|
| R1 Unauthorised child photograph | Child; loss of dignity, safeguarding risk, misuse | Purchaser/uploader lacks authority | Terms require permission; guardian-scoped OS writes; private S3 keys | M / Critical / High | Verify authority; child assent where appropriate; reporting/takedown; moderation; supplier review. Owner: DPO + Safeguarding | Medium |
| R2 Lost/stolen NFC card | Child; stranger discovers identity/profile | Persistent claim-token URL, no lost-card state | Public sharing can be disabled; public ID can rotate; RLS protects private OS | H / High / **High** | Add immediate lost-card report, revoke/rotate card token, replacement lifecycle, guardian notification and audit. Owner: Product + Security. **Now founder decision 15 — still zero implementation, confirmed this pass.** | Low–Medium (once built) |
| R3 Guessing/sharing claim codes | Child; incorrect claim or disclosure | Human-readable codes and pre-auth lookup | 10 attempts/15 min/IP-equivalent; attempt log; unique tokens; approval gate | M / High / High | Increase entropy; never log raw attempted code; adaptive/global throttling; alerting; one-time activation token; security testing. Owner: Security | Low–Medium |
| R4 Incorrect guardian claim | Child/family; unauthorised control and disclosure | Email authentication is not parental-responsibility verification | Claimed card locks; guardian relation controls later actions | M / Critical / **High** | Define evidence/club-mediated verification, dispute/recovery, co-guardian notification, emergency freeze. Owner: Safeguarding + DPO. **The ordinary builder's total lack of authority checks (R26) is a closely related, separately-tracked finding.** | Medium |
| R5 Excessive coach access | Child; privacy invasion, unfair evaluation | Team-wide access and rich fields including DOB | RLS; coach relationship checks; exact DOB special RPC | M / High / High | Role/field matrix, least privilege, purpose-specific views, access logging/review, remove DOB unless essential. Owner: Product + Club Welfare. **Founder decision 1 (remove exact DOB) directly closes the DOB portion of this risk once implemented.** | Medium (pending DOB removal) |
| R6 Former coach retains access | Child; ongoing unauthorised access | No automatic assignment expiry/season review | Direct connection can be removed by guardian/self | H / High / **High** | Season expiry, club offboarding, periodic guardian review, revoke all coach sessions/links on removal. Owner: Club admin + Product. **Now founder decision 19 — season expiry not yet implemented, confirmed this pass.** | Low–Medium (once built) |
| R7 Private Player OS exposed through public profile | Child; broad disclosure | Service-role public query bypasses RLS; implementation error | Explicit DTO allowlist, visibility gate, eligible public moments only, 15-min URLs | M / Critical / High | Independent security tests; deny-by-default regression tests; cache headers; monitor route changes; child-friendly preview. Owner: Security. **This reconciliation's D5 finding is a real instance of the DTO allowlist being broader than intended, not a hypothetical.** | Medium–High (elevated by D5 until closed) |
| R8 Search-engine indexing | Child; durable discoverability | Public stable URLs, identifiable content | Random public ID; guardian disable/rotation; **`noindex` confirmed present this pass** | M / High / Medium (revised down from High, `noindex` now confirmed rather than unverified) | Verify search/cache behaviour empirically; avoid sitemaps; search-engine de-index request process. Owner: Web + DPO | Low |
| R9 Identification by name/club/team/age/location | Child; stalking, unwanted contact | Combined public attributes and image | Public DTO excludes DOB/age/height; visibility opt-in | H / High / **High, and directly worsened by D5** | Pseudonym/first-name default; omit team/season/squad number; granular preview/choices; forbid location; safeguarding review. **D4/D5 findings mean this risk is materially live today, not theoretical, for any guardian who has already opted into sharing.** | Medium (High until D4/D5 closed) |
| R10 Scraping/downloading photos | Child; copying, facial misuse | Public signed URL can be downloaded; stable page | 15-minute URL; private S3 bucket | H / High / **High, worsened by D5's photo exposure** | Default no public photo (founder decision 5 already says this); transformed low-resolution/watermarked derivative; CSP/hotlink controls; takedown monitoring. Owner: Security + Product | Medium–High until D5 closed |
| R11 Bullying/comparison/public ranking | Children; distress, exclusion, lost opportunity | Stats, scores, assessments, strengths, moments | Assessments excluded publicly; no public leaderboard/XP found; **season statistics disabled for pilot per founder decision 9, pending confirmation of what `card_definitions.stats` actually contains** | M / High / High | Prohibit ranking; age-appropriate presentation; contest/correct controls; safeguarding reporting; test with children. Owner: Product + Safeguarding | Low–Medium |
| R12 Inappropriate uploads | Children/public/staff; harmful content or unlawful imagery | Free text/photo/video; no moderation workflow evidenced | Terms prohibit inappropriate content; coach verification states | M / Critical / High | Upload rules, scanning/moderation, report/block/escalation, CSAM response advice, staff training, minimal access. Owner: Safeguarding | Medium |
| R13 Staff misuse | Children/families; broad unauthorised access | Service-role/staff production capability | `staff_accounts`, `requireStaff`, approval attribution, RLS/no client access | M / Critical / High | MFA, least privilege, joiner/mover/leaver, audit every sensitive view/action, periodic review, dual control for export/public override. Owner: Security. **The public-profile kill switch's own missing audit trail (controls-and-tests matrix) is a specific, confirmed instance of this risk.** | Medium |
| R14 Compromised guardian/coach account | Child; disclosure or harmful edits | Email OTP/session compromise | Server `getUser`; recent OTP reauth for account deletion; scoped RLS | M / Critical / High | MFA/passkeys for staff/coaches, session/device controls, security notifications, recovery/freeze, anomaly detection. Owner: Security | Medium |
| R15 Insecure third party/transfer | Children/adults; breach, reuse, overseas access | Cloud/AI/email/commerce suppliers | Server-held keys; private S3; no secret values client-side identified | M / Critical / **High, and Google Gemini specifically is now the highest-priority unresolved entry** | Article 28/transfer review, UK regions where suitable, AI no-training/retention confirmation, supplier register, incident terms. Owner: DPO + Procurement. **See the supplier register.** | Medium (High for Gemini specifically until assessed) |
| R16 Deletion failure/orphaned media | Child; data persists after valid request | Manual DB/S3/Auth cross-system deletion and temporary backup | Detailed runbook, request state machine, Auth failure queue | H / High / **High** | Automated inventory/tombstone workflow, reconciliation, backup expiry, completion evidence, periodic deletion tests. Owner: Operations + Security. **Founder decision 18 sets a 14-day internal target; not yet enforced by any automation, confirmed this pass.** | Low–Medium (once built) |
| R17 Withdrawn consent not propagated | Child; continued public/AI processing | Copies, caches, supplier retention, printed card | Guardian disable/unpublish and delete tools | M / High / High | Map consent dependencies; supplier deletion; cache purge; explain irreversible physical copies/downloads; record withdrawal. Owner: DPO + Product | Medium |
| R18 Club transfer | Child; old coach/team access and wrong public identity | `team_id`/coach relations persist; historic snapshots | Direct coach removal exists | H / High / **High** | Atomic transfer workflow: end old access, review content visibility, notify guardian, preserve only justified history. Owner: Club admin + Product | Low–Medium |
| R19 Full DOB disclosure | Child; identity theft/safeguarding | Exact DOB stored and coach RPC exposes it | Absent from normal SELECT/public DTO; coach relationship rechecked | M / Critical / High | **Founder decision 1 already resolves this in principle — remove exact DOB, retain football age group only. Not yet implemented.** Owner: DPO + Product | Low (once implemented) |
| R20 Excessive retention | All; increased breach and future-use risk | No comprehensive schedules/jobs | Cascades and some deletion tools; invite expiry | H / High / High | **Founder decision 16 now sets exact periods — see the retention schedule. None are yet automated.** Owner: DPO + Engineering | Low–Medium (once automated) |
| R21 Real child data in staging/dev | Child; weaker environment exposure | Copies, screenshots, local exports | Separate project references inferred | M / Critical / High | Written prohibition; synthetic data; masked refresh only; separate keys/access; scanning and deletion attestations. Owner: Security | Low |
| R22 AI changes/misrepresents child photo | Child; dignity, bias, stereotyping | Generative model creates edited/stylised image | User chooses feature; fallback exists | M / High / **High, sharpened by the D11 finding that this is not a separately-chosen feature for background removal specifically** | Non-AI default for real pilot photos until D11/D12 are resolved; clear notice/preview/approval; prohibit sensitive inference; quality/bias tests; delete provider inputs/outputs. Owner: Product + DPO | Medium (High until D11/D12 resolved) |
| R23 Claim-attempt log becomes credential dataset | Children/users; token replay and location inference | Raw code attempt + IP stored | Service-role-only table | M / High / High | Hash/tokenise attempts, never retain valid codes, short TTL, restricted incident access. Owner: Security | Low |
| R24 Public physical card persists after withdrawal/deletion | Child; offline identity/photo remains in circulation | Printed card cannot be remotely erased | Digital profile disable/delete breaks online resolution | H / Medium / High | Explain physical limitation, replacement/destruction process, minimal print content, safeguarding recall plan. Owner: Operations | Medium |

Where a high residual risk remains after feasible mitigation, UK GDPR Article 36 prior consultation may be required before processing. **REQUIRES SPECIALIST REVIEW.** Do not proceed on the assumption that accepting a risk internally is sufficient.

## 11. Consultation required

Before pilot sign-off, conduct and document proportionate consultation with:

- parents/guardians (2–3, per founder decision 23), including non-technical and separated/custody households;
- children in relevant ICO age bands (a small number of U8–U16, with guardian involvement, using fictional-player demonstrations wherever possible, per founder decision 23), with accessible methods and no pressure;
- coaches (1 grassroots coach, per founder decision 23) and club officials;
- a trained Club Welfare Officer or safeguarding professional (per founder decision 23);
- an independent safeguarding specialist; and
- a UK data-protection specialist/DPO or solicitor.

Consultation should test: comprehension of privacy notices and NFC behaviour; expectations about coach access; comfort with football age group/photos (exact DOB scheduled for removal); public-profile field choices; visibility/withdrawal; bullying/comparison impacts; lost cards; account sharing; deletion; AI photo processing (now confirmed as the default, not optional, mechanism for background removal); and whether children can find help. Record dissent and how design changed. ICO design guidance recommends bringing children's views into design and meaningful parent-child conversations: [ICO design guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/designing-products-that-protect-privacy/childrens-code-design-guidance/).

## 12. Gaps and recommended actions

**Superseded in operational detail by the [founder decision register](./founder-decision-register-v1.md) and [controls-and-tests matrix](./gate2-controls-tests-matrix-v1.md), which should be used as the working documents going forward. Preserved below as the historical record this reconciliation grew from.**

### Required before the pilot

1. **REQUIRES SPECIALIST REVIEW:** identify controller(s) — **now named, Lauda Cartoons Ltd** — legal entity, DPO/privacy contact — **see the DPO decision record** — Article 30 purposes, lawful bases, LIAs and any Article 9 condition.
2. Complete best-interests assessment and consultation; approve this DPIA with action owners.
3. Replace placeholder privacy/terms with layered adult/child notices covering OS, NFC, football age group, coaches, public sharing, AI, suppliers, retention and rights.
4. Implement parental-responsibility/authority verification and incorrect-claim dispute/freeze. **See R26 — currently absent from the ordinary builder entirely.**
5. Implement lost/stolen-card token revocation/replacement distinct from public-ID rotation. **See R2/founder decision 15 — still zero implementation.**
6. `noindex` — **now confirmed implemented.** Test cache/search behaviour and reduce default public fields/photos per founder decision 5, currently not met.
7. Approve field-by-field minimisation — **founder has approved it (decisions 1, 4–9); implementation is the remaining gap, not the decision.**
8. Establish upload moderation/safeguarding/reporting and staff escalation. **See founder decision 20 — visible reporting route not yet built.**
9. Execute supplier due diligence, Article 28 terms, transfer assessments and AI input/output retention/training commitments. **See the supplier register — Google Gemini is now the top priority.**
10. Approve retention schedule — **done, see the retention schedule** — and automate high-risk expiry: claim logs, presence, invites, media/prints, public caches, logs and deletion backups — **none yet automated.**
11. Prohibit real child data in development/staging; implement synthetic/masked test data and access reviews.
12. Test RLS/RPC/public DTO and staff permissions independently — **substantially done via direct production catalog inspection across both Gate 2 passes; the cross-account synthetic test plan from the prior pass remains to be executed** — and enable MFA/strong staff access and sensitive-action audit.
13. Convert manual player/S3 deletion into a verifiable workflow or demonstrate operational capacity, reconciliation and backup expiry. **Founder decision 18 sets specific targets; automation remains the gap.**

### Required during a controlled pilot

- limit clubs, children, staff and coaches — **done, founder decision confirms 2–3 clubs, ≤30 players, U8–U16, 8–12 weeks**; maintain named welfare contacts — **Safeguarding Lead not yet named, see G3**;
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

1. **RESOLVED this reconciliation:** the legal controller is Lauda Cartoons Ltd; Blake is interim Privacy Lead, accountable for DPIA decisions pending independent review.
2. **RESOLVED this reconciliation:** ages U8–U16, guardian-operated per the pilot scope; whether children directly operate Player OS themselves within that scope is still **UNKNOWN**.
3. **UNKNOWN, and now sharpened by R26:** what proves parental responsibility and resolves custody/disputes — the ordinary builder currently asks nothing at all.
4. **UNKNOWN:** are clubs independent/joint controllers, and what contracts govern coaches?
5. **UNKNOWN:** what are production hosting regions — **the AWS S3 region specifically flagged as unconfirmed, see founder decision register P1** — supplier legal entities, subprocessors and transfer safeguards?
6. **UNKNOWN, now the single highest-priority open question:** does Google Gemini retain inputs/outputs or use them for model improvement under the chosen terms — see R15/R22 and the supplier register.
7. **RESOLVED this reconciliation, and more concerning than previously understood:** background removal — not just stylisation — invokes Gemini by default for every real photo in the live builder.
8. **UNKNOWN:** who prints and ships cards, what data they receive, and how they delete it?
9. **PARTIALLY RESOLVED this reconciliation:** `noindex` is confirmed present; whether public profiles are actually excluded from search indices in practice still needs empirical testing.
10. **UNKNOWN, now founder-decided but not built:** the lost/stolen card support process — founder decision 15 specifies the intended process; it does not yet exist in code.
11. **PARTIALLY RESOLVED this reconciliation:** founder decision 16 sets DB/S3/print-PDF retention periods; Auth/Vercel/Supabase/AWS logs, email logs and backups remain **UNKNOWN**.
12. **UNKNOWN:** are production data ever copied to staging, development, support tickets or staff devices?
13. **UNKNOWN:** are analytics, error monitoring, cookies or third-party scripts enabled outside repository code/config?
14. **UNKNOWN:** what age/identity/safeguarding training and background checks apply to staff/coaches?
15. **PARTIALLY RESOLVED this reconciliation:** public-profile views and exact-DOB reads are confirmed NOT audited (see controls-and-tests matrix); sensitive staff reads generally remain **UNKNOWN** beyond the specific mechanisms checked.
16. **RESOLVED this reconciliation:** the lawful need for exact DOB and structured assessment history — founder decision 1 removes exact DOB; height/ambitions/assessments remain to be individually reviewed per the original §12 recommendation.
17. **UNKNOWN:** how will a child correct, contest or object to a coach assessment?
18. **UNKNOWN:** are backup/DR copies included in erasure and retention processes?
19. **UNKNOWN:** is the passive NFC token writable/locked, cloneable, or replaceable in the physical production process?
20. **PARTIALLY RESOLVED this reconciliation:** the pilot stop criterion is now scoped (2–3 clubs, ≤30 players, 8–12 weeks) and founder decision 20 sets safeguarding escalation principles; the specific incident escalation chain still needs the not-yet-named Safeguarding Lead and independent review — see the independent-review checklist.

## 14. Sign-off

### Decision

- [ ] Approved to proceed without further action
- [ ] Approved only subject to the actions below
- [ ] Paused pending mitigation/specialist advice
- [ ] Processing must not begin/continue because high residual risk remains

**Draft recommendation, reaffirmed by this reconciliation:** **REQUIRES SPECIALIST REVIEW — paused pending completion of the founder decision register and controls-and-tests matrix's open items, especially R25 (Gemini/background removal) and R26 (ordinary-builder authority gap), and the independent review described in the [independent-review checklist](./independent-review-checklist-v1.md).**

### Risk acceptance

| Risk IDs accepted | Rationale and evidence | Acceptance expiry | Accountable approver |
|---|---|---|---|
| UNKNOWN |  |  |  |

Risk acceptance must not be used to bypass mandatory legal obligations or ICO prior consultation where required.

### Action owners

**See the [founder decision register](./founder-decision-register-v1.md) for the current, complete, per-decision owner/status table. The table below is preserved as the historical record this reconciliation grew from.**

| Action | Owner | Due date | Evidence of completion |
|---|---|---|---|
| Assign controller/DPIA owner and specialist reviewer | Blake (interim, self-assigned — see independence note below) | 2026-08-17 | This entry; controller now formally named this reconciliation |
| Complete before-pilot actions in section 12 | See founder decision register | Before pilot | Founder decision register |
| Conduct child/parent/coach/welfare consultation | See founder decision 23 | Before final sign-off | Independent-review checklist |
| Verify supplier contracts/transfers | See supplier register | Before live processing | Supplier register |
| Security and safeguarding acceptance | Independent Safeguarding Lead not yet named (G3) | Before live processing | Independent-review checklist |

### Review date and approval roles

**Next review date:** before real-child use begins, and no later than three months after the pilot begins, consistent with the original draft.

**Required approval roles:** accountable controller executive (Lauda Cartoons Ltd); DPO/UK data-protection specialist; independent Safeguarding Lead (not yet named); security lead; product owner; operations lead; relevant Club Welfare Officer(s). **See the [independent-review checklist](./independent-review-checklist-v1.md) for the operative sign-off table going forward — this section is preserved as historical record.**

**Independence note (added 2026-08-17, reaffirmed 2026-08-24):** Blake has provisionally named himself to the DPO/UK data-protection specialist, safeguarding lead and security lead roles below, as an interim placeholder so these roles are no longer blank — not as a substitute for genuinely independent review. This DPIA itself explains why that independence matters (§7, §11, §13 item 1): the person accountable for the product deciding whether the product is safe is exactly the conflict of interest a DPO/safeguarding/security function exists to check. **This reconciliation's own two severe findings (R25, R26) are exactly the kind of thing independent review exists to catch — they were found by re-verifying claims against code, not by trusting the original draft's prose, which is precisely the discipline that must continue.** Section 12's required-before-pilot actions remain open regardless of who is named here, and the draft recommendation above is unchanged by this update — assigning an owner to a gap is not the same as closing it.

| Role | Name | Decision | Date/signature |
|---|---|---|---|
| Controller accountable executive | Lauda Cartoons Ltd (named this reconciliation) |  |  |
| DPO / UK data-protection specialist | Blake (interim, self-assigned) | Not yet decided — role filled, review not yet conducted | 2026-08-17, reaffirmed 2026-08-24 |
| Safeguarding lead | **Not yet named — see G3** | Not yet decided | — |
| Security lead | Blake (interim, self-assigned) | Not yet decided — role filled, review not yet conducted | 2026-08-17, reaffirmed 2026-08-24 |
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
