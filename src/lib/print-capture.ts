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
    // Images inside a clip-path wrapper are handled by
    // neutralizeClipPathForCapture instead (below) — that function bakes
    // object-fit AND the clip shape together in one pass, since baking
    // object-fit alone here first would leave this function's own swapped-
    // in (already-cropped) bitmap as the "natural" image the clip pass
    // then reads, silently double-cropping it.
    if (img.closest('[data-capture-clip-wrapper]')) return false;
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

/**
 * html2canvas also does not implement CSS `clip-path` at all — verified by
 * reading its bundled source (no clip-path handling anywhere in
 * CanvasRenderer) and confirmed live: every `ellipse()`/`polygon()`/`inset()`
 * clip in this codebase's own card templates (Solar/Galaxy/Comic via the
 * shared EMJFL_PHOTO_CLIP, Hollinwood, EMJFL, Galaxy/Vintage's own
 * `inset()` clips in RealCardArt, and Crimson/Royal/Emerald/Glacier's own
 * generous photo-placement rectangles) is silently ignored — the captured/
 * shared/printed image shows the photo's full, unclipped rectangular box
 * instead of the shaped/bounded window the builder preview shows, a real
 * divergence between preview and the file a guardian actually receives
 * (confirmed by a live capture-vs-preview comparison; every one of those
 * templates was affected, not just the newest four). `path()` support
 * below is kept as a generically-tested syntax (no current template uses
 * it — Glacier's own first-pass arch clip, which did, was replaced with
 * an `inset()` rectangle after a composition correction; see
 * GlacierCardArt.tsx's own doc comment) rather than removed, since a
 * future template's own clip-path could reasonably need it.
 *
 * Fixed the same way as the object-fit bug above: each `[data-capture-
 * clip-wrapper]` element's own single <img> is pre-baked onto an offscreen
 * canvas sized to the wrapper's own box, with the shape applied via
 * Canvas2D `ctx.clip()` (which supports arbitrary paths, unlike
 * html2canvas) — reproducing the exact on-screen appearance, including
 * whatever CSS `transform` the customer's own saved pan/zoom already
 * applied, by replaying the BROWSER's own resolved transform matrix
 * (`getComputedStyle(img).transform`, already correct for translate-
 * percentage/scale/order-of-operations) around the box's own centre,
 * rather than re-deriving CSS transform semantics by hand. The object-fit:
 * fill branch (computePhotoGeometry's own "reveal more"/zoom-out case,
 * explicit left/top/width/height, transform:none) needs no matrix replay —
 * just a direct draw into that already-resolved rect. Every wrapper this
 * function targets is explicitly marked with the `data-capture-clip-
 * wrapper` attribute in its own CardArt.tsx/*CardArt.tsx source (not a
 * generic "any element with a clip-path" scan) so this only ever touches
 * the specific photo-clip pattern it was built for.
 *
 * Images already processed by neutralizeObjectFitCoverForCapture are
 * explicitly excluded there (see that function's own filter) — running
 * both on the same <img> would have this function's own crop math read
 * the OTHER function's already-cropped, swapped-in bitmap as if it were
 * the original upload, silently double-cropping it.
 */
/**
 * The parsed, framework-agnostic description of one clip-path shape, in
 * absolute pixel coordinates already resolved against a given box size —
 * deliberately returned as plain data rather than a `Path2D` directly, so
 * the regex-and-percentage-resolution logic (where two real, shipped bugs
 * have lived — an off-by-one in a destructuring pattern, and an inset()
 * value-count assumption that didn't match what getComputedStyle actually
 * returns — see this function's own inset() branch) can be unit-tested
 * without a DOM/Canvas environment. `clipShapeToPath2D` below does the
 * DOM-dependent conversion at actual capture time.
 */
export type ClipShapeDescriptor =
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { type: 'polygon'; points: Array<[number, number]> }
  | { type: 'path'; d: string }
  | { type: 'inset'; x: number; y: number; width: number; height: number };

export function parseClipPathShape(clipPath: string, boxWidth: number, boxHeight: number): ClipShapeDescriptor | null {
  const ellipseMatch = clipPath.match(/^ellipse\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (ellipseMatch) {
    const [rx, ry, cx, cy] = ellipseMatch.slice(1).map(Number);
    return {
      type: 'ellipse',
      cx: (cx / 100) * boxWidth,
      cy: (cy / 100) * boxHeight,
      rx: (rx / 100) * boxWidth,
      ry: (ry / 100) * boxHeight,
    };
  }

  const polygonMatch = clipPath.match(/^polygon\((.+)\)$/);
  if (polygonMatch) {
    const points = polygonMatch[1].split(',').map((pair): [number, number] => {
      const [xRaw, yRaw] = pair.trim().split(/\s+/);
      return [(parseFloat(xRaw) / 100) * boxWidth, (parseFloat(yRaw) / 100) * boxHeight];
    });
    return { type: 'polygon', points };
  }

  // path('M ...') — no current template uses this (Glacier's own first-
  // pass arch clip did, computed from the card's real W/H at render time,
  // before being replaced with an inset() rectangle — see
  // GlacierCardArt.tsx's own doc comment); kept supported for a future
  // clip-path that supplies literal SVG path data in absolute pixel
  // coordinates — the string content is valid input to the Path2D
  // constructor directly.
  const pathMatch = clipPath.match(/^path\(\s*(?:'([^']*)'|"([^"]*)")\s*\)$/);
  if (pathMatch) {
    const d = pathMatch[1] ?? pathMatch[2];
    return { type: 'path', d };
  }

  // inset(<1-4 percentages>) — Galaxy/Vintage's own RealCardArt clips, and
  // Crimson/Royal/Emerald/Glacier's own PHOTO_CLIP. Any trailing
  // `round <radius>` is intentionally ignored (sharp corners instead of a
  // ~2% radius) rather than guessed at with an unverified roundRect
  // implementation — a negligible difference next to the bug being fixed
  // (no clip applied at all).
  //
  // Critical: this must accept 1-4 values and expand them with the same
  // shorthand rule CSS itself uses for margin/padding/inset — NOT assume
  // the source always writes all 4 explicitly. A real, shipped instance of
  // getting this wrong: this inline style always wrote all 4 values
  // explicitly (e.g. 'inset(8% 15% 36% 15%)'), but the browser's own
  // getComputedStyle collapses it back down to the shortest equivalent
  // form whenever adjacent sides match — right==left here collapses that
  // to the 3-value form 'inset(8% 15% 36%)' — and neutralizeClipPathForCapture
  // reads the shape from getComputedStyle, not the original inline string.
  // A regex that only matched the literal 4-value form silently failed to
  // match, parseClipPathShape returned null, and the whole capture-fix
  // silently no-opped — confirmed live via a native-vs-exported capture
  // comparison showing the exported PNG completely unclipped. Galaxy's own
  // real clip-path ('inset(2.2% 3.2% 3.2% 3.2% round 2%)', where
  // right==bottom==left) collapses the same way and was equally affected.
  const insetMatch = clipPath.match(/^inset\(\s*([^)]+?)\s*\)$/);
  if (insetMatch) {
    const withoutRound = insetMatch[1].replace(/\s+round\s+.+$/, '').trim();
    const tokens = withoutRound.split(/\s+/);
    if (tokens.length >= 1 && tokens.length <= 4 && tokens.every((t) => /^[\d.]+%$/.test(t))) {
      const values = tokens.map((t) => parseFloat(t));
      // Standard CSS box-shorthand expansion (same rule as margin/padding).
      const [v0, v1 = v0, v2 = v0, v3 = v1] = values;
      const [top, right, bottom, left] = [v0, v1, v2, v3];
      return {
        type: 'inset',
        x: (left / 100) * boxWidth,
        y: (top / 100) * boxHeight,
        width: boxWidth - (left / 100) * boxWidth - (right / 100) * boxWidth,
        height: boxHeight - (top / 100) * boxHeight - (bottom / 100) * boxHeight,
      };
    }
  }

  return null;
}

function clipShapeToPath2D(shape: ClipShapeDescriptor): Path2D {
  const path = new Path2D();
  switch (shape.type) {
    case 'ellipse':
      path.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
      return path;
    case 'polygon':
      shape.points.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
      path.closePath();
      return path;
    case 'path':
      return new Path2D(shape.d);
    case 'inset':
      path.rect(shape.x, shape.y, shape.width, shape.height);
      return path;
  }
}

async function neutralizeClipPathForCapture(el: HTMLElement): Promise<() => void> {
  const wrappers = Array.from(el.querySelectorAll<HTMLElement>('[data-capture-clip-wrapper]'));
  const restores: Array<() => void> = [];

  for (const wrapper of wrappers) {
    const img = wrapper.querySelector('img');
    if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) continue;
    const boxWidth = wrapper.offsetWidth;
    const boxHeight = wrapper.offsetHeight;
    if (boxWidth <= 0 || boxHeight <= 0) continue;

    const clipPathValue = getComputedStyle(wrapper).clipPath;
    if (!clipPathValue || clipPathValue === 'none') continue;
    const clipShape = parseClipPathShape(clipPathValue, boxWidth, boxHeight);
    if (!clipShape) continue; // unrecognised shape syntax — leave untouched rather than guess

    const imgStyle = getComputedStyle(img);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(boxWidth));
    canvas.height = Math.max(1, Math.round(boxHeight));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.save();
    ctx.clip(clipShapeToPath2D(clipShape));

    const transformValue = imgStyle.transform;
    if (transformValue && transformValue !== 'none') {
      // object-fit:cover branch (computePhotoGeometry's default case) — the
      // image visually fills the box (inset:0/100%/100%/cover) before the
      // transform is applied, so the cover-crop window in natural pixels
      // maps onto the full box; the browser's own resolved matrix (already
      // correct for translate-percentage/scale/order-of-operations) is
      // then replayed around the box's own centre, matching
      // computePhotoGeometry's fixed transformOrigin:'center center'.
      const [posXRaw, posYRaw] = imgStyle.objectPosition.split(' ');
      const positionXPercent = parseFloat(posXRaw) || 50;
      const positionYPercent = parseFloat(posYRaw) || 50;
      const crop = computeObjectFitCoverCropWindow({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        boxWidth,
        boxHeight,
        positionXPercent,
        positionYPercent,
      });
      const matrix = new DOMMatrix(transformValue);
      ctx.translate(boxWidth / 2, boxHeight / 2);
      ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
      ctx.translate(-boxWidth / 2, -boxHeight / 2);
      ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, boxWidth, boxHeight);
    } else {
      // object-fit:fill branch (explicit left/top/width/height, transform:
      // none) — draw the whole natural image straight into that already-
      // resolved rect, no crop/matrix math needed.
      const left = parseFloat(imgStyle.left) || 0;
      const top = parseFloat(imgStyle.top) || 0;
      const w = parseFloat(imgStyle.width) || boxWidth;
      const h = parseFloat(imgStyle.height) || boxHeight;
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, left, top, w, h);
    }
    ctx.restore();

    const originalSrc = img.src;
    const original = {
      objectFit: img.style.objectFit,
      objectPosition: img.style.objectPosition,
      transform: img.style.transform,
      left: img.style.left,
      top: img.style.top,
      width: img.style.width,
      height: img.style.height,
    };
    restores.push(() => {
      img.src = originalSrc;
      img.style.objectFit = original.objectFit;
      img.style.objectPosition = original.objectPosition;
      img.style.transform = original.transform;
      img.style.left = original.left;
      img.style.top = original.top;
      img.style.width = original.width;
      img.style.height = original.height;
    });

    img.src = canvas.toDataURL('image/png');
    img.style.objectFit = 'fill';
    img.style.objectPosition = '50% 50%';
    img.style.transform = 'none';
    img.style.left = '0px';
    img.style.top = '0px';
    img.style.width = '100%';
    img.style.height = '100%';
  }

  await Promise.all(
    wrappers
      .map((w) => w.querySelector('img'))
      .filter((img): img is HTMLImageElement => !!img)
      .map((img) => img.decode().catch(() => undefined))
  );

  return () => restores.forEach((restore) => restore());
}

export async function captureElementToPng(
  el: HTMLElement,
  opts: CaptureOptions = {}
): Promise<string> {
  // html2canvas paints whatever is already loaded/rendered at the moment
  // it runs — a webfont (e.g. Hollinwood's Antonio Bold name/position
  // layer) that's still downloading gets silently captured in its
  // fallback face instead, with no error. document.fonts.ready resolves
  // once every font actually referenced by the page has finished loading
  // (or failed), so this guarantees the real face is what gets captured —
  // never a race with the browser's own font-swap timing. Independent of,
  // and unrelated to, the object-fit neutralisation below.
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }
  const restoreObjectFit = await neutralizeObjectFitCoverForCapture(el);
  const restoreClipPath = await neutralizeClipPathForCapture(el);
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
    restoreClipPath();
    restoreObjectFit();
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
