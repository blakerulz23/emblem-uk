# Notes on the salvaged pieces from Matt's first (closed) PR

Matt's first PR (`feat/moderation-and-compliance-drafts`) was cut from
stale main (pre-Phase-1) and would have deleted Phase 1 + 2. The PR
was closed, branch deleted. This branch (`feat/pwa-manifest-and-runbook`)
rebases the safe, non-conflicting pieces onto current main.

## What's in this branch

- `public/manifest.json` + `layout.tsx` metadata reference — closes the
  audit MEDIUM "Can't be installed as an app" finding.
- `docs/infra/s3-london-bucket-setup.md` — runbook for moving media to
  a UK-hosted bucket before real family data flows.

## What is NOT in this branch (needs separate PRs, some need decisions)

1. **Guardian data export + delete API + `/os/settings` page** — closes
   ICO right-of-access and right-to-erasure code gaps. Own PR because
   it adds a new migration (would be `0007_guardian_erasure.sql`, not
   the `0004` collision from my first attempt).

2. **`/os/privacy` + `/os/terms` first drafts + solicitor request email**
   — separate PR, marked "DRAFT — pending solicitor review." Blake's
   compliance checklist explicitly says shipping legal copy without
   review is premature; this PR ships as drafts alongside the checklist,
   not linked from any live surface until the solicitor signs off.

3. **Seed data (`seed.sql` + `seed_link_me.sql`)** — needs updating
   for Phase 1/2 tables (cards, orders, claim tokens) before it's
   useful; the pre-Phase-1 version I wrote is now incomplete.

4. **Moderation gate migration + endpoint** — DROPPED entirely. Blake's
   Phase 1 already ships this as `/api/os/moments/verify` with real
   coach approve/reject wired to the DB. Redundant.
