import { createHash, timingSafeEqual } from 'crypto';
import sharp from 'sharp';
import { FULL_PX } from './print-master-geometry';

/** Hard ceiling before any decode is attempted — a genuine 826x1126 PNG at
 *  this bit depth is a few MB at most; this is generous headroom, not a
 *  tight fit, while still refusing an absurdly large upload outright. */
export const MAX_MASTER_BYTES = 25 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class MasterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MasterValidationError';
  }
}

function hasPngMagicBytes(bytes: Buffer): boolean {
  return bytes.length >= PNG_MAGIC.length && bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Constant-time digest comparison — same pattern as builder-authority.ts's
 *  timingSafeStringEqual, applied here to print-master integrity digests
 *  rather than approval tokens, for the same reason: a digest check is a
 *  security-relevant comparison and must not leak timing information about
 *  how many leading hex characters matched. */
export function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export interface MasterValidationInput {
  bytes: Buffer;
  /** Expected digest to verify against, when available (e.g. re-reading a
   *  stored master before embedding it in a PDF). Omit only when
   *  validating a freshly-rendered buffer that has no prior digest yet. */
  expectedSha256?: string;
}

export interface ValidatedMaster {
  bytes: Buffer;
  width: number;
  height: number;
  sha256: string;
}

/**
 * The one gate every print master must pass before it is trusted as a
 * verified full-bleed source — used both right after rendering (before
 * upload) and again right before a verified-master PDF embeds it (never
 * trust a previous validation; re-check what's actually about to be used).
 *
 * Order matters: magic bytes and size are checked BEFORE sharp ever
 * attempts a full decode, and `limitInputPixels` bounds what sharp itself
 * will decode — both are decompression-bomb protections (a tiny file
 * claiming a huge pixel count, or a crafted file that isn't really a PNG
 * at all, is rejected before any expensive decode happens).
 */
export async function validateMasterBytes(input: MasterValidationInput): Promise<ValidatedMaster> {
  const { bytes, expectedSha256 } = input;

  if (bytes.length === 0 || bytes.length > MAX_MASTER_BYTES) {
    throw new MasterValidationError(`Master file size ${bytes.length} bytes is outside the allowed range (1..${MAX_MASTER_BYTES}).`);
  }
  if (!hasPngMagicBytes(bytes)) {
    throw new MasterValidationError('Master file does not have a valid PNG signature.');
  }

  const sha256 = sha256Hex(bytes);
  if (expectedSha256 !== undefined && !timingSafeHexEqual(sha256, expectedSha256)) {
    throw new MasterValidationError('Master file digest does not match the recorded digest — refusing to use a mismatched file.');
  }

  let metadata: { format?: string; width?: number; height?: number };
  try {
    // limitInputPixels caps what sharp will even attempt to decode,
    // independent of the pre-check above — the primary decompression-bomb
    // guard (a maliciously small file claiming an enormous pixel count).
    const pipeline = sharp(bytes, { limitInputPixels: FULL_PX.w * FULL_PX.h * 4 });
    metadata = await pipeline.metadata();
    // metadata() alone only reads the header (IHDR) — a file with a
    // genuine PNG signature and a valid, correctly-sized header but
    // truncated/corrupted pixel (IDAT) data would otherwise pass here and
    // only fail later, inside the PDF embed or the compositor, with a far
    // less clear error. Forcing a full raw decode is what actually proves
    // the pixel data itself is intact (confirmed necessary by this
    // module's own test: a 64-byte truncation with a valid header alone
    // passed metadata() but must not pass validation).
    await sharp(bytes, { limitInputPixels: FULL_PX.w * FULL_PX.h * 4 }).raw().toBuffer();
  } catch (err) {
    throw new MasterValidationError(`Master file could not be decoded as an image: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  if (metadata.format !== 'png') {
    throw new MasterValidationError(`Master file format "${metadata.format}" is not image/png.`);
  }
  if (metadata.width !== FULL_PX.w || metadata.height !== FULL_PX.h) {
    throw new MasterValidationError(
      `Master file dimensions ${metadata.width}x${metadata.height} do not match the required full-bleed size ${FULL_PX.w}x${FULL_PX.h}.`
    );
  }

  return { bytes, width: metadata.width, height: metadata.height, sha256 };
}
