import { describe, expect, it } from 'vitest';
import { canUseWebGL, restingCameraDistance, smoothstep, transitionStages } from './portal-math';

describe('restingCameraDistance', () => {
  it('moves the camera further back on a narrow phone than on a wide screen', () => {
    const phone = restingCameraDistance(0.62, 35);
    const desktop = restingCameraDistance(1.4, 35);
    expect(phone).toBeGreaterThan(desktop);
  });
  it('fits the whole card height on a wide screen', () => {
    const d = restingCameraDistance(2, 35, 1);
    const visibleHeight = 2 * d * Math.tan((35 * Math.PI) / 360);
    expect(visibleHeight).toBeCloseTo(1.4, 5);
  });
  it('falls back to a square aspect for a broken viewport size', () => {
    expect(restingCameraDistance(Number.NaN, 35)).toBe(restingCameraDistance(1, 35));
    expect(restingCameraDistance(0, 35)).toBe(restingCameraDistance(1, 35));
  });
});

describe('transitionStages', () => {
  it('shows the card at rest and the inside world at the end', () => {
    expect(transitionStages(0)).toEqual({ artOpacity: 1, camera: 0, blend: 0 });
    expect(transitionStages(1)).toEqual({ artOpacity: 0, camera: 1, blend: 1 });
  });
  it('fades the card art before the portal opens', () => {
    const early = transitionStages(0.35);
    expect(early.artOpacity).toBe(0);
    expect(early.blend).toBe(0);
  });
  it('clamps progress outside 0..1', () => {
    expect(transitionStages(-1)).toEqual(transitionStages(0));
    expect(transitionStages(2)).toEqual(transitionStages(1));
  });
  it('smoothstep is monotonic between its edges', () => {
    expect(smoothstep(0, 1, 0.25)).toBeLessThan(smoothstep(0, 1, 0.75));
  });
});

describe('canUseWebGL', () => {
  const docWith = (getContext: () => unknown) => ({ createElement: () => ({ getContext }) }) as unknown as Document;
  it('is false without a document', () => {
    expect(canUseWebGL(undefined)).toBe(false);
  });
  it('is false when no WebGL context can be created', () => {
    expect(canUseWebGL(docWith(() => null))).toBe(false);
  });
  it('is false when context creation throws', () => {
    expect(canUseWebGL(docWith(() => { throw new Error('blocked'); }))).toBe(false);
  });
  it('is true when a context exists, and releases the probe context', () => {
    let released = false;
    const gl = { getExtension: () => ({ loseContext: () => { released = true; } }) };
    expect(canUseWebGL(docWith(() => gl))).toBe(true);
    expect(released).toBe(true);
  });
});
