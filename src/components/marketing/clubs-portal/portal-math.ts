/**
 * Pure helpers for the clubs-page card portal (no three.js import, so they
 * stay out of the page's first-load bundle and are unit-tested directly).
 */

/** Card proportions match the printed card and the hero art (400 × 560). */
export const CARD_WIDTH = 1;
export const CARD_HEIGHT = 1.4;

/**
 * Camera distance that fits the card in view with a margin, for any
 * viewport shape: height-bound on wide screens, width-bound on phones.
 */
export function restingCameraDistance(aspect: number, fovDegrees: number, margin = 1.18): number {
  const halfV = (fovDegrees * Math.PI) / 360;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const fitHeight = ((CARD_HEIGHT * margin) / 2) / Math.tan(halfV);
  const halfH = Math.atan(Math.tan(halfV) * safeAspect);
  const fitWidth = ((CARD_WIDTH * margin) / 2) / Math.tan(halfH);
  return Math.max(fitHeight, fitWidth);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Hermite smoothstep of x between edge0 and edge1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Where each part of the transition is at overall progress p (0 = resting
 * card, 1 = inside). The card art fades first, so the miniature pitch shows
 * inside the card's frame; then the camera moves through and the portal
 * opens to fill the view.
 */
export function transitionStages(p: number) {
  const progress = clamp01(p);
  return {
    artOpacity: 1 - smoothstep(0, 0.35, progress),
    camera: smoothstep(0.2, 1, progress),
    blend: smoothstep(0.5, 0.95, progress),
  };
}

/** True when this browser can create a WebGL context at all. */
/**
 * True for WebGL drawn by the CPU (a blocklisted or missing GPU). The 3D
 * portal is slow there, so the app demo opens directly instead.
 */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
}

export function canUseWebGL(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (!doc) return false;
  try {
    const canvas = doc.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !isSoftwareRenderer(renderer);
  } catch {
    return false;
  }
}

/** Seconds a full move into or out of the card takes. */
export const TRANSITION_SECONDS = 1.4;

/**
 * Moves progress toward the target at a fixed rate in real time, so the
 * transition takes about TRANSITION_SECONDS on a fast or a slow device (a
 * per-frame damped step slows down when the frame rate drops). A long gap
 * between frames (tab switch, a stall) is capped so it can't jump straight
 * to the end in one frame.
 */
export function advanceProgress(current: number, target: number, deltaSeconds: number, duration = TRANSITION_SECONDS): number {
  const step = Math.min(Math.max(deltaSeconds, 0), 0.25) / duration;
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return current;
}
