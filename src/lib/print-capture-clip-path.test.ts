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
    // No current template uses this syntax (Glacier's own first-pass arch
    // clip did, emitting absolute-pixel SVG path data computed from the
    // card's real W/H, before being replaced with a generous inset()
    // rectangle — see GlacierCardArt.tsx's own doc comment) — kept
    // supported and tested for a future clip-path that needs it. Must pass
    // the string through untouched (Path2D parses it directly at actual
    // capture time, not here).
    const d = "M 100 200 A 300 150 0 0 1 700 200 L 700 400 L 100 400 Z";
    const shape = parseClipPathShape(`path('${d}')`, boxWidth, boxHeight);
    expect(shape).toEqual({ type: 'path', d });
  });

  it('parses inset() with the correct top/right/bottom/left-to-x/y/width/height mapping (explicit 4-value form)', () => {
    // Crimson/Royal/Emerald/Glacier's own PHOTO_CLIP, written with all 4
    // values distinct so the browser has no reason to collapse it.
    const shape = parseClipPathShape('inset(8% 20% 36% 15%)', boxWidth, boxHeight);
    expect(shape?.type).toBe('inset');
    if (shape?.type !== 'inset') throw new Error('expected inset shape');
    expect(shape.x).toBeCloseTo(150); // left 15% of 1000
    expect(shape.y).toBeCloseTo(40); // top 8% of 500
    expect(shape.width).toBeCloseTo(1000 - 150 - 200); // minus left (15%) and right (20%)
    expect(shape.height).toBeCloseTo(500 - 40 - 180); // minus top (8%) and bottom (36%)
  });

  it('expands the CSS 3-value inset() shorthand (right==left collapsed) the same way getComputedStyle serialises it', () => {
    // A real, shipped bug: this codebase's own PHOTO_CLIP is written as the
    // full 4-value 'inset(8% 15% 36% 15%)' (right==left==15%), but
    // getComputedStyle(el).clipPath — what neutralizeClipPathForCapture
    // actually reads at capture time, not the original inline string —
    // collapses that back down to the shortest equivalent CSS shorthand,
    // exactly like margin/padding: 'inset(8% 15% 36%)'. A parser that only
    // matched the literal 4-value form silently returned null here,
    // no-opping the entire capture-clip fix — confirmed live via a native-
    // vs-exported capture comparison showing a fully unclipped photo.
    const shape = parseClipPathShape('inset(8% 15% 36%)', boxWidth, boxHeight);
    expect(shape).toEqual({
      type: 'inset',
      x: 150, // left = right = 15% of 1000
      y: 40, // top 8% of 500
      width: 1000 - 150 - 150,
      height: 500 - 40 - 180, // bottom 36% of 500
    });
  });

  it('expands the CSS 3-value inset() shorthand for Galaxy\'s own real (right==bottom==left) collapsed value', () => {
    // Galaxy's own real clip-path, 'inset(2.2% 3.2% 3.2% 3.2% round 2%)',
    // collapses the same way (right==left triggers the 3-value form,
    // independently of bottom's own value) — getComputedStyle actually
    // returns 'inset(2.2% 3.2% 3.2% round 2%)' for it, not the 4-value
    // string this file's own inline style literally writes.
    const shape = parseClipPathShape('inset(2.2% 3.2% 3.2% round 2%)', boxWidth, boxHeight);
    expect(shape?.type).toBe('inset');
    if (shape?.type !== 'inset') throw new Error('expected inset shape');
    expect(shape.x).toBeCloseTo(32); // left 3.2% of 1000
    expect(shape.y).toBeCloseTo(11); // top 2.2% of 500
    expect(shape.width).toBeCloseTo(1000 - 32 - 32); // minus left and right insets
    expect(shape.height).toBeCloseTo(500 - 11 - 16); // minus top (2.2%) and bottom (3.2%) insets
  });

  it('expands the CSS 2-value and 1-value inset() shorthands too', () => {
    const two = parseClipPathShape('inset(10% 20%)', boxWidth, boxHeight);
    expect(two).toEqual({ type: 'inset', x: 200, y: 50, width: 1000 - 200 - 200, height: 500 - 50 - 50 });

    const one = parseClipPathShape('inset(5%)', boxWidth, boxHeight);
    expect(one).toEqual({ type: 'inset', x: 50, y: 25, width: 1000 - 50 - 50, height: 500 - 25 - 25 });
  });

  it('returns null for an unrecognised clip-path syntax rather than guessing', () => {
    expect(parseClipPathShape('circle(50% at center)', boxWidth, boxHeight)).toBeNull();
    expect(parseClipPathShape('none', boxWidth, boxHeight)).toBeNull();
    expect(parseClipPathShape('', boxWidth, boxHeight)).toBeNull();
  });
});
