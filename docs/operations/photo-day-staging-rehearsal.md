# Photo Day — staging rehearsal and release checklist

**For:** Blake (or whoever runs the release). **Branch:** `feat/photo-day`.
**Status (15 November 2026):** step 0.1 done in production; step 0.3 partly done (PR #143); **steps 1 and 2 done on staging**. Step 0.2 is waiting on Matt (the bucket is in his AWS account). Step 3 is not started.

Run the steps in order. Stop at the first failure.

## 0. Before anything

1. **0103: DONE in production, 15 Nov 2026.** Production was missing `coach_card_submitted` (confirmed read-only). A read-only pre-check found no allowed value or existing row outside 0103's list. The 0103 SQL was then applied by hand in the production SQL editor; verification returned `fix_applied = true` and `convalidated = true`. Code: PR #144 (`fix/restore-squad-invite-audit-events`). 0103 is idempotent, so re-running it on staging is safe.
2. **S3 versioning (release blocker; affects the whole app, not only Photo Day).** `docs/infra/s3-london-bucket-setup.md` says the bucket has versioning **on** and no expiry rule. On a versioned bucket, `deleteObject` only adds a delete marker; the bytes stay as a hidden old version. So retention and child-data erasure would hide photos, not delete them. In the AWS console, check the bucket, then add this lifecycle rule:
   - "Permanently delete noncurrent versions of objects": **1 day** after they become noncurrent.
   - "Delete expired object delete markers": **on**.
   - Scope: whole bucket. That also fixes the existing erasure and artwork-retention paths.
3. **Vercel crons (partly done, 15 Nov 2026).** Confirmed live: all five old sweeps returned 405 to Vercel's GET, so they never ran. PR #143 fixed overdue-payments, ready-to-finalise and abandoned-uploads. `sweep-expired-artwork` and `sweep-expired-card-share-public-pages` are still POST-only (step 2 needs a backlog count first). The new `sweep-photo-day-retention` accepts GET.
   - **Production bucket owner:** `emblem-uk-moments-prod` (eu-west-2) is in **Matt's** AWS account, not Emblem UK 191178643043. The lifecycle rule in 0.2 has to be added by him.
   - **Previews share the production bucket.** `AWS_S3_BUCKET`, `AWS_REGION` and the keys are set for All Environments / Production. Step 3 must override them for the preview, for example to `emblem-squad-invite-disposable-20260816-uk` in account 191178643043.
4. **`CRON_SECRET`: set in Vercel Production on 15 Nov 2026.** A preview needs its own value.

## 1. Apply the migrations to staging

Prove the target first. It must be staging ref `rqgrpaprfxxhcvqtwhgj`, never production `ksszgbcditlfimnfnzla` (see `supabase/verification/hosted_staging_runbook.md`).

Apply, in order: `0103` → `0104` → `0105` → `0106` → `0107`. Use the same method as the existing staging runbook (`supabase db push` against the linked staging project, or the staging SQL editor).

**DONE 15 Nov 2026.**
- Before applying, staging tracked migrations up to `0101`, plus `0097_coach_account_deletion_verified_moments` and `0098_deletion_review_suspension_and_verifier_identity`, which come from the coach-deletion work and aren't on this branch. Neither one changes any object that 0103–0107 replace, and Photo Day's foreign keys point only at `staff_accounts`.
- Each file was applied in its own transaction, and a `supabase_migrations.schema_migrations` row (version and name) was added in the same transaction. All five applied cleanly.

## 2. Read-only check of staging

```
npm install --no-save pg
node supabase/tests/photo_day_staging_verify.mjs
```

The script needs `.env.staging.local` with `STAGING_SUPABASE_DB_URL`. It aborts unless the URL is staging, and runs in one read-only transaction that is rolled back. Expect every line to be `PASS`. It checks:
- the audit and consent lists;
- RLS and no anon/authenticated access;
- each of the 14 functions: definer, empty `search_path`, service_role only;
- that the erasure function has the Photo Day block.

The same SQL was dry-run against the in-memory database on the branch (89 PASS).

**DONE 15 Nov 2026: 89 PASS, 0 FAIL on hosted staging.**

## 3. End-to-end on a staging preview (real S3)

Deploy `feat/photo-day` as a Vercel **preview**:
- point Supabase at staging;
- set `SQUAD_INVITE_MVP_ENABLED=true`;
- use AWS credentials for a **non-production bucket or prefix**;
- set `CRON_SECRET`.

Use synthetic people only (no real children or photos; stock or self-taken test images). Tick each step:

| # | Step | Expect |
|---|---|---|
| 1 | Create a Squad Invite and approve it as staff | Campaign active |
| 2 | Staff page → Photo Day → add the day (today + 2) | Panel shows the date, venue and a delete-by date |
| 3 | Try to issue a link | Refused: coach permission first |
| 4 | Confirm coach permission with a note; issue a 24 h link | Link shown once; copy it |
| 5 | Parent A joins → Photo Day step → **Yes**, name, initial, number | Lands in the builder with the shirt number filled in |
| 6 | Parent B joins → **No** | Builder, no Photo Day section |
| 7 | Matching page before upload | Parent A on the shoot list, B absent |
| 8 | Open the photographer link on a phone; upload 5 photos (including one over 4.5 MB and one HEIC from an iPhone) | All sent; S3 has 5 `.jpg` under `photo-day/{dayId}/` with **no EXIF/GPS** (check one with `exiftool`) |
| 9 | Parent C joins now → Photo Day step | Not offered (shoot already taken) |
| 10 | Match 2 photos to A. Try to match one to B | A works; B is refused (no permission) |
| 11 | Parent A's builder before publishing | "will appear once matched", no photos |
| 12 | Publish to parents | Status published; the photographer link now fails |
| 13 | Parent A's builder: tap one of the photos, crop, remove background, send the card | Exactly 2 photos offered; card committed with its photo stored under `order-assets/{participation}/` |
| 14 | Parent B tries A's photo URL (`/api/squad-invite-participations/{A}/photo-day-photos/{id}`) | 404 |
| 15 | Second parent D (Yes before the shoot, matched, published) → Withdraw in the builder | Photos gone from the builder; staff page shows them unmatched; D's name gone from the staff list |
| 16 | Parent A asks for deletion; staff execute the erasure | Erasure completes; A's 2 Photo Day objects are gone from S3 (check versions too, after step 0.2) |
| 17 | Retention: set the day's `photos_delete_after` to the past in the staging SQL editor, then `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/internal/cron/sweep-photo-day-retention` | `daysClosed: 1`; the `photo-day/{dayId}/` prefix is empty; the panel says "All photos were deleted on …" |
| 18 | Organiser dashboard | Children who only said Yes to Photo Day aren't listed as joined |

Clean up the synthetic campaign afterwards, as in the existing staging runbook.

## 4. Release

Only after steps 0–3 all pass:
- merge `feat/photo-day`;
- apply 0104–0107 to production (0103 already shipped);
- run `photo_day_staging_verify.mjs`'s checks read-only against production by hand. The script itself refuses production on purpose.

Before the first real shoot, the DPIA's "REQUIRES DECISION / SPECIALIST REVIEW" items still apply (`docs/compliance/childrens-dpia-v0.1.md`, Photo Day addendum).
