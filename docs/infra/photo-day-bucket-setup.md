# Photo Day bucket: setup

**For:** whoever sets up or audits Photo Day storage.
**Why:** Photo Day photos go to their own S3 bucket in the Emblem UK AWS account (191178643043), not the main bucket (`AWS_S3_BUCKET`, in an account Emblem UK doesn't control). Parents are told every photo is permanently deleted within 30 days of the team order closing, and never later than 60 days after the shoot. That is only true if the bucket permanently removes old versions, so this bucket gets the right lifecycle rule from day one.

Code: `src/lib/photo-day-storage.ts`. **In production, Photo Day refuses to store anything unless all four settings below are present.** It never falls back to the main bucket there.

## 1. Bucket (S3 console, region Europe (London) eu-west-2)
- **Name:** `emblem-photo-day-prod`, or similar.
- **Access:** Block all public access: **on**.
- **Versioning:** **off**. Deletes are then immediate and final.
- **Encryption:** default (SSE-S3).
- **Lifecycle rule** (Management → Create lifecycle rule; scope: whole bucket). This is a safety net in case versioning is ever switched on:
  - Permanently delete noncurrent versions: **1 day**.
  - Delete expired object delete markers: **on**.
  - Delete incomplete multipart uploads: **1 day**.

## 2. IAM user (no console access)
**User name:** `emblem-photo-day-prod`.

**Inline policy:** only this bucket.

```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],"Resource":["arn:aws:s3:::emblem-photo-day-prod","arn:aws:s3:::emblem-photo-day-prod/*"]}]}
```

`s3:ListBucket` is required: the retention sweep lists `photo-day/{dayId}/` to confirm the folder is empty before closing the day.

**Access key:** create one with the use case "Application running outside AWS".

## 3. Vercel (Production)

| Name | Value | Type |
|---|---|---|
| `PHOTO_DAY_S3_BUCKET` | `emblem-photo-day-prod` | Config |
| `PHOTO_DAY_AWS_REGION` | `eu-west-2` | Config |
| `PHOTO_DAY_AWS_ACCESS_KEY_ID` | the access key id | Secret |
| `PHOTO_DAY_AWS_SECRET_ACCESS_KEY` | the secret | Secret |

Redeploy production afterwards.

## Previews and local dev
If `PHOTO_DAY_S3_BUCKET` is unset outside production, the main `AWS_*` settings are used. That way the `feat/photo-day` preview keeps using its disposable test bucket.

## Check after deploy
Schedule a Photo Day on a synthetic campaign and upload one test photo, with no children in it. The object should appear under `photo-day/{dayId}/` in **emblem-photo-day-prod**, not in the main bucket. Then delete the test campaign's day by moving its delete date into the past and running the sweep, as in the staging rehearsal (step 17).
