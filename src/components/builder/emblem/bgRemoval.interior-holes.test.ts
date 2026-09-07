import { describe, expect, it } from 'vitest';
import { keyWhiteConnectedToBorder } from './bgRemoval';

/**
 * Reproduces the "blocky interior cutout" defect reported live: a bright
 * patch deep inside the subject (a highlight, a JPEG-compression block, a
 * shadowed gap between the legs) got keyed transparent by the plain
 * brightness-threshold version even though it's nowhere near the real
 * background, punching a visible hole mid-body. keyWhiteConnectedToBorder
 * fixes this with connectivity: only pixels reachable from the image's
 * actual outer edge via other bright pixels are ever eligible to be keyed,
 * regardless of how bright an isolated interior pixel is.
 */

function makeGrid(width: number, height: number, fill: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = fill(x, y);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

function alphaAt(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  return data[(y * width + x) * 4 + 3];
}

describe('keyWhiteConnectedToBorder', () => {
  it('keys a full white background (connected to every edge) fully transparent, leaves a dark subject alone', () => {
    const width = 20, height = 20;
    const data = makeGrid(width, height, (x, y) => (x >= 6 && x < 14 && y >= 6 && y < 14 ? 30 : 255));
    keyWhiteConnectedToBorder(data, width, height);

    expect(alphaAt(data, width, 0, 0)).toBe(0);
    expect(alphaAt(data, width, 19, 19)).toBe(0);
    expect(alphaAt(data, width, 10, 10)).toBe(255);
  });

  it('reproduces the reported defect and confirms the fix: an isolated bright interior patch, not touching the border, stays fully opaque no matter how bright', () => {
    const width = 30, height = 30;
    const data = makeGrid(width, height, (x, y) => {
      // A dark subject block occupying most of the frame...
      if (x >= 3 && x < 27 && y >= 3 && y < 27) {
        // ...with an isolated bright "highlight"/JPEG-block patch dead
        // centre, well clear of the subject's own edge.
        if (x >= 13 && x < 17 && y >= 13 && y < 17) return 250;
        return 30;
      }
      return 255; // real background, touches every border
    });
    keyWhiteConnectedToBorder(data, width, height);

    // Real background: transparent.
    expect(alphaAt(data, width, 0, 0)).toBe(0);
    // The isolated bright interior patch: untouched, still fully opaque,
    // even though 250 is well past the fully-background cutoff.
    expect(alphaAt(data, width, 15, 15)).toBe(255);
    // The surrounding dark subject: untouched.
    expect(alphaAt(data, width, 5, 5)).toBe(255);
  });

  it('follows an 8-connected diagonal path of background pixels back to the border', () => {
    const width = 10, height = 10;
    // A diagonal staircase of bright pixels from the top-left corner down
    // to a bright pixel at (5,5) that touches no edge directly.
    const data = makeGrid(width, height, (x, y) => (x === y && x <= 5 ? 255 : 30));
    keyWhiteConnectedToBorder(data, width, height);

    expect(alphaAt(data, width, 0, 0)).toBe(0);
    expect(alphaAt(data, width, 5, 5)).toBe(0);
  });

  it('applies the same linear partial-alpha ramp as before for background-connected pixels in the 225-244 band', () => {
    const width = 3, height = 1;
    const data = makeGrid(width, height, (x) => (x === 0 ? 255 : x === 1 ? 235 : 255));
    keyWhiteConnectedToBorder(data, width, height);

    expect(alphaAt(data, width, 0, 0)).toBe(0);
    // (245 - 235) / 20 * 255 = 127.5 -> rounds to 128 (or 127 depending on
    // rounding direction) — assert the ramp, not touched (255) or fully
    // cleared (0).
    const midAlpha = alphaAt(data, width, 1, 0);
    expect(midAlpha).toBeGreaterThan(0);
    expect(midAlpha).toBeLessThan(255);
  });

  it('does not falsely clear real (non-bright) background content, e.g. grass — this function only decides which bright pixels count, it never touches non-bright ones', () => {
    const width = 10, height = 10;
    // "Grass" colour has a low min-channel value (green channel high, but
    // min(r,g,b) is what the threshold checks) — well under 225.
    const data = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      data[p * 4] = 90;
      data[p * 4 + 1] = 120;
      data[p * 4 + 2] = 60;
      data[p * 4 + 3] = 255;
    }
    keyWhiteConnectedToBorder(data, width, height);
    expect(alphaAt(data, width, 0, 0)).toBe(255);
    expect(alphaAt(data, width, 5, 5)).toBe(255);
  });
});
