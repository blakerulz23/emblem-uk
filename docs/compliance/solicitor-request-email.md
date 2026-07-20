# Solicitor / Data Protection Officer — request for review

_Draft email you can send to a UK data protection solicitor or an
outsourced DPO service (e.g. DPO Centre, GRCI Law, Bird & Bird's DPO
service). Fill in the bracketed items and send with the three artifacts
attached._

---

**Subject:** Review request — children's data product (Emblem OS) pre-launch privacy assessment

Hi [solicitor's first name],

We're preparing to launch a UK product called Emblem OS. It's the app
that a family uses after buying an Emblem NFC card — the card links to
a private digital profile of the child (a grassroots football or rugby
player, typically age 8–14) with photos, videos, and coach-recorded
skill notes.

Because we're storing personal data about children, we want a proper
review under UK GDPR and the ICO's Age Appropriate Design Code
("Children's Code") **before any real family's data touches the system.**
The build is functionally complete; deployment is gated on your review.

## What we'd like reviewed

1. **Our compliance self-assessment** — attached as
   `children-data-checklist.md`. This is a code-level map against each
   Children's Code standard, with ✅/🟡/❌ status and file citations so
   you can see exactly where each design decision lives.

2. **The two user-facing legal pages** we've drafted as a starting point
   — attached as `privacy-draft.md` and `terms-draft.md`. Both are
   marked as drafts and both are wording we want you to correct, expand,
   or replace.

3. **The engineering audit** — attached as
   `production-readiness-audit.pdf`. Not a legal document, but it gives
   you the fuller picture of what's built and what isn't.

## What we're specifically unsure about

- Whether "the parent holds the account and consents on the child's
  behalf" is the right framing across the whole 8–14 age range, or
  whether we need a different model above a certain age.
- What our retention default should be, and whether we need active
  deletion or just deletion-on-request.
- Whether the current data flow to a Sydney (ap-southeast-2) S3 bucket
  triggers UK international-transfer requirements — we plan to move to
  a UK bucket before launch but want to know if there's a reason to
  hold shipping until that's done.
- Any Data Protection Impact Assessment we should complete before real
  families onboard.

## Practical

- **We are:** Lauda Collective Ltd
- **Product URL:** `emblem-uk.vercel.app` (production; not yet
  connected to real user data)
- **Data hosts:** Supabase Postgres (London, eu-west-2), AWS S3
  (currently ap-southeast-2, moving to eu-west-2)
- **Expected launch:** [target date]
- **Budget for review + drafting:** [range]

Would you have capacity in the next [2–3] weeks for a first-pass review
+ a call to discuss the ❌ items? If not, could you recommend someone
who does?

Thanks,
[Your name]
Lauda Collective

---

_Attach:_
- `docs/compliance/children-data-checklist.md`
- `src/app/os/privacy/page.tsx` (or a rendered PDF of it)
- `src/app/os/terms/page.tsx` (or a rendered PDF of it)
- `Emblem OS - Production Readiness Audit (2).pdf`
