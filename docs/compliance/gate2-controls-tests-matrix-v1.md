# Gate 2 Controls-and-Tests Matrix — Emblem

**Version:** 1.0
**Date:** 24 August 2026
**Status:** Controlled draft. Traces each founder decision's engineering state against `origin/main` at commit `cf866a66bd2e7930541ec468ffac397cc07c9135`, verified via a clean isolated worktree, not the dirty local tree. This is not a test report — the "test" columns describe what should be run, not what has been run.

Classification legend, per Gate 2 Work Package 1 instructions:
`VERIFIED IN CODE` · `VERIFIED BY DOCUMENT` · `FOUNDER DECISION — NOT YET IMPLEMENTED` · `REQUIRES LIVE TEST` · `REQUIRES SUPPLIER EVIDENCE` · `REQUIRES INDEPENDENT REVIEW` · `UNKNOWN`

---

## Signed-link lifetimes (feeds decisions 15, 16, 18, 22)

Every `getSignedDownloadUrl` call site (`src/lib/s3-client.ts`), individually checked — expiries are **not uniform**:

| Context | Expiry | Who can trigger | Classification |
|---|---|---|---|
| Public player profile (photo, card photo, card logo, moment media) | 15 min | Any unauthenticated visitor with the link | `VERIFIED IN CODE` — `src/lib/public-player-profile.ts:21,31,154` |
| Print-file PDF, anonymous builder session | 15 min | Anonymous capability-cookie holder | `VERIFIED IN CODE` — `src/app/api/render-print/route.ts:25,107` |
| Order-asset upload confirmation | 15 min | Anonymous capability-cookie holder | `VERIFIED IN CODE` — `src/app/api/order-assets/route.ts:42,243` |
| Guardian Player OS (card photo/logo, moment media, player photo) | **7 days (silent default — no `expiresInSec` passed)** | Authenticated guardian, own player only | `VERIFIED IN CODE` — `src/lib/os-data.ts:459-460,684,697,741` |
| Coach OS (moment thumbnails, player photo) | **7 days (silent default)** | Authenticated coach | `VERIFIED IN CODE` — `src/lib/os-data.ts:985`; `src/app/api/os/players/[id]/coach-fields/route.ts:58` |
| Staff queue (pending-order photo, card face, print PDF) | 1 hour (hardcoded) | Staff only | `VERIFIED IN CODE` — `src/app/staff/queue/page.tsx:121,179,367` |

**Finding requiring a decision, not just documentation:** the 7-day default is not a deliberate design choice anyone documented — it is what happens when a call site omits an explicit override. If a guardian or coach forwards, screenshots the URL bar, or has a compromised device, a leaked link stays live up to ~450× longer than the public-facing equivalent. **Recommend an explicit, short (e.g. 15–60 minute) expiry on every authenticated OS media call, matching the discipline already applied to public/anonymous paths**, unless there's a specific operational reason for the longer window that should be recorded here instead.

**Test required (not run in this pass):** generate a guardian-context signed URL, wait past a shortened test expiry, confirm 403; confirm the same for staff (1hr) and public (15min) paths.

---

## Card lifecycle — suspension, revocation, replacement (decision 15)

Carried forward from the prior Gate 2 pass and re-confirmed this pass against the same clean commit — **no code has changed here**:

| Founder requirement | Status | Evidence |
|---|---|---|
| Guardian can suspend/reactivate | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No `suspend`/`reactivate` action exists on any guardian-facing route; `cards.status` enum has no such value |
| Staff can suspend/revoke | `FOUNDER DECISION — NOT YET IMPLEMENTED` | `staff/players/[id]/public-profile/route.ts` only toggles *public-profile* visibility, never `cards.claim_token` or `cards.status`; no staff route touches card state at all |
| Coach can report only | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No reporting mechanism of any kind exists for coaches regarding card status |
| Suspended/revoked card shows neutral unavailable page, no child info | `FOUNDER DECISION — NOT YET IMPLEMENTED` | Cannot exist without a suspended/revoked state to check against; `resolveCardCode()` (`src/lib/card-lookup.ts`) has no such branch |
| Revocation is permanent | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No revocation exists to be permanent |
| Replacement issues a new secure identifier | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No replacement-card flow exists; `claim_token` is generated once at order creation with no regenerate function anywhere in `src/lib` |
| Disputed claims trigger suspension | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No dispute concept exists on `cards`/`orders` |
| All actions audited | `FOUNDER DECISION — NOT YET IMPLEMENTED` | Moot — there are no actions yet to audit; and separately, the one card-adjacent kill switch that does exist (public-profile disable) has **no** audit trail either (see Audit logging, below) |

**This remains the single highest-priority concrete engineering gap identified across both Gate 2 passes.** `resolveCardCode()` will resolve a claimed card's token indefinitely; there is no code path, staff or guardian, to stop that.

**Smallest safe work package (not implemented in this pass):** add a `cards.status` value for `suspended`/`revoked` (state machine currently `unassigned→assigned→claimed`, one-directional only — confirmed via the FK/constraint check in the prior Gate 2 pass), a guardian-facing suspend/reactivate toggle gated the same way `public_id_enabled` already is, a staff-only revoke action, a neutral "card unavailable" response in `resolveCardCode()` for any suspended/revoked status, and an audit insert on every transition. This is new column + new RLS-safe RPC + new UI, not a large rewrite — but it is real engineering work, not documentation, and is explicitly out of scope to build in this pass.

---

## AI / image processing (decisions 10–12)

See the [founder decision register](./founder-decision-register-v1.md)'s dedicated section for the full finding — summarised here for the matrix:

| Item | Classification |
|---|---|
| Background removal routes through Google Gemini by default for every real photo upload in the live Squad Invite builder | `VERIFIED IN CODE` — `src/components/builder/emblem/bgRemoval.ts:139`, `src/app/api/ai-mockup/route.ts:13-14,167,206` |
| Stylisation features (plushie/figurine/etc.) use the same Gemini endpoint but are **not** reachable from the Squad Invite/ordinary child-photo flow — separate user action required | `VERIFIED IN CODE` — no reference to `AIMockupBlock`/stylisation kinds anywhere in `ProductionBuilder.tsx`; only in the unrelated general-merchandise builder shell |
| Meshy (3D) receives only a hosted image URL, not raw photo bytes, and has no call site in the child-photo flow | `VERIFIED IN CODE` — `src/lib/meshy.ts:24-41` |
| Whether this constitutes "real children's data to generative AI" under decision #10 | `FOUNDER DECISION — NOT YET IMPLEMENTED` (i.e. decision #10, as stated, is not currently true of the live system for the background-removal path) |
| Google Gemini training/retention/subprocessor/transfer terms | `REQUIRES SUPPLIER EVIDENCE` — none found in code or docs; see supplier register |
| A synthetic-vs-real gate specifically for background removal (as opposed to the general Squad Invite MVP flag) | `UNKNOWN` — no such distinction exists in the code; the only relevant flag (`SQUAD_INVITE_MVP_ENABLED`) gates the whole pilot feature, not AI use specifically |

**Test required:** none can meaningfully substitute for the founder decision this needs first (see the register). Once decided, if background removal is to continue using Gemini for real children during the pilot, the correct next step is supplier evidence gathering, not a synthetic test.

---

## Ordinary builder authority (decision 13) vs Squad Invite authority (decision 14)

Squad Invite: `VERIFIED BY DOCUMENT` (`docs/pilot/squad-invite-controlled-pilot-runbook.md`) and substantially `VERIFIED IN CODE` (staff manual review before activation; parent email-session verification; separate declaration acceptances; commit route re-derives credentials server-side rather than trusting client input; atomic `SECURITY DEFINER` commit transaction; source-aware staff approval; no coach-submission-without-parent path found).

Ordinary builder: see the founder decision register's dedicated table — **8 of 9 sub-requirements are `FOUNDER DECISION — NOT YET IMPLEMENTED`**, with only generic staff payment/production review present. Not reproduced again here to avoid drift; that table is the source of truth.

**Test required once built:** attempt to complete an ordinary-builder order with no age confirmation, no authority confirmation, and confirm the order is rejected pre-finalisation — this test cannot be written yet because there is nothing to test against.

---

## Retention automation (decisions 16, 17)

| Founder retention period | Automation status | Evidence |
|---|---|---|
| Abandoned uploads: 7 days | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No cron/scheduled job or lifecycle rule found in the application. `builder_submission_capabilities`/`builder_submission_assets` (migration 0068) implement a *reservation* system with states (`active/finalising/submitted/revoked/expired`) but no evidence of an automated sweep that actually deletes expired/abandoned S3 objects was found in this pass — this needs direct confirmation, not assumption either way |
| Original uncropped photo: 30 days post-delivery | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No deletion job found; matches the deletion runbook's own statement that all deletion is currently manual |
| Processed private-profile image: retained while active, guardian-removable | `PARTIALLY VERIFIED IN CODE` | Guardian-initiated photo removal exists (`players/[id]/photo/route.ts`, prior Gate 2 pass finding); there is no *automatic* expiry tied to profile inactivity — see decision 17 below |
| Print PDF: 90 days post-delivery | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No automated deletion job found |
| Deletion request overrides routine retention | `VERIFIED BY DOCUMENT` | `docs/pilot/child-data-deletion-runbook.md` — but this is a manual staff process, not automation |
| Accounting/payment records: 6 years, subject to accountant confirmation | `UNKNOWN` / `REQUIRES INDEPENDENT REVIEW` | Not a code question; needs the accountant's confirmation the founder decision itself flags |
| Inactivity: 24 months, 30-day guardian warning, keep/download/delete, default deletion/anonymisation on no response | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No inactivity-tracking job, no warning-email mechanism, no automatic action found anywhere in the codebase |
| Open incidents may be retained pending resolution | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No incident/legal-hold flag exists on any retention-relevant table |
| A physical card alone does not justify indefinite retention | ⚪ Policy statement, not a code question | Recorded for completeness |

**Summary: every specific retention period the founder just set has no automated enforcement anywhere in the codebase today.** This matches — and sharpens with real numbers — the prior Gate 2 pass's finding that "no retention policy or deletion job exists," and the original DPIA's own R20 risk. See the [retention schedule](./retention-schedule-v1.md) for the full period-by-period record.

**Smallest safe work package (not implemented in this pass):** a single scheduled job (Vercel Cron or equivalent) that (a) deletes `builder_submission_capabilities`/`squad_invite_participation_assets` reservations past their own `expired` state and any orphaned S3 objects they reference, and (b) flags — not yet auto-deletes — profiles crossing the 24-month inactivity threshold for staff review, would close the two highest-volume gaps without building the full guardian-facing warning/response flow in one step.

---

## Deletion (decision 18)

Builds on `docs/pilot/child-data-deletion-runbook.md`, re-verified this pass:

| Founder requirement | Status | Evidence |
|---|---|---|
| Acknowledge within 2 working days | `VERIFIED BY DOCUMENT` (as a target, not enforced) | Runbook's own "Pilot operational target" section — explicitly informal, unenforced |
| Internal 14-calendar-day completion target | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No SLA tracking/alerting exists anywhere in the codebase; the runbook's own target was 2 days to *acknowledge*, not the new 14-day completion figure — the runbook needs updating to match this founder decision, not just cross-referencing |
| Statutory ~1 month legal response deadline | ⚪ Legal fact, not a code question | Recorded for completeness |
| Proportionate requester verification | `VERIFIED BY DOCUMENT` | Runbook §1 |
| Freeze disputed requests | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No dispute/freeze mechanism on deletion requests specifically (distinct from the general authority-dispute gap above) |
| Delete DB records, images, derivatives, PDFs, public links, guardian relationships, NFC claim links | `PARTIALLY VERIFIED IN CODE` | DB cascade confirmed correct in the prior Gate 2 pass (direct production FK inspection); S3 object deletion is a manual runbook step, correctly sequenced but not automated; **"NFC claim links" specifically cannot currently be deleted/invalidated at all — same gap as the card-lifecycle section above**, since no claim-token revocation exists, deleting the player row leaves the physical card's token orphaned rather than actively invalidated (it will simply fail to resolve to a player once the row is gone, which is a side effect, not a deliberate revocation) |
| Request deletion from relevant suppliers | `FOUNDER DECISION — NOT YET IMPLEMENTED` / `REQUIRES SUPPLIER EVIDENCE` | No supplier-deletion-request mechanism or record found; depends on suppliers actually supporting deletion on request, which is unconfirmed for most (see supplier register) |
| Keep only records required by law | `VERIFIED BY DOCUMENT` (intent) | Runbook §5's "audit record without retaining deleted child data" principle |
| Retry/escalate failed deletion jobs | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No automated jobs exist to retry; the one documented failure-recovery queue (`/staff/pending-auth-deletions`) covers only the Supabase Auth API failure case, not S3/supplier failures |
| Send completion confirmation | `VERIFIED BY DOCUMENT` | Runbook §4 |
| Document backup expiry, prevent restored backups from recreating deleted data | `UNKNOWN` | Backup policy is a Supabase-platform question this pass could not verify without accessing platform administration outside the scope of a read-only Postgres-catalog/code review |

**Test required (future, disposable project only):** the full synthetic deletion test plan already specified in the prior Gate 2 pass's report — create a synthetic player with photo/moment/card, run the runbook end to end, verify DB cascade, S3 removal, public-link 404, and claim-token behaviour (note: it will fail-closed by orphaning, not by active revocation — confirm this distinction is acceptable pending the card-lifecycle work above, or treat it as a second reason that work is urgent).

---

## Coach access (decision 19)

| Founder requirement | Status | Evidence |
|---|---|---|
| Expires at end of each football season | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No season-linked expiry on `coach_team`/`coach_players`; confirmed in the prior Gate 2 pass and unchanged |
| Guardian or staff can revoke immediately | `VERIFIED IN CODE` | Guardian/coach direct-connection removal exists (`players/[id]/coach-connections/[coachProfileId]/route.ts`, prior Gate 2 pass finding); confirmed this pass to trigger a `story_updates` notification to the guardian (`route.ts:81-88`) |
| Club safeguarding report can trigger suspension | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No safeguarding-report-to-access-suspension mechanism exists |
| Access renewed for a new season | `FOUNDER DECISION — NOT YET IMPLEMENTED` | No season-renewal concept exists at all |
| Former coaches lose access | `PARTIALLY VERIFIED IN CODE` | True only if someone (guardian or coach) actively removes the connection — there is no automatic trigger tied to employment/season/club-departure |
| Historical approved achievements may remain | `UNKNOWN` — depends on decision #8 (achievement badges), which is not built at all yet, so this is currently moot |
| All access changes audited | `FOUNDER DECISION — NOT YET IMPLEMENTED — this is not a full audit trail** | Coach removal produces a `story_updates` row, but that table is a one-way **guardian notification**, not a compliance audit log: it has no staff/service-role read path and no documented immutability guarantee (`supabase/migrations/0025_story_updates.sql:34-36` scopes SELECT to the recipient guardian only). A genuine audit record (comparable to `squad_invite_audit_events`'s 19-event, staff/service-role-only, RLS-locked table) does not exist for coach access changes. |

---

## Safeguarding and incident handling (decision 20)

Mostly process/organisational, not code — classified accordingly:

| Founder requirement | Status |
|---|---|
| Visible safeguarding contact method | `FOUNDER DECISION — NOT YET IMPLEMENTED` — no in-app reporting route found in either Gate 2 pass, matching the original DPIA's own "Online tools: ❌ Not addressed" finding |
| Immediate escalation of serious concerns / emergency services where needed | ⚪ Process, not code |
| Suspend affected profiles/cards | `FOUNDER DECISION — NOT YET IMPLEMENTED` — depends on the card-lifecycle work above, which doesn't exist yet; public-profile disable alone (which does exist) is a partial substitute only |
| Preserve evidence securely, not via WhatsApp/general email | ⚪ Process, not code — no evidence-preservation tooling exists or was expected to |
| Maintain incident and breach logs | `FOUNDER DECISION — NOT YET IMPLEMENTED` — no incident-log table or mechanism found in the schema |
| Escalate to club/CFA as appropriate | ⚪ Process, not code |
| Notify ICO within 72 hours where threshold met / notify affected families where high risk | ⚪ Process, not code — genuinely a legal/operational trigger, not something to build in advance beyond having the capability to act fast, which depends on the card/profile-suspension gaps above |
| Post-incident review | ⚪ Process, not code |

**The one clearly buildable near-term gap here is the visible safeguarding/report contact route** — everything else in this section is process design, not engineering.

---

## Audit logging — full inventory (feeds decisions 15, 18, 19, 20)

| Mechanism | Captures | Read access | Gap |
|---|---|---|---|
| `moment_visibility_changes` | Every visibility change, incl. bulk unpublish | Guardian of that player only | No staff/service-role read policy |
| `squad_invite_audit_events` | 19 defined event types across the full campaign lifecycle | Staff/service-role only, RLS-locked | None found — this is the best-built audit mechanism in the codebase |
| `orders.approved_by`/`approved_at` | Latest approval only, single row, no history | Anyone who can read the order | Not append-only; a re-approval overwrites, no history of prior states |
| `player_deletion_requests` | Deletion request lifecycle with attestation fields | Guardian (own) + broad `authenticated` SELECT grant | Grant may be broader than necessary — worth a tightening review |
| `story_updates` | Guardian notifications (coach connected/removed, moment verified, etc.) | Recipient guardian only | Not a compliance audit log — no staff/service-role visibility, not documented as immutable |
| **Public-profile enable/disable/rotate** | **Nothing** | — | **`staff/players/[id]/public-profile/route.ts` performs zero audit insert** despite its own doc comment describing itself as "the administrative kill switch" — this is the exact mechanism the DPIA and this founder's own decision #15 lean on for lost/compromised-card containment, and it currently leaves no trace of who disabled/rotated what, when |
| **Exact-DOB reads** (`get_player_date_of_birth`) | **Nothing** | — | Every coach view of a raw date of birth is untracked — relevant until decision #1 (remove exact DOB) is actually implemented |
| **Player/guardian-account deletion completion** | Only the *request*, not confirmation of actual erasure | Staff (if they fill in the attestation) | No automated confirmation that the runbook's steps were actually completed correctly |

**Recommend, in priority order:** add an audit insert to the public-profile kill-switch route first (it's the one piece of incident-response tooling that already exists and is silently untracked); then close the coach-access-change and DOB-read gaps.

---

## Marketing claims — cross-reference

Already classified in the prior Gate 2 pass (SUPPORTED / PARTIALLY SUPPORTED / NOT SUPPORTED / CANNOT PROVE for "Private," "Secure," "Guardian controlled," and "Parents only see their own child's details"). This pass's new findings **strengthen the case for narrower interim wording, not weaken it** — the public-profile field-exposure gap (decision D5, above) and the ordinary-builder authority gap (decision 13) are both new, concrete reasons "Private"/"Guardian controlled" should not be stated as unconditional facts. See the founder decision register and the revised DPIA's claim-substantiation section for the updated verdicts.
