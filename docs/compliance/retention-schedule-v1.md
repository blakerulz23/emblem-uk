# Retention Schedule — Emblem (Lauda Cartoons Ltd)

**Version:** 1.0
**Date:** 24 August 2026
**Status:** Controlled draft recording founder-decided retention periods. **None of the periods below are currently enforced by automation** — see the "Automation status" column, cross-referenced in full technical detail in the [Gate 2 controls-and-tests matrix](./gate2-controls-tests-matrix-v1.md).

| Data category | Retention period (founder decision) | Trigger | Automation status | Manual fallback |
|---|---|---|---|---|
| Abandoned/incomplete uploads | 7 days | Upload started, order never finalised | Not automated | None currently — orphaned objects persist until manually found |
| Original uncropped photograph | 30 days after confirmed delivery | Delivery confirmation | Not automated | Manual, via the deletion runbook, only if a deletion request is filed |
| Processed private-profile image | While the profile remains active, unless the guardian removes it | Guardian action (removal), or account/player deletion | Guardian-initiated removal exists in code; automatic expiry tied to inactivity does not | Guardian self-service removal (`players/[id]/photo` route); otherwise persists indefinitely absent guardian action |
| Card artwork / print PDF | 90 days after delivery | Delivery confirmation | Not automated | Manual, via the deletion runbook |
| Deletion requests | Override routine retention where legally permitted | Guardian or staff-filed request | Manual staff process (runbook), not automated | The runbook itself, `docs/pilot/child-data-deletion-runbook.md` |
| Accounting / payment / refund records | 6 years, subject to accountant confirmation, children's data removed/minimised where possible | Transaction date | Not a code question — awaiting accountant confirmation per the founder's own decision wording | N/A |
| Inactive profiles | 24 months of inactivity → 30-day guardian warning → keep/download/delete choice → default deletion/anonymisation on no response | Last activity timestamp | Not automated — no inactivity-tracking job, no warning mechanism, no default action found anywhere in the codebase | None currently |
| Open incidents | May be retained until resolved, overriding the above | Incident opened | No incident/legal-hold flag exists on any table | Manual, would need to be tracked outside the product entirely today |
| Physical card | Does not by itself justify indefinite data retention | N/A | ⚪ Policy statement | N/A |
| Print PDFs specifically (AWS S3, decision 22) | 90 days post-delivery, short-lived signed links only | Delivery confirmation | Signed-link short expiry is `VERIFIED IN CODE` (15 min for anonymous/builder paths, 1 hour for staff); the 90-day **deletion** itself is not automated | Manual |

## What this schedule does not yet answer

- **Backup retention and post-restore reconciliation** — `UNKNOWN`. This is a Supabase/AWS platform-configuration question outside what a read-only Postgres-catalog and code review in this pass could confirm. Needs direct platform-administration confirmation, not inference.
- **Whether the AWS S3 bucket holding these objects is actually in the UK region** — `UNKNOWN`, see the founder decision register's P1 entry. `docs/infra/s3-london-bucket-setup.md` documents an *intended* migration to `eu-west-2`; this pass could not confirm it has completed without accessing sensitive AWS credential values, which it must not do.
- **Email-provider (Resend) data retention** — `REQUIRES SUPPLIER EVIDENCE`, see the supplier register.

## Recommended smallest safe automation (not implemented in this pass)

A single scheduled job that (a) purges expired/abandoned upload reservations (`builder_submission_capabilities`, `squad_invite_participation_assets`, both already have an `expired` state to key off) and their orphaned S3 objects, and (b) flags — not yet auto-actions — profiles crossing the 24-month inactivity mark for staff review, closes the two highest-volume gaps in this schedule without building the full guardian-facing warning/response flow in one step.
