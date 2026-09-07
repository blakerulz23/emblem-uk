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

// Take an image that has a (near-)white background and key those pixels to transparent.
// Returns { dataUrl, w, h } so the caller can decide whether to also crop.
//
// FOUNDER DECISION (Blake, 7 September 2026): reverted to the plain
// brightness-threshold version (matches emblem.cards/youthcards'
// bgRemoval.ts exactly) after the despill+adjacency version (this file's
// prior history) still left a visible warm-toned fringe on a backlit
// outdoor photo — Gemini gave that photo a hard, non-anti-aliased cutout
// edge, and the adjacency heuristic ended up "correcting" genuine opaque
// edge pixels that were never actually blended with white, producing a
// worse artifact than it removed. Known, accepted trade-off: this plain
// version has no colour correction at all, so it can still show the
// original white-halo defect (reported on Miles's and Roy's cards) on
// photos where Gemini *does* anti-alias the cutout edge.
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
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const minComp = Math.min(r, g, b);
        if (minComp >= 245) {
          d[i + 3] = 0;
        } else if (minComp >= 225) {
          d[i + 3] = Math.round(((245 - minComp) / 20) * 255);
        }
      }
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
  // 1. Resize + re-encode to keep the payload sensible
  const resized = await resizeToJpegDataUrl(file);

  // 2. Ask Gemini to put the subject on a white background, retrying if the
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
