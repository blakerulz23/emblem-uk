import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION || 'us-east-1';
const bucket = process.env.AWS_S3_BUCKET || '';

export const s3 = new S3Client({
  region,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

/** Upload a Buffer to S3 and return the S3 key. */
export async function uploadObject(key: string, buffer: Buffer, contentType = 'application/octet-stream'): Promise<string> {
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/** Upload a PDF Buffer to S3 and return the S3 key. */
export async function uploadPdf(key: string, buffer: Buffer, contentType = 'application/pdf'): Promise<string> {
  return uploadObject(key, buffer, contentType);
}

/**
 * Copies one S3 object to another key within the same bucket — used to
 * promote a reservation-specific temporary upload to its slot's stable
 * final key only once the ledger confirms that reservation is still the
 * current one for that slot (see builder-submission-capability.ts /
 * squad-invite-participation-assets.ts). Never used to move anything
 * between submissions/participations — both keys are always derived from
 * the same verified namespace.
 */
export async function copyObject(sourceKey: string, destinationKey: string): Promise<void> {
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destinationKey,
    })
  );
}

/**
 * Delete one S3 object. S3's DeleteObject is idempotent by design —
 * deleting an already-gone or never-existed key still succeeds (no
 * NoSuchKey error) — which is what makes the guardian-facing delete flows
 * (photo removal, moment deletion) safely retryable with no extra
 * bookkeeping here: a retried request re-issues the same delete calls,
 * and any key already gone from a prior attempt is simply a no-op.
 */
export async function deleteObject(key: string): Promise<void> {
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export interface ObjectMetadata {
  exists: boolean;
  contentType?: string;
  contentLength?: number;
}

/**
 * True only for a provider response that conclusively means the object
 * does not exist (a 404, or the SDK's own NotFound/NoSuchKey error name) —
 * never for a permission, network, timeout, or other transient failure.
 * Shared by headObject below and by the abandoned-upload sweep
 * (sweep-abandoned-uploads/route.ts), which must not treat every S3 error
 * as "already gone" — only this narrow, conclusive case is safe to treat
 * the same as a successful delete.
 */
export function isS3NotFoundError(err: unknown): boolean {
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const name = (err as { name?: string })?.name;
  return status === 404 || name === 'NotFound' || name === 'NoSuchKey';
}

/**
 * Confirms a key genuinely exists in the bucket (and returns its stored
 * content type/size), rather than trusting that a well-formed-looking key
 * string was actually uploaded. A namespace-prefix check alone (see
 * order-enquiry-validation.ts's isValidNamespacedKey) proves a submitted
 * key *claims* to belong to a given submission — it does not prove the
 * object was ever really written. Used by order-enquiry/route.ts before
 * calling the persistence RPC, so a forged/guessed key can never reach a
 * database row.
 */
export async function headObject(key: string): Promise<ObjectMetadata> {
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, contentType: result.ContentType, contentLength: result.ContentLength };
  } catch (err) {
    if (isS3NotFoundError(err)) {
      return { exists: false };
    }
    throw err;
  }
}

/** SigV4's AWS-enforced ceiling for presigned URL expiry: 7 days. */
const MAX_PRESIGN_EXPIRY_SEC = 60 * 60 * 24 * 7;

/**
 * Explicit, justified expiry for authenticated guardian/coach OS media
 * (child photo, moment media, card photo/logo) — every call site in
 * os-data.ts, coach-fields/route.ts, and moments/route.ts previously
 * omitted `expiresInSec` entirely, which silently fell through to
 * MAX_PRESIGN_EXPIRY_SEC (7 days): undocumented, and ~168x longer than
 * the 1-hour window already used for staff (staff/queue/page.tsx) and
 * far beyond the 15-minute window used for the fully public/anonymous
 * profile and pre-order builder paths. One hour matches the existing
 * staff precedent in this codebase, comfortably covers a normal single
 * OS browsing session (the URL is re-fetched on the next page load, not
 * held open across visits), and is the smallest period that doesn't
 * require adding a client-side re-fetch-before-expiry mechanism that
 * doesn't exist today — a shorter window would need that work done
 * first, not just a smaller number here.
 */
export const AUTHENTICATED_OS_MEDIA_EXPIRY_SEC = 60 * 60;

/**
 * Get a presigned download URL valid for `expiresInSec` seconds (default,
 * and maximum, 7 days). Values above the SigV4 ceiling are clamped rather
 * than passed through — AWS hard-rejects anything longer with
 * "Signature version 4 presigned URLs must have an expiration date less
 * than one week in the future", which surfaced as a customer-facing
 * checkout failure when a caller asked for 14 days.
 */
export async function getSignedDownloadUrl(key: string, expiresInSec = MAX_PRESIGN_EXPIRY_SEC): Promise<string> {
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: Math.min(expiresInSec, MAX_PRESIGN_EXPIRY_SEC) }
  );
}
