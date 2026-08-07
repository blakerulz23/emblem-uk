import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { buildFullBleedRaster, buildPdf } from './pdf-generator';
import { PRINT_SPECS, pdfPageSize } from './print-specs';

async function jpegDataUrl(width: number, height: number, color: { r: number; g: number; b: number }) {
  const buf = await sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** A source with a distinctive marker at a known trim-relative position —
 * lets tests assert *where* content ends up, not just that pixels exist. */
async function markerSourcePng(width: number, height: number) {
  const markerSize = Math.round(width * 0.08);
  const markerX = Math.round(width * 0.1); // near the left edge, like a badge would sit
  const markerY = Math.round(height * 0.05); // near the top edge, like a badge would sit
  const svg = `<svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#204060"/>
    <rect x="${markerX}" y="${markerY}" width="${markerSize}" height="${markerSize}" fill="#ff2222"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Reproduces the exact confirmed defect: a print capture taken with
 * html2canvas's own opaque white backgroundColor behind a CardArt element
 * that clips to a rounded rect (borderRadius: W * 0.05, per CardArt.tsx).
 * The rounded shape is colour; the four corner triangles the clip removes
 * from the underlying full-rectangle background layer are left as the
 * capture's own white fill — never real template artwork. This is what
 * every print-capture call site produced before this fix (see
 * card-definition.tsx's CardFace `style` prop and pdf-generator.ts's
 * assertNoCornerKnockout doc comment).
 */
async function roundedKnockoutSourcePng(width: number, height: number) {
  const radius = Math.round(width * 0.05);
  const svg = `<svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#204060"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Fraction of near-white pixels in a window at each of the trim's own 4
 * corners (bleedPx in from the raster edge) — matches assertNoCornerKnockout's
 * own sampling geometry, confirmed empirically to be where a knockout
 * concentrates (the trim is composited back on top of the raster unblurred). */
async function cornerNearWhiteFractions(bleedRaster: Buffer, bleedPx: number, win: number) {
  const { data, info } = await sharp(bleedRaster).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const corners = [
    { name: 'top-left', x0: bleedPx, y0: bleedPx },
    { name: 'top-right', x0: info.width - bleedPx - win, y0: bleedPx },
    { name: 'bottom-left', x0: bleedPx, y0: info.height - bleedPx - win },
    { name: 'bottom-right', x0: info.width - bleedPx - win, y0: info.height - bleedPx - win },
  ];
  return corners.map((c) => {
    let nearWhite = 0;
    let total = 0;
    for (let y = Math.max(0, c.y0); y < Math.min(info.height, c.y0 + win); y++) {
      for (let x = Math.max(0, c.x0); x < Math.min(info.width, c.x0 + win); x++) {
        const i = (y * info.width + x) * info.channels;
        total++;
        if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) nearWhite++;
      }
    }
    return { name: c.name, fraction: nearWhite / total };
  });
}

// The card capture rig always produces this exact ratio (CardArt's
// H = Math.round(size * 1.4) for every template family).
const CARD_SOURCE = { width: 1020, height: 1428 }; // 340x476 at pixelRatio 3

describe('buildFullBleedRaster — trim composition must not be zoomed, cropped, or distorted', () => {
  it('the trim rectangle cropped back out of the bleed raster reproduces the resized source exactly (no zoom, no crop of real content)', async () => {
    const source = await markerSourcePng(CARD_SOURCE.width, CARD_SOURCE.height);
    const spec = PRINT_SPECS.card;
    const trimPxW = Math.round(spec.finalWidthIn * spec.dpi);
    const trimPxH = Math.round(spec.finalHeightIn * spec.dpi);
    const bleedPx = Math.round(spec.bleedIn * spec.dpi);

    const bleedRaster = await buildFullBleedRaster(source, spec);
    const meta = await sharp(bleedRaster).metadata();
    expect(meta.width).toBe(trimPxW + bleedPx * 2);
    expect(meta.height).toBe(trimPxH + bleedPx * 2);

    // Crop the bleed margin back off — this must be pixel-identical to a
    // plain uniform resize of the original source to trim size. If the
    // trim composition had been enlarged (the bug under audit), this
    // extracted region would NOT match a same-size resize of the source.
    const recoveredTrim = await sharp(bleedRaster)
      .extract({ left: bleedPx, top: bleedPx, width: trimPxW, height: trimPxH })
      .raw()
      .toBuffer();
    const expectedTrim = await sharp(source).resize(trimPxW, trimPxH, { fit: 'fill' }).raw().toBuffer();

    expect(recoveredTrim.length).toBe(expectedTrim.length);
    let maxDiff = 0;
    for (let i = 0; i < recoveredTrim.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(recoveredTrim[i] - expectedTrim[i]));
    }
    expect(maxDiff).toBeLessThanOrEqual(1); // PNG re-encode rounding only, never a real content shift
  });

  it('the marker (badge-like element) lands at the same relative position inside the trim rectangle as in the source', async () => {
    const source = await markerSourcePng(CARD_SOURCE.width, CARD_SOURCE.height);
    const spec = PRINT_SPECS.card;
    const trimPxW = Math.round(spec.finalWidthIn * spec.dpi);
    const trimPxH = Math.round(spec.finalHeightIn * spec.dpi);
    const bleedPx = Math.round(spec.bleedIn * spec.dpi);

    const bleedRaster = await buildFullBleedRaster(source, spec);
    const { data, info } = await sharp(bleedRaster).raw().toBuffer({ resolveWithObject: true });

    // Find the red marker's bounding box inside the full bleed raster.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r > 200 && g < 80 && b < 80) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    // Convert to trim-relative fractional position (subtracting the bleed offset).
    const relX = (minX - bleedPx) / trimPxW;
    const relY = (minY - bleedPx) / trimPxH;
    // Source marker was placed at 10%/5% of the source — must land within a
    // tight tolerance of that same fraction inside the trim rectangle, not
    // shifted inward (which is what a 1.1x zoom would do).
    expect(relX).toBeGreaterThan(0.08);
    expect(relX).toBeLessThan(0.12);
    expect(relY).toBeGreaterThan(0.03);
    expect(relY).toBeLessThan(0.07);
  });

  it('the bleed margin has no sharp mirrored seam (softened, not a crisp doubled reflection)', async () => {
    // A plain mirror-extend of a rounded card corner reflects the corner
    // curve itself, producing a visible doubled/lens-shaped seam right at
    // the trim boundary (confirmed by direct pixel inspection during this
    // audit). Regression guard: measure edge "sharpness" (max adjacent-
    // pixel jump) along a line crossing the trim boundary into the bleed
    // margin — a crisp mirror fold produces a hard edge there; the
    // softened bleed should not.
    const source = await markerSourcePng(CARD_SOURCE.width, CARD_SOURCE.height);
    const spec = PRINT_SPECS.card;
    const bleedPx = Math.round(spec.bleedIn * spec.dpi);
    const bleedRaster = await buildFullBleedRaster(source, spec);
    const { data, info } = await sharp(bleedRaster).raw().toBuffer({ resolveWithObject: true });

    const y = Math.floor(info.height / 2); // mid-height, away from any corner
    let maxJump = 0;
    // Scan a window straddling the trim boundary (bleedPx) into the bleed margin.
    for (let x = Math.max(1, bleedPx - 15); x < bleedPx + 15; x++) {
      const idxA = (y * info.width + (x - 1)) * info.channels;
      const idxB = (y * info.width + x) * info.channels;
      const jump = Math.abs(data[idxA] - data[idxB]) + Math.abs(data[idxA + 1] - data[idxB + 1]) + Math.abs(data[idxA + 2] - data[idxB + 2]);
      maxJump = Math.max(maxJump, jump);
    }
    // A hard mirror fold reads as a near-instant colour reversal (jump well
    // over 200 combined); a blurred transition stays well under that.
    expect(maxJump).toBeLessThan(120);
  });

  it('the bleed margin is not blank/white padding — it carries real (mirrored) edge content', async () => {
    const source = await markerSourcePng(CARD_SOURCE.width, CARD_SOURCE.height);
    const spec = PRINT_SPECS.card;
    const bleedRaster = await buildFullBleedRaster(source, spec);
    const { data, info } = await sharp(bleedRaster).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    // Sample a pixel in the middle of the top bleed strip — should be the
    // source's dark-blue background colour (mirrored), not white/blank.
    const x = Math.floor(info.width / 2);
    const y = 2;
    const idx = (y * info.width + x) * info.channels;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    const isWhite = r > 240 && g > 240 && b > 240;
    expect(isWhite).toBe(false);
    expect(b).toBeGreaterThan(r); // #204060 is blue-dominant
  });

  it('rejects a source whose corners are an unpainted rounded-corner knockout — the confirmed root cause of the pale-corner defect', async () => {
    // Simulates exactly what every print capture produced before the
    // borderRadius:0 print-capture fix: a rounded colour shape on an
    // otherwise-white capture background. buildFullBleedRaster must refuse
    // to ship this rather than mirror/blur the white into the bleed.
    const source = await roundedKnockoutSourcePng(CARD_SOURCE.width, CARD_SOURCE.height);
    const spec = PRINT_SPECS.card;
    await expect(buildFullBleedRaster(source, spec)).rejects.toThrow(/knockout|near-white/i);
  });

  it('a fully-rectangular (no knockout) source produces bleed corners with real colour, not white/pale blobs', async () => {
    const source = await markerSourcePng(CARD_SOURCE.width, CARD_SOURCE.height); // already a full rectangle, no rounded clip baked in
    const spec = PRINT_SPECS.card;
    const bleedPx = Math.round(spec.bleedIn * spec.dpi);
    const bleedRaster = await buildFullBleedRaster(source, spec);
    const win = Math.min(Math.max(Math.round(bleedPx * 0.6), 12), 60);
    const fractions = await cornerNearWhiteFractions(bleedRaster, bleedPx, win);
    for (const { name, fraction } of fractions) {
      expect(fraction, `corner ${name} near-white fraction`).toBeLessThan(0.05);
    }
  });
});

describe('buildPdf — page fit is a plain 1:1 draw of the already-correct bleed raster', () => {
  it('draws the bleed raster at exactly the page size, x=0,y=0 — no cover/crop math left to distort anything', async () => {
    const front = await jpegDataUrl(CARD_SOURCE.width, CARD_SOURCE.height, { r: 10, g: 10, b: 20 });
    const bytes = await buildPdf({ product: 'card', frontImageDataUrl: front, meta: { orderRef: 'test' } });
    const doc = await PDFDocument.load(bytes);
    const { width: pw, height: ph } = doc.getPage(0).getSize();
    const { width: specW, height: specH } = pdfPageSize(PRINT_SPECS.card);
    expect(pw).toBeCloseTo(specW, 2);
    expect(ph).toBeCloseTo(specH, 2);
    expect(doc.getPageCount()).toBe(2);
  });

  it('rejects a source raster that does not match the trim ratio, instead of silently stretching it', async () => {
    const wrongRatio = await jpegDataUrl(1000, 1000, { r: 200, g: 0, b: 0 });
    await expect(buildPdf({ product: 'card', frontImageDataUrl: wrongRatio, meta: {} })).rejects.toThrow(/aspect ratio/i);
  });
});

describe('buildPdf — existing families/products not broken', () => {
  it.each(['card', 'sticker', 'keychain', 'poster-sm'] as const)('generates a valid PDF for product=%s at its own trim ratio', async (product) => {
    const spec = PRINT_SPECS[product];
    const trimAspect = spec.finalWidthIn / spec.finalHeightIn;
    const w = 800;
    const h = Math.round(w / trimAspect);
    const front = await jpegDataUrl(w, h, { r: 5, g: 5, b: 5 });
    const bytes = await buildPdf({ product, frontImageDataUrl: front, meta: { orderRef: `test-${product}` } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(spec.pages);
  });
});
