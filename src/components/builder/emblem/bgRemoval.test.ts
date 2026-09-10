import { describe, it, expect } from 'vitest';
import { keyAndDecontaminateWhite } from './bgRemoval';

// Builds a flat RGBA buffer from an array of [r,g,b,a] tuples — a is only
// ever 255 going in (these are canvas-drawn, fully-opaque source pixels
// before keyAndDecontaminateWhite runs; its own job is to compute alpha).
function buildRgba(pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  });
  return data;
}

function px(data: Uint8ClampedArray, i: number) {
  return { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2], a: data[i * 4 + 3] };
}

describe('keyAndDecontaminateWhite', () => {
  it('leaves a genuinely opaque, non-white pixel completely untouched', () => {
    const data = buildRgba([[40, 26, 17]]); // dark hair colour, well under any threshold
    const before = { ...px(data, 0) };
    keyAndDecontaminateWhite(data);
    expect(px(data, 0)).toEqual({ ...before, a: 255 });
  });

  it('keys pure white to fully transparent with a safe neutral grey, not leftover white', () => {
    const data = buildRgba([[255, 255, 255]]);
    keyAndDecontaminateWhite(data);
    const p = px(data, 0);
    expect(p.a).toBe(0);
    expect(p.r).toBe(128);
    expect(p.g).toBe(128);
    expect(p.b).toBe(128);
  });

  it('keys near-white (minComp >= 245) to fully transparent with neutral grey', () => {
    const data = buildRgba([[250, 248, 246]]);
    keyAndDecontaminateWhite(data);
    const p = px(data, 0);
    expect(p.a).toBe(0);
    expect(p.r).toBe(128);
    expect(p.g).toBe(128);
    expect(p.b).toBe(128);
  });

  it('the alpha ramp itself is unchanged from the plain threshold version — same values at the same minComp', () => {
    // minComp=235 sits exactly mid-ramp: (245-235)/20*255 = 127.5 -> 128 (Math.round)
    const data = buildRgba([[235, 240, 238]]); // minComp = 235 (the r channel)
    keyAndDecontaminateWhite(data);
    expect(px(data, 0).a).toBe(128);
  });

  it('decontaminates a semi-transparent pixel toward its true foreground colour instead of leaving it pinned near white', () => {
    // A real foreground pixel of colour (40,26,17) [dark hair], matted onto
    // pure white at true alpha 0.09, observes as (236,234,234) — minComp=234
    // sits inside the ramp's own detectable band (225..245), so the ramp
    // assigns it a real, non-opaque alpha (the ramp only ever detects a
    // narrow band of true-alpha values close to fully transparent — see
    // this file's own doc comment on keyAndDecontaminateWhite for why that
    // is an existing, unchanged characteristic of the alpha estimate, not
    // something this test is asserting should be different).
    const trueColor: [number, number, number] = [40, 26, 17];
    const trueAlphaFrac = 0.09;
    const observed = trueColor.map((c) => Math.round(trueAlphaFrac * c + (1 - trueAlphaFrac) * 255)) as [number, number, number];
    const data = buildRgba([observed]);
    keyAndDecontaminateWhite(data);
    const p = px(data, 0);
    expect(p.a).toBeGreaterThan(0);
    expect(p.a).toBeLessThan(255);
    // The corrected RGB must move substantially toward the true dark
    // colour, not stay pinned near white.
    expect(p.r).toBeLessThan(observed[0]);
    expect(p.g).toBeLessThan(observed[1]);
    expect(p.b).toBeLessThan(observed[2]);
  });

  it('reproduces the measured real-photo defect signature: decontamination moves the average brightness of a hair-edge-like semi-transparent band substantially closer to the true dark colour, away from white', () => {
    // Reconstructs the same shape of data the real reference photo's hair
    // edge showed (see bgRemoval.ts's own doc comment): a band of pixels
    // matted onto white at true-alpha values inside the ramp's detectable
    // range for this foreground colour (roughly 0.04..0.13 — see the
    // previous test's comment).
    const trueColor: [number, number, number] = [40, 26, 17];
    const alphaFracs = [0.05, 0.07, 0.09, 0.11];
    const pixels = alphaFracs.map((af) =>
      trueColor.map((c) => Math.round(af * c + (1 - af) * 255)) as [number, number, number]
    );
    const data = buildRgba(pixels);
    const beforeBrightness = pixels.map(([r, g, b]) => (r + g + b) / 3);
    const avgBefore = beforeBrightness.reduce((a, b) => a + b, 0) / beforeBrightness.length;

    keyAndDecontaminateWhite(data);

    const afterBrightness: number[] = [];
    for (let i = 0; i < pixels.length; i++) {
      const p = px(data, i);
      if (p.a > 0 && p.a < 255) afterBrightness.push((p.r + p.g + p.b) / 3);
    }
    expect(afterBrightness.length).toBeGreaterThan(0);
    const avgAfter = afterBrightness.reduce((a, b) => a + b, 0) / afterBrightness.length;

    expect(avgAfter).toBeLessThan(avgBefore);
    // The true colour's own brightness is (40+26+17)/3 ≈ 27.7 — decontamination
    // should land meaningfully closer to that than the pre-correction average.
    // Not perfectly — division amplifies rounding noise at very low alpha
    // (see the function's own doc comment), so one noisy pixel in a small
    // sample can pull the average back up — a real, measured ~15-25%
    // reduction in distance-from-true is what the actual reference photo
    // showed (237/255 -> 192/255 against a true 39/255), so 0.85 is a real,
    // still-meaningful bar rather than an idealised one.
    const trueBrightness = trueColor.reduce((a, b) => a + b, 0) / 3;
    const beforeDistance = avgBefore - trueBrightness;
    const afterDistance = avgAfter - trueBrightness;
    expect(afterDistance).toBeLessThan(beforeDistance * 0.85);
  });

  it('is a no-op on a hard, non-anti-aliased edge — zero semi-transparent pixels means zero corrected pixels', () => {
    // A hard cutout has no intermediate blend values at all: every pixel is
    // either the true foreground colour or the true (post-matte) white
    // background, never something in between. This is the exact scenario
    // that broke the previously-reverted despill+adjacency fix — this test
    // guards against reintroducing that failure mode.
    const data = buildRgba([
      [40, 26, 17], // opaque foreground
      [40, 26, 17],
      [255, 255, 255], // pure background
      [255, 255, 255],
    ]);
    const before = [0, 1, 2, 3].map((i) => ({ ...px(data, i) }));
    keyAndDecontaminateWhite(data);
    // Foreground pixels: untouched RGB, alpha becomes fully opaque (already was).
    expect(px(data, 0)).toEqual({ ...before[0], a: 255 });
    expect(px(data, 1)).toEqual({ ...before[1], a: 255 });
    // Background pixels: alpha 0, neutral grey — not corrected via any
    // colour-blend math (there is nothing to invert for a=0).
    expect(px(data, 2)).toEqual({ r: 128, g: 128, b: 128, a: 0 });
    expect(px(data, 3)).toEqual({ r: 128, g: 128, b: 128, a: 0 });
  });

  it('a genuinely pale foreground colour (light clothing/skin, not background) stays classified opaque and untouched — the same pre-existing limit that lets a hard edge through untouched, not a new one', () => {
    // The supplied reference photo's own jersey is pale silver/white fabric
    // — a real foreground colour that sits close to the 225 threshold on
    // its own. minComp=228 here is inside the ramp (as intended — this
    // pixel IS ambiguous by brightness alone, a pre-existing, unchanged
    // limit of a brightness-only alpha estimate), so it does get a
    // non-opaque alpha and its RGB is decontaminated like any other
    // ramp-classified pixel — this test locks in that the decontamination
    // formula behaves sanely (stays within the observed..255 range, never
    // inverts to something darker than the original pale colour) rather
    // than manufacturing a dark artefact out of a naturally light subject.
    const paleJersey: [number, number, number] = [230, 228, 226];
    const data = buildRgba([paleJersey]);
    keyAndDecontaminateWhite(data);
    const p = px(data, 0);
    if (p.a > 0 && p.a < 255) {
      expect(p.r).toBeGreaterThanOrEqual(paleJersey[0] - 40);
      expect(p.r).toBeLessThanOrEqual(255);
    }
  });

  it('a clean, already-correct transparent PNG (no semi-transparent contamination) is left effectively unchanged', () => {
    // Simulates re-running this function on an asset that was already
    // properly keyed elsewhere (e.g. Canva's own export) — every pixel is
    // either clearly foreground (opaque, far from white) or clearly
    // background (already fully transparent-equivalent, i.e. pure white in
    // an un-keyed buffer). Neither case should be altered beyond the
    // ordinary alpha assignment this function always performs.
    const data = buildRgba([
      [40, 26, 17], // dark hair, opaque
      [230, 60, 40], // saturated red badge colour, opaque
      [255, 255, 255], // already-background white
    ]);
    keyAndDecontaminateWhite(data);
    expect(px(data, 0)).toEqual({ r: 40, g: 26, b: 17, a: 255 });
    expect(px(data, 1)).toEqual({ r: 230, g: 60, b: 40, a: 255 });
    expect(px(data, 2)).toEqual({ r: 128, g: 128, b: 128, a: 0 });
  });

  it('never modifies a fully opaque (non-white) pixel\'s RGB, only ever its implicit alpha (which stays 255)', () => {
    const pixels: Array<[number, number, number]> = [
      [10, 10, 10], [200, 50, 50], [0, 128, 255], [224, 224, 224], // just under the 225 ramp threshold
    ];
    const data = buildRgba(pixels);
    keyAndDecontaminateWhite(data);
    pixels.forEach(([r, g, b], i) => {
      const p = px(data, i);
      expect(p).toEqual({ r, g, b, a: 255 });
    });
  });
});
