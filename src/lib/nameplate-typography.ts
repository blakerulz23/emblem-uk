import type { CSSProperties } from 'react';

/**
 * Shared vertical nameplate typography — one geometry system for every card
 * whose name/position text is a rotated, bottom-to-top plate on the card's
 * left side, next to the kit number (Hollinwood, EMJFL, and the Custom
 * Collection variants whose measurements confirmed the same structure — see
 * the "Hollinwood typography generalisation" PR description for the full
 * per-card measurement table and the two exceptions it documents).
 *
 * The geometry below is Hollinwood's own, measured directly against the
 * supplied Canva reference PNGs (alpha-bounds via sharp, matched against a
 * real browser render to within ~2px on a native 1050x1498 canvas — see
 * PR #86). It is deliberately the single source of truth for coordinates,
 * rotation, font, reference size and fit-scale rules; colour is NOT part of
 * this module — every card supplies its own name/position colour (and any
 * optional shadow/stroke effect its own design actually has), since colour
 * treatment is the one dimension that genuinely varies card to card.
 */

// minScale is an explicit parameter (not hardcoded into the formula) so a
// slot with more headroom in its own design can ask for a gentler floor
// than another — see NAMEPLATE_GEOMETRY's own name/position minScale
// values below for why they differ from each other.
export function nameFitScale(name: string | undefined, comfortableChars = 10, minScale = 0.68): number {
  const length = (name || '').trim().length;
  if (length <= comfortableChars) return 1;
  return Math.max(minScale, comfortableChars / length);
}

export const NAMEPLATE_FONT_FAMILY = 'var(--font-antonio), Impact, sans-serif';
export const NAMEPLATE_FONT_WEIGHT = 700;

export interface NameplateSlotGeometry {
  /** CSS left%, of the card's own W — the left edge of the rotated text's on-screen thickness. */
  left: string;
  /** CSS top%, of the card's own H — the bottom anchor of the rotated text's on-screen box; text grows upward from here. */
  top: string;
  /** Pre-rotation box width, as a fraction of H — becomes the text's max on-screen length after rotation. Generous on purpose; nameFitScale, not this box, is what actually bounds long text. */
  widthFactor: number;
  /** Reference font-size, as a fraction of W, at comfortableChars or fewer. */
  fontSizeFactor: number;
  /** Character count at/under which the reference size renders unscaled. */
  comfortableChars: number;
  /** Never shrink further than this fraction of the reference size. */
  minScale: number;
  fontWeight: number;
  letterSpacing: string;
}

export const NAMEPLATE_GEOMETRY: { name: NameplateSlotGeometry; position: NameplateSlotGeometry } = {
  name: {
    left: '9.08%',
    top: '62.73%',
    widthFactor: 0.6,
    fontSizeFactor: 0.0838,
    comfortableChars: 14,
    minScale: 0.6,
    fontWeight: NAMEPLATE_FONT_WEIGHT,
    letterSpacing: '0em',
  },
  position: {
    left: '17.57%',
    top: '52.84%',
    widthFactor: 0.2,
    fontSizeFactor: 0.0432,
    comfortableChars: 10,
    minScale: 0.85,
    fontWeight: NAMEPLATE_FONT_WEIGHT,
    letterSpacing: '0em',
  },
};

/**
 * The kit number is upright (no rotation) and centred, not left-anchored —
 * unlike name/position, one and two-digit values must land visually
 * centred on the same point rather than growing rightward from a fixed
 * left edge, so its geometry shape is genuinely different from
 * NameplateSlotGeometry above (centre-x/bottom-y anchor + a scaled-copy
 * outline, not a rotation box). Kept in the same module because it's still
 * one shared measured geometry across every compatible card, with only
 * fill/outline colour (and outline scale, where a design's own treatment
 * differs) left per-card — see nameplateNumberLayers below.
 *
 * The outline is NOT `-webkit-text-stroke`. An earlier version used it,
 * calibrated purely by matching the reference PNG's outer alpha bounds —
 * that produced a stroke width around 60% of the font's own em-size,
 * which is fine for an open digit like "7" but completely swallows the
 * thin curves and enclosed counters of "2", "0", "6", "8", "9": a stroke
 * is centred on the glyph's outline path, so a thick one eats inward by
 * half its width on both sides of every stroke, and once that exceeds the
 * glyph's own line thickness the white fill disappears entirely — exactly
 * the "solid coloured block" defect this was rewritten to fix. Outer-
 * bounds matching alone can't catch this: it only ever checks the
 * silhouette, never whether the interior is still open.
 *
 * The fix is the layered-text technique this module's own callers now use
 * (see nameplateNumberLayers): a slightly larger copy of the same glyph in
 * the outline colour sits behind an unscaled white copy on top. Outline
 * thickness is controlled by outlineScale (how much bigger the back copy
 * is), which scales every part of the glyph — including its counters —
 * proportionally, so it can never fully close a counter the way a stroke
 * can. It also composes correctly under the card's own W-proportional
 * sizing (the whole two-layer stack scales together with fontSize), so
 * the outline stays visually consistent whether the card renders at
 * builder-preview size or full print resolution.
 */
export interface NameplateNumberGeometry {
  /** CSS left%, of the card's own W — horizontal centre of the number, any digit count. */
  left: string;
  /** CSS top%, of the card's own H — bottom edge of the number; taller digits grow upward from here, not downward, so nothing below is ever at risk. */
  top: string;
  /** Reference font-size, as a fraction of W, for a value at/under comfortableChars digits. */
  fontSizeFactor: number;
  /** How much larger the back (outline) copy is than the front (fill) copy — 1.12 means a 12%-larger back copy, giving a restrained, proportional outline that can't swallow the glyph's own counters. */
  outlineScale: number;
  /** Digit count at/under which the reference size renders unscaled (2 — realistic kit numbers are 1 or 2 digits). */
  comfortableChars: number;
  minScale: number;
  fontWeight: number;
}

export const NAMEPLATE_NUMBER_GEOMETRY: NameplateNumberGeometry = {
  left: '14.67%',
  top: '77.35%',
  fontSizeFactor: 0.19,
  outlineScale: 1.12,
  comfortableChars: 2,
  minScale: 0.8,
  fontWeight: NAMEPLATE_FONT_WEIGHT,
};

/** The three ready-to-spread style objects nameplateNumberLayers returns. */
export interface NameplateNumberLayerStyles {
  /** The positioned, centred/bottom-anchored wrapper — apply zIndex and any card-specific rotate/shadow `extra` here. */
  wrapper: CSSProperties;
  /** The back copy — outline colour, scaled up slightly. Render first (behind), with aria-hidden. */
  outline: CSSProperties;
  /** The front copy — fill colour, true size. Render second (on top); this is the one screen readers/selection should see. */
  fill: CSSProperties;
}

/**
 * Builds the three style objects for the kit number's layered-text
 * rendering (see the module doc comment above for why it's layered rather
 * than a single stroked div). `fillColor` and `outlineColor` are the one
 * thing every compatible card sets for itself — geometry, font and the
 * digit-count fit-scale rule are shared.
 *
 * Expected markup:
 * ```tsx
 * const layers = nameplateNumberLayers(W, number, fill, outline);
 * <div style={{ ...layers.wrapper, zIndex }}>
 *   <div style={{ position: 'relative', display: 'inline-block' }}>
 *     <span aria-hidden style={layers.outline}>{number}</span>
 *     <span style={layers.fill}>{number}</span>
 *   </div>
 * </div>
 * ```
 */
export function nameplateNumberLayers(
  W: number,
  number: string,
  fillColor: string,
  outlineColor: string,
  overrides?: Partial<NameplateNumberGeometry>,
  wrapperExtra?: CSSProperties
): NameplateNumberLayerStyles {
  const cleanOverrides = overrides
    ? (Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) as Partial<NameplateNumberGeometry>)
    : undefined;
  const g: NameplateNumberGeometry = { ...NAMEPLATE_NUMBER_GEOMETRY, ...cleanOverrides };
  const fontSize = W * g.fontSizeFactor * nameFitScale(number, g.comfortableChars, g.minScale);
  const sharedFont: CSSProperties = {
    fontFamily: NAMEPLATE_FONT_FAMILY,
    fontWeight: g.fontWeight,
    fontSize,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
  return {
    wrapper: {
      position: 'absolute',
      left: g.left,
      top: g.top,
      transform: 'translate(-50%, -100%)',
      ...wrapperExtra,
    },
    outline: {
      position: 'absolute',
      inset: 0,
      ...sharedFont,
      color: outlineColor,
      transform: `scale(${g.outlineScale})`,
      transformOrigin: 'center',
    },
    fill: {
      position: 'relative',
      ...sharedFont,
      color: fillColor,
    },
  };
}

/**
 * Position's own `top` in NAMEPLATE_GEOMETRY is a fixed anchor, entirely
 * independent of the player name — correct for the exact reference pair
 * it was calibrated against (JACOB THOMPSON / MIDFIELDER, both ≥
 * comfortableChars long), but wrong for any shorter name: the name is
 * bottom-anchored and grows *upward* as it gets longer, so a short name's
 * own top edge sits much lower on the card than a long name's — while
 * position, anchored to a card-relative constant, doesn't move with it and
 * ends up floating above the now-much-shorter name (confirmed by real
 * measurement: TINUBU/MIDFIELDER — name spans native y 711–939, position
 * 598–788, extending 113px above the name's own top).
 *
 * computeAdaptivePositionAnchor derives position's vertical anchor from the
 * *name's own estimated rendered length* instead of a fixed constant, so it
 * moves down toward a short name and up alongside a long one automatically
 * — one documented formula, not a per-string exception. Neither this
 * module nor CardArt.tsx can measure real DOM text width (CardArt also
 * renders server-side, e.g. Collection OS's print path, with no DOM at
 * all), so rendered length is *estimated* from character count × font-size
 * × a per-slot average-advance-width ratio, calibrated against two
 * independently measured reference points (JACOB THOMPSON at 14 chars,
 * unscaled, and ALEXANDER MONTGOMERY at 20 chars, fit-scaled) that agreed
 * to within ~1%.
 *
 * The anchor itself is proportional, not additive: position's centre sits
 * POSITION_CENTER_RATIO of the name's own estimated length up from the
 * name's fixed bottom edge — calibrated from the same reference pair.
 * Proportional (a fraction of the name's own length) rather than additive
 * (a fixed pixel offset from the name's centre) matters for short names:
 * an additive offset stays constant regardless of how short the name gets
 * and can still push position past the name's own bottom edge, while a
 * proportional one shrinks together with the name automatically.
 *
 * Even proportional, an extreme pairing (a very short name with the
 * longest position label) can still push position's own top above the
 * name's — algebraically, containment only holds once
 * `nameLength >= positionLength / (2 * (1 - POSITION_CENTER_RATIO))`.
 * POSITION_CONTAINMENT_SAFETY_MARGIN_PX pads that boundary, and when the
 * natural position length would still cross it, an *additional* shrink
 * (independent of nameFitScale's own length-based shrink) is applied to
 * position — down to POSITION_CONTAINMENT_MIN_SCALE — until it clears the
 * name's own top. This is the "scale down only when required by the real
 * safe area" case; it does not fire for any of the five canonical labels
 * against any realistic name length (see the module's own test file for
 * the full reproduction matrix), only for pathological combinations.
 */
const NAME_CHAR_WIDTH_RATIO = 0.465;
const POSITION_CHAR_WIDTH_RATIO = 0.42;
const POSITION_CENTER_RATIO = 0.4;
const POSITION_CONTAINMENT_SAFETY_MARGIN_PX = 6;
// Lower than nameFitScale's own usual 0.68-0.85 floors elsewhere in this
// module — a genuinely extreme pairing (the shortest realistic name with
// the longest canonical label, "JAY" / "GOALKEEPER") needs this much
// headroom to actually clear the name's own top; confirmed via real
// rendering that 0.6 was not enough for that specific pairing.
const POSITION_CONTAINMENT_MIN_SCALE = 0.4;
// A CSS `top`/rotated-box anchor never lands exactly on the rendered
// glyph's own ink edge — line-height/leading adds a small, real gap
// between the two, proportional to font-size (same phenomenon the fixed
// anchor's own original calibration absorbed silently by iterating
// against a real render — see PR #86). This formula computes the target
// edge directly rather than iterating, so that gap has to be corrected
// explicitly: calibrated at the reference pair (JACOB THOMPSON /
// MIDFIELDER) by rendering the formula's own computed anchor and
// measuring the residual offset against the reference's measured 786–938
// bounds (~13.75 native px at MIDFIELDER's reference font-size, expressed
// here as a fraction of position's own effective font-size so it scales
// correctly when fit-scale or containment shrink that font-size).
const POSITION_RENDER_LEADING_RATIO = 0.303;

export interface AdaptivePositionAnchor {
  /** CSS top% for the position slot — pass as `{ top }` in nameplateSlotStyle's overrides. */
  top: string;
  /** Effective fontSizeFactor for the position slot (the shared default, further reduced only if containment against this specific name required it) — pass as `{ fontSizeFactor }` alongside `top`. */
  fontSizeFactor: number;
}

/**
 * Computes position's adaptive vertical anchor for one name/position pair.
 * See the doc comment above this for the full reasoning; call this once
 * per render and pass both fields of the result as position's
 * `nameplateSlotStyle` overrides (`{ top: result.top, fontSizeFactor:
 * result.fontSizeFactor }`) — name's own geometry is untouched by this.
 */
export function computeAdaptivePositionAnchor(
  W: number,
  H: number,
  name: string | undefined,
  positionLabel: string | undefined
): AdaptivePositionAnchor {
  const nameGeom = NAMEPLATE_GEOMETRY.name;
  const posGeom = NAMEPLATE_GEOMETRY.position;

  const nameScale = nameFitScale(name, nameGeom.comfortableChars, nameGeom.minScale);
  const nameFontSize = W * nameGeom.fontSizeFactor * nameScale;
  const nameLenCss = (name || '').trim().length * nameFontSize * NAME_CHAR_WIDTH_RATIO;

  const posScale = nameFitScale(positionLabel, posGeom.comfortableChars, posGeom.minScale);
  const posFontSize = W * posGeom.fontSizeFactor * posScale;
  const posLenCssNatural = (positionLabel || '').trim().length * posFontSize * POSITION_CHAR_WIDTH_RATIO;

  const nameBottomCss = H * (parseFloat(nameGeom.top) / 100);
  const nameTopCss = nameBottomCss - nameLenCss;
  const centerCss = nameBottomCss - nameLenCss * POSITION_CENTER_RATIO;

  // The leading-gap shift moves the whole rendered box down by a constant
  // (font-size-proportional) amount without changing its own height, so it
  // must apply to the containment check too — checking the pre-shift box
  // would let a case through that renders overlapping the name's own top
  // by roughly `shift` once actually painted.
  const naturalShiftCss = posFontSize * POSITION_RENDER_LEADING_RATIO;
  let posLenCss = posLenCssNatural;
  let containmentScale = 1;
  const naturalTopCss = centerCss - posLenCssNatural / 2 - naturalShiftCss;
  const safeTopCss = nameTopCss + POSITION_CONTAINMENT_SAFETY_MARGIN_PX;
  if (naturalTopCss < safeTopCss) {
    const maxLenCss = 2 * (centerCss - naturalShiftCss - safeTopCss);
    if (maxLenCss > 0 && maxLenCss < posLenCssNatural) {
      containmentScale = Math.max(POSITION_CONTAINMENT_MIN_SCALE, maxLenCss / posLenCssNatural);
      posLenCss = posLenCssNatural * containmentScale;
    }
  }

  const effectivePosFontSize = posFontSize * containmentScale;
  const positionBottomCss = centerCss + posLenCss / 2 - effectivePosFontSize * POSITION_RENDER_LEADING_RATIO;
  return {
    top: `${((positionBottomCss / H) * 100).toFixed(3)}%`,
    fontSizeFactor: posGeom.fontSizeFactor * containmentScale,
  };
}

/**
 * Builds the ready-to-spread style object for one nameplate slot ('name' or
 * 'position'). `geometry` defaults to the shared measured geometry above;
 * pass a partial override only when measurement has proven a genuinely
 * different structure for that one card (see custom-galaxy's own call site
 * for the one currently-justified case, and the PR description for why
 * every other card needed none) — or, for position specifically, when
 * computeAdaptivePositionAnchor's own `{ top, fontSizeFactor }` result
 * says the anchor needs to move for this particular name.
 */
export function nameplateSlotStyle(
  slot: 'name' | 'position',
  W: number,
  H: number,
  text: string,
  color: string,
  overrides?: Partial<NameplateSlotGeometry>,
  extra?: CSSProperties
): CSSProperties {
  const base = NAMEPLATE_GEOMETRY[slot];
  // Drop explicit `undefined` values from overrides before merging — an
  // override object built as `{ left: maybeUndefined, ... }` must not blank
  // out the shared default for a field it didn't actually mean to touch.
  const cleanOverrides = overrides
    ? (Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) as Partial<NameplateSlotGeometry>)
    : undefined;
  const g: NameplateSlotGeometry = { ...base, ...cleanOverrides };
  return {
    position: 'absolute',
    left: g.left,
    top: g.top,
    width: H * g.widthFactor,
    transform: 'rotate(-90deg)',
    transformOrigin: 'left top',
    color,
    fontFamily: NAMEPLATE_FONT_FAMILY,
    fontWeight: g.fontWeight,
    fontSize: W * g.fontSizeFactor * nameFitScale(text, g.comfortableChars, g.minScale),
    lineHeight: 1,
    letterSpacing: g.letterSpacing,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    overflow: 'visible',
    pointerEvents: 'none',
    ...extra,
  };
}
