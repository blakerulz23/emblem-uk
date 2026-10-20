import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_NAME_MAX_CHARS, playerNameLength, playerNameTooLong } from './player-name';
import { BACK_NAME_HEIGHT_CAP, BACK_NAME_SAFE_WIDTH, backNameWidthEm, customBackNameFontSize, estimateTextWidthCss } from './nameplate-typography';
import { createPlayer, derivePlayerStatus as playerStatus } from './emblem-uk-builder';

const W = 340;
const BASE = W * 0.098 * 0.9; // the back's previous base size (no per-template override)
const NAMES = ['Test', 'Zoë', "O'Brien", 'Anna-Louise', 'José María', 'Christopher', 'Wojciechowski', 'Maximilian-Alexander',
  "Siobhán O'Donoghue-Kerr", 'Alexander-Christopherson', 'Mary Jane Montgomery-Wai', 'WWWWWWWWWWWWWWWWWWWWWWWW', 'MMMMMMMMMMMMMMMMMMMMMMMM'];

describe('player name limit', () => {
  it('is 24 characters, counted in code points after trimming', () => {
    expect(PLAYER_NAME_MAX_CHARS).toBe(24);
    expect(playerNameLength('  Zoë  ')).toBe(3);
    expect(playerNameLength('Zoe\u0308')).toBe(3); // combining accent normalised
    expect(playerNameTooLong('Alexander-Christopherson')).toBe(false); // 24
    expect(playerNameTooLong('Alexander-Christophersons')).toBe(true); // 25
    expect(playerNameTooLong(null)).toBe(false);
  });

  it('an over-long name (e.g. from an older device draft) needs editing before the card can be approved', () => {
    const base = createPlayer({ name: 'Riley', position: 'MID', kitNo: '7' });
    const withPhoto = { ...base, photo: { srcUrl: 'blob:x', hiResUrl: 'blob:x', crop: { x: 0, y: 0, scale: 1 } } } as typeof base;
    expect(playerStatus(withPhoto)).not.toBe('needs-details');
    expect(playerStatus({ ...withPhoto, name: 'Alexander-Christophersons' })).toBe('needs-details');
    // Even a card approved in an older draft must be edited first.
    expect(playerStatus({ ...withPhoto, name: 'Alexander-Christophersons', approvedAt: withPhoto.updatedAt })).toBe('needs-details');
    expect(playerStatus({ ...withPhoto, approvedAt: withPhoto.updatedAt })).toBe('approved');
  });
});

describe('Custom Collection back name: Antonio Bold sized from measured width', () => {
  it('every name up to 24 characters fits one line within 62% of the card', () => {
    for (const name of NAMES) {
      const size = customBackNameFontSize(name, W, BASE);
      expect(backNameWidthEm(name) * size, name).toBeLessThanOrEqual(W * BACK_NAME_SAFE_WIDTH + 0.01);
    }
  });

  it('never exceeds the height cap that keeps it clear of SIGNATURE COLLECTION', () => {
    for (const name of NAMES) expect(customBackNameFontSize(name, W, BASE), name).toBeLessThanOrEqual(BASE * BACK_NAME_HEIGHT_CAP + 1e-9);
    expect(customBackNameFontSize('Test', W, BASE)).toBeCloseTo(BASE * BACK_NAME_HEIGHT_CAP, 6); // short names keep the capped size
  });

  it('measures accented letters as their base letter, and is case-insensitive', () => {
    expect(backNameWidthEm('ZOË')).toBeCloseTo(backNameWidthEm('ZOE'), 10);
    expect(backNameWidthEm('José')).toBeCloseTo(backNameWidthEm('JOSE'), 10);
    expect(backNameWidthEm('anna-louise')).toBeCloseTo(backNameWidthEm('ANNA-LOUISE'), 10);
  });

  it('leaves the card fronts\' existing width measurement unchanged', () => {
    // estimateTextWidthCss (fronts) still uses the raw table: an accented letter falls back, as before.
    expect(estimateTextWidthCss('É', 1)).toBeCloseTo(0.4589, 4);
    expect(estimateTextWidthCss('E', 1)).toBeCloseTo(0.3906, 4);
  });
});

describe('wiring', () => {
  const art = readFileSync('src/components/builder/emblem/CardArt.tsx', 'utf8');
  const back = art.slice(art.indexOf('function CustomCollectionCardBack('), art.indexOf('export { RealCardBack'));
  it('the Custom Collection back uses Antonio Bold and the measured-width size', () => {
    expect(back).toContain('fontFamily: NAMEPLATE_FONT_FAMILY,');
    expect(back).toContain('fontWeight: NAMEPLATE_FONT_WEIGHT,');
    expect(back).toMatch(/fontSize: customBackNameFontSize\(playerName, W, W \* \(nameBox\.fontSize \? Number\(nameBox\.fontSize\) : 0\.098\) \* 0\.9\)/);
    expect(back).toContain("whiteSpace: 'nowrap'");
    expect(back).not.toContain('--font-oswald');
  });
  it('fronts still use the shared nameplate slot (unchanged)', () => {
    expect(art).toContain("nameplateSlotStyle('name', W, H, playerName, nameColor, nameBoxOverride, {");
  });
  it('builder name inputs enforce the limit and explain it', () => {
    const b = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
    expect(b.match(/maxLength=\{PLAYER_NAME_MAX_CHARS\}/g)?.length).toBe(2);
    expect(b).toContain('up to ${PLAYER_NAME_MAX_CHARS} characters');
  });
});
