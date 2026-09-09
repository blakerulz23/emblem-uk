import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { nameFitScale, nameplateSlotStyle, NAMEPLATE_GEOMETRY, NAMEPLATE_FONT_FAMILY } from './nameplate-typography';

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
    expect(body).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#FF4B1F')");
  });

  it('Hollinwood keeps its own fixed red position colour, not template.accent', () => {
    const body = bodyOf('HollinwoodCardArt');
    expect(body).toContain("nameplateSlotStyle('position', W, H, positionLabel, '#ff0000')");
  });

  it('RealCardArt (Futuristic/Vintage/Chrome/Champions/legacy-Galaxy) is untouched — horizontal, non-rotated text, a genuinely different structure, not on the shared nameplate', () => {
    const body = bodyOf('RealCardArt');
    expect(body).not.toContain('nameplateSlotStyle');
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
