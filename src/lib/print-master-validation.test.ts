import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { validateMasterBytes, MasterValidationError, sha256Hex, timingSafeHexEqual } from './print-master-validation';
import { FULL_PX } from './print-master-geometry';

async function validPng(): Promise<Buffer> {
  return sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer();
}

describe('print-master-validation — the one gate every master must pass', () => {
  it('accepts a well-formed, exact-dimension PNG', async () => {
    const bytes = await validPng();
    const result = await validateMasterBytes({ bytes });
    expect(result.width).toBe(FULL_PX.w);
    expect(result.height).toBe(FULL_PX.h);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects the wrong dimensions (e.g. trim-only, no bleed)', async () => {
    const wrong = await sharp({ create: { width: 750, height: 1050, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    await expect(validateMasterBytes({ bytes: wrong })).rejects.toThrow(MasterValidationError);
    await expect(validateMasterBytes({ bytes: wrong })).rejects.toThrow(/dimensions/i);
  });

  it('rejects a non-PNG MIME/format (e.g. a JPEG re-encode of the right pixels)', async () => {
    const jpg = await sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer();
    await expect(validateMasterBytes({ bytes: jpg })).rejects.toThrow(/PNG signature/i);
  });

  it('rejects a corrupted/truncated file rather than throwing an unhandled decode error', async () => {
    const valid = await validPng();
    // A highly-compressible solid-colour PNG can still decode from a
    // clean half-truncation (libvips tolerates some missing tail data) —
    // cut deep into the header/data instead, past only the PNG magic
    // bytes, so the pixel data itself is genuinely incomplete.
    const truncated = valid.subarray(0, 64);
    await expect(validateMasterBytes({ bytes: truncated })).rejects.toThrow(MasterValidationError);
  });

  it('rejects an empty buffer and an oversized buffer', async () => {
    await expect(validateMasterBytes({ bytes: Buffer.alloc(0) })).rejects.toThrow(/size/i);
    const hugeFakeHeader = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(26 * 1024 * 1024)]);
    await expect(validateMasterBytes({ bytes: hugeFakeHeader })).rejects.toThrow(/size/i);
  });

  it('rejects a digest mismatch — refuses to use a file that does not match its recorded hash', async () => {
    const bytes = await validPng();
    const wrongDigest = 'a'.repeat(64);
    await expect(validateMasterBytes({ bytes, expectedSha256: wrongDigest })).rejects.toThrow(/digest/i);
  });

  it('accepts when the digest matches exactly', async () => {
    const bytes = await validPng();
    const digest = sha256Hex(bytes);
    const result = await validateMasterBytes({ bytes, expectedSha256: digest });
    expect(result.sha256).toBe(digest);
  });

  it('digest comparison is constant-time (length-mismatch short-circuits without throwing, equal-length always goes through timingSafeEqual)', () => {
    expect(timingSafeHexEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeHexEqual('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(timingSafeHexEqual('a'.repeat(64), 'b'.repeat(64))).toBe(false);
  });
});
