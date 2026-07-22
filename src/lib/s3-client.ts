import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

/** SigV4's AWS-enforced ceiling for presigned URL expiry: 7 days. */
const MAX_PRESIGN_EXPIRY_SEC = 60 * 60 * 24 * 7;

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
