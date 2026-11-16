import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Photo Day photos live in their OWN bucket, separate from every other
 * Emblem upload (AWS_S3_BUCKET).
 *
 * Why: the main production bucket sits in an AWS account Emblem UK does not
 * control, and it may keep hidden previous versions of deleted objects.
 * Photo Day promises parents that every photo is permanently deleted
 * within 30 days of the team order closing (never more than 60 days after
 * the shoot). That promise has to be true from the first real shoot, so
 * these photos go to a bucket in Emblem UK's own account, which has a
 * lifecycle rule that permanently removes noncurrent versions and expired
 * delete markers.
 *
 * Configuration (all four are required together):
 *   PHOTO_DAY_S3_BUCKET, PHOTO_DAY_AWS_REGION,
 *   PHOTO_DAY_AWS_ACCESS_KEY_ID, PHOTO_DAY_AWS_SECRET_ACCESS_KEY
 *
 * Fail closed in production: if they are missing there, every call throws
 * and nothing is written to the main bucket by accident. Outside
 * production (local dev, previews) the main AWS_* settings are used as a
 * fallback, so existing preview setups keep working.
 */

export class PhotoDayStorageNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoDayStorageNotConfiguredError';
  }
}

interface PhotoDayStorageConfig {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  dedicated: boolean;
}

/** Exported for tests. Reads env on every call so tests can change it. */
export function resolvePhotoDayStorageConfig(env: NodeJS.ProcessEnv = process.env): PhotoDayStorageConfig {
  const bucket = env.PHOTO_DAY_S3_BUCKET?.trim();
  if (bucket) {
    const region = env.PHOTO_DAY_AWS_REGION?.trim();
    const accessKeyId = env.PHOTO_DAY_AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.PHOTO_DAY_AWS_SECRET_ACCESS_KEY?.trim();
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new PhotoDayStorageNotConfiguredError(
        'PHOTO_DAY_S3_BUCKET is set but PHOTO_DAY_AWS_REGION, PHOTO_DAY_AWS_ACCESS_KEY_ID or PHOTO_DAY_AWS_SECRET_ACCESS_KEY is missing',
      );
    }
    return { bucket, region, accessKeyId, secretAccessKey, dedicated: true };
  }
  if (env.VERCEL_ENV === 'production') {
    throw new PhotoDayStorageNotConfiguredError('PHOTO_DAY_S3_BUCKET is not set; Photo Day storage is disabled in production');
  }
  const fallbackBucket = env.AWS_S3_BUCKET?.trim();
  if (!fallbackBucket) throw new PhotoDayStorageNotConfiguredError('Neither PHOTO_DAY_S3_BUCKET nor AWS_S3_BUCKET is set');
  return {
    bucket: fallbackBucket,
    region: env.AWS_REGION || 'us-east-1',
    accessKeyId: env.AWS_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || undefined,
    dedicated: false,
  };
}

let cached: { key: string; client: S3Client } | null = null;

function connect(): { client: S3Client; bucket: string } {
  const config = resolvePhotoDayStorageConfig();
  const cacheKey = `${config.bucket}|${config.region}|${config.accessKeyId ?? ''}`;
  if (!cached || cached.key !== cacheKey) {
    cached = {
      key: cacheKey,
      client: new S3Client({
        region: config.region,
        credentials: config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
      }),
    };
  }
  return { client: cached.client, bucket: config.bucket };
}

export async function uploadPhotoDayObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const { client, bucket } = connect();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
}

/** Idempotent, like S3 DeleteObject itself: deleting a missing key succeeds. */
export async function deletePhotoDayObject(key: string): Promise<void> {
  const { client, bucket } = connect();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Lists keys under one photo day's folder. Same guard as
 * s3-client.listObjectKeys: only a specific `photo-day/{id}/` style prefix,
 * never the whole bucket.
 */
export async function listPhotoDayObjectKeys(prefix: string, maxKeys = 2000): Promise<string[]> {
  if (!/^[a-z0-9-]+\/[A-Za-z0-9_.-]+\/$/.test(prefix)) throw new Error('Refusing to list an unscoped prefix');
  const { client, bucket } = connect();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of result.Contents ?? []) if (item.Key) keys.push(item.Key);
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token && keys.length < maxKeys);
  return keys.slice(0, maxKeys);
}

export async function getPhotoDayObjectBytes(key: string): Promise<{ bytes: Buffer; contentType?: string }> {
  const { client, bucket } = connect();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return { bytes: Buffer.from(await result.Body!.transformToByteArray()), contentType: result.ContentType };
}

const MAX_PRESIGN_EXPIRY_SEC = 60 * 60 * 24 * 7;

export async function getPhotoDaySignedUrl(key: string, expiresInSec: number): Promise<string> {
  const { client, bucket } = connect();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: Math.min(expiresInSec, MAX_PRESIGN_EXPIRY_SEC),
  });
}
