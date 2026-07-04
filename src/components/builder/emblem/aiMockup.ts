// src/components/builder/emblem/aiMockup.ts
// Client-side helpers for the AI mockup endpoint.
// Resizes the photo down (Gemini doesn't need a huge image and big payloads
// are slow + bump up against route size limits), then POSTs to /api/ai-mockup.

const MAX_DIM = 1024;
const JPEG_QUALITY = 0.9;

export type AIKind =
  | 'plushie' | 'figurine' | 'pendant' | 'coin'
  | 'bobblehead'
  | 'armyman'
  | 'rushmore'
  | 'jewelry-charm'
  | 'keychain-charm'
  | 'pin-charm'
  | 'magnet-charm';

export async function fileToResizedDataUrl(file: File | Blob): Promise<string> {
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
      if (!ctx) {
        reject(new Error('Could not get 2D context'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

// Some of our existing photo state stores the photo as a data URL string
// (from background removal). This converts that to a resized version too.
export async function dataUrlToResized(dataUrl: string): Promise<string> {
  // If already JPEG and small-ish, send as-is. Otherwise re-encode.
  const blob = await (await fetch(dataUrl)).blob();
  return fileToResizedDataUrl(blob);
}

export async function generateAIMockup(
  imageDataUrl: string,
  kind: AIKind,
  extras?: Record<string, unknown>,
): Promise<{ image: string; model: string }> {
  const res = await fetch('/api/ai-mockup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: imageDataUrl,
      mimeType: 'image/jpeg',
      kind,
      ...(extras || {}),
    }),
  });
  const data: { image?: string; model?: string; error?: string } = await res
    .json()
    .catch(() => ({}));
  if (!res.ok || !data.image) {
    throw new Error(data.error || `AI mockup failed (${res.status})`);
  }
  return { image: data.image, model: data.model || '' };
}


// Mount Rushmore: takes up to 4 photos, returns one combined scene.
export async function generateRushmoreScene(
  photoDataUrls: string[],
): Promise<{ image: string }> {
  const res = await fetch('/api/ai-mockup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'rushmore',
      imagesBase64: photoDataUrls,
      mimeType: 'image/jpeg',
    }),
  });
  const data: { image?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok || !data.image) {
    throw new Error(data.error || 'Rushmore generation failed');
  }
  return { image: data.image };
}
