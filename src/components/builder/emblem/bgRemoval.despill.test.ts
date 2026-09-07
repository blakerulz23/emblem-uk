import { describe, expect, it } from 'vitest';
import { despillAndKeyWhite } from './bgRemoval';

/**
 * Reproduces the "white halo" defect reported on Miles's and Roy's cards:
 * an edge pixel observed after Gemini composites the subject onto white is
 * a genuine blend of the subject's true colour and white. The old code only
 * ever adjusted alpha for a narrow 225-245 brightness band and left the RGB
 * untouched, so most real edge pixels stayed fully opaque with their colour
 * still contaminated by white — invisible on a light card, a visible pale
 * ring on a dark one.
 *
 * despillAndKeyWhite is spatially aware (it needs width/height, not just a
 * flat pixel list), so these tests build small synthetic 1-row "strip"
 * images with real left-to-right structure — pure background, an
 * anti-aliased blend gradient, then pure subject — rather than isolated
 * single pixels. That spatial structure is load-bearing: an earlier,
 * brightness-only version of this function passed single-pixel tests fine
 * but keyed real interior skin-tone pixels transparent, because brightness
 * alone can't distinguish a genuinely bright subject pixel from a
 * background-blended edge pixel. Only a strip image can catch that.
 */

type RGB = [number, number, number];

function blendOntoWhite(fg: RGB, alpha: number): RGB {
  return [
    Math.round(fg[0] * alpha + 255 * (1 - alpha)),
    Math.round(fg[1] * alpha + 255 * (1 - alpha)),
    Math.round(fg[2] * alpha + 255 * (1 - alpha)),
  ];
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** Builds a 1-row RGBA strip from a list of per-pixel [r,g,b,a] values. */
function buildStrip(pixels: [number, number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return data;
}

function pixelAt(data: Uint8ClampedArray, i: number): [number, number, number, number] {
  return [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
}

describe('despillAndKeyWhite', () => {
  it('keys pure-white background pixels fully transparent', () => {
    // 6 background px, 6 fully-opaque dark-subject px — background block is
    // wider than EDGE_RADIUS so its far end isn't itself treated as an edge.
    const bg: RGB = [255, 255, 255];
    const fg: RGB = [40, 30, 20];
    const pixels: [number, number, number, number][] = [
      ...Array(6).fill(0).map(() => [...bg, 255] as [number, number, number, number]),
      ...Array(6).fill(0).map(() => [...fg, 255] as [number, number, number, number]),
    ];
    const data = buildStrip(pixels);
    despillAndKeyWhite(data, pixels.length, 1);

    for (let i = 0; i < 6; i++) {
      expect(pixelAt(data, i)[3]).toBe(0);
    }
  });

  it('despills the anti-aliased blend edge of dark hair against white, close to true colour, near-transparent at the outer edge', () => {
    // background(6) | blend gradient, alpha 0.1..0.9 (9px) | opaque dark hair core (10px)
    const bg: RGB = [255, 255, 255];
    const darkHair: RGB = [40, 30, 20];
    const gradientAlphas = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

    const pixels: [number, number, number, number][] = [
      ...Array(6).fill(0).map(() => [...bg, 255] as [number, number, number, number]),
      ...gradientAlphas.map((a) => [...blendOntoWhite(darkHair, a), 255] as [number, number, number, number]),
      ...Array(10).fill(0).map(() => [...darkHair, 255] as [number, number, number, number]),
    ];
    const data = buildStrip(pixels);
    const width = pixels.length;
    despillAndKeyWhite(data, width, 1);

    // The core, far from any background pixel, must be untouched.
    const coreStart = 6 + gradientAlphas.length;
    for (let i = coreStart + 4; i < width; i++) {
      expect(pixelAt(data, i)).toEqual([...darkHair, 255]);
    }

    // Every gradient pixel should end up at least as close to the true
    // colour as the raw white-blended observation was — strictly closer for
    // the ones actually caught by the despill band, unchanged (already
    // close, since their white contamination was small to begin with) for
    // the ones deep enough to fall below EDGE_START.
    gradientAlphas.forEach((trueAlpha, idx) => {
      const i = 6 + idx;
      const observed = blendOntoWhite(darkHair, trueAlpha);
      const [r, g, b] = pixelAt(data, i);
      expect(colorDistance([r, g, b], darkHair)).toBeLessThanOrEqual(colorDistance(observed, darkHair));
    });

    // The halo-critical low-alpha pixels (mostly background bleed) must
    // show a strict, material improvement — this is the actual visible
    // defect on Miles's and Roy's cards.
    for (const trueAlpha of [0.1, 0.2, 0.3]) {
      const idx = gradientAlphas.indexOf(trueAlpha);
      const i = 6 + idx;
      const observed = blendOntoWhite(darkHair, trueAlpha);
      const [r, g, b] = pixelAt(data, i);
      expect(colorDistance([r, g, b], darkHair)).toBeLessThan(colorDistance(observed, darkHair));
    }

    // The pixel right next to the background block should end up mostly
    // transparent, not opaque-and-white-tinted.
    expect(pixelAt(data, 6)[3]).toBeLessThan(120);
  });

  it('does NOT erase a genuinely bright interior pixel (skin tone) that is nowhere near real background — the false positive an earlier brightness-only version had', () => {
    const bg: RGB = [255, 255, 255];
    const skinTone: RGB = [225, 190, 165]; // bright, but a real opaque subject colour

    // background(6) | a short dark-hair edge blend (5px) | skin tone deep in the interior (10px, well past EDGE_RADIUS=3 from any background pixel)
    const pixels: [number, number, number, number][] = [
      ...Array(6).fill(0).map(() => [...bg, 255] as [number, number, number, number]),
      ...[0.2, 0.4, 0.6, 0.8, 1.0].map((a) => [...blendOntoWhite([40, 30, 20], a), 255] as [number, number, number, number]),
      ...Array(10).fill(0).map(() => [...skinTone, 255] as [number, number, number, number]),
    ];
    const data = buildStrip(pixels);
    despillAndKeyWhite(data, pixels.length, 1);

    const interiorStart = 6 + 5 + 4; // well clear of the 3px adjacency radius
    for (let i = interiorStart; i < pixels.length; i++) {
      expect(pixelAt(data, i)).toEqual([...skinTone, 255]);
    }
  });

  it('regression guard: the old 225-245-only band would have missed this dark-hair halo pixel, the new logic catches it', () => {
    const bg: RGB = [255, 255, 255];
    const darkHair: RGB = [40, 30, 20];
    const observedAt20PctAlpha = blendOntoWhite(darkHair, 0.2);
    expect(Math.min(...observedAt20PctAlpha)).toBeLessThan(225); // outside the old band

    const pixels: [number, number, number, number][] = [
      ...Array(4).fill(0).map(() => [...bg, 255] as [number, number, number, number]),
      [...observedAt20PctAlpha, 255],
      ...Array(4).fill(0).map(() => [...darkHair, 255] as [number, number, number, number]),
    ];
    const data = buildStrip(pixels);
    despillAndKeyWhite(data, pixels.length, 1);

    const [r, g, b, a] = pixelAt(data, 4);
    expect(a).toBeLessThan(255);
    expect(colorDistance([r, g, b], darkHair)).toBeLessThan(colorDistance(observedAt20PctAlpha, darkHair));
  });
});
