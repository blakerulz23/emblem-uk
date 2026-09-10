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

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Keys (near-)white pixels of an RGBA buffer to transparent, in place, and
 * recovers the true foreground colour of any pixel it makes non-opaque.
 *
 * FOUNDER DECISION (Blake, 7 September 2026): an earlier despill+adjacency
 * version of this correction (this file's prior history) was reverted after
 * it left a visible warm-toned fringe on a backlit outdoor photo — Gemini
 * gave that photo a hard, non-anti-aliased cutout edge, and the adjacency
 * heuristic ended up "correcting" genuine opaque edge pixels that were
 * never actually blended with white (found near, not blended with,
 * background pixels), producing a worse artifact than it removed.
 * Reverting to a plain brightness-threshold-only version removed the
 * correction entirely, leaving the original white-halo defect in place
 * (reported on Miles's and Roy's cards; confirmed again directly against
 * Miles's own supplied photo — real per-pixel measurement showed the
 * semi-transparent hair-edge band averaging RGB brightness 237/255,
 * essentially white, against the true hair colour's ~39/255) on any photo
 * where Gemini *does* anti-alias the cutout edge.
 *
 * This version corrects that without repeating the adjacency mistake: the
 * alpha ramp below (`minComp` thresholds) is completely UNCHANGED from the
 * plain version — still the same brightness-only estimate, still the same
 * 225/245 thresholds — and RGB is only ever touched for a pixel whose OWN
 * just-computed alpha is non-opaque. There is no lookup at neighbouring
 * pixels at all. This is what makes the fix safe on a hard, non-anti-
 * aliased cutout edge: a hard edge has zero pixels with alpha strictly
 * between 0 and 255 by construction (every pixel is either fully inside the
 * subject or fully inside the background), so the correction below is a
 * no-op there — confirmed directly by simulating one (binarizing a real
 * photo's alpha, re-compositing onto white, running this function): 0.0055%
 * of pixels were touched, all in one small cluster where the subject's own
 * fabric was independently pale enough to trip the pre-existing brightness
 * threshold on its own — not a reintroduction of the ~9px whole-silhouette
 * band the adjacency version produced.
 *
 * The correction itself: /api/ai-mockup's own cutout prompt requires Gemini
 * to composite the subject onto pure solid white (#FFFFFF) — so any pixel
 * this function assigns a non-opaque alpha to is, by construction, a known
 * blend of the true foreground colour and pure white. That blend can be
 * inverted exactly (Porter-Duff "over," solved for the source colour) to
 * recover the true foreground colour, which is what a correctly
 * alpha-aware compositor should show at every alpha level instead of a
 * colour pinned near white. Semi-transparent pixels are corrected this way;
 * fully-transparent pixels get a safe neutral grey rather than Gemini's
 * leftover white, since a stale white RGB there can still bleed into a
 * neighbouring semi-transparent pixel during later resizing (many resize
 * implementations interpolate RGB and alpha independently) even though it
 * never affects a direct, unresized render. Opaque pixels are never
 * touched. The recovered colour is only as accurate as the alpha estimate
 * it is inverted against — that estimate is a brightness heuristic, not a
 * true alpha channel (Gemini's cutout response has none), so this is a
 * substantial, measured improvement (real hair-edge brightness dropped
 * from 237/255 to 192/255 against a true value of 39/255 on the reference
 * photo), not a mathematically perfect recovery.
 *
 * Exported as a pure, DOM-free function (operates on a plain RGBA buffer,
 * not a canvas) so it can be unit-tested directly without a browser/canvas
 * environment — see bgRemoval.test.ts.
 */
export function keyAndDecontaminateWhite(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const minComp = Math.min(r, g, b);
    let alpha = 255;
    if (minComp >= 245) {
      alpha = 0;
    } else if (minComp >= 225) {
      alpha = Math.round(((245 - minComp) / 20) * 255);
    }
    data[i + 3] = alpha;

    if (alpha === 0) {
      data[i] = 128; data[i + 1] = 128; data[i + 2] = 128;
    } else if (alpha < 255) {
      const af = alpha / 255;
      data[i] = clamp255((r - (1 - af) * 255) / af);
      data[i + 1] = clamp255((g - (1 - af) * 255) / af);
      data[i + 2] = clamp255((b - (1 - af) * 255) / af);
    }
  }
}

// Take an image that has a (near-)white background and key those pixels to
// transparent, decontaminating the recovered colour of any pixel it makes
// non-opaque (see keyAndDecontaminateWhite above). Returns { dataUrl, w, h }
// so the caller can decide whether to also crop.
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
      keyAndDecontaminateWhite(id.data);
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
