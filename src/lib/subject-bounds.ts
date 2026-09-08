'use client';

/**
 * Client-side, canvas-only detection of where a cutout's actual pixel
 * content sits — never a network call, never a face/landmark model (see
 * the task this was built for: "do not send children's photos to a new
 * external service"). This finds the bounding box of non-transparent
 * pixels, the same alpha-bounding-box idea bgRemoval.ts's cropToContent
 * already uses to trim a fresh Gemini cutout — reused here, at a lower
 * threshold's cousin (same ALPHA_THRESHOLD=28), to tell Auto-fit Player
 * how much of the *frame* the subject actually needs.
 *
 * This is deliberately NOT face/head/limb detection. It only proves "the
 * opaque cutout content spans this rectangle" — see PhotoAsset.subjectBounds
 * in emblem-uk-builder.ts for why callers must never treat it as proof of
 * where a face or head specifically is.
 */

export type NaturalSize = { width: number; height: number };
export type SubjectBoundsFraction = { x0: number; y0: number; x1: number; y1: number };

const ALPHA_THRESHOLD = 28;
// A photo this close to fully opaque has no meaningful transparency to
// bound — almost certainly the 'canvas' fallback path (no Gemini cutout),
// where every pixel is real photo content and there is no "subject vs
// background" alpha signal to detect at all.
const MOSTLY_OPAQUE_FRACTION = 0.98;

export async function loadNaturalSize(src: string): Promise<NaturalSize | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Returns null when the photo has no usable alpha signal (opaque JPEG,
 * fully-opaque PNG, or a decode failure) — callers should fall back to
 * treating the whole natural image as the subject area in that case,
 * never fabricate a tighter guess.
 */
export async function detectSubjectBounds(src: string): Promise<SubjectBoundsFraction | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= 0 || h <= 0) { resolve(null); return; }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, w, h).data;
      } catch {
        // Cross-origin canvas taint — can't read pixels; not this
        // function's job to fail the whole flow over it.
        resolve(null);
        return;
      }

      let minX = w, minY = h, maxX = -1, maxY = -1;
      let opaqueCount = 0;
      const totalPixels = w * h;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3];
          if (a > ALPHA_THRESHOLD) {
            opaqueCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < 0 || maxY < 0) { resolve(null); return; }
      if (opaqueCount / totalPixels >= MOSTLY_OPAQUE_FRACTION) { resolve(null); return; }

      resolve({ x0: minX / w, y0: minY / h, x1: (maxX + 1) / w, y1: (maxY + 1) / h });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
