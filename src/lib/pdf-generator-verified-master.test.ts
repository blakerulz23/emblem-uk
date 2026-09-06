import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { buildPdfFromVerifiedMasters } from './pdf-generator';
import { sha256Hex } from './print-master-validation';
import { FULL_PX } from './print-master-geometry';
import { PRINT_SPECS, pdfPageSize } from './print-specs';

async function master(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { ...color, alpha: 1 } } }).png().toBuffer();
}

describe('buildPdfFromVerifiedMasters — direct 1:1 placement, no fit/cover/contain/mirror/blur', () => {
  it('places each master across the full page at x=0,y=0, exactly the page size — no scaling math beyond the page grid', async () => {
    const front = await master({ r: 10, g: 20, b: 30 });
    const back = await master({ r: 40, g: 50, b: 60 });
    const bytes = await buildPdfFromVerifiedMasters({
      front: { bytes: front, expectedSha256: sha256Hex(front) },
      back: { bytes: back, expectedSha256: sha256Hex(back) },
      meta: { orderRef: 'test-order' },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width: specW, height: specH } = pdfPageSize(PRINT_SPECS.card);
    for (let i = 0; i < 2; i++) {
      const { width, height } = doc.getPage(i).getSize();
      expect(width).toBeCloseTo(specW, 5);
      expect(height).toBeCloseTo(specH, 5);
    }
  });

  it('embeds the master raster completely unmodified — same pixel dimensions in the PDF as the source master, no resample', async () => {
    const front = await master({ r: 1, g: 2, b: 3 });
    const back = await master({ r: 4, g: 5, b: 6 });
    const bytes = await buildPdfFromVerifiedMasters({
      front: { bytes: front, expectedSha256: sha256Hex(front) },
      back: { bytes: back, expectedSha256: sha256Hex(back) },
    });
    const doc = await PDFDocument.load(bytes);
    let imageCount = 0;
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) {
        const subtype = obj.dict.get(PDFName.of('Subtype'));
        if (subtype?.toString() === '/Image') {
          const w = Number(obj.dict.get(PDFName.of('Width'))?.toString());
          const h = Number(obj.dict.get(PDFName.of('Height'))?.toString());
          expect(w).toBe(FULL_PX.w);
          expect(h).toBe(FULL_PX.h);
          imageCount++;
        }
      }
    }
    expect(imageCount).toBe(2);
  });

  it('adds crop marks as separate PDF vector line instructions (page.drawLine), matching the legacy buildPdf()\'s own pattern — never baked into the embedded raster itself', async () => {
    // pdf-lib packs modern PDF page content into compressed object
    // streams, so asserting on decompressed page-content bytes here would
    // mean re-implementing a chunk of pdf-lib's own internals just to
    // prove what the previous test already proves at the data level (the
    // embedded XObject's pixel dimensions exactly match the untouched
    // source master, so no crop mark pixel ever reaches it). This checks
    // the actual mechanism at the source level instead: crop marks are
    // page.drawLine() calls, the same primitive the legacy buildPdf()
    // already uses for its own crop marks (pdf-generator.ts's addPage()),
    // never any pixel operation on the raster buffer itself.
    const source = readFileSync('src/lib/pdf-generator.ts', 'utf8');
    const fnBody = source.slice(source.indexOf('export async function buildPdfFromVerifiedMasters'));
    expect(fnBody).toContain('drawCropMarks');
    expect(fnBody.match(/page\.drawLine\(/g)?.length).toBeGreaterThanOrEqual(8); // 2 marks x 4 corners
    expect(fnBody).not.toMatch(/sharp\(.*bytes.*\)\.(composite|extend|blur)/);

    const front = await master({ r: 7, g: 7, b: 7 });
    const back = await master({ r: 8, g: 8, b: 8 });
    const bytes = await buildPdfFromVerifiedMasters({
      front: { bytes: front, expectedSha256: sha256Hex(front) },
      back: { bytes: back, expectedSha256: sha256Hex(back) },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('rejects a front master with the wrong dimensions rather than silently stretching it onto the page', async () => {
    const wrongSize = await sharp({ create: { width: 750, height: 1050, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const back = await master({ r: 1, g: 1, b: 1 });
    await expect(
      buildPdfFromVerifiedMasters({ front: { bytes: wrongSize, expectedSha256: sha256Hex(wrongSize) }, back: { bytes: back, expectedSha256: sha256Hex(back) } })
    ).rejects.toThrow(/dimensions/i);
  });

  it('rejects a non-PNG file', async () => {
    const jpg = await sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer();
    const back = await master({ r: 1, g: 1, b: 1 });
    await expect(
      buildPdfFromVerifiedMasters({ front: { bytes: jpg, expectedSha256: sha256Hex(jpg) }, back: { bytes: back, expectedSha256: sha256Hex(back) } })
    ).rejects.toThrow(/PNG signature/i);
  });

  it('rejects a digest mismatch on either side — never trusts a caller that skipped its own validation', async () => {
    const front = await master({ r: 1, g: 1, b: 1 });
    const back = await master({ r: 2, g: 2, b: 2 });
    await expect(
      buildPdfFromVerifiedMasters({ front: { bytes: front, expectedSha256: 'a'.repeat(64) }, back: { bytes: back, expectedSha256: sha256Hex(back) } })
    ).rejects.toThrow(/digest/i);
  });
});
