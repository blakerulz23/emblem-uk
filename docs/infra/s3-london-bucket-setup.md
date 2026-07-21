# Move Emblem OS media to a UK-hosted S3 bucket

This closes the "AWS bucket is in Sydney" follow-up flagged in the
compliance checklist. UK children's data sitting in `ap-southeast-2`
triggers UK GDPR international-transfer requirements — moving to
`eu-west-2` (London) removes that friction.

## Order of operations

1. **Create the new bucket** — AWS Console → S3 → Create bucket
   - Name: `emblem-uk-moments-prod`
   - Region: **EU (London) eu-west-2**
   - Block all public access: **ON** (default; keep on)
   - Bucket versioning: **Enable**
   - Encryption: **SSE-S3** (default)
   - Object Ownership: **Bucket owner enforced**

2. **Lifecycle rule** for storage cost:
   - Transition to Intelligent-Tiering after 30 days
   - Delete incomplete multipart uploads after 7 days
   - No automatic expiration until retention policy is decided

3. **Create a new IAM user scoped only to this bucket** — do NOT reuse
   the storefront credentials.
   - Name: `emblem-uk-s3-writer`
   - Inline policy JSON:

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

4. **Update Vercel env vars** on the `emblem-uk` project:
   - `AWS_REGION` = `eu-west-2`
   - `AWS_S3_BUCKET` = `emblem-uk-moments-prod`
   - `AWS_ACCESS_KEY_ID` = (from new IAM user)
   - `AWS_SECRET_ACCESS_KEY` = (from new IAM user) — mark Sensitive

5. **Redeploy.**

## Do you need to migrate existing objects?

- **Pre-launch:** No.
- **Post-launch:** `aws s3 sync` from old bucket to new under the OLD
  credentials, then flip env vars during a brief maintenance window.

## Verification

`POST /api/os/moments/upload` should return an S3 key in
`emblem-uk-moments-prod`, not `youthcards-print-files`.
