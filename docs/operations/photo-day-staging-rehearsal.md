# Photo Day — staging rehearsal and release checklist

**For:** Blake (or whoever runs the release). **Branch:** `feat/photo-day`.
**Status:** prepared 15 November 2026, **not run**. Nothing here has touched staging or production.

Run the steps in order. Stop at the first failure.

## 0. Before anything

1. **Ship 0103 on its own first** (`fix/restore-squad-invite-audit-events`, now `73a4167`). To confirm production needs it, run read-only in the production SQL editor:
   ```sql
   select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'squad_invite_audit_events_event_type_check';
   ```
   If `coach_card_submitted` is missing, coach card submit/lock, photo rejection and campaign reopen are failing in production today.
2. **S3 versioning (release blocker; affects the whole app, not only Photo Day).** `docs/infra/s3-london-bucket-setup.md` says the bucket has versioning **on** and no expiry rule. On a versioned bucket, `deleteObject` only adds a delete marker; the bytes stay as a hidden old version. So retention and child-data erasure would hide photos, not delete them. In the AWS console, check the bucket, then add this lifecycle rule:
   - "Permanently delete noncurrent versions of objects": **1 day** after they become noncurrent.
   - "Delete expired object delete markers": **on**.
   - Scope: whole bucket. That also fixes the existing erasure and artwork-retention paths.
3. **Vercel crons don't run today (separate fix, your call).** Vercel Cron calls with **GET**, but the five existing sweeps in `vercel.json` only export POST, so they likely return 405 and never run. Check Vercel → project → Cron Jobs / logs. The new `sweep-photo-day-retention` accepts GET. Fixing the old five would suddenly start real deletions (for example 90-day artwork), so decide that separately.
4. **`CRON_SECRET`** must be set in Vercel. Without it, every cron returns 401.

## 1. Apply the migrations to staging

Prove the target first. It must be staging ref `rqgrpaprfxxhcvqtwhgj`, never production `ksszgbcditlfimnfnzla` (see `supabase/verification/hosted_staging_runbook.md`).

Apply, in order: `0103` → `0104` → `0105` → `0106` → `0107`. Use the same method as the existing staging runbook (`supabase db push` against the linked staging project, or the staging SQL editor).

## 2. Read-only check of staging

```
npm install --no-save pg
node supabase/tests/photo_day_staging_verify.mjs
```

The script needs `.env.staging.local` with `STAGING_DB_URL`. It aborts unless the URL is staging, and runs in one read-only transaction that is rolled back. Expect every line to be `PASS`. It checks:
- the audit and consent lists;
- RLS and no anon/authenticated access;
- each of the 14 functions: definer, empty `search_path`, service_role only;
- that the erasure function has the Photo Day block.

The same SQL was dry-run against the in-memory database on the branch (89 PASS).

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
