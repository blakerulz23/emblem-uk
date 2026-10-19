import { existsSync, readFileSync, statSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { contentBounds, isLikelySlowConnection, saliencyToAlpha, toInputTensorData } from './bgRemovalOnDevice';

/**
 * On-device background removal (adapted from Emblem Canada). The parent's
 * photo is cut out in the browser; it must never be sent to Gemini or any
 * other service by the card builder, the original must stay available to
 * switch back to, and that local original must never reach checkout.
 */
describe('pure pipeline helpers', () => {
  it('builds an ImageNet-normalised NCHW tensor from RGBA pixels', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const t = toInputTensorData(rgba, 2);
    expect(t.length).toBe(12);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 5); // pixel 0, red plane
    expect(t[4 + 1]).toBeCloseTo((1 - 0.456) / 0.224, 5); // pixel 1, green plane
    expect(t[8 + 2]).toBeCloseTo((1 - 0.406) / 0.225, 5); // pixel 2, blue plane
  });

  it('turns a saliency map into alpha: background transparent, subject opaque', () => {
    const alpha = saliencyToAlpha(new Float32Array([0, 0.05, 0.5, 1]));
    expect(alpha[0]).toBe(0);
    expect(alpha[1]).toBe(0);
    expect(alpha[2]).toBeGreaterThan(0);
    expect(alpha[2]).toBeLessThan(255);
    expect(alpha[3]).toBe(255);
  });

  it('crops to the subject with breathing room, and reports no subject when the mask is empty', () => {
    const w = 100;
    const h = 100;
    const alpha = new Uint8ClampedArray(w * h);
    for (let y = 40; y < 60; y += 1) for (let x = 30; x < 50; x += 1) alpha[y * w + x] = 255;
    expect(contentBounds(alpha, w, h)).toEqual({ x: 20, y: 30, w: 40, h: 40 });
    expect(contentBounds(new Uint8ClampedArray(w * h), w, h)).toBeNull();
  });
});

describe('privacy: the card builder never sends photos to an external service for background removal', () => {
  const step = readFileSync('src/components/emblem-uk/builder-steps/BackgroundRemovalStep.tsx', 'utf8');
  const engine = readFileSync('src/components/builder/emblem/bgRemovalOnDevice.ts', 'utf8');

  it('the background step uses the on-device engine only (no Gemini path)', () => {
    expect(step).toContain("from '@/components/builder/emblem/bgRemovalOnDevice'");
    expect(step).not.toMatch(/removeBackgroundSmart|builder\/emblem\/bgRemoval'|\/api\/ai-mockup/);
    expect(step).not.toMatch(/fetch\(['"`]\/api/);
  });

  it('the engine loads its runtime and model from our own origin and calls no API', () => {
    expect(engine).toContain("const MODEL_URL = '/models/u2netp.onnx'");
    expect(engine).toContain("const ORT_SCRIPT = '/ort/ort.wasm.min.js'");
    // The only fetches are the two same-origin engine files (for progress).
    expect(engine).not.toMatch(/fetch\(['"`]\/api/);
    expect(engine).not.toMatch(/https?:\/\//);
    expect(engine).toContain("track(ORT_WASM_BINARY), track(MODEL_URL)");
    expect(engine).toContain("const ORT_WASM_BINARY = '/ort/ort-wasm-simd-threaded.wasm'");
  });

  it('the model ships with the app (4.6 MB, Apache-2.0, documented) and the runtime is copied at build', () => {
    expect(existsSync('public/models/u2netp.onnx')).toBe(true);
    expect(statSync('public/models/u2netp.onnx').size).toBe(4574861);
    expect(readFileSync('public/models/README.md', 'utf8')).toMatch(/Apache License 2\.0/);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.prebuild).toContain('copy-ort-wasm.mjs');
    expect(pkg.dependencies['onnxruntime-web']).toBe('1.21.0');
  });

  it('the engine is fetched when a photo is chosen, not when the builder opens', () => {
    const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
    const assign = builder.slice(builder.indexOf('const assignPhoto = '), builder.indexOf('const assignPhoto = ') + 400);
    expect(assign).toContain('warmOnDeviceBackgroundRemoval()');
    expect(builder.match(/warmOnDeviceBackgroundRemoval\(\)/g)?.length).toBe(2); // assignPhoto + bulkPhotos only
  });
});

describe('original and background-removed photos: choice and revert', () => {
  const step = readFileSync('src/components/emblem-uk/builder-steps/BackgroundRemovalStep.tsx', 'utf8');

  it('shows both previews and lets the guardian pick either', () => {
    expect(step).toContain('alt="Original photo"');
    expect(step).toContain('alt="Background removed"');
    expect(step).toContain("onClick={() => setChoice('original')}");
  });

  it('keeps the untouched upload as originalUrl when the cut-out is used, and restores it on revert', () => {
    expect(step).toMatch(/bgRemoved: true, originalUrl: untouched/);
    expect(step).toMatch(/srcUrl: originalSrc, hiResUrl: originalSrc, bgRemoved: false, originalUrl: undefined/);
  });

  it('if the engine cannot run, the original carries through and the parent can still continue', () => {
    expect(step).toContain('setEngineFailed(true);');
    expect(step).toContain("setChoice('original');");
  });
});

describe('checkout compatibility: the local original never leaves the device', () => {
  it('the direct order validator builds the stored photo from an explicit allowlist', () => {
    const validation = readFileSync('src/lib/order-enquiry-validation.ts', 'utf8');
    const photo = validation.slice(validation.indexOf('      photo: {\n        storageKey,'), validation.indexOf('      stats: raw.stats'));
    expect(photo).toMatch(/storageKey,[\s\S]*contentType:[\s\S]*crop:[\s\S]*bgRemoved:/);
    expect(photo).not.toMatch(/originalUrl|srcUrl|hiResUrl/);
  });

  it('the Squad Invite commit sends an explicit photo subset without originalUrl', () => {
    const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
    const commitPhoto = builder.slice(builder.indexOf('photo: photo && {'), builder.indexOf('accepted: Object.fromEntries('));
    expect(commitPhoto).toContain('storageKey: photo.storageKey');
    expect(commitPhoto).not.toContain('originalUrl');
  });
});

describe('optional, with progress, never blocking (slow mobile connections)', () => {
  const step = readFileSync('src/components/emblem-uk/builder-steps/BackgroundRemovalStep.tsx', 'utf8');
  const engine = readFileSync('src/components/builder/emblem/bgRemovalOnDevice.ts', 'utf8');
  const realNavigator = globalThis.navigator;
  afterEach(() => { Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true }); });
  const withConnection = (connection: unknown) => Object.defineProperty(globalThis, 'navigator', { value: { connection }, configurable: true });

  it('treats Data Saver and 2G/3G as slow, and 4G or unknown as not slow', () => {
    withConnection({ saveData: true, effectiveType: '4g' });
    expect(isLikelySlowConnection()).toBe(true);
    withConnection({ effectiveType: '3g' });
    expect(isLikelySlowConnection()).toBe(true);
    withConnection({ effectiveType: '4g' });
    expect(isLikelySlowConnection()).toBe(false);
    withConnection(undefined);
    expect(isLikelySlowConnection()).toBe(false);
  });

  it('on a slow connection nothing downloads until the parent taps "Remove background"', () => {
    expect(engine).toMatch(/if \(!onDeviceBackgroundRemovalSupported\(\) \|\| isLikelySlowConnection\(\)\) return;/);
    expect(step).toMatch(/if \(!onDeviceEngineReady\(\) && isLikelySlowConnection\(\)\) \{[\s\S]{0,160}setStatus\('offer'\)/);
    expect(step).toContain('onClick={() => startRemoval(photoSrc)}');
  });

  it('shows download progress, then processing', () => {
    expect(step).toContain('role="progressbar"');
    expect(step).toContain("Getting the background tool ready…");
    expect(engine).toContain('progressListeners.forEach((listener) => listener(loaded, total))');
  });

  it('"Continue with original photo" is available at every stage before a result, without waiting', () => {
    expect(step).toMatch(/status === 'ready' \? \([\s\S]*?\) : \([\s\S]*?Continue with original photo/);
    expect(step).toMatch(/const continueWithOriginal = \(\) => \{\s*runRef\.current \+= 1;\s*onContinue\(\);/);
    // The download itself has no time limit (the parent can always skip); only processing does.
    expect(engine).toContain('[session, ort] = await Promise.all([getSession(options.onProgress), loadOrt()]);');
  });
});
