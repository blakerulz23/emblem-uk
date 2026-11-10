import { describe, expect, it } from 'vitest';
import { advanceProgress, canUseWebGL, isSoftwareRenderer, restingCameraDistance, smoothstep, transitionStages } from './portal-math';

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
  const glWith = (renderer: string | null, onRelease: () => void) => ({
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' ? (renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 1 }) : { loseContext: onRelease },
    getParameter: () => renderer,
  });
  it('is true when a hardware context exists, and releases the probe context', () => {
    let released = false;
    expect(canUseWebGL(docWith(() => glWith('Apple GPU', () => { released = true; })))).toBe(true);
    expect(released).toBe(true);
  });
  it('is true when the renderer cannot be identified', () => {
    expect(canUseWebGL(docWith(() => glWith(null, () => {})))).toBe(true);
  });
  it('is false for software-only WebGL, still releasing the probe context', () => {
    let released = false;
    expect(canUseWebGL(docWith(() => glWith('Google SwiftShader', () => { released = true; })))).toBe(false);
    expect(released).toBe(true);
  });
});

describe('advanceProgress', () => {
  const run = (fps: number) => {
    let p = 0;
    let frames = 0;
    while (p < 1 && frames < 10_000) { p = advanceProgress(p, 1, 1 / fps); frames += 1; }
    return frames / fps;
  };
  it('takes about the same real time at 60 fps and at 8 fps', () => {
    expect(run(60)).toBeCloseTo(1.4, 1);
    expect(run(8)).toBeCloseTo(1.4, 0);
  });
  it('moves back out toward 0 and stops exactly at the target', () => {
    expect(advanceProgress(0.05, 0, 0.2)).toBe(0);
    expect(advanceProgress(1, 1, 0.016)).toBe(1);
  });
  it('caps a long stall so one frame cannot finish the move', () => {
    expect(advanceProgress(0, 1, 5)).toBeCloseTo(0.25 / 1.4, 5);
  });
});

describe('isSoftwareRenderer', () => {
  it('flags CPU-drawn WebGL', () => {
    for (const r of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver', 'Google SwiftShader']) {
      expect(isSoftwareRenderer(r)).toBe(true);
    }
  });
  it('keeps real GPUs and unknown renderers on the 3D path', () => {
    for (const r of ['Apple GPU', 'Adreno (TM) 640', 'Mali-G78', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', '']) {
      expect(isSoftwareRenderer(r)).toBe(false);
    }
  });
});
