// Browser-side background removal via the Gemini /api/ai-mockup endpoint.
// Drop-in replacement for the old @imgly version — same exports + return shape.

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

// Pixels at or above this brightness are pure background — fully transparent.
const FULLY_BACKGROUND = 252;
// Pixels at or above this brightness are *candidates* for despill — but
// only if they're also spatially near a background pixel (see EDGE_RADIUS
// below); spatial adjacency, not brightness, is what actually decides
// whether a pixel gets touched, so this only needs to be low enough to
// cheaply skip pixels that obviously can't be part of any white blend at
// all (near-black). For a dark subject like brown/black hair, minComp at
// full opacity can be as low as ~20-30 and rises almost the entire way to
// 255 across the real blend band — the old 225-245 band, and an earlier
// version of this fix's own 150 cutoff, both still caught only the last
// sliver closest to pure white and left most of the real edge untouched at
// full opacity with its colour still contaminated by white. Kept low
// deliberately; the adjacency check is the real safety net now, not this.
const EDGE_START = 5;
// How many pixels away from an actual background pixel a candidate pixel
// can be and still be treated as "near the silhouette boundary." Brightness
// alone can't tell a genuine edge-blend pixel (hair fading into white) apart
// from a pixel that's just naturally bright deep inside the subject (light
// skin, a white shirt) — this is exactly the false positive an earlier,
// brightness-only version of this function hit on skin-tone edges (see
// bgRemoval.despill.test.ts). Requiring actual adjacency to background
// pixels is what makes the wide EDGE_START safe: an interior bright pixel
// is never near real background, so it's left alone regardless of how
// bright it is.
const EDGE_RADIUS = 9;
// Deliberately no gamma/choke curve on the recovered alpha here: an earlier
// version of this fix pushed alpha toward 0 with an exponent to hide
// residual fringe, but that distorts the alpha estimate for pixels close to
// fully opaque too — which then makes the despill step below subtract too
// much of the white contribution and overshoots into clamped, wrong colour
// (caught by this file's own tests). A plain linear estimate, despilled
// accurately, is more faithful than a coarse "trim the edge" heuristic.

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Keys a subject-on-white-background image to transparency, in place.
 *
 * The naive version of this (a single global brightness threshold -> alpha
 * only, no colour correction) leaves a visible light/white "halo" around
 * soft edges like hair: an edge pixel is a genuine blend of the subject's
 * true colour and the white backdrop, so merely making it partially
 * transparent without also correcting its RGB leaves it still tinted toward
 * white. Composited onto a light card template that's invisible; composited
 * onto a dark one (space/galaxy backgrounds, dark jerseys) it reads as a
 * distinct halo ring — this is the exact defect reported on Miles's and
 * Roy's cards.
 *
 * Two things are needed to fix it, and both matter:
 *
 * 1. Un-premultiply ("despill"): once we've estimated a pixel's alpha, we
 *    can recover its true foreground colour by subtracting the background's
 *    proportional contribution back out, rather than leaving the observed
 *    (white-blended) colour as-is.
 * 2. Spatial adjacency, not brightness alone, decides *which* pixels are
 *    edge candidates: brightness by itself can't distinguish a genuinely
 *    bright subject pixel (light skin, a white shirt, deep inside the
 *    subject) from a background-blended edge pixel — only proximity to an
 *    actual background pixel can. Skipping this was a real bug caught by
 *    this file's own tests during development: widening the brightness band
 *    enough to catch dark-hair edges started keying real skin pixels
 *    transparent too, until adjacency was added as a second, required
 *    condition.
 *
 * Pure function, no DOM/Canvas dependency, so it's directly unit-testable —
 * see bgRemoval.despill.test.ts.
 */
export function despillAndKeyWhite(data: Uint8ClampedArray, width: number, height: number): void {
  const pixelCount = width * height;
  const minComp = new Uint8ClampedArray(pixelCount);
  const isBackground = new Uint8Array(pixelCount);

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const mc = Math.min(data[i], data[i + 1], data[i + 2]);
    minComp[p] = mc;
    isBackground[p] = mc >= FULLY_BACKGROUND ? 1 : 0;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;

      if (isBackground[p]) {
        data[i + 3] = 0;
        continue;
      }
      if (minComp[p] < EDGE_START) {
        // Not bright enough to be an edge-blend candidate at all — leave
        // untouched regardless of position.
        continue;
      }

      let nearBackground = false;
      for (let dy = -EDGE_RADIUS; dy <= EDGE_RADIUS && !nearBackground; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const rowStart = ny * width;
        for (let dx = -EDGE_RADIUS; dx <= EDGE_RADIUS; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (isBackground[rowStart + nx]) {
            nearBackground = true;
            break;
          }
        }
      }
      if (!nearBackground) {
        // Bright, but nowhere near real background — a genuine light
        // subject pixel (skin, a white shirt), not an edge blend.
        continue;
      }

      const bgFraction = (minComp[p] - EDGE_START) / (FULLY_BACKGROUND - EDGE_START);
      const rawAlpha = 1 - bgFraction;
      const alpha = Math.max(0, Math.min(1, rawAlpha));

      if (alpha <= 0) {
        data[i + 3] = 0;
        continue;
      }

      // Un-premultiply: observed = fg*alpha + white*(1-alpha), so
      // fg = (observed - white*(1-alpha)) / alpha.
      const r = data[i], g = data[i + 1], b = data[i + 2];
      data[i] = clamp255((r - 255 * (1 - alpha)) / alpha);
      data[i + 1] = clamp255((g - 255 * (1 - alpha)) / alpha);
      data[i + 2] = clamp255((b - 255 * (1 - alpha)) / alpha);
      data[i + 3] = clamp255(alpha * 255);
    }
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
      despillAndKeyWhite(id.data, c.width, c.height);
      ctx.putImageData(id, 0, 0);
      resolve({ dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height });
    };
    img.onerror = () => reject(new Error('Image decode for alpha key failed'));
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

export async function removeBackgroundSmart(file: File): Promise<RemoveBgResult> {
  // 1. Resize + re-encode to keep the payload sensible
  const resized = await resizeToJpegDataUrl(file);

  // 2. Ask Gemini to put the subject on a white background (12 s timeout)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  let resp: Response;
  try {
    resp = await fetch('/api/ai-mockup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: resized,
        mimeType: 'image/jpeg',
        kind: 'cutout',
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return { dataUrl: resized, method: 'canvas' };
  }
  clearTimeout(timeoutId);
  const json: { image?: string; error?: string } = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.image) {
    // No API key or API unavailable — pass the photo through unchanged so the
    // builder remains navigable without a Gemini key configured.
    return { dataUrl: resized, method: 'canvas' };
  }

  // 3. Alpha-key the white background to transparency
  const { dataUrl: transparent } = await alphaKeyWhite(json.image);

  // 4. Crop to the subject's bounding box so the cutout fills the frame
  const cropped = await cropToContent(transparent);

  return { dataUrl: cropped, method: 'gemini' };
}
