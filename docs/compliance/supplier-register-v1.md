# Supplier / Subprocessor Evidence Register — Emblem (Lauda Cartoons Ltd)

**Version:** 1.0
**Date:** 24 August 2026
**Status:** Controlled draft. Records what data each supplier receives (per founder decision 21, minimum-necessary) and what compliance evidence is confirmed present versus still required. **No supplier contract, DPA, or subprocessor list was read or exists in this repository** — this register can only confirm what the *code* sends, not what the *supplier* legally commits to. Contractual evidence must come from Blake/procurement, not from this codebase.

| Supplier | What it receives (per founder decision + code evidence) | Role (provisional) | DPA/contract evidence | Subprocessors/transfers | Status |
|---|---|---|---|---|---|
| **Shopify** | Adult purchaser, order and payment information only, per founder decision 21. `VERIFIED IN CODE`: the `orders/paid` webhook handler reads only the webhook payload; the custom app is scoped to `read_orders` only, explicitly not `write_orders` (`docs/infra/shopify-webhook-setup.md`); the handler writes only to Emblem's own DB, never sends child-specific fields to Shopify | Likely independent controller for payment/platform purposes, processor for some merchant functions | `REQUIRES SUPPLIER EVIDENCE` | `REQUIRES SUPPLIER EVIDENCE` | Data flow confirmed minimal; contract terms not evidenced |
| **Printer** | Print-ready PDF and production reference only, per founder decision 21 | `UNKNOWN` — legal entity not identified anywhere in this repository, consistent with the original DPIA's own §13 unanswered question | `REQUIRES SUPPLIER EVIDENCE` | `REQUIRES SUPPLIER EVIDENCE` | **No printer identity evidenced anywhere in code or docs — this is a genuine unknown, not just missing paperwork** |
| **Courier** | Delivery information only, per founder decision 21 | `UNKNOWN` | `REQUIRES SUPPLIER EVIDENCE` | `REQUIRES SUPPLIER EVIDENCE` | Same as printer — no identity evidenced |
| **Resend (transactional email)** | Adult email and required message only, per founder decision 21. `VERIFIED IN CODE` (prior Gate 2 pass): the four Squad Invite lifecycle emails carry only the organiser's own email, team display name, and a link back to their own authenticated page — explicitly never a child's name, photo, delivery address, or the parent-facing invitation link itself | Processor | `REQUIRES SUPPLIER EVIDENCE` | `REQUIRES SUPPLIER EVIDENCE` | Data-minimisation confirmed in code; contract terms not evidenced |
| **Google Gemini (generative image API)** | **Full, uncropped child photograph, as of every real background-removal call in the live Squad Invite builder** — see the founder decision register's D10/D11 finding. This is a materially different (and more sensitive) data flow than founder decision 21's "background-removal provider: image only, with no unnecessary child metadata" implies as safe, because the image itself is the exact child-identifying content in question, and this pass found no retention/training/subprocessor commitment anywhere | `UNKNOWN` — likely processor, unconfirmed | `REQUIRES SUPPLIER EVIDENCE` — **none found, not even referenced in any document** | `REQUIRES SUPPLIER EVIDENCE` | **Highest-priority open item in this entire register — see founder decision register D11/D12** |
| **Meshy (image-to-3D)** | A hosted image URL only, not raw photo bytes (`VERIFIED IN CODE`, `src/lib/meshy.ts:24-41`); no call site exists in the child-photo/Squad Invite flow | `UNKNOWN` | `REQUIRES SUPPLIER EVIDENCE` | `REQUIRES SUPPLIER EVIDENCE` | Not currently reachable from real child data per this pass's code trace |
| **AWS S3** | Print PDFs and private media, with short-lived signed links (`VERIFIED IN CODE`, see the [retention schedule](./retention-schedule-v1.md)); founder decision 22 approves this specific pattern | Processor | `REQUIRES SUPPLIER EVIDENCE` (standard AWS terms, region-specific commitments) | Region **`UNKNOWN`** — see the founder decision register's P1 finding; `docs/infra/s3-london-bucket-setup.md` documents an intended London migration whose completion this pass could not confirm | Region confirmation is the most concrete, checkable next step here |
| **Supabase** | Database, authentication, all structured application data | Processor | `REQUIRES SUPPLIER EVIDENCE` | `REQUIRES SUPPLIER EVIDENCE` | Not newly assessed this pass; carried from the original DPIA's own unresolved question |
| **Vercel** | Application hosting, request logs, edge/serverless execution | Processor | `REQUIRES SUPPLIER EVIDENCE` | `REQUIRES SUPPLIER EVIDENCE` | Not newly assessed this pass |

## Required background-removal-specific assessment (founder decision 12)

Before any further real child photograph reaches the background-removal path, the founder decision itself specifies six items to assess. Current evidence for each, from this pass:

1. **Training or secondary use of uploaded images** — `REQUIRES SUPPLIER EVIDENCE`, none found.
2. **Retention and deletion** — `REQUIRES SUPPLIER EVIDENCE`, none found.
3. **Subprocessors and processing locations** — `REQUIRES SUPPLIER EVIDENCE`, none found.
4. **International transfers** — `REQUIRES SUPPLIER EVIDENCE`, none found; Google's processing location for the Generative Language API is not confirmed UK/EEA anywhere in this codebase.
5. **Contractual/DPA terms** — `REQUIRES SUPPLIER EVIDENCE`, none found.
6. **Encrypted transport and access controls** — `PARTIALLY VERIFIED IN CODE`: the request is HTTPS to `generativelanguage.googleapis.com` (standard TLS, not independently re-verified in this pass) and the `GEMINI_API_KEY` is a server-side-only environment variable, never exposed client-side — but this only covers transport-in-transit and app-side key handling, not Google's own internal access controls, which are outside what code review can confirm.

## Supplier deletion-on-request capability

Founder decision 18 requires requesting deletion from relevant suppliers as part of the deletion process. **No code or document in this repository confirms any supplier's actual capability or process for honouring such a request.** This is not evidenced as either present or absent — it is genuinely unassessed, and should not be assumed either way.
