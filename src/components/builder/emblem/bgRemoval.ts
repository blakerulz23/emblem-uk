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
