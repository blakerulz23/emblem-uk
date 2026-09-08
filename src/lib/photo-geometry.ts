/**
 * The one place a saved photo crop/zoom/position turns into CSS. Emblem
 * OS (CardFace, reading card_definitions.photo.crop) and the print-capture
 * rig (reading the live player.photo.crop) both render through the same
 * CardArt component, and CardArt's several per-family photo layers
 * (EMJFL/Hollinwood/Custom/RealCardArt) all called this identical formula
 * inline before this extraction — there was already only one calculation,
 * not two; this makes it a single named, independently testable function
 * instead of four copies of the same string template.
 */

export type PhotoCrop = { x: number; y: number; scale: number };

export type PhotoNaturalSize = { naturalWidth: number; naturalHeight: number };
export type PhotoBox = { boxWidth: number; boxHeight: number };

export type PhotoGeometry = {
  objectFit: 'cover' | 'fill';
  objectPosition: string;
  transform: string;
  transformOrigin: string;
} & Partial<{ position: 'absolute'; left: string; top: string; width: string; height: string }>;

function parsePositionPercent(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (trimmed === 'center') return 50;
  if (trimmed === 'left' || trimmed === 'top') return 0;
  if (trimmed === 'right' || trimmed === 'bottom') return 100;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * `objectPosition` varies slightly by template family (most use
 * 'center 12%', RealCardArt's procedural fallback uses 'center 10%') —
 * passed through rather than hard-coded so this stays the single source
 * of the *scale/offset* rule without forcing every family onto identical
 * framing.
 *
 * `sizing` (the photo's natural pixel dimensions + the rendered box's own
 * pixel dimensions) is optional and additive: omit it — or request
 * scale >= 1 — and this returns the exact original formula, pixel-for-pixel
 * identical to every card saved before this parameter existed. It only
 * takes effect for scale < 1 ("zoom out"), because that is the one range
 * the original formula could never serve correctly: `object-fit: cover`
 * selects its crop window from the element's own LAYOUT box size alone,
 * and a paint-time `transform: scale()` never changes that — it only
 * shrinks the display of the *same, already-cropped* window, exposing
 * whatever sits behind the photo layer around it rather than more of the
 * source (confirmed empirically against a real full-body upload: the
 * visible hair-to-hands slice was pixel-identical at 1.0x, 0.8x and 0.3x,
 * with the template's own art appearing around the photo, not more of it,
 * as the box shrank — see PR description for the screenshots).
 *
 * With `sizing` present and scale < 1, this instead grows the *natural-pixel
 * window itself*, clamped so it can never exceed the real photo's own
 * bounds — "zoom out" now genuinely reveals more of what was uploaded, and
 * honestly stops at "the whole photo, letterboxed" rather than fabricating
 * anything beyond it (see computeAutoFitCrop below and the task's own "never
 * generate missing hair, limbs, clothing or background content").
 * Continuous at the scale=1 boundary by construction: at scale=1 the grown
 * window is defined to equal computeObjectFitCoverCropWindow's own baseline,
 * the same crop the legacy formula already produces.
 */
export function computePhotoGeometry(
  crop: PhotoCrop | null | undefined,
  objectPosition: string,
  sizing?: (PhotoNaturalSize & PhotoBox) | null
): PhotoGeometry {
  const scale = crop?.scale ?? 1;
  const x = crop?.x ?? 0;
  const y = crop?.y ?? 0;

  if (!sizing || scale >= 1 || sizing.naturalWidth <= 0 || sizing.naturalHeight <= 0 || sizing.boxWidth <= 0 || sizing.boxHeight <= 0) {
    return {
      objectFit: 'cover',
      objectPosition,
      transform: `translate(${x}%, ${y}%) scale(${scale})`,
      transformOrigin: 'center center',
    };
  }

  const { naturalWidth: natW, naturalHeight: natH, boxWidth: boxW, boxHeight: boxH } = sizing;
  const [posXRaw, posYRaw] = objectPosition.split(' ');
  const positionXPercent = parsePositionPercent(posXRaw, 50);
  const positionYPercent = parsePositionPercent(posYRaw, 50);

  const base = computeObjectFitCoverCropWindow({
    naturalWidth: natW, naturalHeight: natH, boxWidth: boxW, boxHeight: boxH, positionXPercent, positionYPercent,
  });

  // Grow the baseline window by 1/scale, independently per axis, each
  // capped at the photo's own real bound. Independently, not by a single
  // joint factor: in the common case (like a tall full-body photo in a
  // squarer box) one axis is *already* at its natural bound at scale=1 —
  // a joint min-factor clamp would then scale the other axis back down by
  // that same factor too, cancelling the very growth "zoom out" is meant
  // to produce. Growing each axis on its own is what lets the window's
  // aspect ratio depart from the box's own once there's more to reveal in
  // one direction than the other — the honest "nothing more to reveal
  // here, but there's still more there" case.
  const windowW = Math.min(base.width / scale, natW);
  const windowH = Math.min(base.height / scale, natH);

  const maxOffsetX = Math.max(0, natW - windowW);
  const maxOffsetY = Math.max(0, natH - windowH);
  // x/y (the existing Horizontal/Vertical pan controls, roughly -40..40)
  // shift the window within its now-larger slack, on top of the family's
  // own static bias — additive with the legacy formula's intent, but now
  // moving a real natural-pixel window instead of nudging an already-fixed
  // crop.
  const windowX0 = maxOffsetX * clamp01(positionXPercent / 100 + x / 100);
  const windowY0 = maxOffsetY * clamp01(positionYPercent / 100 + y / 100);

  const dispScale = Math.min(boxW / windowW, boxH / windowH);
  const renderedW = natW * dispScale;
  const renderedH = natH * dispScale;
  const left = -windowX0 * dispScale + (boxW - windowW * dispScale) / 2;
  const top = -windowY0 * dispScale + (boxH - windowH * dispScale) / 2;

  return {
    objectFit: 'fill',
    objectPosition: '50% 50%',
    transform: 'none',
    transformOrigin: 'center center',
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${renderedW}px`,
    height: `${renderedH}px`,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export type ObjectFitCoverCropWindow = { x: number; y: number; width: number; height: number };

/**
 * html2canvas (src/lib/print-capture.ts's captureElementToPng, the only
 * renderer this app ever captures a card through — for both card-front
 * sharing and print files) does not implement `object-fit`/`object-position`
 * at all: it always draws an <img>'s full natural bitmap stretched into the
 * element's own layout box (confirmed by reading its bundled source —
 * CanvasRenderer.renderReplacedElement's drawImage call passes the element's
 * intrinsicWidth/Height as the source rect unconditionally). The browser's
 * own on-screen rendering of the exact same CSS is correct; only the
 * captured/downloaded/printed output silently reverts to `object-fit:fill`
 * behaviour. For any photo whose aspect ratio differs from the card's
 * photo-well box (visible on real full-body uploads whose aspect sits far
 * from the box's own ~0.71), this measurably distorts and/or reveals more
 * or less of the source photo than what the guardian actually sees on
 * screen — confirmed by a live-photo end-to-end measurement showing the
 * captured render's body width at ~70% of the on-screen render's, matching
 * boxWidth/boxHeight to within measurement noise.
 *
 * This function computes the same crop window `object-fit:cover` +
 * `object-position` would already have painted (in NATURAL image pixels),
 * so the capture path can pre-crop the bitmap itself before handing it to
 * html2canvas — see neutralizeObjectFitCoverForCapture in print-capture.ts.
 * Deliberately covers object-fit:cover only (the one value this codebase's
 * photo layers ever use) — see computePhotoGeometry above.
 */
export function computeObjectFitCoverCropWindow(input: {
  naturalWidth: number;
  naturalHeight: number;
  boxWidth: number;
  boxHeight: number;
  /** Percentages, e.g. from a parsed "50% 12%" objectPosition — 0 = image's
   *  own edge flush with the box's edge, 100 = the opposite edge. */
  positionXPercent: number;
  positionYPercent: number;
}): ObjectFitCoverCropWindow {
  const { naturalWidth, naturalHeight, boxWidth, boxHeight, positionXPercent, positionYPercent } = input;
  const coverScale = Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const scaledWidth = naturalWidth * coverScale;
  const scaledHeight = naturalHeight * coverScale;
  // Standard CSS object-position/background-position formula: the excess
  // (always >= 0 once scaled to cover) is distributed by the percentage.
  const offsetX = (scaledWidth - boxWidth) * (positionXPercent / 100);
  const offsetY = (scaledHeight - boxHeight) * (positionYPercent / 100);
  return {
    x: offsetX / coverScale,
    y: offsetY / coverScale,
    width: boxWidth / coverScale,
    height: boxHeight / coverScale,
  };
}

/**
 * "Auto-fit Player": picks a starting `scale` that shows the photo's full
 * detected subject — computed, not assumed. Leaves x/y at 0, relying on the
 * family's own static `objectPosition` bias (e.g. 'center 12%' already
 * favours headroom over footroom) rather than re-deriving a bespoke
 * horizontal/vertical centre — this keeps the guardian's existing
 * Horizontal/Vertical sliders meaningful (they adjust *from* this baseline,
 * not from some independently-centred point) and avoids overclaiming
 * precision this function doesn't have: `subjectBounds` proves where the
 * cutout's opaque pixels are, never where a face specifically sits (see
 * subject-bounds.ts).
 *
 * When `subjectBounds` is unavailable (an opaque JPEG that never went
 * through Gemini's cutout — the 'canvas' fallback path in bgRemoval.ts) this
 * falls back to treating the *entire* natural photo as the subject, which
 * is the same honest, content-preserving behaviour: never crop tighter than
 * "we don't know where the subject is, so show all of it."
 */
export function computeAutoFitCrop(input: {
  naturalWidth: number;
  naturalHeight: number;
  boxWidth: number;
  boxHeight: number;
  objectPosition: string;
  subjectBounds?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Fraction of the subject's own height added as headroom above it (and,
   *  more modestly, as breathing room on the other three sides) — clamped
   *  to the real photo's bounds, never fabricated beyond them. */
  headroomFraction?: number;
}): PhotoCrop {
  const { naturalWidth: natW, naturalHeight: natH, boxWidth: boxW, boxHeight: boxH, subjectBounds, headroomFraction = 0.08 } = input;
  const [posXRaw, posYRaw] = input.objectPosition.split(' ');
  const positionXPercent = parsePositionPercent(posXRaw, 50);
  const positionYPercent = parsePositionPercent(posYRaw, 50);

  const bounds = subjectBounds ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const subjectX0 = bounds.x0 * natW;
  const subjectY0 = bounds.y0 * natH;
  const subjectW = Math.max(1, (bounds.x1 - bounds.x0) * natW);
  const subjectH = Math.max(1, (bounds.y1 - bounds.y0) * natH);

  const marginX = subjectW * headroomFraction;
  const marginTop = subjectH * headroomFraction;
  const marginBottom = subjectH * (headroomFraction / 2);
  const targetX0 = Math.max(0, subjectX0 - marginX);
  const targetY0 = Math.max(0, subjectY0 - marginTop);
  const targetX1 = Math.min(natW, subjectX0 + subjectW + marginX);
  const targetY1 = Math.min(natH, subjectY0 + subjectH + marginBottom);
  const targetW = Math.max(1, targetX1 - targetX0);
  const targetH = Math.max(1, targetY1 - targetY0);

  const base = computeObjectFitCoverCropWindow({
    naturalWidth: natW, naturalHeight: natH, boxWidth: boxW, boxHeight: boxH, positionXPercent, positionYPercent,
  });

  // The scale that makes computePhotoGeometry's window grow to *at least*
  // cover the target rectangle in both dimensions — min() so neither axis
  // of the subject ends up cropped.
  const scale = Math.min(1, base.width / targetW, base.height / targetH);

  return { x: 0, y: 0, scale: Math.max(0.05, Number(scale.toFixed(3))) };
}
