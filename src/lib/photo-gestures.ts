import { computeObjectFitCoverCropWindow, computePhotoGeometry, type PhotoCrop } from './photo-geometry';

/**
 * Turning a drag, a pinch, a wheel tick or a key press on the card into a
 * photo crop (adapted from Emblem Canada's crop-gestures.ts).
 *
 * Canada's arithmetic can't be reused as-is, because the UK renderer has two
 * regimes (photo-geometry.ts, protected, not changed here):
 *  - zoom >= 1 (or a photo with no measured size): x/y translate the photo by
 *    a percentage of the card, so dragging right means x goes up;
 *  - zoom < 1 with a measured photo (what Auto-fit usually produces): x/y
 *    move a crop WINDOW across the photo, so dragging right means x goes
 *    DOWN, by an amount that depends on the photo's own size, and stops at
 *    the photo's edge.
 * A fixed "pixels to percent" rule would push the photo the wrong way, or
 * at the wrong speed, half the time. So every gesture here asks
 * computePhotoGeometry itself where the photo is drawn and solves for the
 * crop that puts it where the finger is. Preview, capture and print all
 * render through that same function, so whatever a gesture produces is
 * exactly what prints.
 *
 * The result is the same { x, y, scale } the sliders write, within the same
 * limits, so the sliders, drafts, team-card switching and the server see
 * nothing new.
 */

/** The slider bounds in ProductionBuilder's photo controls: two ways in, one set of limits. */
export const PHOTO_GESTURE_LIMITS = { minScale: 0.25, maxScale: 1.8, maxOffset: 40 } as const;

/** What a gesture needs to know about the card it's on, in the card's own layout pixels. */
export type PhotoFrameModel = {
  boxWidth: number;
  boxHeight: number;
  /** The family's object-position (e.g. 'center 12%'), as passed to computePhotoGeometry. */
  objectPosition: string;
  /** photo.naturalWidth/Height exactly as the card gets them; null when unmeasured. */
  natural: { naturalWidth: number; naturalHeight: number } | null;
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);

function sizingOf(frame: PhotoFrameModel) {
  return frame.natural ? { ...frame.natural, boxWidth: frame.boxWidth, boxHeight: frame.boxHeight } : null;
}

function percentOf(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  if (raw === 'center') return 50;
  if (raw === 'left' || raw === 'top') return 0;
  if (raw === 'right' || raw === 'bottom') return 100;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Where the photo point that sits at the card's centre at zoom 1 (the centre
 * of the object-fit:cover window) is drawn now, in the card's layout pixels.
 * Tracking one fixed point of the photo is what lets a drag follow the
 * finger and a zoom hold the picture still, in either regime, including the
 * moment a pinch crosses zoom 1.
 */
export function photoAnchorPoint(crop: PhotoCrop, frame: PhotoFrameModel): { x: number; y: number } {
  const g = computePhotoGeometry(crop, frame.objectPosition, sizingOf(frame));
  if (g.position === 'absolute' && frame.natural) {
    const [px, py] = frame.objectPosition.split(' ');
    const base = computeObjectFitCoverCropWindow({
      naturalWidth: frame.natural.naturalWidth,
      naturalHeight: frame.natural.naturalHeight,
      boxWidth: frame.boxWidth,
      boxHeight: frame.boxHeight,
      positionXPercent: percentOf(px, 50),
      positionYPercent: percentOf(py, 50),
    });
    const left = parseFloat(g.left ?? '0');
    const top = parseFloat(g.top ?? '0');
    const drawScale = parseFloat(g.width ?? '0') / frame.natural.naturalWidth;
    return { x: left + (base.x + base.width / 2) * drawScale, y: top + (base.y + base.height / 2) * drawScale };
  }
  // object-fit:cover + translate(x%, y%) scale(s) about the centre: the
  // cover window's centre is the card's centre, moved by the translate.
  return {
    x: frame.boxWidth / 2 + ((crop.x ?? 0) / 100) * frame.boxWidth,
    y: frame.boxHeight / 2 + ((crop.y ?? 0) / 100) * frame.boxHeight,
  };
}

/**
 * The offset on one axis that draws the anchor at `target`, as close to the
 * current offset as the renderer allows. The anchor moves monotonically with
 * the offset (up in one regime, down in the other, flat once the crop
 * window reaches the photo's edge), so a bisection over the slider range
 * finds it. Afterwards the answer is pulled back to the nearest offset that
 * draws the same thing: past the photo's edge every offset looks identical,
 * and without this a drag would wind the offset out to 40 there, leaving a
 * dead zone to unwind before the photo moved back.
 */
function solveAxis(crop: PhotoCrop, frame: PhotoFrameModel, axis: 'x' | 'y', target: number): number {
  const { maxOffset } = PHOTO_GESTURE_LIMITS;
  const at = (v: number) => photoAnchorPoint({ ...crop, [axis]: v }, frame)[axis];
  const current = finite(crop[axis], 0);
  const lo: number = -maxOffset;
  const hi: number = maxOffset;
  const fLo = at(lo);
  const fHi = at(hi);
  if (Math.abs(fHi - fLo) < 1e-6) return current; // this axis can't move the photo at this zoom
  const rising = fHi > fLo;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 40; i += 1) {
    const mid = (a + b) / 2;
    if ((at(mid) < target) === rising) a = mid;
    else b = mid;
  }
  const solved = (a + b) / 2;
  const reached = at(solved);
  if (Math.abs(at(current) - reached) < 0.01) return current; // already drawn there
  // Nearest offset to `current` that still draws `reached`.
  let near = current;
  let far = solved;
  for (let i = 0; i < 40; i += 1) {
    const mid = (near + far) / 2;
    if (Math.abs(at(mid) - reached) < 0.01) far = mid;
    else near = mid;
  }
  return far;
}

function solveCrop(crop: PhotoCrop, frame: PhotoFrameModel, target: { x: number; y: number }): PhotoCrop {
  const x = solveAxis(crop, frame, 'x', target.x);
  const y = solveAxis({ ...crop, x }, frame, 'y', target.y);
  return { x: round1(x), y: round1(y), scale: crop.scale };
}

/**
 * A drag, as a fraction of the card's on-screen width/height (so the same
 * drag means the same thing on a 300px phone preview and a 560px desktop
 * stage), applied to the crop so the photo follows the pointer.
 */
export function panPhoto(crop: PhotoCrop, frame: PhotoFrameModel, delta: { fx: number; fy: number }): PhotoCrop {
  if (!frame.boxWidth || !frame.boxHeight) return crop;
  const fx = finite(delta.fx, 0);
  const fy = finite(delta.fy, 0);
  const safe = { x: finite(crop.x, 0), y: finite(crop.y, 0), scale: finite(crop.scale, 1) };
  const from = photoAnchorPoint(safe, frame);
  return solveCrop(safe, frame, { x: from.x + fx * frame.boxWidth, y: from.y + fy * frame.boxHeight });
}

/**
 * The zoom range a gesture may move in. The upper bound is the slider's; the
 * lower bound is the slider's too, unless the crop already sits below it
 * (Auto-fit can frame a tall photo below 0.25), in which case it's left
 * there rather than snapped up the moment someone touches it.
 */
export function zoomBounds(startScale: number): { min: number; max: number } {
  const { minScale, maxScale } = PHOTO_GESTURE_LIMITS;
  const s = finite(startScale, 1);
  return { min: Math.min(minScale, s), max: Math.max(maxScale, s) };
}

/**
 * Zoom to `scale` (clamped to zoomBounds of `fromScale`), holding the photo
 * still: the same point of the photo stays where it was drawn, as far as the
 * renderer allows. Crossing zoom 1 switches renderer regime; solving for the
 * anchor is what stops the photo jumping there.
 */
export function zoomPhotoTo(crop: PhotoCrop, frame: PhotoFrameModel, scale: number, fromScale = crop.scale): PhotoCrop {
  const safe = { x: finite(crop.x, 0), y: finite(crop.y, 0), scale: finite(crop.scale, 1) };
  if (!Number.isFinite(scale) || scale <= 0) return safe;
  const { min, max } = zoomBounds(fromScale);
  const nextScale = round3(Math.min(max, Math.max(min, scale)));
  if (nextScale === safe.scale) return safe;
  const anchor = photoAnchorPoint(safe, frame);
  return solveCrop({ ...safe, scale: nextScale }, frame, anchor);
}

/** Zoom by a multiplier (a pinch's distance ratio, a wheel tick, a button press). */
export function zoomPhotoBy(crop: PhotoCrop, frame: PhotoFrameModel, factor: number, fromScale = crop.scale): PhotoCrop {
  if (!Number.isFinite(factor) || factor <= 0) return crop;
  return zoomPhotoTo(crop, frame, finite(crop.scale, 1) * factor, fromScale);
}

/** A wheel notch as a zoom factor. Trackpads send many small deltas and a mouse a few large ones, so it's gentle and capped. */
export function wheelZoomFactor(deltaY: number): number {
  if (!Number.isFinite(deltaY)) return 1;
  const step = Math.min(Math.max(deltaY, -100), 100);
  return Math.exp(-step / 600);
}

/** The distance between two touches, for a pinch. */
export function touchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * The object-positions the card families pass to computePhotoGeometry
 * ('center 10%' RealCardArt, 'center 12%' EMJFL/Hollinwood/Solar/Galaxy/
 * Comic, 'center 25%' Crimson/Royal/Emerald/Glacier). Pinned to the card
 * art sources by photo-gestures.test.ts, so a new family can't silently
 * fall outside it.
 */
export const CARD_PHOTO_OBJECT_POSITIONS = ['center 10%', 'center 12%', 'center 25%'] as const;

/**
 * Which object-position a rendered photo is using, read back from the DOM
 * without touching the protected card art.
 *
 * In the cover regime the browser reports it directly. In the window regime
 * the renderer resolves it into explicit left/top, so each known
 * object-position is tried and the one that reproduces the drawn top is
 * kept. Where several draw identically (the window is pinned at an edge),
 * it makes no difference to the picture which is chosen.
 */
export function inferObjectPosition(input: {
  crop: PhotoCrop;
  boxWidth: number;
  boxHeight: number;
  natural: PhotoFrameModel['natural'];
  computed: { transform: string; objectPosition: string; left: string; top: string };
}): string {
  const { computed } = input;
  if (computed.transform && computed.transform !== 'none') {
    const [px, py] = computed.objectPosition.split(' ');
    return `${percentOf(px, 50)}% ${percentOf(py, 50)}%`;
  }
  const drawnLeft = parseFloat(computed.left);
  const drawnTop = parseFloat(computed.top);
  let best: string = CARD_PHOTO_OBJECT_POSITIONS[1];
  let bestError = Infinity;
  for (const candidate of CARD_PHOTO_OBJECT_POSITIONS) {
    const g = computePhotoGeometry(input.crop, candidate, input.natural ? { ...input.natural, boxWidth: input.boxWidth, boxHeight: input.boxHeight } : null);
    if (g.position !== 'absolute') continue;
    const error = Math.abs(parseFloat(g.top ?? '0') - drawnTop) + Math.abs(parseFloat(g.left ?? '0') - drawnLeft);
    if (error < bestError - 1e-6) {
      best = candidate;
      bestError = error;
    }
  }
  return best;
}
