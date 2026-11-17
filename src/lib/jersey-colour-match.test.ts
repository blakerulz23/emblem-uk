import { describe, expect, it } from 'vitest';
import { deltaE, dominantColours, hexToRgb, rankByJersey, STRONG_MATCH_DELTA_E } from './jersey-colour-match';

/** A width x height RGBA frame: transparent outside the torso band, `fill` inside. */
function frame(width: number, height: number, fill: (x: number, y: number) => [number, number, number] | null): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgb = fill(x, y);
      if (!rgb) continue;
      const i = (y * width + x) * 4;
      data.set([...rgb, 255], i);
    }
  }
  return data;
}

describe('dominantColours', () => {
  it('reads a red kit with a blue stripe, red first', () => {
    const data = frame(100, 100, (x) => (x > 60 && x < 75 ? [20, 50, 200] : [210, 30, 35]));
    const colours = dominantColours(data, 100, 100);
    expect(colours.map((c) => c.hex.slice(1, 3))).toHaveLength(2);
    expect(deltaE(hexToRgb(colours[0].hex), { r: 210, g: 30, b: 35 })).toBeLessThan(5);
    expect(deltaE(hexToRgb(colours[1].hex), { r: 20, g: 50, b: 200 })).toBeLessThan(5);
  });

  it('does not read sunlit skin (chroma just over 50) as a kit colour', () => {
    const data = frame(60, 60, (x) => (x < 30 ? [245, 146, 101] : [250, 250, 250]));
    expect(dominantColours(data, 60, 60)).toEqual([]);
  });

  it('still reads true orange and gold kits', () => {
    for (const kit of [[241, 106, 49], [255, 140, 0], [230, 170, 20]] as [number, number, number][]) {
      const data = frame(60, 60, () => kit);
      expect(dominantColours(data, 60, 60), `rgb(${kit})`).toHaveLength(1);
    }
  });

  it('does not read skin as a kit colour, from pale to deep', () => {
    for (const skin of [[241, 194, 167], [224, 172, 105], [198, 134, 66], [141, 85, 36], [92, 56, 32]] as [number, number, number][]) {
      const data = frame(60, 60, (x) => (x < 30 ? skin : [250, 250, 250]));
      expect(dominantColours(data, 60, 60), `rgb(${skin})`).toEqual([]);
    }
  });

  it('still reads an orange kit', () => {
    const data = frame(60, 60, () => [242, 107, 31]);
    expect(dominantColours(data, 60, 60)).toHaveLength(1);
  });

  it('ignores the removed background and neutral white and black', () => {
    const data = frame(80, 80, (x, y) => (y < 30 ? null : x < 40 ? [250, 250, 250] : [12, 12, 12]));
    expect(dominantColours(data, 80, 80)).toEqual([]);
  });
});

describe('rankByJersey', () => {
  const designs = [
    { id: 'violet', accent: '#8f5cff' },
    { id: 'red', accent: '#df3829' },
    { id: 'green', accent: '#1f8a52' },
    { id: 'ice', accent: '#4fc3f7' },
  ];

  it('puts the design nearest the kit first', () => {
    const ranked = rankByJersey(designs, (d) => d.accent, [{ hex: '#1c8f4a', share: 0.7 }, { hex: '#f5f5f5', share: 0.1 }]);
    expect(ranked[0].item.id).toBe('green');
    const red = rankByJersey(designs, (d) => d.accent, [{ hex: '#c8102e', share: 0.8 }]);
    expect(red[0].item.id).toBe('red');
  });

  it('matches a dark navy kit to the ice-blue design, and calls it a match', () => {
    const ranked = rankByJersey(designs, (d) => d.accent, [{ hex: '#253452', share: 0.6 }]);
    expect(ranked[0].item.id).toBe('ice');
    expect(ranked[0].score).toBeLessThanOrEqual(STRONG_MATCH_DELTA_E);
  });

  it('keeps the given order when the kit has no colour to match', () => {
    expect(rankByJersey(designs, (d) => d.accent, []).map((r) => r.item.id)).toEqual(['violet', 'red', 'green', 'ice']);
  });
});
