import { describe, expect, it } from 'vitest';
import { borderCleanFraction, BORDER_CLEAN_THRESHOLD } from './bgRemoval';

/**
 * Reproduces the "grass bleeding through" defect: Gemini's cutout step is
 * generative, not deterministic segmentation, so the same source photo can
 * come back with the background fully replaced by white on one call and
 * only partially replaced (real photo content still visible in part of the
 * frame) on another. borderCleanFraction is the quality signal
 * removeBackgroundSmart uses to detect that and retry — since the cutout
 * prompt always centers and fully frames the subject, a properly-generated
 * result's outer edge should be almost entirely pure white regardless of
 * pose, so sampling just the perimeter is enough to catch "an entire region
 * of the border is the wrong colour" without needing to understand the
 * subject's silhouette at all.
 */

function makeImage(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = fill(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('borderCleanFraction', () => {
  it('scores a fully white image as perfectly clean', () => {
    const data = makeImage(32, 32, () => [255, 255, 255]);
    expect(borderCleanFraction(data, 32, 32)).toBe(1);
  });

  it('scores an image whose entire border is real (non-white) content as 0', () => {
    const grass: [number, number, number] = [90, 120, 60];
    const data = makeImage(32, 32, () => grass);
    expect(borderCleanFraction(data, 32, 32)).toBe(0);
  });

  it('reproduces the reported defect: a clean top/sides but a contaminated bottom edge scores roughly half, well under the accept threshold', () => {
    const grass: [number, number, number] = [90, 120, 60];
    const data = makeImage(64, 64, (_x, y) => (y >= 32 ? grass : [255, 255, 255]));
    const score = borderCleanFraction(data, 64, 64);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
    expect(score).toBeLessThan(BORDER_CLEAN_THRESHOLD);
  });

  it('does not penalise interior (non-border) contamination — this check is deliberately perimeter-only', () => {
    const grass: [number, number, number] = [90, 120, 60];
    // A patch of "grass" entirely in the interior, at least 2px clear of every edge.
    const data = makeImage(32, 32, (x, y) => (x >= 10 && x <= 20 && y >= 10 && y <= 20 ? grass : [255, 255, 255]));
    expect(borderCleanFraction(data, 32, 32)).toBe(1);
  });

  it('treats a pixel exactly at the white cutoff as clean, and one just below it as not', () => {
    const atCutoff = makeImage(16, 16, () => [245, 245, 245]);
    expect(borderCleanFraction(atCutoff, 16, 16)).toBe(1);

    const justBelow = makeImage(16, 16, () => [244, 244, 244]);
    expect(borderCleanFraction(justBelow, 16, 16)).toBe(0);
  });

  it('a single contaminated channel is enough to disqualify a pixel (uses the min of r/g/b, same as alphaKeyWhite)', () => {
    // Bright yellow: r/g at 255 but b crashed to 100 — a real background
    // pixel would never look like this, so this must not be miscounted as clean.
    const data = makeImage(16, 16, () => [255, 255, 100]);
    expect(borderCleanFraction(data, 16, 16)).toBe(0);
  });
});
