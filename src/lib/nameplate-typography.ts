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

/**
 * Antonio Bold's real per-character advance width, as a fraction of
 * font-size — measured directly (Playwright, Range.getBoundingClientRect,
 * the same precise width-measurement technique established in PR #86),
 * each letter framed between two "I"s (`I<char>I`, width minus `II`'s own
 * width) so the result reflects real rendering including any kerning
 * against neighbours, not an isolated glyph's advance in a vacuum.
 *
 * This exists because a flat average-width-per-character estimate (an
 * earlier version of this module used ~0.465 for every letter) has real,
 * material error: "I" is 0.265 and "M" is 0.692 — a 2.6x spread. Two
 * equal-length names can differ enough in real rendered width that an
 * average-based estimate leaves too little safety margin for one of them
 * — confirmed directly: "LEE" and "MAX" are both 3 characters, but LEE
 * renders to 30.6 CSS px at reference size and MAX to 43.6 — a 42%
 * difference the average model could not see, and did not: it left LEE
 * only 3.1px of containment margin against the calibrated 0.4 floor,
 * dangerously close to overflowing for real users with narrow-letter
 * names (LI, WILL, TIM, JIM, ...), while MAX had 43px to spare.
 *
 * A deterministic table (not real-time DOM measurement) is required
 * because CardArt also renders server-side (Collection OS's print path)
 * with no DOM available at all — this stays exact there too, since it's
 * pure data, not a measurement taken at render time.
 */
export const CHAR_ADVANCE_WIDTH: Record<string, number> = {
  A: 0.4527, B: 0.4805, C: 0.4731, D: 0.4922, E: 0.3906, F: 0.3862,
  G: 0.4883, H: 0.5078, I: 0.2652, J: 0.4619, K: 0.4791, L: 0.3672,
  M: 0.6923, N: 0.522, O: 0.4878, P: 0.4605, Q: 0.4878, R: 0.4839,
  S: 0.4273, T: 0.3453, U: 0.4947, V: 0.4541, W: 0.6641, X: 0.438,
  Y: 0.4288, Z: 0.3653, ' ': 0.1792, "'": 0.2066, '-': 0.3398,
};
// Fallback for any character not in the table above (digits, accented
// letters, punctuation beyond the set actually measured) — the mean of
// every measured letter A-Z, a reasonable middle estimate rather than 0.
const CHAR_ADVANCE_WIDTH_FALLBACK = 0.4589;

/**
 * Estimates a string's rendered width in CSS px at a given font-size, by
 * summing each character's real measured advance width (see
 * CHAR_ADVANCE_WIDTH above) — used wherever this module needs to reason
 * about how long a name or position label will actually render without
 * being able to measure the real DOM (see computeAdaptivePositionAnchor).
 * Input is uppercased first since every nameplate slot renders
 * textTransform:'uppercase' regardless of the stored value's own case.
 */
export function estimateTextWidthCss(text: string | undefined, fontSizePx: number): number {
  const upper = (text || '').trim().toUpperCase();
  let sum = 0;
  for (const ch of upper) {
    sum += CHAR_ADVANCE_WIDTH[ch] ?? CHAR_ADVANCE_WIDTH_FALLBACK;
  }
  return sum * fontSizePx;
}

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

// GROUP_LEFT_SHIFT / GROUP_TOP_SHIFT — a single, shared, explicitly-named
// correction applied identically to name and position's own fixed anchors,
// not two separate unexplained per-slot offsets.
//
// GROUP_LEFT_SHIFT_PCT: measured directly against the newest supplied
// native Canva reference (OLLIE HARRISON, isolated transparent layer,
// alpha bounds via sharp on a 1050x1498 canvas) compared against a real
// browser render of the same name at the same native resolution — its
// width/height matched the reference to within ~2-4 native px (i.e. no
// scale difference, only a translation), off by x0 +27.0px/x1 +29.2px,
// averaging 28.1px too far right.
//
// GROUP_TOP_SHIFT_PCT: NOT derived from name's own isolated-layer match
// alone (that in isolation suggested a much smaller, ~4.9px correction).
// Re-diagnosed after direct review of the rendered result: the group's
// vertical placement has to be judged against the kit number below it,
// which this change must never move (NAMEPLATE_NUMBER_GEOMETRY is
// untouched). A first attempt measured clearance between position's own
// bottom edge and the number's own top edge via isolated native alpha
// bounds (position layer, native y1=778; a separately-supplied number
// layer, native y0=1039 → 261px reference clearance) against the ~133.6px
// the render showed — but that number layer's own embedded metadata
// showed it came from a DIFFERENT, earlier Canva page (page 55, 2026-09-09)
// than the name/position layers used for every other measurement here
// (pages 58/59, 2026-09-10) — not a same-revision, trustworthy comparison,
// so the resulting ~127px shift was not applied as computed: it visibly
// collided the top of the name text into the club badge above it on a
// real render (Hollinwood, both badge layers) — confirmed directly, not
// inferred from bounding boxes alone (the badge is circular; a naive bbox
// check both over- and under-states the real overlap depending on exactly
// which x-column of the badge a given letter falls under).
//
// Final value found by iterating against real renders (Hollinwood, EMJFL,
// both Custom Collection badge variants) between the two extremes above:
// -1.5 clears every current badge/crest with a comfortable, visually
// confirmed margin, while still measurably increasing position-to-number
// clearance (native ~138px pre-change -> ~158px, a real ~20px/~14%
// increase, verified via the same isolated alpha-bounds measurement) —
// smaller than the (unreliable) cross-page target, but a genuine,
// non-arbitrary improvement bounded by an actual collision constraint
// rather than a magic number. If a future, same-revision native number
// layer becomes available, this value should be re-derived from it rather
// than assumed correct indefinitely.
//
// POSITION's own isolated-layer measurement additionally showed a
// materially different, visually-confirmed *size* delta beyond translation
// (not just a shifted anchor) — but position's rendered size today exactly
// reproduces PR #86's own original calibration (JACOB THOMPSON/MIDFIELDER,
// already verified against Canva then), so this is very unlikely to be a
// regression in the shared geometry itself; flagged as a separate,
// unresolved, NOT-acted-upon finding rather than folded into this shift
// (see the PR description for the full measurement table).
//
// Position's own "left" still receives the same shared horizontal shift —
// it preserves the existing, already-correct 8.49-percentage-point inset
// between name's and position's left edges (17.57% - 9.08%), not a new,
// independently-tuned value.
const GROUP_LEFT_SHIFT_PCT = -2.68; // -28.1 native px / 1050
const GROUP_TOP_SHIFT_PCT = -1.5; // -22.5 native px / 1498, badge-clearance-bounded (see above)

export const NAMEPLATE_GEOMETRY: { name: NameplateSlotGeometry; position: NameplateSlotGeometry } = {
  name: {
    left: `${(9.08 + GROUP_LEFT_SHIFT_PCT).toFixed(2)}%`,
    top: `${(62.73 + GROUP_TOP_SHIFT_PCT).toFixed(2)}%`,
    widthFactor: 0.6,
    fontSizeFactor: 0.0838,
    comfortableChars: 14,
    minScale: 0.6,
    fontWeight: NAMEPLATE_FONT_WEIGHT,
    letterSpacing: '0em',
  },
  position: {
    left: `${(17.57 + GROUP_LEFT_SHIFT_PCT).toFixed(2)}%`,
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
 * all), so rendered length is *estimated* — via estimateTextWidthCss's
 * real per-glyph advance-width table (see its own doc comment for why a
 * flat average-per-character estimate isn't accurate enough: two equal-
 * length names can differ by over 40% in real rendered width, more than
 * enough to erase a short name's own containment margin for one of them
 * while leaving the other with room to spare).
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
 * position, computed as the exact scale required to clear the name's own
 * top (down to POSITION_CONTAINMENT_ABSOLUTE_FLOOR, a technical guard
 * against zero, not a readability choice — see its own doc comment for why
 * this must never clamp upward). This is the "scale down only exactly as
 * much as the real safe area requires" case; it does not fire for any of
 * the five canonical labels against any realistic name length (see the
 * module's own test file for the full reproduction matrix), only for very
 * short or narrow-letter-dominated names — where it now guarantees full
 * containment for any name/position pairing, not only the ones measured
 * during calibration, since it is no longer possible for a fixed floor to
 * override the computed requirement.
 */
const POSITION_CENTER_RATIO = 0.4;
const POSITION_CONTAINMENT_SAFETY_MARGIN_PX = 6;
// NOT a readability floor — a last-resort technical guard against a
// zero/negative font-size for a maxLenCss/posLenCssNatural ratio that
// collapses toward zero (e.g. an all-but-empty name against the longest
// canonical label). Containment is a hard requirement with no exception,
// so nothing may clamp *up* toward this value the way an earlier version
// of this constant did: that version (0.4, framed as a readability floor)
// silently overrode the computed required scale whenever the real
// requirement fell below it, which is precisely what let "LI"/"III"-style
// narrow-letter short names against GOALKEEPER render *overlapping* the
// name by up to 16.6px even though the containment math itself knew the
// correct, smaller scale to prevent it. Real per-pairing required scale is
// used directly below (see requiredScale); this constant only stops that
// scale from reaching zero, it never raises it.
const POSITION_CONTAINMENT_ABSOLUTE_FLOOR = 0.1;
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
  /**
   * CSS top% of position's own topmost rendered edge — the highest point of
   * the combined name+position group (position always sits above name; see
   * this module's own doc comment above). Exposed so a caller that needs
   * the group's actual combined bounds (not just each slot's own anchor) —
   * e.g. a template family's group-centering override — doesn't have to
   * re-derive this formula's internals; ignored by callers that only need
   * `top`/`fontSizeFactor`.
   */
  topEdgePct: number;
}

/**
 * Computes position's adaptive vertical anchor for one name/position pair.
 * See the doc comment above this for the full reasoning; call this once
 * per render and pass both fields of the result as position's
 * `nameplateSlotStyle` overrides (`{ top: result.top, fontSizeFactor:
 * result.fontSizeFactor }`) — name's own geometry is untouched by this.
 *
 * `nameBottomOverridePct` lets a caller compute position's anchor relative
 * to a name bottom edge other than the shared NAMEPLATE_GEOMETRY.name.top
 * default — e.g. EMJFL's own reverted baseline, or Custom Collection's
 * computed group-centering anchor — without duplicating this formula.
 * Name's own rendered geometry (font, fit-scale) never changes; only the
 * fixed point position's anchor is measured relative to does.
 */
export function computeAdaptivePositionAnchor(
  W: number,
  H: number,
  name: string | undefined,
  positionLabel: string | undefined,
  nameBottomOverridePct?: number
): AdaptivePositionAnchor {
  const nameGeom = NAMEPLATE_GEOMETRY.name;
  const posGeom = NAMEPLATE_GEOMETRY.position;
  const nameBottomPct = nameBottomOverridePct ?? parseFloat(nameGeom.top);

  const nameScale = nameFitScale(name, nameGeom.comfortableChars, nameGeom.minScale);
  const nameFontSize = W * nameGeom.fontSizeFactor * nameScale;
  const nameLenCss = estimateTextWidthCss(name, nameFontSize);

  const posScale = nameFitScale(positionLabel, posGeom.comfortableChars, posGeom.minScale);
  const posFontSize = W * posGeom.fontSizeFactor * posScale;
  const posLenCssNatural = estimateTextWidthCss(positionLabel, posFontSize);

  const nameBottomCss = H * (nameBottomPct / 100);
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
    if (maxLenCss < posLenCssNatural) {
      const requiredScale = maxLenCss / posLenCssNatural;
      containmentScale = Math.max(POSITION_CONTAINMENT_ABSOLUTE_FLOOR, requiredScale);
      posLenCss = posLenCssNatural * containmentScale;
    }
  }

  const effectivePosFontSize = posFontSize * containmentScale;
  const positionBottomCss = centerCss + posLenCss / 2 - effectivePosFontSize * POSITION_RENDER_LEADING_RATIO;
  const positionTopCss = centerCss - posLenCss / 2 - effectivePosFontSize * POSITION_RENDER_LEADING_RATIO;
  return {
    top: `${((positionBottomCss / H) * 100).toFixed(3)}%`,
    fontSizeFactor: posGeom.fontSizeFactor * containmentScale,
    topEdgePct: (positionTopCss / H) * 100,
  };
}

/**
 * EMJFL's own vertical anchor — reverted to the ORIGINAL baseline (pre-
 * dating the "Hollinwood group correction" folded into NAMEPLATE_GEOMETRY
 * above). That correction (both its horizontal shift, still shared, and
 * its -1.5% vertical shift) was measured directly against Hollinwood's own
 * Canva reference layers and, once landed in the shared geometry object,
 * applied to EMJFL too only because EMJFL happens to call the same
 * typography functions — never independently validated against EMJFL's
 * own artwork. EMJFL places two badges (club + league) on the same side of
 * the card (see EmjflCardArt's own badge rendering in CardArt.tsx), a
 * measurably smaller/different safe area at the top of the nameplate
 * channel than Hollinwood's single badge — applying a correction
 * calibrated for a different safe area risked a real collision that was
 * never checked for. Reverting EMJFL's own vertical anchor removes an
 * unvalidated borrowed correction; it is not a claim that EMJFL's own
 * placement is newly wrong. Horizontal (left) is NOT reverted here — the
 * shared shift's own derivation (see NAMEPLATE_GEOMETRY's doc comment) is
 * rooted in this module's rotation/anchor math (a generic ~28px rendering
 * offset), not Hollinwood's specific artwork, and no EMJFL-specific
 * horizontal issue has ever been reported or measured.
 */
export const EMJFL_NAME_TOP_PCT = 62.73;

// --- Custom Collection (Solar/Galaxy/Comic) group centering ---
//
// These three variants share one artwork geometry — an identical badgeBox
// (custom-collection-manifest.ts: top 4.8%, height 15.1%, the same for all
// three) placing a round club-badge slot near the top of the card, and the
// same shared NAMEPLATE_NUMBER_GEOMETRY kit number below the nameplate.
// Neither boundary is Hollinwood's own (Hollinwood's -1.5% vertical
// correction was calibrated against ITS OWN single badge and must not be
// assumed to generalise here — see EMJFL_NAME_TOP_PCT's doc comment for
// the same reasoning applied the other way). Rather than borrow a static
// offset from a different card family, this computes where the
// name+position group's ACTUAL RENDERED bounds must sit to be centred
// between these two real, per-render boundaries — re-derived every call
// from the real name/position pair, not a single fixed constant, so a
// short name (which naturally renders lower, closer to the number) and a
// long name (which naturally renders taller, reaching closer to the
// badge) both land centred in the same physical channel.
//
// Position's own rendered bounds are NOT a separate input to the centring
// target: computeAdaptivePositionAnchor's own containment logic guarantees
// position's top edge never rises above name's own top edge (within a
// small safety margin) and its centre always sits strictly above name's
// own bottom edge — i.e. position always nests INSIDE name's own vertical
// span, confirmed directly for every case in this module's own test file
// (search "nests inside"). The combined group's true outer bounds are
// therefore always exactly name's own [top, bottom] — centring name's own
// span centres the whole group, and cascading the shifted anchor back
// through computeAdaptivePositionAnchor (see below) carries position along
// with its existing relationship to name fully intact, since it is the
// same formula, just evaluated against a different fixed point.
const CUSTOM_COLLECTION_BADGE_BOTTOM_PCT = 19.9; // badgeBox top 4.8% + height 15.1%, shared solar/galaxy/comic (custom-collection-manifest.ts)

// The kit number's own rendered top edge, derived from its fixed
// NAMEPLATE_NUMBER_GEOMETRY anchor (bottom-anchored via translate(-50%,
// -100%), so nothing here can ever move the number itself — only this
// module's own estimate of where its top edge lands). comfortableChars is
// 2, so any realistic 1-2 digit kit number renders unscaled (scale 1) —
// the leading ratio below was calibrated once, at that unscaled size,
// against a real render (Playwright getBoundingClientRect on both the
// fill and outline spans, "7", Solar/Galaxy's default numberBox — no
// outlineScale/rotate override): rendered height 263.3 native px (1050
// scale) against the anchor-to-measured-top distance of 81.02 css px at a
// 64.6 css px reference fontSize (340-wide render) => ratio 1.254. Comic's
// own numberBox override (outlineScale 1.035, rotate -8deg) shifts its
// real top edge by a few native px from this shared estimate — small
// enough to be absorbed by CUSTOM_COLLECTION_GROUP_MIN_CLEARANCE_PCT below
// rather than modelled per-variant.
const CUSTOM_COLLECTION_NUMBER_TOP_LEADING_RATIO = 1.254;

// Minimum breathing room preserved between the centred group and each of
// the two channel boundaries — a deliberate, named floor (not a byproduct
// of the centring math) so the group can never land flush against the
// badge or the number even for the longest realistic name/position
// pairing. 3% of the card's own height reads as a genuine, visible gap at
// both builder-preview and print size without making the centring feel
// arbitrarily loose.
const CUSTOM_COLLECTION_GROUP_MIN_CLEARANCE_PCT = 3;

export interface CustomCollectionGroupAnchor {
  /** CSS top% for the name slot — pass as `{ top }` in nameplateSlotStyle's overrides. */
  nameTopPct: string;
  /** Position's own anchor, cascaded from the same shifted name anchor — pass `{ top: result.position.top, fontSizeFactor: result.position.fontSizeFactor }` as position's overrides. */
  position: AdaptivePositionAnchor;
}

/**
 * Computes the Custom Collection (Solar/Galaxy/Comic) group's centred
 * anchor for one name/position pair. See the module-level comment above
 * for the full reasoning. Call once per render; EMJFL and Hollinwood do
 * NOT use this — see EMJFL_NAME_TOP_PCT and computeAdaptivePositionAnchor
 * respectively for their own, separate vertical placement.
 */
export function computeCustomCollectionGroupAnchor(
  W: number,
  H: number,
  name: string | undefined,
  positionLabel: string | undefined
): CustomCollectionGroupAnchor {
  const nameGeom = NAMEPLATE_GEOMETRY.name;
  const baselineNameBottomPct = parseFloat(nameGeom.top);

  const nameScale = nameFitScale(name, nameGeom.comfortableChars, nameGeom.minScale);
  const nameFontSize = W * nameGeom.fontSizeFactor * nameScale;
  const nameLenCss = estimateTextWidthCss(name, nameFontSize);
  const naturalNameBottomCss = H * (baselineNameBottomPct / 100);
  const naturalNameTopCss = naturalNameBottomCss - nameLenCss;
  const naturalGroupCenterCss = (naturalNameTopCss + naturalNameBottomCss) / 2;

  const numFontSizeUnscaled = W * NAMEPLATE_NUMBER_GEOMETRY.fontSizeFactor;
  const numberBottomAnchorCss = H * (parseFloat(NAMEPLATE_NUMBER_GEOMETRY.top) / 100);
  const numberTopCss = numberBottomAnchorCss - numFontSizeUnscaled * CUSTOM_COLLECTION_NUMBER_TOP_LEADING_RATIO;

  const badgeBottomCss = H * (CUSTOM_COLLECTION_BADGE_BOTTOM_PCT / 100);
  const clearanceCss = H * (CUSTOM_COLLECTION_GROUP_MIN_CLEARANCE_PCT / 100);
  const channelTopCss = badgeBottomCss + clearanceCss;
  const channelBottomCss = numberTopCss - clearanceCss;
  const targetCenterCss = (channelTopCss + channelBottomCss) / 2;

  const shiftCss = targetCenterCss - naturalGroupCenterCss;
  const nameTopPct = ((naturalNameBottomCss + shiftCss) / H) * 100;

  return {
    nameTopPct: `${nameTopPct.toFixed(3)}%`,
    position: computeAdaptivePositionAnchor(W, H, name, positionLabel, nameTopPct),
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
