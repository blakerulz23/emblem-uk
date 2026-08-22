/**
 * Sniffs a file's real type from its leading bytes rather than trusting a
 * client-declared MIME string alone (Gate 1 residual pass — order-assets
 * previously accepted whatever `file.type` the browser reported with no
 * corroborating check). Covers exactly the types order-assets already
 * allows; anything else returns null.
 */
export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

export function sniffImageMimeType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // ISO base media file format: a 4-byte big-endian box size, then 'ftyp',
  // then a 4-byte major brand. HEIC and HEIF share this container and are
  // told apart only by convention (order-assets treats both identically
  // anyway), so either brand set maps to whichever declared type matches.
  const ftypAtOffset4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  if (ftypAtOffset4) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
  }

  return null;
}
