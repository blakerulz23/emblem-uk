// Browser-side background removal.
//
// Primary path: @imgly/background-removal — a real ML segmentation model
// (WASM/ONNX) that classifies the actual, original photo's pixels as
// foreground/background rather than redrawing the image. It cannot
// hallucinate, duplicate, or alter content, because it never generates any
// new pixels — the whole class of defect this file's history hit with a
// Gemini generative-repaint cutout (a warm fringe, real background bleeding
// through, a blocky interior hole, and duplicated jersey text — four
// distinct defects from ONE reference photo in a single day) is structurally
// impossible here.
//
// FOUNDER DECISION (Blake, 7 September 2026): this library was already used
// here once before — next.config.mjs still carries webpack config written
// specifically for it (aliasing out its Node-only ONNX runtime), and
// JewelryEditScreen.tsx/KeychainEditScreen.tsx/WristbandEditScreen.tsx still
// show "Cut out (clean)" / "Used the ML model." copy whenever
// removeBackgroundSmart's result isn't the 'canvas' fallback — copy that's
// been quietly describing Gemini's generative repaint as "the ML model"
// ever since this file was switched away from @imgly, and becomes literally
// true again with this change. No changes needed to any of those three
// files.
//
// Deliberately no custom `publicPath` (self-hosting the model/wasm files) —
// git history here shows exactly that configuration broke this exact
// library's cutout once before; the library's own default, IMG.LY-hosted
// CDN is what's proven to work. Also deliberately no COOP/COEP headers for
// SharedArrayBuffer/multi-threaded WASM — this app tried that too, and it
// silently broke every cross-origin image sitewide (signed S3 photo URLs
// discarded by the browser — see next.config.mjs's own git history). The
// accepted trade-off is single-threaded, slower WASM execution, not a
// correctness issue.
//
// Gemini (the retry + border-connectivity alpha-keying pipeline this file
// already had) remains as a fallback for the rare case @imgly fails to load
// or run at all in a given browser — not thrown away, only demoted to
// "only when real segmentation genuinely can't run here."

const MAX_DIM = 1024;
const JPEG_QUALITY = 0.92;

export async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

// Resize an image to fit within MAX_DIM and re-encode as JPEG to keep payload small.
async function resizeToJpegDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('No 2D context')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode failed')); };
    img.src = url;
  });
}

// Same brightness bands the plain threshold version used (see this file's
// history): >=245 is fully background, 225-244 gets a linear partial-alpha
// ramp.
const FULLY_BACKGROUND = 245;
const PARTIAL_BACKGROUND_START = 225;

/**
 * Keys a subject-on-white-background image to transparency, in place.
 *
 * FOUNDER DECISION (Blake, 7 September 2026): a brightness-threshold-only
 * version (matching emblem.cards/youthcards' bgRemoval.ts) replaced an
 * earlier despill+adjacency version here after that version left a visible
 * warm-toned fringe on a backlit outdoor photo — Gemini gave that photo a
 * hard, non-anti-aliased cutout edge, and despill's adjacency heuristic
 * "corrected" genuine opaque edge pixels that were never actually blended
 * with white. That plain version's accepted trade-off was no colour
 * correction at all — but pure brightness has a second failure mode this
 * function now also fixes: any sufficiently bright pixel gets keyed
 * transparent regardless of *where* it is, so an isolated bright patch deep
 * inside the subject (a highlight, a JPEG-compression block, a shadowed
 * gap between the legs) can get punched into a visible hole even though
 * it's nowhere near the real background — reported live as a blocky cutout
 * mid-body on an otherwise-correct card.
 *
 * The fix is connectivity, not colour: a pixel only counts as background if
 * it's reachable from the image's actual outer edge by walking through
 * other sufficiently-bright pixels (8-connected flood fill seeded from the
 * border). A real background region is always connected to the border by
 * definition; an isolated bright interior pixel — no matter how bright —
 * never is, so it's left fully opaque. This adds no colour correction, so
 * it doesn't reintroduce the despill overcorrection this file's history
 * already ruled out; it only narrows *which* bright pixels are eligible to
 * be keyed at all.
 *
 * Pure function, no DOM/Canvas dependency, so it's directly unit-testable —
 * see bgRemoval.interior-holes.test.ts.
 */
export function keyWhiteConnectedToBorder(data: Uint8ClampedArray, width: number, height: number): void {
  const pixelCount = width * height;
  const minComp = new Uint8ClampedArray(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    minComp[p] = Math.min(data[i], data[i + 1], data[i + 2]);
  }

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueLength = 0;

  const tryEnqueue = (p: number) => {
    if (visited[p] || minComp[p] < PARTIAL_BACKGROUND_START) return;
    visited[p] = 1;
    queue[queueLength++] = p;
  };

  for (let x = 0; x < width; x++) {
    tryEnqueue(x);
    tryEnqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(y * width);
    tryEnqueue(y * width + (width - 1));
  }

  let head = 0;
  while (head < queueLength) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) tryEnqueue(p - 1);
    if (x < width - 1) tryEnqueue(p + 1);
    if (y > 0) tryEnqueue(p - width);
    if (y < height - 1) tryEnqueue(p + width);
    if (x > 0 && y > 0) tryEnqueue(p - width - 1);
    if (x < width - 1 && y > 0) tryEnqueue(p - width + 1);
    if (x > 0 && y < height - 1) tryEnqueue(p + width - 1);
    if (x < width - 1 && y < height - 1) tryEnqueue(p + width + 1);
  }

  for (let p = 0; p < pixelCount; p++) {
    if (!visited[p]) continue;
    const i = p * 4;
    const mc = minComp[p];
    data[i + 3] = mc >= FULLY_BACKGROUND ? 0 : Math.round(((FULLY_BACKGROUND - mc) / (FULLY_BACKGROUND - PARTIAL_BACKGROUND_START)) * 255);
  }
}

// Take an image that has a (near-)white background and key those pixels to transparent.
// Returns { dataUrl, w, h } so the caller can decide whether to also crop.
async function alphaKeyWhite(dataUrl: string): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('No 2D context')); return; }
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      keyWhiteConnectedToBorder(id.data, c.width, c.height);
      ctx.putImageData(id, 0, 0);
      resolve({ dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height });
    };
    img.onerror = () => reject(new Error('Image decode for alpha key failed'));
    img.src = dataUrl;
  });
}

// Gemini's cutout step is generative, not deterministic segmentation: the
// same source photo can come back with the background fully replaced by
// white on one call and only partially replaced (leaving real photo content
// — grass, sky, other players — visible) on another. No alpha-keying step
// can fix that after the fact, since a non-white pixel there isn't
// background bleed to correct, it's genuine opaque content Gemini left in.
// The cutout prompt always centers and fully frames the subject, so a
// properly-generated result's outer perimeter should be almost entirely
// pure white regardless of the subject's pose — sampling it is a cheap,
// reliable signal for "did this generation actually work."
export const BORDER_CLEAN_THRESHOLD = 0.97;
// Pixels at or above this brightness count as background for the purposes
// of this check — deliberately the same cutoff alphaKeyWhite uses for
// "fully transparent," so this asks exactly the question that matters: will
// the alpha-key step actually remove this pixel.
const BORDER_WHITE_MIN = 245;
// Every Nth pixel along each edge — a coarse sample is enough to detect
// "an entire region of the border is the wrong colour," which is what this
// defect looks like; it doesn't need to catch a few stray fringe pixels
// (that's despill/alpha-keying's job, not this one's).
const BORDER_SAMPLE_STEP = 8;

/**
 * Pure function, no DOM/Canvas dependency, so it's directly unit-testable —
 * see bgRemoval.border-check.test.ts. Samples the four edges of an RGBA
 * buffer and returns the fraction of sampled pixels that are at or above
 * BORDER_WHITE_MIN in all three channels.
 */
export function borderCleanFraction(data: Uint8ClampedArray, width: number, height: number): number {
  let sampled = 0;
  let clean = 0;
  const checkPixel = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    sampled++;
    if (Math.min(data[i], data[i + 1], data[i + 2]) >= BORDER_WHITE_MIN) clean++;
  };
  for (let x = 0; x < width; x += BORDER_SAMPLE_STEP) {
    checkPixel(x, 0);
    checkPixel(x, height - 1);
  }
  for (let y = 0; y < height; y += BORDER_SAMPLE_STEP) {
    checkPixel(0, y);
    checkPixel(width - 1, y);
  }
  return sampled === 0 ? 1 : clean / sampled;
}

// DOM wrapper around borderCleanFraction — decodes a data URL to a pixel
// buffer via canvas, since the pure function above only knows about raw
// RGBA arrays.
async function scoreCutoutBorder(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('No 2D context')); return; }
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      resolve(borderCleanFraction(data, width, height));
    };
    img.onerror = () => reject(new Error('Image decode for border check failed'));
    img.src = dataUrl;
  });
}

// Crop a transparent PNG down to the subject's bounding box, plus a tiny
// breathing-room margin. This stops the cutout from looking "zoomed out" when
// Gemini returns a large canvas with the subject centered.
async function cropToContent(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('No 2D context')); return; }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;

      // Find the bounding box of pixels whose alpha is above a small threshold.
      const ALPHA_THRESHOLD = 28;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3];
          if (a > ALPHA_THRESHOLD) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      // If we didn't find any opaque content, return the original
      if (maxX < 0 || maxY < 0) {
        resolve(dataUrl);
        return;
      }
      // Generous breathing-room margin around the subject (10% of largest dim) — gives 0.8x zoom-out feel
      const margin = Math.max(2, Math.round(Math.max(w, h) * 0.10));
      const x0 = Math.max(0, minX - margin);
      const y0 = Math.max(0, minY - margin);
      const x1 = Math.min(w - 1, maxX + margin);
      const y1 = Math.min(h - 1, maxY + margin);
      const cropW = x1 - x0 + 1;
      const cropH = y1 - y0 + 1;
      const out = document.createElement('canvas');
      out.width = cropW; out.height = cropH;
      const octx = out.getContext('2d');
      if (!octx) { reject(new Error('No 2D context for crop')); return; }
      octx.drawImage(img, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
      resolve(out.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Image decode for crop failed'));
    img.src = dataUrl;
  });
}

export type RemoveBgResult = {
  dataUrl: string;
  method: 'gemini' | 'canvas' | 'imgly';
};

// 35s, matching the exact timeout this library's config used the last time
// it ran correctly in this codebase family (see this file's own top comment)
// — long enough for a cold, uncached model download, short enough that a
// genuinely stuck load still falls back to Gemini rather than hanging the
// builder indefinitely.
const IMGLY_TIMEOUT_MS = 35_000;

async function tryImglyRemoval(file: File): Promise<string> {
  const removed = (async () => {
    // Dynamic import: this model is only ever needed on the background-
    // removal step, so it must never be part of the initial builder bundle.
    const { removeBackground } = await import('@imgly/background-removal');
    const blob: Blob = await removeBackground(file);
    return await readBlobAsDataUrl(blob);
  })();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('@imgly/background-removal timed out')), IMGLY_TIMEOUT_MS),
  );
  return await Promise.race([removed, timeout]);
}

// Up to this many Gemini calls total before giving up and using whichever
// attempt scored best — matches the reported defect one extra retry would
// very likely have avoided (a second call on the same photo came back
// fully clean), while keeping a hard ceiling on latency/cost when a photo
// is just genuinely hard for the model to fully key out.
const MAX_CUTOUT_ATTEMPTS = 3;

async function requestGeminiCutout(imageBase64: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  let resp: Response;
  try {
    resp = await fetch('/api/ai-mockup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mimeType: 'image/jpeg',
        kind: 'cutout',
      }),
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  const json: { image?: string; error?: string } = await resp.json().catch(() => ({}));
  return resp.ok && json.image ? json.image : null;
}

export async function removeBackgroundSmart(file: File): Promise<RemoveBgResult> {
  // 1. Real segmentation first — see this file's top comment for why.
  try {
    const dataUrl = await tryImglyRemoval(file);
    const cropped = await cropToContent(dataUrl);
    return { dataUrl: cropped, method: 'imgly' };
  } catch (err) {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[bg-removal] @imgly failed, falling back to Gemini:', err);
    }
  }

  // 2. Fallback: the Gemini cutout pipeline, only reached when real
  // segmentation couldn't run in this browser at all.
  // 2a. Resize + re-encode to keep the payload sensible
  const resized = await resizeToJpegDataUrl(file);

  // 2b. Ask Gemini to put the subject on a white background, retrying if the
  // result's border shows the background wasn't fully replaced (see
  // borderCleanFraction's own comment above for why this can happen at
  // all) — keeping whichever attempt scored best in case none pass.
  let bestImage: string | null = null;
  let bestScore = -1;
  for (let attempt = 0; attempt < MAX_CUTOUT_ATTEMPTS; attempt++) {
    const image = await requestGeminiCutout(resized);
    if (!image) {
      // Network failure, no API key, or the API is unavailable — retrying
      // the identical request won't change that outcome.
      break;
    }
    let score: number;
    try {
      score = await scoreCutoutBorder(image);
    } catch {
      score = 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestImage = image;
    }
    if (score >= BORDER_CLEAN_THRESHOLD) break;
  }

  if (!bestImage) {
    // No API key, API unavailable, or every attempt failed outright — pass
    // the photo through unchanged so the builder remains navigable.
    return { dataUrl: resized, method: 'canvas' };
  }

  // 3. Alpha-key the white background to transparency
  const { dataUrl: transparent } = await alphaKeyWhite(bestImage);

  // 4. Crop to the subject's bounding box so the cutout fills the frame
  const cropped = await cropToContent(transparent);

  return { dataUrl: cropped, method: 'gemini' };
}
