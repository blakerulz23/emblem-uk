// On-device background removal for the card builder (adapted from Emblem
// Canada's bgRemovalOnDevice.ts).
//
// Runs U²-Net (small, "u2netp", Apache-2.0 — public/models/README.md) with
// onnxruntime-web in the parent's own browser. The photo is decoded,
// segmented and cut out locally: nothing is uploaded for this step, and no
// image is sent to Gemini or any other external service. The WASM runtime
// is served from our own origin (/ort/, copied by scripts/copy-ort-wasm.mjs)
// and loaded lazily — warmed while the parent is choosing a photo — so the
// builder's first paint doesn't pay for it.
//
// Any failure (no WebAssembly, model fetch failed, decode failed, too slow)
// returns the resized original with method 'original', which the step
// explains as "we couldn't remove the background on this device". The
// parent can always continue with the original photo.

export type OnDeviceRemoveBgResult = {
  dataUrl: string;
  method: 'on-device' | 'original';
};

/** Bumped whenever the cut-out this file produces changes. */
export const CUTOUT_ENGINE_VERSION = 1;

const MODEL_URL = '/models/u2netp.onnx';
const ORT_SCRIPT = '/ort/ort.wasm.min.js';
const ORT_WASM_DIR = '/ort/';
const INPUT = 320;
const MAX_DIM = 1600;
/** A first visit downloads the runtime and model; after this, give up and keep the original. */
export const ON_DEVICE_TIMEOUT_MS = 45_000;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type OrtTensor = { data: Float32Array; dims: readonly number[] };
type OrtSession = { inputNames: string[]; outputNames: string[]; run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> };
type OrtModule = {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(url: string, options?: Record<string, unknown>): Promise<OrtSession> };
};

let ortPromise: Promise<OrtModule> | null = null;
let sessionPromise: Promise<OrtSession> | null = null;

/** True when this browser can run the on-device engine at all. */
export function onDeviceBackgroundRemovalSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly === 'object' && typeof document !== 'undefined';
}

function loadOrt(): Promise<OrtModule> {
  if (ortPromise) return ortPromise;
  ortPromise = new Promise<OrtModule>((resolve, reject) => {
    const w = window as unknown as { ort?: OrtModule };
    if (w.ort) { resolve(w.ort); return; }
    const script = document.createElement('script');
    script.src = ORT_SCRIPT;
    script.async = true;
    script.onload = () => (w.ort ? resolve(w.ort) : reject(new Error('onnxruntime-web did not load')));
    script.onerror = () => reject(new Error('onnxruntime-web failed to load'));
    document.head.appendChild(script);
  });
  ortPromise.catch(() => { ortPromise = null; });
  return ortPromise;
}

function getSession(): Promise<OrtSession> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = await loadOrt();
    ort.env.wasm.wasmPaths = ORT_WASM_DIR;
    // Threads need cross-origin isolation, which this site doesn't set; one
    // thread keeps the runtime from probing for SharedArrayBuffer.
    ort.env.wasm.numThreads = 1;
    return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })();
  sessionPromise.catch(() => { sessionPromise = null; });
  return sessionPromise;
}

/** Start downloading the runtime + model ahead of need (e.g. while a photo is chosen). */
export function warmOnDeviceBackgroundRemoval(): void {
  if (!onDeviceBackgroundRemovalSupported()) return;
  getSession().catch(() => undefined);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode failed')); };
    img.src = url;
  });
}

/** Pure: NCHW float32 input from RGBA pixels at size×size, ImageNet-normalised. */
export function toInputTensorData(rgba: Uint8ClampedArray, size: number = INPUT): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[c * plane + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

/**
 * Pure: the saliency map → 0–255 alpha. Min–max normalised (as U²-Net's own
 * reference code does), then a gentle contrast curve so the soft halo U²-Net
 * leaves around the subject doesn't read as a grey fringe on dark cards.
 */
export function saliencyToAlpha(map: Float32Array): Uint8ClampedArray {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < map.length; i += 1) {
    if (map[i] < min) min = map[i];
    if (map[i] > max) max = map[i];
  }
  const range = max - min || 1;
  const out = new Uint8ClampedArray(map.length);
  for (let i = 0; i < map.length; i += 1) {
    const v = (map[i] - min) / range;
    const curved = Math.min(1, Math.max(0, (v - 0.12) / 0.76));
    out[i] = Math.round(curved * 255);
  }
  return out;
}

/** Pure: bounding box of pixels above an alpha threshold, padded by 10% of the longest side. */
export function contentBounds(alpha: ArrayLike<number>, w: number, h: number, threshold = 28): { x: number; y: number; w: number; h: number } | null {
  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (alpha[y * w + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const margin = Math.max(2, Math.round(Math.max(w, h) * 0.1));
  const x0 = Math.max(0, minX - margin);
  const y0 = Math.max(0, minY - margin);
  const x1 = Math.min(w - 1, maxX + margin);
  const y1 = Math.min(h - 1, maxY + margin);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then((value) => { clearTimeout(id); resolve(value); }, (error) => { clearTimeout(id); reject(error); });
  });
}

export async function removeBackgroundOnDevice(file: Blob): Promise<OnDeviceRemoveBgResult> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const photo = document.createElement('canvas');
  photo.width = w;
  photo.height = h;
  const pctx = photo.getContext('2d');
  if (!pctx) throw new Error('No 2D context');
  pctx.drawImage(img, 0, 0, w, h);
  const original = (): OnDeviceRemoveBgResult => ({ dataUrl: photo.toDataURL('image/jpeg', 0.92), method: 'original' });

  if (!onDeviceBackgroundRemovalSupported()) return original();

  let session: OrtSession;
  let ort: OrtModule;
  try {
    [session, ort] = await withTimeout(Promise.all([getSession(), loadOrt()]), ON_DEVICE_TIMEOUT_MS);
  } catch {
    return original();
  }

  const small = document.createElement('canvas');
  small.width = INPUT;
  small.height = INPUT;
  const sctx = small.getContext('2d');
  if (!sctx) return original();
  sctx.drawImage(photo, 0, 0, INPUT, INPUT);
  const input = toInputTensorData(sctx.getImageData(0, 0, INPUT, INPUT).data);

  let saliency: Float32Array;
  try {
    const result = await withTimeout(session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT, INPUT]) }), ON_DEVICE_TIMEOUT_MS);
    saliency = result[session.outputNames[0]].data;
  } catch {
    return original();
  }

  // Mask at model resolution → scaled (smoothly) to the photo → applied as alpha.
  const alpha = saliencyToAlpha(saliency);
  const maskSmall = document.createElement('canvas');
  maskSmall.width = INPUT;
  maskSmall.height = INPUT;
  const mctx = maskSmall.getContext('2d');
  if (!mctx) return original();
  const maskPixels = mctx.createImageData(INPUT, INPUT);
  for (let i = 0; i < alpha.length; i += 1) maskPixels.data[i * 4 + 3] = alpha[i];
  mctx.putImageData(maskPixels, 0, 0);

  const cut = document.createElement('canvas');
  cut.width = w;
  cut.height = h;
  const cctx = cut.getContext('2d');
  if (!cctx) return original();
  cctx.drawImage(photo, 0, 0);
  cctx.globalCompositeOperation = 'destination-in';
  cctx.imageSmoothingEnabled = true;
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(maskSmall, 0, 0, w, h);
  cctx.globalCompositeOperation = 'source-over';

  // Crop to the player with breathing room, so the card frames them well.
  const rgba = cctx.getImageData(0, 0, w, h).data;
  const alphaPlane = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alphaPlane.length; i += 1) alphaPlane[i] = rgba[i * 4 + 3];
  const box = contentBounds(alphaPlane, w, h);
  if (!box) return original();
  const out = document.createElement('canvas');
  out.width = box.w;
  out.height = box.h;
  const octx = out.getContext('2d');
  if (!octx) return original();
  octx.drawImage(cut, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { dataUrl: out.toDataURL('image/png'), method: 'on-device' };
}
