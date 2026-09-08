'use client';

import html2canvas from 'html2canvas';
import { computeObjectFitCoverCropWindow } from './photo-geometry';

/**
 * emblem_builder_csrf is deliberately non-httpOnly (see
 * src/lib/builder-request-security.ts and src/middleware.ts's
 * ensureBuilderCsrfCookie) specifically so client code can echo it back as
 * a header — the same double-submit-cookie pattern Squad Invite's own
 * readSquadInviteCsrfCookie (ProductionBuilder.tsx) uses. Shared here
 * because both ProductionBuilder.tsx and the test-print dev harness call
 * into this module.
 */
export const BUILDER_CSRF_HEADER = 'x-emblem-builder-csrf';

export function readBuilderCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )emblem_builder_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export interface CaptureOptions {
  pixelRatio?: number;
  quality?: number;
  backgroundColor?: string;
}

/**
 * html2canvas does not implement `object-fit`/`object-position` — it always
 * draws an <img>'s full natural bitmap stretched into the element's own
 * layout box (verified by reading its bundled source: CanvasRenderer.
 * renderReplacedElement's drawImage call always passes the image's own
 * intrinsicWidth/Height as the source rect, regardless of computed style).
 * Every <img> this app ever captures uses `object-fit:cover` (see
 * photo-geometry.ts's computePhotoGeometry — the single place that CSS is
 * produced), so every capture — card-front sharing AND the print files
 * customers are actually sent to production — silently reverted to
 * object-fit:fill behaviour: stretching, not cropping, whichever full photo
 * was uploaded into the card's fixed photo-well box. On a photo whose
 * aspect ratio is close to the box's own (~0.71) this is a small, easy-to-
 * miss distortion; on one further from it (e.g. a square photo) it's large
 * and visibly wrong. A live end-to-end measurement (a real, roughly-square
 * uploaded photo) showed the captured render's body ~30% narrower than the
 * on-screen render's, at identical card dimensions — matching predicted
 * cover-vs-fill scale error almost exactly.
 *
 * Fixed once, here, for every caller: before capture, every `object-fit:
 * cover` <img> under `el` is pre-cropped to exactly the rectangle the
 * browser's own cover algorithm already paints (computeObjectFitCoverCrop-
 * Window, in photo-geometry.ts) and its src swapped to that cropped bitmap
 * with object-fit neutralised — since the swapped-in image's own aspect
 * ratio now exactly matches its box, html2canvas's fill-shaped drawImage
 * call reproduces the correct crop with no further distortion possible.
 * Every existing CSS `transform` (the saved pan/zoom crop) is left
 * completely untouched — html2canvas supports transform correctly; only
 * object-fit was ever the problem. The DOM is restored to its original
 * state in a `finally`, so this is invisible to every caller and safe to
 * run against a live (not just offscreen) element.
 */
async function neutralizeObjectFitCoverForCapture(el: HTMLElement): Promise<() => void> {
  const imgs = Array.from(el.querySelectorAll('img')).filter((img) => {
    const style = getComputedStyle(img);
    return style.objectFit === 'cover' && img.naturalWidth > 0 && img.naturalHeight > 0 && img.offsetWidth > 0 && img.offsetHeight > 0;
  });

  const restores: Array<() => void> = [];
  for (const img of imgs) {
    const boxWidth = img.offsetWidth;
    const boxHeight = img.offsetHeight;
    const style = getComputedStyle(img);
    const [posXRaw, posYRaw] = style.objectPosition.split(' ');
    const positionXPercent = parseFloat(posXRaw);
    const positionYPercent = parseFloat(posYRaw);

    const crop = computeObjectFitCoverCropWindow({
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      boxWidth,
      boxHeight,
      positionXPercent: Number.isFinite(positionXPercent) ? positionXPercent : 50,
      positionYPercent: Number.isFinite(positionYPercent) ? positionYPercent : 50,
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

    const originalSrc = img.src;
    const originalObjectFit = img.style.objectFit;
    const originalObjectPosition = img.style.objectPosition;
    restores.push(() => {
      img.src = originalSrc;
      img.style.objectFit = originalObjectFit;
      img.style.objectPosition = originalObjectPosition;
    });

    img.src = canvas.toDataURL('image/png');
    // Harmless once the bitmap's own aspect ratio matches its box exactly —
    // kept explicit (rather than left as 'cover') so nothing depends on
    // object-fit's cropping behaviour at all for this swapped-in image.
    img.style.objectFit = 'fill';
    img.style.objectPosition = '50% 50%';
  }

  // The synchronous src assignments above still decode asynchronously.
  await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));

  return () => restores.forEach((restore) => restore());
}

export async function captureElementToPng(
  el: HTMLElement,
  opts: CaptureOptions = {}
): Promise<string> {
  const restore = await neutralizeObjectFitCoverForCapture(el);
  try {
    const canvas = await html2canvas(el, {
      scale: opts.pixelRatio ?? 1.5,
      useCORS: true,
      allowTaint: false,
      backgroundColor: opts.backgroundColor ?? null,
      logging: false,
    });
    return canvas.toDataURL('image/jpeg', opts.quality ?? 0.88);
  } finally {
    restore();
  }
}

export type PrintProduct = 'card' | 'sticker' | 'keychain' | 'poster-sm' | 'poster-md' | 'poster-lg' | 'puzzle';

export interface RenderPrintResponse {
  success: boolean;
  key: string;
  downloadUrl: string;
  bytes: number;
  spec: { label: string; finalWidthIn: number; finalHeightIn: number; bleedIn: number; dpi: number; pages: number };
}

export async function renderPrintFile(
  product: PrintProduct,
  frontImageDataUrl: string,
  meta?: { playerName?: string; teamName?: string; template?: string; orderRef?: string },
  backImageDataUrl?: string,
  /** Optional here only for parameter-ordering reasons (it must follow
   *  the already-optional meta/backImageDataUrl) — /api/render-print
   *  itself now rejects any call that omits it. Namespaces the print-file
   *  key by order-enquiry-validation.ts's expected
   *  print-files/<submissionKey>/ prefix. A real order submission uses
   *  ProductionBuilder.tsx's own crypto.randomUUID(); src/app/test-print
   *  generates its own dev-only key for the same reason. */
  submissionKey?: string
): Promise<RenderPrintResponse> {
  const r = await fetch('/api/render-print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
    body: JSON.stringify({ product, frontImageDataUrl, backImageDataUrl, meta, submissionKey }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'render failed' }));
    throw new Error(err.error || 'render failed');
  }
  return r.json();
}
