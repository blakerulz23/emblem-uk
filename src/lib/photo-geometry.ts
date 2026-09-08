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

export type PhotoGeometry = {
  objectFit: 'cover';
  objectPosition: string;
  transform: string;
  transformOrigin: string;
};

/**
 * `objectPosition` varies slightly by template family (most use
 * 'center 12%', RealCardArt's procedural fallback uses 'center 10%') —
 * passed through rather than hard-coded so this stays the single source
 * of the *scale/offset* rule without forcing every family onto identical
 * framing.
 */
export function computePhotoGeometry(crop: PhotoCrop | null | undefined, objectPosition: string): PhotoGeometry {
  const scale = crop?.scale ?? 1;
  const x = crop?.x ?? 0;
  const y = crop?.y ?? 0;
  return {
    objectFit: 'cover',
    objectPosition,
    transform: `translate(${x}%, ${y}%) scale(${scale})`,
    transformOrigin: 'center center',
  };
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
