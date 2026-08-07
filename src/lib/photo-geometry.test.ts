import { describe, expect, it } from 'vitest';
import { computePhotoGeometry } from './photo-geometry';

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
