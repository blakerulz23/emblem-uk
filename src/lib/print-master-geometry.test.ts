import { describe, expect, it } from 'vitest';
import {
  FULL_PX,
  TRIM_PX,
  BLEED_PX,
  TRIM_RECT_IN_CANVAS,
  trimBoxToCanvasRect,
  trimPointToCanvasPoint,
  trimPolygonToCanvasPoints,
} from './print-master-geometry';
import { PRINT_SPECS } from './print-specs';

describe('print-master-geometry — authoritative 300dpi full-bleed dimensions', () => {
  it('derives full-bleed dimensions from print-specs.ts directly, never re-declared literals', () => {
    const spec = PRINT_SPECS.card;
    expect(TRIM_PX.w).toBe(Math.round(spec.finalWidthIn * spec.dpi));
    expect(TRIM_PX.h).toBe(Math.round(spec.finalHeightIn * spec.dpi));
    expect(BLEED_PX).toBe(Math.round(spec.bleedIn * spec.dpi));
  });

  it('exact required full-bleed canvas: 826x1126px (2.75x3.75in @300dpi)', () => {
    expect(FULL_PX.w).toBe(826);
    expect(FULL_PX.h).toBe(1126);
  });

  it('trim box is centred with exactly 0.125in (38px) bleed on every side', () => {
    expect(TRIM_RECT_IN_CANVAS.x).toBe(38);
    expect(TRIM_RECT_IN_CANVAS.y).toBe(38);
    expect(TRIM_RECT_IN_CANVAS.w).toBe(750);
    expect(TRIM_RECT_IN_CANVAS.h).toBe(1050);
    // Symmetric margin on the opposite edges too.
    expect(FULL_PX.w - (TRIM_RECT_IN_CANVAS.x + TRIM_RECT_IN_CANVAS.w)).toBe(BLEED_PX);
    expect(FULL_PX.h - (TRIM_RECT_IN_CANVAS.y + TRIM_RECT_IN_CANVAS.h)).toBe(BLEED_PX);
  });

  it('trim-relative percentage boxes stay anchored to the trim box, not the full canvas', () => {
    // A box at left:0%,top:0% must land exactly at the trim box's own
    // corner (38,38) — NOT at the full canvas's corner (0,0). This is the
    // exact bug a naive "just enlarge the container" approach produces.
    const rect = trimBoxToCanvasRect({ left: '0%', top: '0%', width: '10%', height: '10%' });
    expect(rect.x).toBe(BLEED_PX);
    expect(rect.y).toBe(BLEED_PX);
    expect(rect.w).toBeCloseTo(TRIM_PX.w * 0.1, 5);
    expect(rect.h).toBeCloseTo(TRIM_PX.h * 0.1, 5);
  });

  it('a box at 100%,100% lands exactly at the trim box far corner, inside the bleed margin, never at the full canvas edge', () => {
    const point = trimPointToCanvasPoint('100%', '100%');
    expect(point.x).toBe(BLEED_PX + TRIM_PX.w);
    expect(point.y).toBe(BLEED_PX + TRIM_PX.h);
    expect(point.x).toBeLessThan(FULL_PX.w);
    expect(point.y).toBeLessThan(FULL_PX.h);
  });

  it('polygon conversion offsets every point by the same trim-box origin', () => {
    const points = trimPolygonToCanvasPoints('polygon(0% 0%, 100% 0%, 100% 100%)');
    expect(points[0]).toEqual([BLEED_PX, BLEED_PX]);
    expect(points[1]).toEqual([BLEED_PX + TRIM_PX.w, BLEED_PX]);
    expect(points[2]).toEqual([BLEED_PX + TRIM_PX.w, BLEED_PX + TRIM_PX.h]);
  });
});
