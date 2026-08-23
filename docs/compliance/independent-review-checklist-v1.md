# Independent-Review Checklist and Sign-Off — Emblem (Lauda Cartoons Ltd)

**Version:** 1.0
**Date:** 24 August 2026
**Status:** Controlled draft. Nothing in this document constitutes the review itself — it is the checklist for that review to work through, and the sign-off section stays blank until it happens.

## What this pass reconciled

This document set (the revised [Children's DPIA](./childrens-dpia-v0.2.md), the [founder decision register](./founder-decision-register-v1.md), the [controls-and-tests matrix](./gate2-controls-tests-matrix-v1.md), the [retention schedule](./retention-schedule-v1.md), and the [supplier register](./supplier-register-v1.md)) was produced by reconciling 23 founder decisions against direct inspection of the actually-deployed source code and production database schema — not against what documentation claims should be true. Every material factual claim is cited to a specific file, line, or production catalog query.

## Consultation required before approval (founder decision 23)

- 2–3 parents/guardians
- 1 grassroots coach
- 1 trained Club Welfare Officer or safeguarding professional
- A small number of U8–U16 children, with guardian involvement, using fictional-player demonstrations wherever possible

None of this consultation has taken place as part of this documentation pass. It is a prerequisite this pass records, not one it can satisfy.

## Independent review checklist

For the reviewer(s) — safeguarding specialist, UK data-protection specialist, and the not-yet-named Safeguarding Lead — to work through:

- [ ] Confirm the controller/lawful-basis analysis in the revised DPIA is legally sound, purpose by purpose (not a blanket consent basis — see the DPIA's own lawful-basis table).
- [ ] Confirm whether the background-removal-via-Gemini finding (founder decision register, D11) requires pausing real-child use of that feature pending supplier evidence, or whether an alternative mitigation is acceptable.
- [ ] Confirm whether the ordinary builder's near-total absence of authority/consent controls (founder decision register, decision 13 section) means real pilot orders must go through Squad Invite exclusively until closed.
- [ ] Confirm the card-suspension/revocation gap (controls-and-tests matrix) is an acceptable residual risk for an 8–12 week, ≤30-player pilot, or a hard blocker.
- [ ] Review the public-profile field-exposure finding (founder decision register, D5) and confirm no real family should be offered public sharing until it's closed.
- [ ] Review the four marketing-claim verdicts (SUPPORTED / PARTIALLY SUPPORTED / NOT SUPPORTED / CANNOT PROVE) in the revised DPIA and approve or amend the recommended interim wording.
- [ ] Confirm the DPO decision record's reasoning (no statutory DPO required at current pilot scale).
- [ ] Confirm the retention schedule's periods are legally defensible, and specifically the accounting/payment 6-year period once the accountant has confirmed it.
- [ ] Identify and name the independent Safeguarding Lead (founder decision register, G3) — this checklist itself cannot be completed by someone in that role until they exist.
- [ ] Confirm whether Rebecca's proposed backup-adult role (G4) needs to be operationalised (least-privilege account definition) before or after this review.
- [ ] Confirm the AWS S3 UK-region migration (founder decision register, P1) has actually completed, using AWS console access this pass did not have and should not have used even if available.

## Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Accountable controller executive (Lauda Cartoons Ltd) | | | |
| Independent Safeguarding Lead | *(not yet named — see founder decision register G3)* | | |
| UK data-protection specialist | | | |
| Interim Privacy Lead | Blake Ugo-Ogbonna | *(recorded decisions above; formal DPIA sign-off withheld pending the rows above)* | |

**No row above being blank should be read as approval by omission.** The DPIA remains a controlled draft, not formally approved, until every applicable row here is completed by the named person, not inferred from their absence.
