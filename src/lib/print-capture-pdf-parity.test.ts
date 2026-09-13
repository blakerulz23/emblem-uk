import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import sharp from 'sharp';
import { buildFullBleedRaster } from './pdf-generator';
import { PRINT_SPECS } from './print-specs';

/**
 * Regression coverage using a REAL rendered card face, not only the
 * synthetic marker/solid-colour fixtures pdf-generator.test.ts already
 * uses. `sample-print-capture-front.png` is a genuine captureElementToPng
 * output (ProductionBuilder.tsx's own print-capture params: pixelRatio 3,
 * a `forPrint` — borderRadius:0 — CardArt/CardFace render of the Glacier
 * Edition template), downsized to keep the fixture small — the aspect
 * ratio (exactly the card trim ratio, 5:7) is preserved exactly, which is
 * the one property these tests depend on.
 *
 * Investigated (2026-09, printer-visual-parity audit) via a live
 * reproduction across four templates (Glacier, Crimson, one other Custom
 * Collection template, EMJFL) comparing: canonical on-screen render →
 * share-style capture (pixelRatio 2) → print-style capture (pixelRatio 3,
 * forPrint) → trim raster extracted from buildFullBleedRaster's own
 * output. Measured mean absolute pixel difference between the share
 * capture and the trim-extracted print output, front and back, all eight
 * comparisons: 2.6-4.4 (on a 0-255 scale) — consistent with ordinary
 * cross-resolution resampling noise, not a geometry/typography/border
 * regression. `pdf-generator.ts` was found to already faithfully
 * reproduce whatever CardArt/captureElementToPng produces; no code
 * change was made here as a result. These tests exist to keep it that
 * way — using a real template's rendered pixels, not only an abstract
 * marker, as pdf-generator.test.ts's own existing suite does.
 */
const FIXTURE_PATH = 'src/lib/__fixtures__/sample-print-capture-front.png';

describe('print capture -> PDF trim extraction — real rendered card content survives unchanged', () => {
  it('the fixture itself is at the card trim aspect ratio (5:7) — precondition for every test below', async () => {
    const meta = await sharp(readFileSync(FIXTURE_PATH)).metadata();
    const aspect = meta.width! / meta.height!;
    expect(aspect).toBeCloseTo(PRINT_SPECS.card.finalWidthIn / PRINT_SPECS.card.finalHeightIn, 3);
  });

  it('the trim raster extracted from buildFullBleedRaster matches a plain resize of the real card fixture within tight tolerance — no zoom, crop, stretch, or reflow of real template content', async () => {
    const source = readFileSync(FIXTURE_PATH);
    const spec = PRINT_SPECS.card;
    const trimPxW = Math.round(spec.finalWidthIn * spec.dpi);
    const trimPxH = Math.round(spec.finalHeightIn * spec.dpi);
    const bleedPx = Math.round(spec.bleedIn * spec.dpi);

    const bleedRaster = await buildFullBleedRaster(source, spec);
    // buildFullBleedRaster's own pipeline is alpha-aware throughout (the
    // trim compositing step needs it); a plain resize of the opaque source
    // fixture is not. Both sides are forced to the same RGB-only (no
    // alpha) raw layout before comparing — otherwise a 4-channel vs
    // 3-channel buffer produces a length mismatch and, if forced through
    // anyway, byte-for-byte garbage rather than a real tone comparison.
    const trimExtracted = await sharp(bleedRaster)
      .extract({ left: bleedPx, top: bleedPx, width: trimPxW, height: trimPxH })
      .removeAlpha()
      .raw()
      .toBuffer();
    const plainResize = await sharp(source).resize(trimPxW, trimPxH, { fit: 'fill' }).removeAlpha().raw().toBuffer();

    expect(trimExtracted.length).toBe(plainResize.length);
    let sumAbsDiff = 0;
    for (let i = 0; i < trimExtracted.length; i++) sumAbsDiff += Math.abs(trimExtracted[i] - plainResize[i]);
    const meanAbsDiff = sumAbsDiff / trimExtracted.length;
    // Same tolerance class as pdf-generator.test.ts's own marker-based test
    // (maxDiff <= 1 there, on a smaller synthetic source) — a real photo/
    // gradient-rich fixture re-encoded through PNG has slightly more
    // rounding noise than a flat-colour marker, so this uses a mean (not
    // max) bound, generous enough to never mask a real regression: any
    // genuine crop/zoom/shift/stretch of real template content shifts this
    // number by tens of units, not fractions of one.
    expect(meanAbsDiff).toBeLessThan(2);
  });

  it('a set of sample points across the trim area (simulating border/text/photo regions at fixed fractional coordinates) all land within 3 tone units of the same point in a plain resize — proves no positional shift anywhere in the frame, not just at one spot', async () => {
    const source = readFileSync(FIXTURE_PATH);
    const spec = PRINT_SPECS.card;
    const trimPxW = Math.round(spec.finalWidthIn * spec.dpi);
    const trimPxH = Math.round(spec.finalHeightIn * spec.dpi);
    const bleedPx = Math.round(spec.bleedIn * spec.dpi);

    const bleedRaster = await buildFullBleedRaster(source, spec);
    const { data: trimData, info } = await sharp(bleedRaster)
      .extract({ left: bleedPx, top: bleedPx, width: trimPxW, height: trimPxH })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const plainData = await sharp(source).resize(trimPxW, trimPxH, { fit: 'fill' }).removeAlpha().raw().toBuffer();

    // Fractional sample points standing in for: outer border (0.02/0.02),
    // inner artwork edge (0.15/0.5), nameplate/text band (0.5/0.85), and
    // logo corner (0.85/0.1) — spread across the frame rather than
    // clustered near one edge.
    const points: Array<[number, number]> = [[0.02, 0.02], [0.15, 0.5], [0.5, 0.85], [0.85, 0.1], [0.5, 0.5]];
    for (const [fx, fy] of points) {
      const x = Math.min(info.width - 1, Math.round(fx * info.width));
      const y = Math.min(info.height - 1, Math.round(fy * info.height));
      const idx = (y * info.width + x) * info.channels;
      const diff = Math.abs(trimData[idx] - plainData[idx]) + Math.abs(trimData[idx + 1] - plainData[idx + 1]) + Math.abs(trimData[idx + 2] - plainData[idx + 2]);
      expect(diff, `sample point (${fx}, ${fy})`).toBeLessThan(9); // 3 tone units per channel
    }
  });
});
