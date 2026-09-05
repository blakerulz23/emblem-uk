import { randomUUID } from 'crypto';
import { createServiceRoleClient } from './supabase/server';
import { uploadObject, deleteObject, getObjectBytes } from './s3-client';
import { isValidNamespacedKey } from './order-enquiry-validation';
import { validateMasterBytes, sha256Hex } from './print-master-validation';
import { RENDER_VERSION } from './print-master-render';
import { FULL_PX } from './print-master-geometry';

const PRODUCT = 'card' as const;

export function printMasterNamespacePrefix(submissionId: string): string {
  return `print-masters/${submissionId}/${PRODUCT}/`;
}

export function isValidPrintMasterKey(key: unknown, submissionId: string, side: 'front' | 'back'): key is string {
  return isValidNamespacedKey(key, printMasterNamespacePrefix(submissionId)) && (key as string).endsWith(`-${side}.png`);
}

export interface PrintMasterRow {
  id: string;
  submission_id: string;
  order_id: string | null;
  player_id: string;
  product: string;
  front_key: string;
  back_key: string;
  width_px: number;
  height_px: number;
  mime_type: string;
  front_sha256: string;
  back_sha256: string;
  render_version: string;
  status: 'confirmed' | 'superseded';
  created_at: string;
}

export class PrintMasterConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrintMasterConflictError';
  }
}

/**
 * Persists a confirmed pair of front/back print masters for one player of
 * one submission — idempotent (a retry with the same submissionId +
 * playerId finds and returns the existing confirmed row rather than
 * creating a duplicate or silently overwriting it) and crash-safe (if the
 * DB insert fails after upload, both just-uploaded objects are deleted;
 * never a broad/bulk S3 delete, only the two specific keys this call
 * itself just wrote).
 *
 * This function owns the ENTIRE upload+persist step — callers should
 * never upload the raw bytes themselves first, since that's exactly the
 * order that makes "insert failed, objects orphaned" a risk this function
 * is specifically built to close.
 */
export async function persistConfirmedPrintMasters(params: {
  submissionId: string;
  playerId: string;
  front: Buffer;
  back: Buffer;
}): Promise<PrintMasterRow> {
  const { submissionId, playerId, front, back } = params;

  const service = createServiceRoleClient();

  // Idempotency check FIRST — a retried request that already has a
  // confirmed master for this (submission, player, product) must return
  // that existing row untouched, never re-render/re-upload/re-insert.
  const { data: existingRows, error: existingError } = await service
    .from('print_masters')
    .select('*')
    .eq('submission_id', submissionId)
    .eq('player_id', playerId)
    .eq('product', PRODUCT)
    .eq('status', 'confirmed')
    .limit(1);
  if (existingError) {
    throw new Error(`print_masters lookup failed: ${existingError.message}`);
  }
  if (existingRows && existingRows.length > 0) {
    return existingRows[0] as PrintMasterRow;
  }

  const frontValidated = await validateMasterBytes({ bytes: front });
  const backValidated = await validateMasterBytes({ bytes: back });

  const uuid = randomUUID();
  const frontKey = `${printMasterNamespacePrefix(submissionId)}${uuid}-front.png`;
  const backKey = `${printMasterNamespacePrefix(submissionId)}${uuid}-back.png`;

  await uploadObject(frontKey, frontValidated.bytes, 'image/png');
  try {
    await uploadObject(backKey, backValidated.bytes, 'image/png');
  } catch (err) {
    // Clean up the front object we just wrote — never leave a lone
    // orphaned front-only master for this player.
    await deleteObject(frontKey).catch(() => {});
    throw err;
  }

  const { data: inserted, error: insertError } = await service
    .from('print_masters')
    .insert({
      submission_id: submissionId,
      player_id: playerId,
      product: PRODUCT,
      front_key: frontKey,
      back_key: backKey,
      width_px: FULL_PX.w,
      height_px: FULL_PX.h,
      mime_type: 'image/png',
      front_sha256: frontValidated.sha256,
      back_sha256: backValidated.sha256,
      render_version: RENDER_VERSION,
      status: 'confirmed',
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    // DB write failed (or a concurrent request won the race against the
    // unique confirmed-row index) — clean up BOTH objects this call just
    // wrote. Never a wildcard/prefix delete: only the two exact keys this
    // invocation itself created.
    await Promise.all([deleteObject(frontKey).catch(() => {}), deleteObject(backKey).catch(() => {})]);

    // A unique-violation here means a concurrent request won — re-read
    // and return the now-existing confirmed row rather than surfacing a
    // spurious failure for what is, from the caller's perspective, a
    // successful idempotent retry.
    const { data: raceRows } = await service
      .from('print_masters')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('player_id', playerId)
      .eq('product', PRODUCT)
      .eq('status', 'confirmed')
      .limit(1);
    if (raceRows && raceRows.length > 0) return raceRows[0] as PrintMasterRow;

    throw new Error(`print_masters insert failed: ${insertError?.message ?? 'no row returned'}`);
  }

  return inserted as PrintMasterRow;
}

/**
 * Order-scoped, authorised retrieval + integrity verification of a stored
 * master — the only way a print-master's bytes should ever be fetched
 * back for use in a PDF. Re-validates the key's namespace (never trusts a
 * caller-supplied key string) and re-checks the stored digest (never
 * trusts that nothing changed between write and read).
 */
export async function fetchVerifiedPrintMaster(row: PrintMasterRow, side: 'front' | 'back'): Promise<Buffer> {
  const key = side === 'front' ? row.front_key : row.back_key;
  const expectedSha256 = side === 'front' ? row.front_sha256 : row.back_sha256;

  if (!isValidPrintMasterKey(key, row.submission_id, side)) {
    throw new Error(`Print master key for submission is outside its own namespace or malformed — refusing to fetch.`);
  }

  const { bytes } = await getObjectBytes(key);
  const validated = await validateMasterBytes({ bytes, expectedSha256 });
  return validated.bytes;
}

/** Recomputes a digest for freshly-rendered bytes — a small wrapper kept
 *  here (rather than requiring every caller to import print-master-
 *  validation.ts directly) so callers only need this one module for the
 *  full render -> persist -> fetch lifecycle. */
export { sha256Hex };
