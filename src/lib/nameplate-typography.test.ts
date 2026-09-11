import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  nameFitScale,
  nameplateSlotStyle,
  nameplateNumberLayers,
  computeAdaptivePositionAnchor,
  computeCustomCollectionGroupAnchor,
  EMJFL_NAME_TOP_PCT,
  estimateTextWidthCss,
  CHAR_ADVANCE_WIDTH,
  NAMEPLATE_GEOMETRY,
  NAMEPLATE_NUMBER_GEOMETRY,
  NAMEPLATE_FONT_FAMILY,
} from './nameplate-typography';

/**
 * Locks in the shared vertical nameplate typography system: Hollinwood's
 * own measured geometry (Canva reference PNGs, alpha-bounds matched to a
 * real browser render within ~2px on a native 1050x1498 canvas — see PR #86
 * and its follow-up generalisation description) as the one shared default
 * for name/position text, the fit-scale calibration at that geometry, and
 * that colour/effects are NOT part of this module (every card supplies its
 * own — see CardArt.hollinwood-typography.test.ts, renamed here alongside
 * the module it actually tests now that it's a plain .ts file vitest's
 * JSX-less config can import directly, unlike CardArt.tsx itself).
 */

describe('nameFitScale', () => {
  it('renders text at or under comfortableChars at full scale', () => {
    expect(nameFitScale('JACOB THOMPSON', 14, 0.6)).toBe(1);
    expect(nameFitScale('MIDFIELDER', 10, 0.85)).toBe(1);
    expect(nameFitScale('LI YU', 14, 0.6)).toBe(1);
    expect(nameFitScale('CB', 10, 0.85)).toBe(1);
  });

  it('scales down proportionally above comfortableChars, before hitting the floor', () => {
    const longer = 'CHRISTOPHER ALLEN'; // 17 chars
    expect(nameFitScale(longer, 14, 0.6)).toBeCloseTo(14 / 17, 5);
    expect(nameFitScale('ALL-ROUNDER', 10, 0.85)).toBeCloseTo(10 / 11, 5);
    expect(nameFitScale('ALL-ROUNDER', 10, 0.85)).toBeGreaterThan(0.85);
  });

  it('clamps at minScale rather than shrinking further for extreme lengths', () => {
    const extreme = 'CHRISTOPHER ALEXANDER-WOJCIECHOWSKI'; // 36 chars, 14/36 < 0.6
    expect(nameFitScale(extreme, 14, 0.6)).toBe(0.6);
  });
});

describe('NAMEPLATE_GEOMETRY — shared defaults, including the group-placement correction', () => {
  // Values below reflect the group-level left/top correction (see
  // nameplate-typography.ts's own GROUP_LEFT_SHIFT_PCT/GROUP_TOP_SHIFT_PCT
  // doc comment): left is measured against the newest native Canva
  // reference (OLLIE HARRISON, alpha bounds on a 1050x1498 canvas); top is
  // bounded by a real-render collision check against the club/league badge
  // artwork (see the doc comment for why the initial reference-derived
  // value could not be used as computed). Name's own left/top shifted by
  // the same explicit, named amount position's left also received,
  // preserving their existing relative left-edge gap (8.49 percentage
  // points) exactly. Nothing else (widthFactor, fontSizeFactor,
  // comfortableChars, minScale — i.e. font size, fit-scale rules) changed.
  it('name slot matches the corrected group placement', () => {
    expect(NAMEPLATE_GEOMETRY.name).toMatchObject({
      left: '6.40%',
      top: '61.23%',
      widthFactor: 0.6,
      fontSizeFactor: 0.0838,
      comfortableChars: 14,
      minScale: 0.6,
    });
  });

  it('position slot matches the corrected group placement', () => {
    expect(NAMEPLATE_GEOMETRY.position).toMatchObject({
      left: '14.89%',
      top: '52.84%', // inert for every real consumer — always overridden by computeAdaptivePositionAnchor's own computed top
      widthFactor: 0.2,
      fontSizeFactor: 0.0432,
      // 11, not 10 — covers all five canonical labels (ALL-ROUNDER, the
      // longest, is 11 chars) at full, unshrunk reference size; see
      // NAMEPLATE_GEOMETRY's own doc comment on this field for why.
      comfortableChars: 11,
      minScale: 0.85,
    });
  });

  it('preserves the exact pre-existing relative left-edge gap between name and position (8.49 percentage points) — the shift is shared, not independently re-tuned per slot', () => {
    const nameLeft = parseFloat(NAMEPLATE_GEOMETRY.name.left);
    const posLeft = parseFloat(NAMEPLATE_GEOMETRY.position.left);
    expect(posLeft - nameLeft).toBeCloseTo(8.49, 1);
  });
});

describe('nameplateSlotStyle', () => {
  const W = 340, H = 476;

  it('builds the reference-size name style unscaled for the calibration name', () => {
    const style = nameplateSlotStyle('name', W, H, 'JACOB THOMPSON', '#fff');
    expect(style.left).toBe('6.40%');
    expect(style.top).toBe('61.23%');
    expect(style.fontSize).toBeCloseTo(W * 0.0838, 5);
    expect(style.fontFamily).toBe(NAMEPLATE_FONT_FAMILY);
    expect(style.color).toBe('#fff');
    expect(style.transform).toBe('rotate(-90deg)');
    expect(style.transformOrigin).toBe('left top');
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.overflow).toBe('visible');
  });

  it('ALL-ROUNDER (11 chars, comfortableChars=11) renders at full, unshrunk reference size — the longest canonical label, not scaled down', () => {
    const style = nameplateSlotStyle('position', W, H, 'ALL-ROUNDER', '#ff0000');
    expect(style.fontSize).toBeCloseTo(W * 0.0432, 5);
  });

  it('scales the position font-size down only once a label genuinely exceeds comfortableChars (12+ chars)', () => {
    const style = nameplateSlotStyle('position', W, H, 'GOALKEEPER-ISH', '#ff0000'); // 14 chars, not a real label, exercises the shrink path
    // 11/14 = 0.786, below minScale (0.85), so the floor governs.
    expect(style.fontSize).toBeCloseTo(W * 0.0432 * 0.85, 5);
  });

  it('a colour-only override does not blank out the shared left/top anchor (regression: spreading an explicit `undefined` used to silently unposition the div)', () => {
    const style = nameplateSlotStyle('position', W, H, 'MIDFIELDER', '#ef2222', {
      left: undefined,
      top: undefined,
    });
    expect(style.left).toBe('14.89%');
    expect(style.top).toBe('52.84%');
    expect(style.color).toBe('#ef2222');
  });

  it('an explicit geometry override wins over the shared default (for a card genuinely proven to differ)', () => {
    const style = nameplateSlotStyle('name', W, H, 'JACOB THOMPSON', '#fff', {
      left: '5%',
      top: '70%',
      fontSizeFactor: 0.05,
    });
    expect(style.left).toBe('5%');
    expect(style.top).toBe('70%');
    expect(style.fontSize).toBeCloseTo(W * 0.05, 5);
  });

  it('extra style properties merge in without disturbing geometry (e.g. a card-specific text-shadow)', () => {
    const style = nameplateSlotStyle('name', W, H, 'JACOB THOMPSON', '#fff', undefined, {
      textShadow: '0 2px 4px rgba(0,0,0,.45)',
    });
    expect(style.textShadow).toBe('0 2px 4px rgba(0,0,0,.45)');
    expect(style.left).toBe('6.40%');
  });
});

describe('NAMEPLATE_NUMBER_GEOMETRY — Hollinwood-measured kit-number calibration', () => {
  it('matches the measured centre-x/bottom-y anchor and reference size', () => {
    expect(NAMEPLATE_NUMBER_GEOMETRY).toMatchObject({
      left: '14.67%',
      top: '77.35%',
      fontSizeFactor: 0.19,
      outlineScale: 1.12,
      comfortableChars: 2,
      minScale: 0.8,
    });
  });
});

describe('nameplateNumberLayers', () => {
  const W = 340;

  it('centres horizontally and bottom-anchors vertically via the wrapper transform, not a left-anchored box', () => {
    const layers = nameplateNumberLayers(W, '7', '#fff', '#0074ff');
    expect(layers.wrapper.left).toBe('14.67%');
    expect(layers.wrapper.top).toBe('77.35%');
    expect(layers.wrapper.transform).toBe('translate(-50%, -100%)');
  });

  it('renders one- and two-digit numbers at full reference scale (comfortableChars=2)', () => {
    expect(nameplateNumberLayers(W, '7', '#fff', '#0074ff').fill.fontSize).toBeCloseTo(W * 0.19, 5);
    expect(nameplateNumberLayers(W, '10', '#fff', '#0074ff').fill.fontSize).toBeCloseTo(W * 0.19, 5);
    expect(nameplateNumberLayers(W, '99', '#fff', '#0074ff').fill.fontSize).toBeCloseTo(W * 0.19, 5);
  });

  it('outline and fill layers always share the identical font-size, so the outline never runs ahead of or behind the fill at any digit count', () => {
    for (const n of ['7', '10', '100']) {
      const layers = nameplateNumberLayers(W, n, '#fff', '#0074ff');
      expect(layers.outline.fontSize).toBe(layers.fill.fontSize);
    }
  });

  it('scales down only for more than 2 digits, never stretches horizontally (no scaleX applied to fontSize, no forced width)', () => {
    // 3 digits: comfortableChars/length = 2/3 ≈ 0.667, clamped up to the 0.8 floor.
    const layers = nameplateNumberLayers(W, '100', '#fff', '#0074ff');
    expect(layers.fill.fontSize).toBeCloseTo(W * 0.19 * 0.8, 5);
    expect(layers.fill.width).toBeUndefined();
  });

  it('the outline is a proportional scaled copy, not a stroke — it cannot fully close a glyph counter the way an oversized stroke can, because the front (fill) layer is always drawn at true size on top', () => {
    const layers = nameplateNumberLayers(W, '2', '#fff', '#ef2222');
    expect(layers.outline.transform).toBe(`scale(${1.12})`);
    expect(layers.outline.transformOrigin).toBe('center');
    expect(layers.outline).not.toHaveProperty('WebkitTextStroke');
    expect(layers.fill).not.toHaveProperty('WebkitTextStroke');
  });

  // Regression guard for the confirmed defect: at the old technique
  // (-webkit-text-stroke, calibrated by forcing the outer alpha bounds to
  // match Hollinwood (85).png regardless of the glyph's own shape), the
  // stroke width came out to 63% of the font's em-size — enough to close
  // "0"/"6"/"8"/"9"'s counters completely and merge both sides of "2"'s
  // thin curve, rendering every affected card's number as a solid coloured
  // block (confirmed with real screenshots against custom-solar/-galaxy/
  // emjfl-official). The layered-copy technique can't reproduce that
  // failure mode by construction (the front layer always draws at full,
  // unshrunk size), but outlineScale could still be pushed large enough to
  // visually overwhelm the fill even so — this pins it to a range verified
  // (via real rendering across every digit 0-9 on every unified card, plus
  // Comic's own thinner override) to keep every digit's interior and any
  // enclosed counter clearly visible.
  it('outlineScale — both the shared default and every per-card override — stays within a range verified not to swallow the glyph', () => {
    expect(NAMEPLATE_NUMBER_GEOMETRY.outlineScale).toBeGreaterThan(1);
    expect(NAMEPLATE_NUMBER_GEOMETRY.outlineScale).toBeLessThanOrEqual(1.2);
    const cardArtSource = readFileSync(
      resolve(process.cwd(), 'src/lib/custom-collection-manifest.ts'),
      'utf8'
    );
    const overrides = Array.from(cardArtSource.matchAll(/outlineScale:\s*'([\d.]+)'/g)).map((m) => Number(m[1]));
    expect(overrides.length).toBeGreaterThan(0); // Comic's own override should still be present
    for (const scale of overrides) {
      expect(scale).toBeGreaterThan(1);
      expect(scale).toBeLessThanOrEqual(1.2);
    }
  });

  it('fill and outline colour are independent, per-card parameters', () => {
    const layers = nameplateNumberLayers(W, '7', '#fff', '#FF4B1F');
    expect(layers.fill.color).toBe('#fff');
    expect(layers.outline.color).toBe('#FF4B1F');
  });

  it('a colour-only override does not blank out the shared anchor (same undefined-spread hazard as nameplateSlotStyle)', () => {
    const layers = nameplateNumberLayers(W, '7', '#fff', '#111', { left: undefined, top: undefined, outlineScale: 1.035 });
    expect(layers.wrapper.left).toBe('14.67%');
    expect(layers.wrapper.top).toBe('77.35%');
    expect(layers.outline.transform).toBe('scale(1.035)');
  });

  it('a restrained per-card outline (Comic\'s own thin treatment) is smaller than the shared default', () => {
    const shared = nameplateNumberLayers(W, '7', '#fff', '#111');
    const comic = nameplateNumberLayers(W, '7', '#fff', '#111', { outlineScale: 1.035 });
    const sharedGap = Number(String(shared.outline.transform).match(/scale\(([\d.]+)\)/)?.[1]) - 1;
    const comicGap = Number(String(comic.outline.transform).match(/scale\(([\d.]+)\)/)?.[1]) - 1;
    expect(comicGap).toBeLessThan(sharedGap);
  });

  it('a rotate/shadow wrapper extra (Comic\'s own treatment) composes onto the wrapper without touching either text layer', () => {
    const layers = nameplateNumberLayers(W, '7', '#fff', '#111', undefined, {
      transform: 'translate(-50%, -100%) rotate(-8deg)',
      filter: 'drop-shadow(0 3px 0 #111)',
    });
    expect(layers.wrapper.transform).toBe('translate(-50%, -100%) rotate(-8deg)');
    expect(layers.wrapper.filter).toBe('drop-shadow(0 3px 0 #111)');
    expect(layers.fill).not.toHaveProperty('filter');
  });
});

/**
 * Regression coverage for the position-overflow defect: position's `top`
 * was a fixed, card-relative constant, entirely independent of the player
 * name. That's correct only for a name at least as long as the reference
 * pair (JACOB THOMPSON, 14 chars, unscaled) — for anything shorter, the
 * name (bottom-anchored, grows upward as it lengthens) has a much smaller
 * rendered span than position's fixed anchor assumed, and position ends up
 * floating above the name's own top edge. Confirmed by real rendering
 * before this fix: TINUBU (6 chars) / MIDFIELDER — name native y
 * 711.2–938.6, position 597.9–788.3, extending 113.3px above the name.
 *
 * These are pure-function tests (computeAdaptivePositionAnchor takes no
 * DOM/React input), so they can assert the actual formula's numeric
 * output directly — real-browser topology (open counters, readability)
 * doesn't apply here since this is a geometry/layout fix, not a fill-vs-
 * stroke one; the reproduction matrix below was independently re-verified
 * against real rendering during this fix (see the PR description for the
 * full before/after measurement table across all five test pairs, all
 * five canonical labels, one legacy label, and the placeholder).
 */
/**
 * estimateTextWidthCss / CHAR_ADVANCE_WIDTH replaced an earlier flat
 * average-per-character estimate (~0.465 for every letter) after real
 * rendering showed material error: two equal-length names (LEE, MAX — both
 * 3 characters) differ by 42% in real rendered width, which the average
 * model couldn't distinguish and left LEE with only 3.1px of real
 * containment margin. These tests lock in that the per-glyph table is
 * genuinely being used (not silently still an average), not the specific
 * numeric values themselves — those came from real measurement, not a
 * formula, so testing "does the letter I really measure 0.2652" would just
 * be re-asserting the measurement rather than testing behaviour.
 */
describe('CHAR_ADVANCE_WIDTH / estimateTextWidthCss', () => {
  it('different letters have measurably different advance widths — not a flat average', () => {
    // Confirmed via real Playwright rendering: I is one of the narrowest
    // letters, M one of the widest, in Antonio Bold.
    expect(CHAR_ADVANCE_WIDTH.I).toBeLessThan(CHAR_ADVANCE_WIDTH.M);
    expect(CHAR_ADVANCE_WIDTH.M / CHAR_ADVANCE_WIDTH.I).toBeGreaterThan(2); // the real ~2.6x spread
  });

  it('LEE and MAX (both 3 characters) estimate to genuinely different widths — the exact case a flat average could not distinguish', () => {
    const fontSize = 28.492; // W=340 reference name font-size
    const leeWidth = estimateTextWidthCss('LEE', fontSize);
    const maxWidth = estimateTextWidthCss('MAX', fontSize);
    expect(leeWidth).not.toBeCloseTo(maxWidth, 0);
    expect(maxWidth).toBeGreaterThan(leeWidth);
  });

  it('is case-insensitive (every nameplate slot renders textTransform:uppercase regardless of stored case)', () => {
    const fontSize = 28.492;
    expect(estimateTextWidthCss('lee', fontSize)).toBeCloseTo(estimateTextWidthCss('LEE', fontSize), 5);
  });

  it('falls back to a reasonable default for an unmapped character rather than treating it as zero-width', () => {
    const fontSize = 28.492;
    // '5' is not in the table (names don't contain digits); it must still
    // contribute real width, not silently vanish from the estimate.
    expect(estimateTextWidthCss('5', fontSize)).toBeGreaterThan(0);
  });

  it('an empty or undefined string estimates to zero width without throwing', () => {
    expect(estimateTextWidthCss('', 28.492)).toBe(0);
    expect(estimateTextWidthCss(undefined, 28.492)).toBe(0);
  });
});

describe('computeAdaptivePositionAnchor', () => {
  const W = 340, H = 476;

  it('reproduces the calibrated JACOB THOMPSON / MIDFIELDER anchor, shifted by exactly the group placement correction', () => {
    // Pre-correction, 594.8-785.2 native was the real measured render at
    // this anchor (PR #86's own measurement, target 597-786). The group
    // placement correction (GROUP_TOP_SHIFT_PCT = -1.5, see
    // NAMEPLATE_GEOMETRY's own doc comment for the full derivation —
    // badge-collision-bounded, not the larger reference-derived value that
    // turned out to rest on a cross-page/cross-revision measurement)
    // shifts name.top by -1.5 percentage points — and because
    // computeAdaptivePositionAnchor derives position's own anchor as a
    // pure linear function of name.top (nameBottomCss -> centerCss ->
    // positionBottomCss, with no other term depending on name.top), that
    // exact same -1.5-point shift (1498 * -1.5 / 100 ≈ -22.5 native px)
    // passes straight through to position's own computed top — this is
    // the whole point of correcting the group via name.top alone rather
    // than separately re-tuning position. Expected native top is therefore
    // the old ~785.2 minus that ~22.5px shift, ≈ 762.7.
    const anchor = computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', 'MIDFIELDER');
    const topPct = parseFloat(anchor.top);
    const nativeTop = (topPct / 100) * 1498;
    expect(nativeTop).toBeGreaterThan(755);
    expect(nativeTop).toBeLessThan(770);
    expect(anchor.fontSizeFactor).toBeCloseTo(NAMEPLATE_GEOMETRY.position.fontSizeFactor, 5); // unscaled — no containment shrink needed for the reference pair
  });

  it('the group placement correction moves position strictly upward (toward the name, away from the kit number below) — a directional regression guard against a future sign flip', () => {
    // NAMEPLATE_NUMBER_GEOMETRY.top ('77.35%') is fixed and untouched by
    // this correction — confirmed by its own describe block above. This
    // test locks in that computeAdaptivePositionAnchor's own output for the
    // calibration pair sits meaningfully further from that fixed number
    // anchor (a smaller top%, i.e. higher on the card) than the pre-
    // correction geometry would have produced, which is the entire point
    // of GROUP_TOP_SHIFT_PCT being negative.
    const anchor = computeAdaptivePositionAnchor(340, 476, 'JACOB THOMPSON', 'MIDFIELDER');
    const positionTopPct = parseFloat(anchor.top);
    const numberTopPct = parseFloat(NAMEPLATE_NUMBER_GEOMETRY.top);
    expect(positionTopPct).toBeLessThan(numberTopPct); // position sits above the number, with real margin
    expect(numberTopPct - positionTopPct).toBeGreaterThan(20); // comfortably more than a token amount of clearance
  });

  it('changing only the position label does not move the name (position has no way to write back into name geometry)', () => {
    // computeAdaptivePositionAnchor only ever returns position's own
    // anchor — it cannot and does not mutate NAMEPLATE_GEOMETRY.name, so
    // this is really a type-level guarantee; asserted here as a
    // regression trip-wire in case that ever changes.
    const before = { ...NAMEPLATE_GEOMETRY.name };
    computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', 'GOALKEEPER');
    computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', 'CB');
    expect(NAMEPLATE_GEOMETRY.name).toEqual(before);
  });

  it('changing only the player name moves position in the documented, formula-driven direction — not arbitrarily', () => {
    const shortAnchor = computeAdaptivePositionAnchor(W, H, 'JAY', 'MIDFIELDER');
    const longAnchor = computeAdaptivePositionAnchor(W, H, 'ALEXANDER MONTGOMERY', 'MIDFIELDER');
    const shortTop = parseFloat(shortAnchor.top);
    const longTop = parseFloat(longAnchor.top);
    // top% is measured from the card's own top, so a *larger* value means
    // *lower* on the card, closer to the shared bottom anchor. A shorter
    // name has less of its own length above that bottom anchor, so
    // position must move down (larger top%) to stay within it — confirmed
    // against real rendering (JAY/MIDFIELDER: top% ≈61.5–61.8; ALEXANDER
    // MONTGOMERY/MIDFIELDER: ≈52.4–52.8).
    expect(shortTop).toBeGreaterThan(longTop);
  });

  /**
   * Regression coverage for the confirmed "position shrinks with a short
   * name" defect: an earlier version of computeAdaptivePositionAnchor
   * additionally shrank position's own FONT SIZE whenever its natural
   * (own-length) placement would extend above a short name's own (small)
   * span — e.g. XAVI / ALL-ROUNDER rendered at roughly half the size of
   * JACOB THOMPSON / ALL-ROUNDER, the identical position label, purely
   * because XAVI is short. Position's font size must depend ONLY on its
   * own text now — never on which name it's paired with. Placement (top%)
   * is still name-length-dependent by design (that's the adaptive-anchor
   * feature itself, unrelated to this bug) and is not asserted here.
   */
  it.each([
    ['JAY', 'GOALKEEPER'],
    ['XAVI', 'ALL-ROUNDER'],
    ['TINUBU', 'MIDFIELDER'],
    ['MILES LEE', 'DEFENDER'],
    ['JACOB THOMPSON', 'MIDFIELDER'],
    ['JACOB THOMPSON', 'ALL-ROUNDER'],
    ['ALEXANDER MONTGOMERY', 'ALL-ROUNDER'],
    ['LI', 'GOALKEEPER'],
    ['III', 'GOALKEEPER'],
  ])('name=%s / position=%s: position\'s fontSizeFactor is always the shared base value, regardless of name', (name, position) => {
    const anchor = computeAdaptivePositionAnchor(W, H, name, position);
    expect(anchor.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
  });

  it.each([
    ['XAVI', 'ALL-ROUNDER'],
    ['JAY', 'GOALKEEPER'],
    ['TINUBU', 'MIDFIELDER'],
  ])('name=%s / position=%s: the SAME position label renders at the SAME font size regardless of which name it is paired with (the exact regression: a short name must not shrink the position label)', (shortName, position) => {
    const withShortName = computeAdaptivePositionAnchor(W, H, shortName, position);
    const withLongName = computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', position);
    expect(withShortName.fontSizeFactor).toBe(withLongName.fontSizeFactor);
  });

  it('two equal-length names with very different real glyph widths (LEE vs MAX, both 3 characters) both keep a healthy, comparable containment margin — the specific failure mode the flat-average estimate had', () => {
    const leeAnchor = computeAdaptivePositionAnchor(W, H, 'LEE', 'MIDFIELDER');
    const maxAnchor = computeAdaptivePositionAnchor(W, H, 'MAX', 'MIDFIELDER');
    // Both should resolve to a real, usable top — the point of this test is
    // that neither is starved of margin the way LEE specifically was
    // before (3.1px, effectively zero safety net) — verified via the
    // module's own doc comment measurement, real rendering showed 16.5px
    // (LEE) and 23.6px (MAX) after the fix, a normal, comparable spread
    // rather than the earlier 3.1px vs 43.2px outlier.
    expect(leeAnchor.top).not.toBe(maxAnchor.top); // real glyph widths differ, so the anchors should too
    expect(parseFloat(leeAnchor.top)).toBeGreaterThan(0);
    expect(parseFloat(maxAnchor.top)).toBeGreaterThan(0);
  });

  it('the five canonical position labels and one legacy label all resolve without error against a range of realistic names', () => {
    const names = ['JAY', 'TINUBU', 'MILES LEE', 'JACOB THOMPSON', 'ALEXANDER MONTGOMERY'];
    const positions = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD', 'ALL-ROUNDER', 'CB'];
    for (const name of names) {
      for (const position of positions) {
        const anchor = computeAdaptivePositionAnchor(W, H, name, position);
        expect(anchor.top).toMatch(/^\d+\.\d{3}%$/);
        // Always exactly the shared base value now — position's font size
        // never varies with name (see the regression-coverage block above).
        expect(anchor.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
      }
    }
  });

  it('the placeholder "POSITION" label (no value set) also resolves for a short name', () => {
    const anchor = computeAdaptivePositionAnchor(W, H, 'TINUBU', 'POSITION');
    expect(parseFloat(anchor.top)).toBeGreaterThan(0);
    expect(anchor.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
  });

  it('for the most extreme realistic pairing (JAY/GOALKEEPER), the rendered font size is the full shared base — no shrink', () => {
    // Historically this pairing was the trigger for a containment-driven
    // font-size shrink (see this describe block's own regression coverage
    // above for why that shrink was removed entirely) — asserted directly
    // here since this specific pairing was the one originally used to
    // justify that now-removed mechanism.
    const anchor = computeAdaptivePositionAnchor(W, H, 'JAY', 'GOALKEEPER'); // shortest realistic name, longest canonical label
    expect(anchor.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
  });

  it('for a genuinely pathological narrow-letter name (LI), position\'s font size still is NOT shrunk — placement, not size, is the only thing that can move for an extreme pairing', () => {
    // "LI" is not a realistic player display name (two of Antonio's
    // narrowest letters, no width to spare) — previously this drove
    // position's font size down to under 20% of base; that coupling
    // between name and position size is exactly the confirmed regression
    // this file now guards against.
    const anchor = computeAdaptivePositionAnchor(W, H, 'LI', 'GOALKEEPER');
    expect(anchor.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
  });

  it('position CAN extend above a short name\'s own top edge for a short-name + long-position pairing — no longer treated as an overflow to fix by shrinking', () => {
    const nameGeom = NAMEPLATE_GEOMETRY.name;
    const name = 'XAVI';
    const position = 'ALL-ROUNDER';
    const nameScale = nameFitScale(name, nameGeom.comfortableChars, nameGeom.minScale);
    const nameFontSize = W * nameGeom.fontSizeFactor * nameScale;
    const nameLenCss = estimateTextWidthCss(name, nameFontSize);
    const nameBottomCss = H * (parseFloat(nameGeom.top) / 100);
    const nameTopCss = nameBottomCss - nameLenCss;

    const anchor = computeAdaptivePositionAnchor(W, H, name, position);
    const posTopCss = H * (anchor.topEdgePct / 100);
    expect(posTopCss).toBeLessThan(nameTopCss); // extends above name's own top — expected, not a bug
    expect(anchor.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor); // and still at full size
  });

  it('an undefined name or position does not throw', () => {
    expect(() => computeAdaptivePositionAnchor(W, H, undefined, 'MIDFIELDER')).not.toThrow();
    expect(() => computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', undefined)).not.toThrow();
    expect(() => computeAdaptivePositionAnchor(W, H, undefined, undefined)).not.toThrow();
  });
});

/**
 * EMJFL_NAME_TOP_PCT reverts EMJFL's own vertical anchor to the baseline
 * that predates the Hollinwood group correction folded into
 * NAMEPLATE_GEOMETRY — see its own doc comment in nameplate-typography.ts
 * for why (that correction was calibrated against Hollinwood's own single
 * badge, never validated against EMJFL's two-badge safe area).
 */
describe('EMJFL_NAME_TOP_PCT', () => {
  it('is the original, pre-group-correction baseline — genuinely different from the shared (Hollinwood-calibrated) NAMEPLATE_GEOMETRY.name.top', () => {
    expect(EMJFL_NAME_TOP_PCT).toBe(62.73);
    expect(EMJFL_NAME_TOP_PCT).not.toBe(parseFloat(NAMEPLATE_GEOMETRY.name.top));
  });

  it('computeAdaptivePositionAnchor, given EMJFL_NAME_TOP_PCT as an override, resolves a lower (larger top%, further from the badge) anchor than the shared Hollinwood-shifted default', () => {
    const W = 340, H = 476;
    const withOverride = computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', 'MIDFIELDER', EMJFL_NAME_TOP_PCT);
    const withoutOverride = computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', 'MIDFIELDER');
    expect(parseFloat(withOverride.top)).toBeGreaterThan(parseFloat(withoutOverride.top));
  });
});

/**
 * Full regression matrix required for the "position shrinks with a short
 * name" fix: every listed name against every listed position (and every
 * listed kit number, checked separately below since the number has its
 * own, wholly independent geometry). Every cell must resolve without
 * throwing and — the actual regression — must render position at the
 * SAME font size no matter which name it is paired with.
 */
describe('full regression matrix — names x positions x numbers', () => {
  const W = 340, H = 476;
  const NAMES = ['JAY', 'XAVI', 'TINUBU', 'MILES LEE', 'OLLIE HARRISON', 'JACOB THOMPSON', 'CHRISTOPHER ALEXANDER-WOJCIECHOWSKI'];
  const POSITIONS = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD', 'ALL-ROUNDER', 'CB']; // CB: one legacy (pre-five-category) value, shown as-is per positionCardLabel
  const NUMBERS = ['1', '6', '7', '10', '88'];

  it.each(POSITIONS)('position=%s renders at the identical font size for every name in the matrix', (position) => {
    const fontSizes = NAMES.map((name) => computeAdaptivePositionAnchor(W, H, name, position).fontSizeFactor);
    expect(new Set(fontSizes).size).toBe(1); // every name maps to the exact same value
  });

  it.each(NAMES.flatMap((name) => POSITIONS.map((position) => [name, position] as const)))(
    'name=%s / position=%s: computeAdaptivePositionAnchor and computeCustomCollectionGroupAnchor both resolve without throwing, to a valid top%% and a positive font size',
    (name, position) => {
      const direct = computeAdaptivePositionAnchor(W, H, name, position);
      expect(direct.top).toMatch(/^-?\d+\.\d{3}%$/);
      expect(direct.fontSizeFactor).toBeGreaterThan(0);

      const group = computeCustomCollectionGroupAnchor(W, H, name, position);
      expect(group.nameTopPct).toMatch(/^-?\d+\.\d{3}%$/);
      expect(group.position.fontSizeFactor).toBeGreaterThan(0);
    }
  );

  it.each(NUMBERS)('number=%s: nameplateNumberLayers resolves at the shared unscaled reference size (1-2 digits, comfortableChars=2)', (number) => {
    const layers = nameplateNumberLayers(W, number, '#fff', '#111');
    expect(layers.fill.fontSize).toBeCloseTo(W * NAMEPLATE_NUMBER_GEOMETRY.fontSizeFactor, 5);
    expect(layers.outline.fontSize).toBe(layers.fill.fontSize);
  });

  describe('four required focused comparisons', () => {
    it('XAVI / ALL-ROUNDER / 6: position renders at full base size, not shrunk', () => {
      const group = computeCustomCollectionGroupAnchor(W, H, 'XAVI', 'ALL-ROUNDER');
      expect(group.position.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
      expect(() => nameplateNumberLayers(W, '6', '#fff', '#8f5cff')).not.toThrow();
    });

    it('OLLIE HARRISON / MIDFIELDER / 7: unaffected by the fix (this pairing never triggered the old containment shrink)', () => {
      const group = computeCustomCollectionGroupAnchor(W, H, 'OLLIE HARRISON', 'MIDFIELDER');
      expect(group.position.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
    });

    it('shortest name (JAY) with longest position (ALL-ROUNDER): full size, same as any other name', () => {
      const short = computeAdaptivePositionAnchor(W, H, 'JAY', 'ALL-ROUNDER');
      const long = computeAdaptivePositionAnchor(W, H, 'CHRISTOPHER ALEXANDER-WOJCIECHOWSKI', 'ALL-ROUNDER');
      expect(short.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
      expect(short.fontSizeFactor).toBe(long.fontSizeFactor);
    });

    it('longest supported name with longest position: resolves without throwing and without shrinking position', () => {
      const anchor = computeAdaptivePositionAnchor(W, H, 'CHRISTOPHER ALEXANDER-WOJCIECHOWSKI', 'ALL-ROUNDER');
      expect(anchor.fontSizeFactor).toBe(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
    });
  });
});

/**
 * computeCustomCollectionGroupAnchor replaces a static, borrowed offset
 * with a per-render optical-centring calculation: the combined name+
 * position group's actual rendered bounds (not the CSS anchor, not the
 * card's overall midpoint) are centred between Custom Collection's own
 * badge-bottom edge and the fixed kit number's own top edge, re-derived
 * for every name/position pair so short and long names both land centred
 * in the same physical channel rather than at a single fixed offset.
 */
describe('computeCustomCollectionGroupAnchor', () => {
  const W = 340, H = 476;

  // Re-derives the channel's two boundaries independently (same constants
  // documented in nameplate-typography.ts: shared badgeBox bottom 19.9%,
  // the number's own calibrated top-edge ratio 1.254, 3% clearance) rather
  // than reaching into the function's own internals, so this test checks
  // real centring behaviour, not just that the implementation agrees with
  // itself.
  function expectedChannel() {
    const badgeBottomCss = H * (19.9 / 100);
    const numFontSizeUnscaled = W * NAMEPLATE_NUMBER_GEOMETRY.fontSizeFactor;
    const numberBottomAnchorCss = H * (parseFloat(NAMEPLATE_NUMBER_GEOMETRY.top) / 100);
    const numberTopCss = numberBottomAnchorCss - numFontSizeUnscaled * 1.254;
    const clearanceCss = H * (3 / 100);
    return { channelTopCss: badgeBottomCss + clearanceCss, channelBottomCss: numberTopCss - clearanceCss };
  }

  // Computes the group's true outer bounds as the union of name's own
  // [top, bottom] and position's own [top, bottom] — mirroring
  // computeCustomCollectionGroupAnchor's own internal math exactly (see
  // its doc comment for why: position's font size no longer depends on
  // name, so it is no longer guaranteed to nest inside name's own span).
  function groupBoundsCss(result: ReturnType<typeof computeCustomCollectionGroupAnchor>, name: string) {
    const nameGeom = NAMEPLATE_GEOMETRY.name;
    const nameScale = nameFitScale(name, nameGeom.comfortableChars, nameGeom.minScale);
    const nameFontSize = W * nameGeom.fontSizeFactor * nameScale;
    const nameLenCss = estimateTextWidthCss(name, nameFontSize);
    const nameBottomCss = H * (parseFloat(result.nameTopPct) / 100);
    const nameTopCss = nameBottomCss - nameLenCss;
    const posTopCss = H * (result.position.topEdgePct / 100);
    const posBottomCss = H * (parseFloat(result.position.top) / 100);
    return {
      top: Math.min(nameTopCss, posTopCss),
      bottom: Math.max(nameBottomCss, posBottomCss),
    };
  }

  it.each([
    ['Jacob Thompson', 'MIDFIELDER'],
    ['Kai', 'GK'],
    ['Jim Ash', 'FW'],
    ['Mohammed', 'GOALKEEPER'],
    // Short name + longest canonical label — the exact shape of the
    // confirmed regression (see computeAdaptivePositionAnchor's own test
    // block): position's own bounds now genuinely extend beyond name's,
    // so this case only passes if the centring math uses the union of
    // both, not name's bounds alone.
    ['Xavi', 'ALL-ROUNDER'],
  ])('centres the combined name+position group\'s TRUE (union) rendered bounds at the channel midpoint for name=%s / position=%s', (name, position) => {
    const result = computeCustomCollectionGroupAnchor(W, H, name, position);
    const { top, bottom } = groupBoundsCss(result, name);
    const groupCenterCss = (top + bottom) / 2;

    const { channelTopCss, channelBottomCss } = expectedChannel();
    const targetCenterCss = (channelTopCss + channelBottomCss) / 2;
    expect(groupCenterCss).toBeCloseTo(targetCenterCss, 0);
  });

  it('for a short name + long position pairing, position\'s own bounds genuinely extend beyond name\'s — confirming this test matrix actually exercises the union-bounds path, not just name\'s bounds coincidentally', () => {
    const result = computeCustomCollectionGroupAnchor(W, H, 'Xavi', 'ALL-ROUNDER');
    const nameGeom = NAMEPLATE_GEOMETRY.name;
    const nameScale = nameFitScale('Xavi', nameGeom.comfortableChars, nameGeom.minScale);
    const nameFontSize = W * nameGeom.fontSizeFactor * nameScale;
    const nameLenCss = estimateTextWidthCss('Xavi', nameFontSize);
    const nameBottomCss = H * (parseFloat(result.nameTopPct) / 100);
    const nameTopCss = nameBottomCss - nameLenCss;
    const posTopCss = H * (result.position.topEdgePct / 100);
    expect(posTopCss).toBeLessThan(nameTopCss);
  });

  it('the group\'s minimum clearance from the badge is preserved even when position (not name) is the higher of the two', () => {
    const result = computeCustomCollectionGroupAnchor(W, H, 'Xavi', 'ALL-ROUNDER');
    const { top } = groupBoundsCss(result, 'Xavi');
    const badgeBottomCss = H * (19.9 / 100);
    const clearanceCss = H * (3 / 100);
    expect(top).toBeGreaterThanOrEqual(badgeBottomCss + clearanceCss - 0.5);
  });

  it('a short name and a long name resolve to different anchors — the shift is recomputed per pair, not a fixed constant borrowed from one reference render', () => {
    const long = computeCustomCollectionGroupAnchor(W, H, 'Jacob Thompson', 'MIDFIELDER');
    const short = computeCustomCollectionGroupAnchor(W, H, 'Kai', 'GK');
    expect(long.nameTopPct).not.toBe(short.nameTopPct);
  });

  it('never mutates NAMEPLATE_NUMBER_GEOMETRY or NAMEPLATE_GEOMETRY — the kit number and the shared defaults stay fixed', () => {
    const beforeNumber = { ...NAMEPLATE_NUMBER_GEOMETRY };
    const beforeName = { ...NAMEPLATE_GEOMETRY.name };
    const beforePosition = { ...NAMEPLATE_GEOMETRY.position };
    computeCustomCollectionGroupAnchor(W, H, 'Jacob Thompson', 'MIDFIELDER');
    expect(NAMEPLATE_NUMBER_GEOMETRY).toEqual(beforeNumber);
    expect(NAMEPLATE_GEOMETRY.name).toEqual(beforeName);
    expect(NAMEPLATE_GEOMETRY.position).toEqual(beforePosition);
  });

  it('an undefined name or position does not throw', () => {
    expect(() => computeCustomCollectionGroupAnchor(W, H, undefined, 'MIDFIELDER')).not.toThrow();
    expect(() => computeCustomCollectionGroupAnchor(W, H, 'Jacob Thompson', undefined)).not.toThrow();
  });

  /**
   * "One source of truth" regression: the centring calculation and
   * nameplateSlotStyle (the function CardArt.tsx actually renders through)
   * must resolve position to the identical final font size — never a
   * formula computing against one size while the DOM paints another. This
   * pins that down end-to-end (group anchor -> nameplateSlotStyle's own
   * fontSize) rather than only asserting the intermediate fontSizeFactor.
   */
  it.each([
    ['Xavi', 'ALL-ROUNDER'],
    ['Jacob Thompson', 'ALL-ROUNDER'],
    ['Ollie Harrison', 'MIDFIELDER'],
    ['Jay', 'GOALKEEPER'],
  ])('the centring calculation\'s fontSizeFactor, run back through nameplateSlotStyle, renders the SAME position font size regardless of name (name=%s, position=%s)', (name, position) => {
    const result = computeCustomCollectionGroupAnchor(W, H, name, position);
    const style = nameplateSlotStyle('position', W, H, position, '#fff', {
      top: result.position.top,
      fontSizeFactor: result.position.fontSizeFactor,
    });
    const expectedFontSize = W * NAMEPLATE_GEOMETRY.position.fontSizeFactor * nameFitScale(position, NAMEPLATE_GEOMETRY.position.comfortableChars, NAMEPLATE_GEOMETRY.position.minScale);
    expect(style.fontSize).toBeCloseTo(expectedFontSize, 5);
  });
});

describe('the shared nameplate is actually used by every card the generalisation covers, and only those', () => {
  const cardArtSource = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  function bodyOf(fnName: string): string {
    const start = cardArtSource.indexOf(`function ${fnName}(`);
    expect(start, `${fnName} not found in CardArt.tsx`).toBeGreaterThan(-1);
    const nextFn = cardArtSource.indexOf('\nfunction ', start + 1);
    return cardArtSource.slice(start, nextFn === -1 ? undefined : nextFn);
  }

  it('HollinwoodCardArt, EmjflCardArt and CustomCollectionCardArt all call nameplateSlotStyle', () => {
    for (const fn of ['HollinwoodCardArt', 'EmjflCardArt', 'CustomCollectionCardArt']) {
      expect(bodyOf(fn)).toContain("nameplateSlotStyle('name'");
      expect(bodyOf(fn)).toContain("nameplateSlotStyle('position'");
    }
  });

  it('EMJFL keeps its own colour (white name, #FF4B1F position) — colour stays per-card, not shared', () => {
    const body = bodyOf('EmjflCardArt');
    expect(body).toContain("nameplateSlotStyle('name', W, H, d.name || '', '#fff', { top: `${EMJFL_NAME_TOP_PCT}%` })");
    expect(body).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#FF4B1F', { top: positionAnchor.top, fontSizeFactor: positionAnchor.fontSizeFactor })");
  });

  it('EMJFL passes its own reverted vertical anchor into computeAdaptivePositionAnchor, not the shared NAMEPLATE_GEOMETRY.name.top default', () => {
    const body = bodyOf('EmjflCardArt');
    expect(body).toContain('computeAdaptivePositionAnchor(W, H, d.name, positionLabel, EMJFL_NAME_TOP_PCT)');
  });

  it('Hollinwood keeps its own fixed red position colour, not template.accent', () => {
    const body = bodyOf('HollinwoodCardArt');
    expect(body).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#ff0000', { top: positionAnchor.top, fontSizeFactor: positionAnchor.fontSizeFactor })");
  });

  it('Hollinwood does NOT pass any vertical-anchor override into computeAdaptivePositionAnchor — it uses the shared NAMEPLATE_GEOMETRY.name.top default directly, since that default IS Hollinwood\'s own calibration', () => {
    const body = bodyOf('HollinwoodCardArt');
    expect(body).toContain('computeAdaptivePositionAnchor(W, H, d.name, positionLabel)');
    expect(body).not.toContain('computeAdaptivePositionAnchor(W, H, d.name, positionLabel, EMJFL_NAME_TOP_PCT)');
  });

  it('Hollinwood and EMJFL compute and pass the adaptive position anchor directly (the fix for position floating above a short name)', () => {
    for (const fn of ['HollinwoodCardArt', 'EmjflCardArt']) {
      const body = bodyOf(fn);
      expect(body).toContain('computeAdaptivePositionAnchor(');
      expect(body).toMatch(/nameplateSlotStyle\('position',[^)]*positionAnchor/);
    }
  });

  it('CustomCollectionCardArt uses its own group-centering anchor, not the plain adaptive anchor every other template uses unmodified', () => {
    const body = bodyOf('CustomCollectionCardArt');
    expect(body).toContain('computeCustomCollectionGroupAnchor(');
    expect(body).not.toContain('computeAdaptivePositionAnchor(');
    expect(body).toContain('groupAnchor.nameTopPct');
    expect(body).toContain('groupAnchor.position.top');
    expect(body).toContain('groupAnchor.position.fontSizeFactor');
    expect(body).toMatch(/nameplateSlotStyle\('name',[^)]*nameBoxOverride/);
    expect(body).toMatch(/nameplateSlotStyle\('position',[^)]*positionBoxOverride/);
  });

  it('CustomCollectionCardArt\'s nameBoxOverride is never conditionally undefined — the computed group top must always apply, not only when a variant also sets its own nameBox', () => {
    const body = bodyOf('CustomCollectionCardArt');
    expect(body).toMatch(/const nameBoxOverride: Partial<NameplateSlotGeometry> = \{/);
    expect(body).not.toMatch(/const nameBoxOverride: Partial<NameplateSlotGeometry> \| undefined/);
  });

  it('RealCardArt is untouched by the adaptive-anchor fix too — it never had position tied to nameplateSlotStyle in the first place', () => {
    expect(bodyOf('RealCardArt')).not.toContain('computeAdaptivePositionAnchor');
  });

  it('HollinwoodCardArt and EmjflCardArt also call nameplateNumberLayers for the kit number, each with its own outline colour', () => {
    expect(bodyOf('HollinwoodCardArt')).toContain("nameplateNumberLayers(W, d.number || '10', '#fff', template.accent)");
    expect(bodyOf('EmjflCardArt')).toContain("nameplateNumberLayers(W, d.number || '10', '#fff', '#FF4B1F')");
  });

  it('the kit number renders as two stacked layers (outline behind, fill on top), not a single stroked div', () => {
    // CustomCollectionCardArt's own "Custom" watermark (Comic-only, unrelated
    // decorative text) legitimately still uses WebkitTextStroke elsewhere in
    // the same function body, so this only checks that the *number* itself
    // (nameplateNumberLayers's own call + its two <span> layers) is present
    // and doesn't reintroduce a stroke there specifically.
    for (const fn of ['HollinwoodCardArt', 'EmjflCardArt', 'CustomCollectionCardArt']) {
      const body = bodyOf(fn);
      expect(body).toContain('numLayers.outline');
      expect(body).toContain('numLayers.fill');
      const numberSection = body.slice(body.indexOf('nameplateNumberLayers('), body.indexOf('numLayers.fill') + 'numLayers.fill'.length);
      expect(numberSection).not.toContain('WebkitTextStroke');
    }
  });

  it('CustomCollectionCardArt calls nameplateNumberLayers too, defaulting fill/outline to white/positionColor', () => {
    const body = bodyOf('CustomCollectionCardArt');
    expect(body).toContain('nameplateNumberLayers(');
    expect(body).toContain("variant.numberBox?.fillColor || '#fff'");
    expect(body).toContain('variant.numberBox?.strokeColor || positionColor');
  });

  it('RealCardArt (Futuristic/Vintage/Chrome/Champions/legacy-Galaxy) is untouched — horizontal, non-rotated text, a genuinely different structure, not on the shared nameplate', () => {
    const body = bodyOf('RealCardArt');
    expect(body).not.toContain('nameplateSlotStyle');
    expect(body).not.toContain('nameplateNumberLayers');
    expect(body).not.toContain(NAMEPLATE_FONT_FAMILY);
  });

  it('CustomCollectionCardBack (the back face) is untouched — centred horizontal name, not the front vertical nameplate', () => {
    // CustomCollectionCardBack is the function immediately preceding the
    // main CardArt export — locate it by its own distinguishing content
    // (nameBox.rotate is never set there) rather than by name, since back-
    // face renderers for different families share very similar bodies.
    const idx = cardArtSource.indexOf('export { RealCardBack, RealGalaxyBack, RealChromeBack }');
    expect(idx).toBeGreaterThan(-1);
    const backSection = cardArtSource.slice(cardArtSource.indexOf('CustomCollectionCardBack'), idx);
    expect(backSection).not.toContain('nameplateSlotStyle');
  });
});
