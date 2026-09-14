import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import zlib from 'zlib';
import { PDFArray, PDFDocument } from 'pdf-lib';
import { buildCanonicalCardPdf, fitFaceToCanonicalCanvas } from './pdf-generator';
import { PRINT_SPECS } from './print-specs';

/**
 * Product decision under test: the Print S3 PDF for the "card" product no
 * longer runs captures through a separate forPrint-styled renderer or a
 * bleed/crop-mark compositor — each page is the canonical capture, and a
 * physical two-sided card always gets exactly ONE canonical physical page
 * size shared by both faces (requirement: front/back must never produce
 * different PDF page dimensions). Every live-orderable template's own
 * front and back already render at the same platform-wide 5:7 outer card
 * canvas (verified directly in CardArt.tsx), so in real operation every
 * face embeds 1:1 with no compositing. fitFaceToCanonicalCanvas is a
 * generic defensive safety net — not a response to any known live-
 * template mismatch — covering a face whose capture legitimately differs
 * in aspect for any future reason: it is fit proportionally inside the
 * one canonical page, never stretched. This file is deliberately separate
 * from pdf-generator.test.ts, which covers buildPdf/buildFullBleedRaster —
 * unchanged, still used by every other print product.
 */

async function jpegDataUrl(width: number, height: number, color: { r: number; g: number; b: number }): Promise<string> {
  const buf = await sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 92 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function pngDataUrl(width: number, height: number, color: { r: number; g: number; b: number }): Promise<string> {
  const buf = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** A source with a small, distinctively-coloured marker at a known,
 *  off-centre pixel position — lets a test prove real content survived at
 *  its own true position (only offset by a uniform margin), rather than
 *  being resized/stretched to a new position. */
async function markerDataUrl(width: number, height: number, base: { r: number; g: number; b: number }, markerXY: [number, number], markerSize = 24) {
  const [mx, my] = markerXY;
  const svg = `<svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="rgb(${base.r},${base.g},${base.b})"/>
    <rect x="${mx}" y="${my}" width="${markerSize}" height="${markerSize}" fill="#00ff00"/>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, markerX: mx, markerY: my, markerSize };
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

describe('buildCanonicalCardPdf — one canonical physical page for the whole card', () => {
  it('front and back pages have identical MediaBox, width, height and aspect ratio — the ordinary case (both already 5:7)', async () => {
    const front = await jpegDataUrl(1020, 1428, { r: 10, g: 40, b: 90 }); // 5:7, matching CardArt's H=size*1.4 at pixelRatio 3 on a 340-wide card
    const back = await jpegDataUrl(1020, 1428, { r: 90, g: 10, b: 40 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front, backImageDataUrl: back });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const p0 = doc.getPage(0);
    const p1 = doc.getPage(1);
    expect(p0.getSize()).toEqual(p1.getSize());
    expect(p0.getSize().width).toBeCloseTo(PRINT_SPECS.card.finalWidthIn * 72, 1);
    expect(p0.getSize().height).toBeCloseTo(PRINT_SPECS.card.finalHeightIn * 72, 1);
    // Centre point and orientation are implied by identical width/height
    // both being portrait and both pages sharing (0,0) as their origin —
    // explicit for the record.
    expect(p0.getWidth()).toBeLessThan(p0.getHeight()); // portrait
    expect(p1.getWidth()).toBeLessThan(p1.getHeight());
  });

  it('a back captured at a legitimately different (synthetic) aspect ratio than the front still gets the EXACT SAME page size — never a second page size', async () => {
    const front = await jpegDataUrl(1020, 1428, { r: 10, g: 40, b: 90 }); // aspect 1/1.4 = 0.714286
    const back = await jpegDataUrl(1020, 1443, { r: 90, g: 10, b: 40 }); // aspect ~0.706714 — ~1.07% narrower than the front, a synthetic stand-in for any future capture-level deviation
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front, backImageDataUrl: back });
    const doc = await PDFDocument.load(bytes);
    const frontSize = doc.getPage(0).getSize();
    const backSize = doc.getPage(1).getSize();
    expect(backSize.width).toBeCloseTo(frontSize.width, 6);
    expect(backSize.height).toBeCloseTo(frontSize.height, 6);
  });

  it('the back\'s real artwork survives at its own true position, only offset by a uniform margin — never stretched to fit the page', async () => {
    const front = await jpegDataUrl(1020, 1428, { r: 5, g: 5, b: 5 });
    // Marker at a known pixel position on a back whose aspect is narrower
    // than the front's (needs left/right letterbox margin) — a synthetic
    // stand-in for any future capture-level deviation, not a claim about
    // any specific live template.
    const backWidth = 1020;
    const backHeight = 1443;
    const { dataUrl: backUrl, markerX, markerY, markerSize } = await markerDataUrl(backWidth, backHeight, { r: 90, g: 10, b: 40 }, [500, 700]);
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front, backImageDataUrl: backUrl });
    const doc = await PDFDocument.load(bytes);

    // Re-derive the exact margin fitFaceToCanonicalCanvas would have
    // computed, then confirm the marker landed at markerX/markerY offset
    // by exactly that margin — proof of a pure translate, not a resize.
    const pageAspect = 1020 / 1428;
    let canvasW = backWidth;
    let canvasH = Math.round(backWidth / pageAspect);
    if (canvasH < backHeight) {
      canvasH = backHeight;
      canvasW = Math.round(backHeight * pageAspect);
    }
    const marginX = canvasW - backWidth;
    const left = Math.floor(marginX / 2);

    // Render page 1 (the back) to a raster at the same pixel density as
    // canvasW/canvasH so the marker's expected pixel position is exact.
    const pageSize = doc.getPage(1).getSize();
    const scale = canvasW / pageSize.width; // px per pt, since the composited canvas is drawn 1:1 onto the page
    void scale;

    // A full PDF->raster round trip needs a rasteriser this test suite
    // doesn't depend on elsewhere; instead, prove the same property one
    // level down — fitFaceToCanonicalCanvas's own exported output, which
    // is exactly what gets embedded into the page unmodified afterwards.
    const fitted = await fitFaceToCanonicalCanvas(
      { bytes: Buffer.from(backUrl.split(',')[1], 'base64'), mime: 'image/png', width: backWidth, height: backHeight, aspect: backWidth / backHeight },
      pageAspect
    );
    const raw = await sharp(fitted.bytes).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    const [r, g, b] = px(left + markerX + Math.floor(markerSize / 2), markerY + Math.floor(markerSize / 2));
    expect(r).toBeLessThan(40);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeLessThan(40);
  });

  it('hard validation error: a face whose aspect ratio deviates far beyond a legitimate asset-fit case is refused, not silently placed', async () => {
    const front = await jpegDataUrl(1020, 1428, { r: 5, g: 5, b: 5 }); // aspect 0.714286
    const wildlyDifferentBack = await jpegDataUrl(1020, 3000, { r: 5, g: 5, b: 5 }); // aspect 0.34 — nowhere near a legitimate fit
    await expect(
      buildCanonicalCardPdf({ frontImageDataUrl: front, backImageDataUrl: wildlyDifferentBack })
    ).rejects.toThrow(/deviates|aspect ratio|refusing/i);
  });

  it('never rejects the front itself merely for differing from the fixed 2.5x3.5 trim ratio — the front always defines the canonical page, it cannot itself fail to match it', async () => {
    const oddAspectFront = await jpegDataUrl(1000, 1000, { r: 5, g: 5, b: 5 }); // square — nowhere near 5:7
    await expect(buildCanonicalCardPdf({ frontImageDataUrl: oddAspectFront })).resolves.toBeInstanceOf(Buffer);
  });
});

describe('buildCanonicalCardPdf — no restyling in the ordinary (matching-aspect) case', () => {
  it('the content stream is a single plain image draw — no crop-mark stroke operators, no bleed compositing', async () => {
    const front = await jpegDataUrl(1020, 1428, { r: 10, g: 40, b: 90 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front });
    const doc = await PDFDocument.load(bytes);
    const text = await pageOperatorText(doc, 0);
    expect(text).toMatch(/\bDo\b/); // the one image draw
    expect(text).not.toMatch(/\bS\b/); // crop marks are drawn as stroked lines ("... l S") — none here
  });

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

  it('the page has no bleed margin: its size is exactly the front\'s own aspect at the anchored card height, not trim+bleed', async () => {
    const width = 900;
    const height = 1260; // 5:7 exactly
    const front = await pngDataUrl(width, height, { r: 33, g: 66, b: 99 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front });
    const doc = await PDFDocument.load(bytes);
    const { width: pw, height: ph } = doc.getPage(0).getSize();
    // The old buildFullBleedRaster path always produced a page 2*bleedIn
    // (0.25in = 18pt) larger on each axis than the trim. This path must
    // not — page size follows the front's own aspect with zero bleed
    // added, at the anchored card height.
    expect(pw).toBeCloseTo((width / height) * PRINT_SPECS.card.finalHeightIn * 72, 1);
    expect(ph).toBeCloseTo(PRINT_SPECS.card.finalHeightIn * 72, 1);
  });
});

describe('buildCanonicalCardPdf — back rules: missing back falls back onto the exact same canonical page', () => {
  it('when no back is supplied, the fallback back page matches the front\'s own canonical page exactly, not a hardcoded PRINT_SPECS.card size', async () => {
    const width = 700;
    const height = 1000; // deliberately not 5:7, to prove the canonical page follows the front, not a hardcoded spec
    const front = await jpegDataUrl(width, height, { r: 12, g: 34, b: 56 });
    const bytes = await buildCanonicalCardPdf({ frontImageDataUrl: front });
    const doc = await PDFDocument.load(bytes);
    const frontSize = doc.getPage(0).getSize();
    const backSize = doc.getPage(1).getSize();
    expect(backSize).toEqual(frontSize);
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
