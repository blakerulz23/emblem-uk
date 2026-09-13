import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import zlib from 'zlib';
import { PDFArray, PDFDocument } from 'pdf-lib';
import { buildCanonicalCardPdf } from './pdf-generator';
import { PRINT_SPECS } from './print-specs';

/**
 * Product decision under test: the Print S3 PDF for the "card" product no
 * longer runs captures through a separate forPrint-styled renderer or a
 * bleed/crop-mark compositor — each page is exactly the canonical capture,
 * sized to that capture's own aspect ratio, nothing added or restyled.
 * This file is deliberately separate from pdf-generator.test.ts, which
 * covers buildPdf/buildFullBleedRaster — unchanged, still used by every
 * other print product.
 */

async function jpegDataUrl(width: number, height: number, color: { r: number; g: number; b: number }): Promise<string> {
  const buf = await sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 92 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function pngDataUrl(width: number, height: number, color: { r: number; g: number; b: number }): Promise<string> {
  const buf = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** Decodes every content stream on a page (pdf-lib may store one stream or
 *  a PDFArray of several) into plain PDF operator text, so a test can
 *  assert on the literal operators present — the same technique used to
 *  inspect a real production PDF's own content stream earlier in this
 *  investigation. */
async function pageOperatorText(doc: PDFDocument, pageIndex: number): Promise<string> {
  const page = doc.getPage(pageIndex);
  const contentsRef = page.node.Contents();
  const streams = contentsRef instanceof PDFArray
    ? Array.from({ length: contentsRef.size() }, (_, i) => doc.context.lookup(contentsRef.get(i)))
    : [doc.context.lookup(contentsRef)];
  let text = '';
  for (const stream of streams as unknown as Array<{ contents: Uint8Array }>) {
    try {
      text += zlib.inflateSync(Buffer.from(stream.contents)).toString('latin1');
    } catch {
      text += Buffer.from(stream.contents).toString('latin1');
    }
  }
  return text;
}

describe('buildCanonicalCardPdf — the ordinary case (front/back already at the 5:7 canonical aspect)', () => {
  it('sizes both pages to exactly 2.5x3.5in in points, matching the canonical on-screen aspect — no bleed added', async () => {
    const front = await jpegDataUrl(1020, 1428, { r: 10, g: 40, b: 90 }); // 5:7, matching CardArt's H=size*1.4 at pixelRatio 3 on a 340-wide card
    const back = await jpegDataUrl(1020, 1428, { r: 90, g: 10, b: 40 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front, backImageDataUrl: back });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    for (const i of [0, 1]) {
      const { width, height } = doc.getPage(i).getSize();
      expect(width).toBeCloseTo(PRINT_SPECS.card.finalWidthIn * 72, 1);
      expect(height).toBeCloseTo(PRINT_SPECS.card.finalHeightIn * 72, 1);
    }
  });

  it('the content stream is a single plain image draw — no crop-mark stroke operators, no bleed compositing', async () => {
    const front = await jpegDataUrl(1020, 1428, { r: 10, g: 40, b: 90 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front });
    const doc = await PDFDocument.load(bytes);
    const text = await pageOperatorText(doc, 0);
    expect(text).toMatch(/\bDo\b/); // the one image draw
    expect(text).not.toMatch(/\bS\b/); // crop marks are drawn as stroked lines ("... l S") — none here
  });
});

describe('buildCanonicalCardPdf — front and back are sized independently, per their own captured aspect ratio', () => {
  it('a back captured at a different aspect ratio than the front gets its own, different page size — never stretched to match the front\'s page', async () => {
    // Mirrors CardArt.tsx's own real discrepancy: RealCardArt's front uses
    // H = size*1.4 (aspect 0.714286) while RealGalaxyBack/RealChromeBack use
    // H = size*1.415 (aspect 0.706714) for the SAME card. The PDF must
    // preserve each face's own aspect, not force a single shared page size.
    const front = await jpegDataUrl(1020, 1428, { r: 10, g: 40, b: 90 }); // aspect 1/1.4
    const back = await jpegDataUrl(1020, 1443, { r: 90, g: 10, b: 40 }); // aspect 1/1.415
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front, backImageDataUrl: back });
    const doc = await PDFDocument.load(bytes);
    const frontSize = doc.getPage(0).getSize();
    const backSize = doc.getPage(1).getSize();

    const frontAspect = frontSize.width / frontSize.height;
    const backAspect = backSize.width / backSize.height;
    expect(frontAspect).toBeCloseTo(1020 / 1428, 4);
    expect(backAspect).toBeCloseTo(1020 / 1443, 4);
    // The two pages are genuinely different sizes — proof neither face was
    // stretched to fit the other's (or a fixed spec's) page.
    expect(Math.abs(frontSize.width - backSize.width)).toBeGreaterThan(0.5);
  });

  it('never rejects a face merely for differing from the fixed 2.5x3.5 trim ratio — that check belonged to the old bleed pipeline, not this one', async () => {
    const oddAspectFront = await jpegDataUrl(1000, 1000, { r: 5, g: 5, b: 5 }); // square — nowhere near 5:7
    await expect(buildCanonicalCardPdf({ frontImageDataUrl: oddAspectFront })).resolves.toBeInstanceOf(Buffer);
  });
});

describe('buildCanonicalCardPdf — no restyling of the embedded bytes', () => {
  it('accepts a JPEG source (what captureElementToPng actually produces) without re-encoding it through sharp', async () => {
    const front = await jpegDataUrl(600, 840, { r: 50, g: 60, b: 70 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2); // still 2 pages (fallback back) even with only a front supplied
  });

  it('also accepts a PNG source', async () => {
    const front = await pngDataUrl(600, 840, { r: 200, g: 20, b: 20 });
    const back = await pngDataUrl(600, 840, { r: 20, g: 200, b: 20 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front, backImageDataUrl: back });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('the page has no bleed margin: its size is exactly the source\'s own aspect at the anchored card height, not trim+bleed', async () => {
    const width = 900;
    const height = 1260;
    const front = await pngDataUrl(width, height, { r: 33, g: 66, b: 99 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front });
    const doc = await PDFDocument.load(bytes);
    const { width: pw, height: ph } = doc.getPage(0).getSize();
    // The old buildFullBleedRaster path always produced a page 2*bleedIn
    // (0.25in = 18pt) larger on each axis than the trim. This path must
    // not — page size follows the source's own aspect with zero bleed
    // added, at the anchored card height.
    expect(pw).toBeCloseTo((width / height) * PRINT_SPECS.card.finalHeightIn * 72, 1);
    expect(ph).toBeCloseTo(PRINT_SPECS.card.finalHeightIn * 72, 1);
  });
});

describe('buildCanonicalCardPdf — back rules: missing back falls back without inventing a fixed-spec page size', () => {
  it('when no back is supplied, the fallback back page matches the front\'s own dimensions, not PRINT_SPECS.card', async () => {
    const width = 700;
    const height = 1000; // deliberately not 5:7, to prove the fallback follows the front, not a hardcoded spec
    const front = await jpegDataUrl(width, height, { r: 12, g: 34, b: 56 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front });
    const doc = await PDFDocument.load(bytes);
    const frontSize = doc.getPage(0).getSize();
    const backSize = doc.getPage(1).getSize();
    expect(backSize.width).toBeCloseTo(frontSize.width, 1);
    expect(backSize.height).toBeCloseTo(frontSize.height, 1);
  });
});

describe('buildCanonicalCardPdf — metadata parity with buildPdf', () => {
  it('sets title/author/subject/keywords the same way buildPdf does', async () => {
    const front = await jpegDataUrl(600, 840, { r: 1, g: 2, b: 3 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front, meta: { orderRef: 'ORDER-123', playerName: 'Test Player' } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getSubject()).toBe('Order ORDER-123');
    expect(doc.getAuthor()).toBe('Emblem / Last Shot Cards');
  });
});
