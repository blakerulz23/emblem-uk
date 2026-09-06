import { PRINT_SPECS } from './print-specs';

/**
 * Authoritative full-bleed pixel geometry for the print-master compositor
 * (print-master-render.ts), derived from the SAME print-specs.ts numbers
 * pdf-generator.ts already uses — never re-declared as separate literals,
 * so the master and the legacy PDF path can never silently drift apart on
 * what "300dpi full bleed" means.
 */
export const CARD_SPEC = PRINT_SPECS.card;

export const TRIM_PX = {
  w: Math.round(CARD_SPEC.finalWidthIn * CARD_SPEC.dpi), // 750
  h: Math.round(CARD_SPEC.finalHeightIn * CARD_SPEC.dpi), // 1050
};
export const BLEED_PX = Math.round(CARD_SPEC.bleedIn * CARD_SPEC.dpi); // 38
export const FULL_PX = {
  w: TRIM_PX.w + BLEED_PX * 2, // 826
  h: TRIM_PX.h + BLEED_PX * 2, // 1126
};

/** A CardArt.tsx box expressed the same way the manifest/component does:
 *  percentages of the TRIM box (never of the full bleed canvas) — this is
 *  exactly what "trim-relative" means for this codebase's own components. */
export interface PctBox {
  left: string; // e.g. '12.33%'
  top: string;
  width?: string;
  height?: string;
}

function pct(v: string | undefined, fallback = 0): number {
  if (!v) return fallback;
  return Number(v.replace('%', '')) / 100;
}

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Converts a trim-relative percentage box into ABSOLUTE pixel coordinates
 * within the full bleed canvas — i.e. it both scales by the trim box's own
 * pixel size AND offsets by BLEED_PX, which is the one step a naive "just
 * render CardArt bigger" approach always gets wrong (percentages of a
 * bigger container drift outward instead of staying pinned to the trim
 * box — see the read-only audit's Test C writeup). This is the single
 * function every trim-relative element (photo clip, badge, name, number,
 * position, back logo/name) must go through.
 */
export function trimBoxToCanvasRect(box: PctBox): PxRect {
  return {
    x: BLEED_PX + pct(box.left) * TRIM_PX.w,
    y: BLEED_PX + pct(box.top) * TRIM_PX.h,
    w: box.width !== undefined ? pct(box.width) * TRIM_PX.w : 0,
    h: box.height !== undefined ? pct(box.height) * TRIM_PX.h : 0,
  };
}

/** Same conversion for a single point (left/top only, no width/height) —
 *  used for text anchors, which CardArt positions as a point plus a CSS
 *  transform (translate/rotate), not a box. */
export function trimPointToCanvasPoint(left: string, top: string): { x: number; y: number } {
  return {
    x: BLEED_PX + pct(left) * TRIM_PX.w,
    y: BLEED_PX + pct(top) * TRIM_PX.h,
  };
}

/**
 * Converts a CSS `polygon(x% y%, ...)` clip-path string (CardArt.tsx's
 * EMJFL_PHOTO_CLIP) — defined against the trim box's own 0-100% bounds —
 * into an array of absolute canvas pixel points, in the same trim-relative
 * sense as trimBoxToCanvasRect above.
 */
export function trimPolygonToCanvasPoints(cssPolygon: string): Array<[number, number]> {
  const inner = cssPolygon.replace(/^polygon\(/, '').replace(/\)$/, '');
  return inner.split(',').map((pair) => {
    const [xStr, yStr] = pair.trim().split(/\s+/);
    return [
      BLEED_PX + (Number(xStr.replace('%', '')) / 100) * TRIM_PX.w,
      BLEED_PX + (Number(yStr.replace('%', '')) / 100) * TRIM_PX.h,
    ];
  });
}

/** The trim box's own rect within the full canvas — always the same
 *  (BLEED_PX, BLEED_PX, TRIM_PX.w, TRIM_PX.h), exposed as one constant so
 *  every call site shares the identical rectangle rather than
 *  recomputing it (and risking an off-by-one drift between them). */
export const TRIM_RECT_IN_CANVAS: PxRect = { x: BLEED_PX, y: BLEED_PX, w: TRIM_PX.w, h: TRIM_PX.h };
