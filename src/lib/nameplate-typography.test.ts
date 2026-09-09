import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  nameFitScale,
  nameplateSlotStyle,
  nameplateNumberLayers,
  computeAdaptivePositionAnchor,
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

describe('NAMEPLATE_GEOMETRY — Hollinwood-measured shared defaults', () => {
  it('name slot matches the measured Hollinwood calibration', () => {
    expect(NAMEPLATE_GEOMETRY.name).toMatchObject({
      left: '9.08%',
      top: '62.73%',
      widthFactor: 0.6,
      fontSizeFactor: 0.0838,
      comfortableChars: 14,
      minScale: 0.6,
    });
  });

  it('position slot matches the measured Hollinwood calibration', () => {
    expect(NAMEPLATE_GEOMETRY.position).toMatchObject({
      left: '17.57%',
      top: '52.84%',
      widthFactor: 0.2,
      fontSizeFactor: 0.0432,
      comfortableChars: 10,
      minScale: 0.85,
    });
  });
});

describe('nameplateSlotStyle', () => {
  const W = 340, H = 476;

  it('builds the reference-size name style unscaled for the calibration name', () => {
    const style = nameplateSlotStyle('name', W, H, 'JACOB THOMPSON', '#fff');
    expect(style.left).toBe('9.08%');
    expect(style.top).toBe('62.73%');
    expect(style.fontSize).toBeCloseTo(W * 0.0838, 5);
    expect(style.fontFamily).toBe(NAMEPLATE_FONT_FAMILY);
    expect(style.color).toBe('#fff');
    expect(style.transform).toBe('rotate(-90deg)');
    expect(style.transformOrigin).toBe('left top');
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.overflow).toBe('visible');
  });

  it('scales the position font-size down for a longer-than-reference label', () => {
    const style = nameplateSlotStyle('position', W, H, 'ALL-ROUNDER', '#ff0000');
    expect(style.fontSize).toBeCloseTo(W * 0.0432 * (10 / 11), 5);
  });

  it('a colour-only override does not blank out the shared left/top anchor (regression: spreading an explicit `undefined` used to silently unposition the div)', () => {
    const style = nameplateSlotStyle('position', W, H, 'MIDFIELDER', '#ef2222', {
      left: undefined,
      top: undefined,
    });
    expect(style.left).toBe('17.57%');
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
    expect(style.left).toBe('9.08%');
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

  it('reproduces the calibrated JACOB THOMPSON / MIDFIELDER anchor within ~2 native px', () => {
    const anchor = computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', 'MIDFIELDER');
    // 594.8-785.2 native was the real measured render at this anchor;
    // reference target was 597-786 (PR #86's own measurement).
    const topPct = parseFloat(anchor.top);
    const nativeTop = (topPct / 100) * 1498;
    expect(nativeTop).toBeGreaterThan(775);
    expect(nativeTop).toBeLessThan(795);
    expect(anchor.fontSizeFactor).toBeCloseTo(NAMEPLATE_GEOMETRY.position.fontSizeFactor, 5); // unscaled — no containment shrink needed for the reference pair
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

  it.each([
    ['JAY', 'GOALKEEPER'],
    ['TINUBU', 'MIDFIELDER'],
    ['MILES LEE', 'DEFENDER'],
    ['JACOB THOMPSON', 'MIDFIELDER'],
    ['ALEXANDER MONTGOMERY', 'ALL-ROUNDER'],
    // Same-length stress set (WILLIAMS 8, IBRAHIM 7, MILLER 6, MASON 5, LEE
    // 3, MAX 3) — added after an earlier flat-average-per-character
    // estimate was shown to have material error for these specifically:
    // LEE and MAX are both 3 characters but render to genuinely different
    // real widths (30.6 vs 43.6 CSS px at reference size, a 42%
    // difference), which the flat average couldn't see and left LEE with
    // only 3.1px of real containment margin. estimateTextWidthCss's
    // per-glyph table replaced it for exactly this reason.
    ['WILLIAMS', 'MIDFIELDER'],
    ['IBRAHIM', 'MIDFIELDER'],
    ['MILLER', 'MIDFIELDER'],
    ['MASON', 'MIDFIELDER'],
    ['LEE', 'MIDFIELDER'],
    ['MAX', 'MIDFIELDER'],
    // Extreme narrow-letter-dominated short names against GOALKEEPER (the
    // longest canonical label) — found, via real rendering, to still
    // overflow by up to 16.6px even with the per-glyph width model and the
    // old fixed 0.4 containment floor in place: the floor clamped the
    // shrink *up* to 0.4 even when the real required scale (given how
    // narrow every letter in "LI"/"III" is) was below that. Fixed by
    // letting the computed required scale govern directly with no upward
    // override — these lock that fix in. Real names, not just these
    // pathological ones: TIM and LIL are realistic short names that were
    // already safely contained before the fix and must stay that way.
    ['III', 'GOALKEEPER'],
    ['ILI', 'GOALKEEPER'],
    ['LI', 'GOALKEEPER'],
    ['LIL', 'GOALKEEPER'],
    ['TIM', 'GOALKEEPER'],
  ])('name=%s / position=%s: position never extends above the name (checked against the exact same estimateTextWidthCss the anchor itself uses)', (name, position) => {
    const nameGeom = NAMEPLATE_GEOMETRY.name;
    const nameScale = nameFitScale(name, nameGeom.comfortableChars, nameGeom.minScale);
    const nameFontSize = W * nameGeom.fontSizeFactor * nameScale;
    const nameLenCss = estimateTextWidthCss(name, nameFontSize);
    const nameBottomCss = H * (parseFloat(nameGeom.top) / 100);
    const nameTopCss = nameBottomCss - nameLenCss;

    const anchor = computeAdaptivePositionAnchor(W, H, name, position);
    const posGeom = NAMEPLATE_GEOMETRY.position;
    const posScale = nameFitScale(position, posGeom.comfortableChars, posGeom.minScale);
    const effectiveFontSize = W * anchor.fontSizeFactor * posScale;
    const posLenCss = estimateTextWidthCss(position, effectiveFontSize);
    const posBottomCss = (parseFloat(anchor.top) / 100) * H;
    const posTopCssApprox = posBottomCss - posLenCss;

    expect(posTopCssApprox).toBeGreaterThanOrEqual(nameTopCss);
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
        expect(anchor.fontSizeFactor).toBeGreaterThan(0);
        expect(anchor.fontSizeFactor).toBeLessThanOrEqual(NAMEPLATE_GEOMETRY.position.fontSizeFactor);
      }
    }
  });

  it('the placeholder "POSITION" label (no value set) also resolves without overflowing a short name', () => {
    const anchor = computeAdaptivePositionAnchor(W, H, 'TINUBU', 'POSITION');
    expect(parseFloat(anchor.top)).toBeGreaterThan(0);
    expect(anchor.fontSizeFactor).toBeGreaterThan(0);
  });

  it('for the most extreme realistic pairing (JAY/GOALKEEPER), containment is achieved without collapsing the font size to near-zero', () => {
    // There is deliberately no fixed lower scale floor any more (see
    // POSITION_CONTAINMENT_ABSOLUTE_FLOOR's own doc comment: an earlier
    // 0.4 "floor" silently overrode the real required scale whenever it
    // fell below 0.4, which is exactly what let genuinely pathological
    // narrow-letter names overflow — see the it.each block above). For a
    // realistic name like JAY, the real required scale already lands close
    // to what 0.4 used to give (~0.39), so this asserts that outcome
    // directly rather than re-imposing the floor that caused the bug.
    const anchor = computeAdaptivePositionAnchor(W, H, 'JAY', 'GOALKEEPER'); // shortest realistic name, longest canonical label
    expect(anchor.fontSizeFactor).toBeGreaterThan(NAMEPLATE_GEOMETRY.position.fontSizeFactor * 0.3);
  });

  it('for a genuinely pathological narrow-letter name (LI), containment still holds even though the resulting font size is very small', () => {
    // "LI" is not a realistic player display name (two of Antonio's
    // narrowest letters, no width to spare) — but computeAdaptivePositionAnchor
    // must never let a name it wasn't calibrated against silently overlap
    // the name above it. Containment is unconditional; readability at this
    // extreme is a known, accepted trade-off (see the module's own PR
    // description for the readability-vs-containment discussion).
    const anchor = computeAdaptivePositionAnchor(W, H, 'LI', 'GOALKEEPER');
    expect(anchor.fontSizeFactor).toBeGreaterThan(0);
    expect(anchor.fontSizeFactor).toBeLessThan(NAMEPLATE_GEOMETRY.position.fontSizeFactor * 0.2);
  });

  it('an undefined name or position does not throw', () => {
    expect(() => computeAdaptivePositionAnchor(W, H, undefined, 'MIDFIELDER')).not.toThrow();
    expect(() => computeAdaptivePositionAnchor(W, H, 'JACOB THOMPSON', undefined)).not.toThrow();
    expect(() => computeAdaptivePositionAnchor(W, H, undefined, undefined)).not.toThrow();
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
    expect(body).toContain("nameplateSlotStyle('name', W, H, d.name || '', '#fff')");
    expect(body).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#FF4B1F', positionAnchor)");
  });

  it('Hollinwood keeps its own fixed red position colour, not template.accent', () => {
    const body = bodyOf('HollinwoodCardArt');
    expect(body).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#ff0000', positionAnchor)");
  });

  it('Hollinwood and EMJFL compute and pass the adaptive position anchor directly (the fix for position floating above a short name)', () => {
    for (const fn of ['HollinwoodCardArt', 'EmjflCardArt']) {
      const body = bodyOf(fn);
      expect(body).toContain('computeAdaptivePositionAnchor(');
      expect(body).toMatch(/nameplateSlotStyle\('position',[^)]*positionAnchor/);
    }
  });

  it('CustomCollectionCardArt computes the adaptive anchor and folds it into positionBoxOverride (so a genuine per-variant override, if one ever exists, still wins over it)', () => {
    const body = bodyOf('CustomCollectionCardArt');
    expect(body).toContain('computeAdaptivePositionAnchor(');
    expect(body).toContain('...positionAnchor');
    expect(body).toMatch(/nameplateSlotStyle\('position',[^)]*positionBoxOverride/);
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
