import { describe, expect, it } from 'vitest';
import { computeObjectFitCoverCropWindow, computePhotoGeometry } from './photo-geometry';

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
