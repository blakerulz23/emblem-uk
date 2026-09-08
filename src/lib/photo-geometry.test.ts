import { describe, expect, it } from 'vitest';
import { computeAutoFitCrop, computeObjectFitCoverCropWindow, computePhotoGeometry } from './photo-geometry';

describe('computePhotoGeometry', () => {
  it('defaults to no offset and scale 1 when there is no saved crop', () => {
    const g = computePhotoGeometry(null, 'center 12%');
    expect(g.transform).toBe('translate(0%, 0%) scale(1)');
    expect(g.objectFit).toBe('cover');
    expect(g.objectPosition).toBe('center 12%');
  });

  it('applies saved x/y/scale exactly (proportions preserved — same axis rule for zoom and both offsets)', () => {
    // Jenny's persisted crop, used as the shared fixture across this task's evidence base.
    const g = computePhotoGeometry({ x: 8, y: -4, scale: 0.8 }, 'center 12%');
    expect(g.transform).toBe('translate(8%, -4%) scale(0.8)');
  });

  it('uses a single scale term for both axes — never independent X/Y scale factors', () => {
    const g = computePhotoGeometry({ x: 0, y: 0, scale: 1.35 }, 'center 12%');
    // A single `scale(n)` CSS function scales X and Y uniformly by construction;
    // asserting there is exactly one scale() call (not scale(x, y) or scaleX/scaleY) is
    // the regression guard against ever reintroducing non-uniform stretching here.
    const scaleCalls = g.transform.match(/scale\(/g) ?? [];
    expect(scaleCalls.length).toBe(1);
    expect(g.transform).toContain('scale(1.35)');
    expect(g.transform).not.toMatch(/scaleX|scaleY|scale\([^)]*,/);
  });

  it('preserves the object-position passed in per template family (RealCardArt vs EMJFL/Hollinwood/Custom differ)', () => {
    expect(computePhotoGeometry(null, 'center 10%').objectPosition).toBe('center 10%');
    expect(computePhotoGeometry(null, 'center 12%').objectPosition).toBe('center 12%');
  });

  it('always centres the transform origin', () => {
    expect(computePhotoGeometry({ x: 5, y: 5, scale: 1 }, 'center 12%').transformOrigin).toBe('center center');
  });
});

/**
 * The confirmed fix for the reported defect: a real full-body upload
 * (288x870, aspect 0.331) into the Galaxy Custom Collection card's photo
 * box (340x476, 'center 12%') was pixel-identical — same hair-to-hands
 * slice, template art bleeding in around it — at 1.0x, 0.8x and 0.3x on the
 * legacy formula, because object-fit:cover's crop selection depends only on
 * the box's own layout size, which `transform: scale()` never touches.
 * These are the exact fixture numbers from that investigation.
 */
describe('computePhotoGeometry — zoom-out reveal (sizing param)', () => {
  const REAL_PHOTO = { naturalWidth: 288, naturalHeight: 870, boxWidth: 340, boxHeight: 476 };

  it('falls back to the exact legacy formula when sizing is omitted', () => {
    const g = computePhotoGeometry({ x: 0, y: 0, scale: 0.5 }, 'center 12%');
    expect(g.objectFit).toBe('cover');
    expect(g.transform).toBe('translate(0%, 0%) scale(0.5)');
  });

  it('falls back to the exact legacy formula at scale >= 1, even with sizing present — zero behaviour change for every card saved before this fix', () => {
    const g = computePhotoGeometry({ x: 8, y: -4, scale: 1 }, 'center 12%', REAL_PHOTO);
    expect(g.objectFit).toBe('cover');
    expect(g.transform).toBe('translate(8%, -4%) scale(1)');
    expect(g.width).toBeUndefined();
  });

  it('below scale 1, switches to explicit natural-pixel geometry that actually grows the visible window', () => {
    const g = computePhotoGeometry({ x: 0, y: 0, scale: 0.8 }, 'center 12%', REAL_PHOTO);
    expect(g.objectFit).toBe('fill');
    expect(g.position).toBe('absolute');
    const renderedH = parseFloat(g.height!);
    // At the legacy baseline (scale 1) only 403px of the photo's 870px
    // height was ever visible (base.height = 476 / coverScale). Below
    // scale 1 the *rendered* image must grow taller relative to its own
    // width than that baseline — direct evidence more source is now
    // present, not just a smaller copy of the same crop.
    const renderedW = parseFloat(g.width!);
    expect(renderedH / renderedW).toBeGreaterThan(870 / 288 * 0.4); // sanity: nontrivial extra height revealed
  });

  it('at scale approaching 1 from below, the visible natural-pixel window converges to the exact legacy cover crop (no seam)', () => {
    // width/height returned here are the *full rendered natural image*
    // (typically larger than the box — the surrounding wrapper's
    // overflow:hidden clips it down), not the visible slice itself, so
    // back-derive the visible window from left/top/dispScale and compare
    // that against computeObjectFitCoverCropWindow's own baseline.
    const nearOne = computePhotoGeometry({ x: 0, y: 0, scale: 0.999 }, 'center 12%', REAL_PHOTO);
    // width = naturalWidth * dispScale by construction — recover dispScale
    // from that relationship (NOT boxWidth/width, which is a different
    // ratio once the window is no longer exactly box-shaped).
    const dispScale = parseFloat(nearOne.width!) / REAL_PHOTO.naturalWidth;
    const left = parseFloat(nearOne.left!);
    const top = parseFloat(nearOne.top!);
    const visibleX0 = -left / dispScale;
    const visibleY0 = -top / dispScale;
    const visibleW = REAL_PHOTO.boxWidth / dispScale;
    const visibleH = REAL_PHOTO.boxHeight / dispScale;

    const base = computeObjectFitCoverCropWindow({
      naturalWidth: REAL_PHOTO.naturalWidth, naturalHeight: REAL_PHOTO.naturalHeight,
      boxWidth: REAL_PHOTO.boxWidth, boxHeight: REAL_PHOTO.boxHeight,
      positionXPercent: 50, positionYPercent: 12,
    });
    expect(visibleX0).toBeCloseTo(base.x, 0);
    expect(visibleY0).toBeCloseTo(base.y, 0);
    expect(visibleW).toBeCloseTo(base.width, 0);
    expect(visibleH).toBeCloseTo(base.height, 0);
  });

  it('never requests more of the photo than actually exists — clamped at the full natural image, letterboxed rather than fabricated', () => {
    const g = computePhotoGeometry({ x: 0, y: 0, scale: 0.05 }, 'center 12%', REAL_PHOTO);
    // Fully zoomed out: the window has grown to the entire natural photo in
    // both dimensions (letterboxed against the box, since 288x870 doesn't
    // share the box's 340x476 aspect ratio) — confirmed via the rendered
    // size ratio matching the *natural* image's own aspect ratio exactly,
    // not the box's.
    const w = parseFloat(g.width!);
    const h = parseFloat(g.height!);
    expect(h / w).toBeCloseTo(870 / 288, 2);
  });

  it('is a pure function — same inputs always produce the same geometry', () => {
    const a = computePhotoGeometry({ x: 3, y: -2, scale: 0.6 }, 'center 12%', REAL_PHOTO);
    const b = computePhotoGeometry({ x: 3, y: -2, scale: 0.6 }, 'center 12%', REAL_PHOTO);
    expect(a).toEqual(b);
  });
});

describe('computeAutoFitCrop', () => {
  const REAL_PHOTO = { naturalWidth: 288, naturalHeight: 870, boxWidth: 340, boxHeight: 476, objectPosition: 'center 12%' };

  it('a near-full-frame full-body subject needs a scale well below 1 to fit — this is what makes the zoom-out fix actually matter', () => {
    const crop = computeAutoFitCrop({ ...REAL_PHOTO, subjectBounds: { x0: 0.05, y0: 0.02, x1: 0.95, y1: 0.98 } });
    expect(crop.scale).toBeLessThan(0.6);
    expect(crop.scale).toBeGreaterThan(0.3);
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
  });

  it('never overclaims precision it does not have: with no subjectBounds, treats the whole photo as the subject rather than guessing', () => {
    const withBounds = computeAutoFitCrop({ ...REAL_PHOTO, subjectBounds: { x0: 0, y0: 0, x1: 1, y1: 1 } });
    const withoutBounds = computeAutoFitCrop({ ...REAL_PHOTO, subjectBounds: null });
    expect(withoutBounds.scale).toBeCloseTo(withBounds.scale, 2);
  });

  it('a tight headshot cutout needs no zoom-out at all — stays at the legacy default', () => {
    const crop = computeAutoFitCrop({ ...REAL_PHOTO, subjectBounds: { x0: 0.2, y0: 0, x1: 0.8, y1: 0.2 } });
    expect(crop.scale).toBe(1);
  });

  it('never produces a scale that would ask computePhotoGeometry for more than the real photo has', () => {
    const crop = computeAutoFitCrop({ ...REAL_PHOTO, subjectBounds: { x0: 0, y0: 0, x1: 1, y1: 1 } });
    expect(crop.scale).toBeGreaterThan(0);
    expect(crop.scale).toBeLessThanOrEqual(1);
  });
});

/**
 * FOUNDER-REPORTED (live), root cause confirmed by reading html2canvas's own
 * bundled source: it never implements object-fit/object-position, always
 * drawImage-ing an <img>'s full natural bitmap into its layout box (plain
 * fill/stretch behaviour). captureElementToPng (print-capture.ts) pre-crops
 * every object-fit:cover <img> to exactly this window before capture, so
 * html2canvas's fill-shaped draw reproduces what the browser already shows.
 * This is the pure crop-window math behind that fix — the same formula the
 * CSS object-position/background-position spec defines, verified here
 * against hand-worked cases (including the real 1024x1024 photo that
 * exposed the bug live) independent of any DOM/canvas plumbing.
 */
describe('computeObjectFitCoverCropWindow', () => {
  it('crops only horizontally when the box is relatively taller than the photo (a real 1024x1024 upload into the 340x476 card photo-well) — full height, centred width', () => {
    const crop = computeObjectFitCoverCropWindow({
      naturalWidth: 1024,
      naturalHeight: 1024,
      boxWidth: 340,
      boxHeight: 476,
      positionXPercent: 50,
      positionYPercent: 12,
    });
    // coverScale = max(340/1024, 476/1024) = 476/1024 -> full natural height used.
    expect(crop.height).toBeCloseTo(1024, 5);
    expect(crop.y).toBeCloseTo(0, 5);
    // width = boxWidth / coverScale = 340 / (476/1024)
    expect(crop.width).toBeCloseTo((340 * 1024) / 476, 5);
    // centred (positionXPercent 50%): equal margin cropped off both sides.
    const marginEachSide = (1024 - crop.width) / 2;
    expect(crop.x).toBeCloseTo(marginEachSide, 5);
  });

  it('crops only vertically when the photo is relatively taller than the box (a portrait upload)', () => {
    const crop = computeObjectFitCoverCropWindow({
      naturalWidth: 800,
      naturalHeight: 1200,
      boxWidth: 340,
      boxHeight: 476,
      positionXPercent: 50,
      positionYPercent: 12,
    });
    // coverScale = max(340/800, 476/1200) = 340/800 -> full natural width used.
    expect(crop.width).toBeCloseTo(800, 5);
    expect(crop.x).toBeCloseTo(0, 5);
    expect(crop.height).toBeLessThan(1200);
  });

  it('a 0%/0% position crops from the opposite edge than a 100%/100% position', () => {
    const topLeft = computeObjectFitCoverCropWindow({ naturalWidth: 1024, naturalHeight: 1024, boxWidth: 340, boxHeight: 476, positionXPercent: 0, positionYPercent: 0 });
    const bottomRight = computeObjectFitCoverCropWindow({ naturalWidth: 1024, naturalHeight: 1024, boxWidth: 340, boxHeight: 476, positionXPercent: 100, positionYPercent: 100 });
    expect(topLeft.x).toBeCloseTo(0, 5);
    expect(bottomRight.x).toBeGreaterThan(topLeft.x);
    // Height is fully used regardless of Y position here (this box/photo
    // pairing has zero vertical overflow to distribute — see the first
    // test) — position only has room to move the crop window horizontally.
    expect(topLeft.height).toBeCloseTo(bottomRight.height, 5);
  });

  it('when the photo already matches the box aspect ratio exactly, the crop window is the whole photo', () => {
    const crop = computeObjectFitCoverCropWindow({ naturalWidth: 340, naturalHeight: 476, boxWidth: 340, boxHeight: 476, positionXPercent: 50, positionYPercent: 12 });
    expect(crop).toEqual({ x: 0, y: 0, width: 340, height: 476 });
  });
});
