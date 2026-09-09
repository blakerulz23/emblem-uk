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
 * Builds the ready-to-spread style object for one nameplate slot ('name' or
 * 'position'). `geometry` defaults to the shared measured geometry above;
 * pass a partial override only when measurement has proven a genuinely
 * different structure for that one card (see custom-galaxy's own call site
 * for the one currently-justified case, and the PR description for why
 * every other card needed none).
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
