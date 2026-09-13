import { describe, it, expect } from 'vitest';
import { parseClipPathShape } from './print-capture';

/**
 * Focused regression coverage for parseClipPathShape — the exact function
 * whose regex-destructuring had a real, shipped bug: `const [, rx, ry, cx,
 * cy] = match.slice(1).map(Number)` combined `.slice(1)` (which already
 * drops the full-match element at index 0) with a destructuring pattern
 * that ALSO skips its own first element via a leading comma, silently
 * shifting every value down by one (rx got ry's value, ry got cx's, cx got
 * cy's, and cy came out `undefined`). That produced a degenerate,
 * effectively-empty clip shape — confirmed live: html2canvas exports of
 * every clip-path-framed photo in the app came out completely blank until
 * this was found and fixed. These tests pin the correct field-to-value
 * mapping for all four supported shapes so a similar transcription slip
 * fails loudly here instead of silently blanking a customer's photo.
 */
describe('parseClipPathShape', () => {
  const boxWidth = 1000;
  const boxHeight = 500;

  it('parses ellipse() with the correct rx/ry/cx/cy field mapping, not shifted by one', () => {
    // Crimson/Royal/Emerald's own real clip-path value.
    const shape = parseClipPathShape('ellipse(38% 16.5% at 50% 47.5%)', boxWidth, boxHeight);
    expect(shape).toEqual({ type: 'ellipse', rx: 380, ry: 82.5, cx: 500, cy: 237.5 });
  });

  it('parses a second, distinct ellipse() to confirm the mapping is not coincidentally symmetric', () => {
    // A deliberately asymmetric case (rx != ry != cx != cy) — the shipped
    // bug's shifted values would only coincidentally match symmetric inputs
    // like the one above where several fields are close in value.
    const shape = parseClipPathShape('ellipse(10% 20% at 30% 40%)', boxWidth, boxHeight);
    expect(shape).toEqual({ type: 'ellipse', rx: 100, ry: 100, cx: 300, cy: 200 });
  });

  it('parses polygon() into pixel-resolved points in the given order', () => {
    // A simplified stand-in for CardArt.tsx's own EMJFL_PHOTO_CLIP.
    const shape = parseClipPathShape('polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', boxWidth, boxHeight);
    expect(shape).toEqual({
      type: 'polygon',
      points: [
        [0, 0],
        [1000, 0],
        [1000, 500],
        [0, 500],
      ],
    });
  });

  it('parses path(\'...\') by extracting the literal SVG path data unchanged', () => {
    // Glacier's own buildArchClipPath already emits absolute-pixel SVG path
    // data — this must pass the string through untouched (Path2D parses it
    // directly at actual capture time, not here).
    const d = "M 100 200 A 300 150 0 0 1 700 200 L 700 400 L 100 400 Z";
    const shape = parseClipPathShape(`path('${d}')`, boxWidth, boxHeight);
    expect(shape).toEqual({ type: 'path', d });
  });

  it('parses inset() with the correct top/right/bottom/left-to-x/y/width/height mapping', () => {
    // Galaxy's own real clip-path value (ignoring the trailing "round 2%").
    const shape = parseClipPathShape('inset(2.2% 3.2% 3.2% 3.2% round 2%)', boxWidth, boxHeight);
    expect(shape?.type).toBe('inset');
    if (shape?.type !== 'inset') throw new Error('expected inset shape');
    expect(shape.x).toBeCloseTo(32); // left 3.2% of 1000
    expect(shape.y).toBeCloseTo(11); // top 2.2% of 500
    expect(shape.width).toBeCloseTo(1000 - 32 - 32); // minus left and right insets
    expect(shape.height).toBeCloseTo(500 - 11 - 16); // minus top (2.2%) and bottom (3.2%) insets
  });

  it('returns null for an unrecognised clip-path syntax rather than guessing', () => {
    expect(parseClipPathShape('circle(50% at center)', boxWidth, boxHeight)).toBeNull();
    expect(parseClipPathShape('none', boxWidth, boxHeight)).toBeNull();
    expect(parseClipPathShape('', boxWidth, boxHeight)).toBeNull();
  });
});
