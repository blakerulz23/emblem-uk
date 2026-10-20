import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { computePhotoGeometry } from './photo-geometry';
import {
  CARD_PHOTO_OBJECT_POSITIONS,
  PHOTO_GESTURE_LIMITS,
  inferObjectPosition,
  panPhoto,
  photoAnchorPoint,
  touchDistance,
  wheelZoomFactor,
  zoomBounds,
  zoomPhotoBy,
  zoomPhotoTo,
  type PhotoFrameModel,
} from './photo-gestures';

const BOX = { boxWidth: 340, boxHeight: 476 };
const unmeasured: PhotoFrameModel = { ...BOX, objectPosition: 'center 12%', natural: null };
const portrait: PhotoFrameModel = { ...BOX, objectPosition: 'center 12%', natural: { naturalWidth: 1200, naturalHeight: 2400 } };
const landscape: PhotoFrameModel = { ...BOX, objectPosition: 'center 25%', natural: { naturalWidth: 3000, naturalHeight: 2000 } };

describe('panPhoto: the photo follows the pointer in both renderer regimes', () => {
  it('zoom >= 1: dragging right by 10% of the card moves x up by 10', () => {
    expect(panPhoto({ x: 0, y: 0, scale: 1.2 }, portrait, { fx: 0.1, fy: 0 })).toEqual({ x: 10, y: 0, scale: 1.2 });
    expect(panPhoto({ x: 0, y: 0, scale: 1 }, unmeasured, { fx: 0, fy: -0.05 })).toEqual({ x: 0, y: -5, scale: 1 });
  });

  it('zoom < 1 on a measured photo: the drawn photo moves with the drag (x goes the other way)', () => {
    // At 0.85 the portrait photo shows its full width (so only y can move)
    // and the landscape one its full height (so only x can move): the
    // renderer never offsets an axis that already shows the whole photo.
    for (const frame of [portrait, landscape]) {
      const start = { x: 0, y: 0, scale: 0.85 };
      const before = photoAnchorPoint(start, frame);
      const moved = panPhoto(start, frame, { fx: 0.02, fy: 0.02 });
      const after = photoAnchorPoint(moved, frame);
      // Wherever the renderer lets it move, it moves by the drag (to within rounding).
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      if (Math.abs(dx) > 0.5) expect(dx).toBeCloseTo(0.02 * frame.boxWidth, 0);
      if (Math.abs(dy) > 0.5) expect(dy).toBeCloseTo(0.02 * frame.boxHeight, 0);
      expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0.5);
      expect(moved.scale).toBe(0.85);
    }
  });

  it('stops at the photo edge without a dead zone on the way back', () => {
    const start = { x: 0, y: 0, scale: 0.85 };
    const pushed = panPhoto(start, portrait, { fx: 0, fy: 5 }); // far past the edge
    expect(Math.abs(pushed.y)).toBeLessThanOrEqual(PHOTO_GESTURE_LIMITS.maxOffset);
    const edge = photoAnchorPoint(pushed, portrait).y;
    const back = panPhoto(pushed, portrait, { fx: 0, fy: -0.02 });
    expect(photoAnchorPoint(back, portrait).y).toBeLessThan(edge - 1); // moves on the first nudge back
  });

  it('never leaves the slider range, and never produces NaN', () => {
    const far = panPhoto({ x: 0, y: 0, scale: 1.5 }, unmeasured, { fx: 9, fy: -9 });
    expect(far).toEqual({ x: 40, y: -40, scale: 1.5 });
    const junk = panPhoto({ x: Number.NaN, y: 0, scale: 1 }, unmeasured, { fx: Number.NaN, fy: 0.1 });
    expect(Number.isFinite(junk.x) && Number.isFinite(junk.y)).toBe(true);
  });
});

describe('zoom', () => {
  it('keeps an Auto-fit scale below the slider minimum instead of snapping it up', () => {
    expect(zoomBounds(0.12)).toEqual({ min: 0.12, max: 1.8 });
    expect(zoomPhotoBy({ x: 0, y: 0, scale: 0.12 }, portrait, 0.5).scale).toBe(0.12);
    expect(zoomPhotoTo({ x: 0, y: 0, scale: 1 }, portrait, 9).scale).toBe(1.8);
  });

  it('holds the photo still while zooming, including across zoom 1 (where the renderer switches maths)', () => {
    // Each photo is held on the axis the renderer can still offset below
    // zoom 1 (portrait: y, landscape: x).
    const p0 = { x: 0, y: -4, scale: 1.2 };
    const pOut = zoomPhotoTo(p0, portrait, 0.9);
    expect(pOut.scale).toBe(0.9);
    expect(Math.abs(photoAnchorPoint(pOut, portrait).y - photoAnchorPoint(p0, portrait).y)).toBeLessThan(1);
    const l0 = { x: 6, y: 0, scale: 1.2 };
    const lOut = zoomPhotoTo(l0, landscape, 0.9);
    expect(Math.abs(photoAnchorPoint(lOut, landscape).x - photoAnchorPoint(l0, landscape).x)).toBeLessThan(1);
    // And back up again, staying put.
    const back = zoomPhotoTo(lOut, landscape, 1.3);
    expect(Math.abs(photoAnchorPoint(back, landscape).x - photoAnchorPoint(l0, landscape).x)).toBeLessThan(1);
  });

  it('wheel and pinch helpers are gentle and finite', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(10_000)).toBe(wheelZoomFactor(100));
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
  });
});

describe('inferObjectPosition reads the family anchor back from the rendered photo', () => {
  it('cover regime: from the computed object-position', () => {
    expect(inferObjectPosition({ crop: { x: 0, y: 0, scale: 1 }, ...BOX, natural: null, computed: { transform: 'matrix(1,0,0,1,0,0)', objectPosition: '50% 25%', left: '0px', top: '0px' } })).toBe('50% 25%');
  });

  it('window regime: by reproducing the drawn left/top', () => {
    for (const candidate of CARD_PHOTO_OBJECT_POSITIONS) {
      const crop = { x: 0, y: 0, scale: 0.7 };
      const g = computePhotoGeometry(crop, candidate, { ...portrait.natural!, ...BOX });
      const inferred = inferObjectPosition({ crop, ...BOX, natural: portrait.natural, computed: { transform: 'none', objectPosition: '50% 50%', left: g.left!, top: g.top! } });
      const gi = computePhotoGeometry(crop, inferred, { ...portrait.natural!, ...BOX });
      expect(gi.top).toBe(g.top); // draws identically, whichever label ties
    }
  });
});

describe('contract: every card family uses a known photo object-position', () => {
  it('matches the object-positions passed to computePhotoGeometry in the card art (protected files, read only)', () => {
    const dir = path.join(__dirname, '../components/builder/emblem');
    const files = ['CardArt.tsx', 'CrimsonCardArt.tsx', 'EmeraldCardArt.tsx', 'GlacierCardArt.tsx', 'RoyalCardArt.tsx'];
    const found = new Set<string>();
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), 'utf8');
      const re = /computePhotoGeometry\(\s*\{[^}]*\},\s*'([^']+)'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) found.add(m[1]);
    }
    expect(found.size).toBeGreaterThan(0);
    for (const position of Array.from(found)) expect(CARD_PHOTO_OBJECT_POSITIONS as readonly string[]).toContain(position);
  });
});
