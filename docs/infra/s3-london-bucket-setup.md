# Move Emblem OS media to a UK-hosted S3 bucket

This closes the "AWS bucket is in Sydney" follow-up flagged in the
compliance checklist and the `/os/privacy` draft. UK children's data
sitting in `ap-southeast-2` triggers UK GDPR international-transfer
requirements — moving to `eu-west-2` (London) removes that friction
entirely.

## Order of operations

1. **Create the new bucket** — AWS Console → S3 → Create bucket
   - Name: `emblem-uk-moments-prod` (globally unique — add `-01` suffix if taken)
   - Region: **EU (London) eu-west-2**
   - Block all public access: **ON** (default; keep on)
   - Bucket versioning: **Enable** (safety net for accidental deletes; small storage cost)
   - Encryption: **SSE-S3** (default; free)
   - Object Ownership: **Bucket owner enforced**

2. **Attach a lifecycle rule** to control storage cost as things scale:
   - Rule name: `stale-media-cleanup`
   - Scope: apply to all objects
   - Transition to Intelligent-Tiering after 30 days
   - Delete incomplete multipart uploads after 7 days
   - (Do NOT set an automatic expiration until you've decided the retention policy — that's a legal/product decision, not a cost one.)

3. **Create a new IAM user scoped only to this bucket** — do NOT reuse the
   existing `youthcards-print-files` credentials. Blast radius should be
   small enough that if the emblem-uk key ever leaks, no other bucket is
   at risk.
   - Name: `emblem-uk-s3-writer`
   - Attach inline policy (JSON below)
   - Create access key -> download the CSV (this is your only chance to
     see the secret)

   Inline policy JSON:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "MomentsBucketRW",
         "Effect": "Allow",
         "Action": [
           "s3:GetObject",
           "s3:PutObject",
           "s3:DeleteObject",
           "s3:ListBucket",
           "s3:GetObjectVersion",
           "s3:DeleteObjectVersion"
         ],
         "Resource": [
           "arn:aws:s3:::emblem-uk-moments-prod",
           "arn:aws:s3:::emblem-uk-moments-prod/*"
         ]
       }
     ]
   }
   ```

4. **Update Vercel env vars** on the `emblem-uk` project (both Production
   and Preview) with the new values:
   - `AWS_REGION` = `eu-west-2`
   - `AWS_S3_BUCKET` = `emblem-uk-moments-prod`
   - `AWS_ACCESS_KEY_ID` = (from step 3 CSV)
   - `AWS_SECRET_ACCESS_KEY` = (from step 3 CSV) — mark Sensitive
   - Delete any old AWS values pointing at the Sydney bucket.

5. **Redeploy** so the new env vars are picked up.

## Do you need to migrate existing objects?

- **Pre-launch:** No. Zero real media exists yet; the Sydney bucket won't
  have anything worth moving.
- **Post-launch:** If any real user media has been written to Sydney,
  copy with `aws s3 sync s3://youthcards-print-files/ s3://emblem-uk-moments-prod/`
  under the OLD credentials, then flip env vars. Coordinate with a
  brief maintenance window since S3 keys stored in the moment_media
  table need to still resolve during the copy.

## Verification

After redeploy, `POST /api/os/moments/upload` should return an S3 key
in `emblem-uk-moments-prod`, not `youthcards-print-files`. If it
doesn't, the env var didn't propagate.
