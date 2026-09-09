import { describe, expect, it } from 'vitest';
import {
  CANONICAL_POSITIONS,
  isCanonicalPosition,
  POSITION_CARD_LABEL,
  POSITION_DISPLAY_LABEL,
  POSITION_OPTIONS,
  positionCardLabel,
  positionDisplayLabel,
  resolveCanonicalPosition,
} from './player-position';

describe('the five canonical positions', () => {
  it('are exactly these five, in this order — the customer-facing choices the task specifies', () => {
    expect(CANONICAL_POSITIONS).toEqual(['goalkeeper', 'defender', 'midfielder', 'forward', 'all_rounder']);
  });

  it('POSITION_OPTIONS mirrors CANONICAL_POSITIONS with sentence-case labels, for a builder/Coach OS <select>', () => {
    expect(POSITION_OPTIONS).toEqual([
      { value: 'goalkeeper', label: 'Goalkeeper' },
      { value: 'defender', label: 'Defender' },
      { value: 'midfielder', label: 'Midfielder' },
      { value: 'forward', label: 'Forward' },
      { value: 'all_rounder', label: 'All-rounder' },
    ]);
  });

  it('never uses GK/DEF/MID/FWD/ALL abbreviations anywhere in either label mapping', () => {
    const forbidden = ['GK', 'DEF', 'MID', 'FWD', 'ALL'];
    for (const value of CANONICAL_POSITIONS) {
      expect(forbidden).not.toContain(POSITION_DISPLAY_LABEL[value]);
      expect(forbidden).not.toContain(POSITION_CARD_LABEL[value]);
    }
  });

  it('card labels are the full word, uppercase — never abbreviated', () => {
    expect(POSITION_CARD_LABEL.goalkeeper).toBe('GOALKEEPER');
    expect(POSITION_CARD_LABEL.defender).toBe('DEFENDER');
    expect(POSITION_CARD_LABEL.midfielder).toBe('MIDFIELDER');
    expect(POSITION_CARD_LABEL.forward).toBe('FORWARD');
    expect(POSITION_CARD_LABEL.all_rounder).toBe('ALL-ROUNDER');
  });
});

describe('isCanonicalPosition', () => {
  it('accepts exactly the five internal values', () => {
    for (const value of CANONICAL_POSITIONS) expect(isCanonicalPosition(value)).toBe(true);
  });

  it('rejects display labels, legacy codes, blanks and unrelated strings', () => {
    expect(isCanonicalPosition('Goalkeeper')).toBe(false);
    expect(isCanonicalPosition('GK')).toBe(false);
    expect(isCanonicalPosition('')).toBe(false);
    expect(isCanonicalPosition(null)).toBe(false);
    expect(isCanonicalPosition(undefined)).toBe(false);
    expect(isCanonicalPosition('goalkeeper ')).toBe(false); // untrimmed
  });
});

describe('resolveCanonicalPosition — legacy mapping (task-specified)', () => {
  it('maps GK to goalkeeper', () => {
    expect(resolveCanonicalPosition('GK')).toBe('goalkeeper');
  });

  it('maps RB, CB and LB to defender', () => {
    expect(resolveCanonicalPosition('RB')).toBe('defender');
    expect(resolveCanonicalPosition('CB')).toBe('defender');
    expect(resolveCanonicalPosition('LB')).toBe('defender');
  });

  it('maps CDM, CM and CAM to midfielder', () => {
    expect(resolveCanonicalPosition('CDM')).toBe('midfielder');
    expect(resolveCanonicalPosition('CM')).toBe('midfielder');
    expect(resolveCanonicalPosition('CAM')).toBe('midfielder');
  });

  it('maps RW, LW and ST to forward', () => {
    expect(resolveCanonicalPosition('RW')).toBe('forward');
    expect(resolveCanonicalPosition('LW')).toBe('forward');
    expect(resolveCanonicalPosition('ST')).toBe('forward');
  });

  it('is case-insensitive and trims whitespace on legacy codes', () => {
    expect(resolveCanonicalPosition('gk')).toBe('goalkeeper');
    expect(resolveCanonicalPosition('  CB  ')).toBe('defender');
  });

  it('passes an already-canonical value straight through', () => {
    expect(resolveCanonicalPosition('defender')).toBe('defender');
  });

  it('never maps a missing or unknown value to all_rounder or any other guess — returns null instead', () => {
    expect(resolveCanonicalPosition(null)).toBeNull();
    expect(resolveCanonicalPosition(undefined)).toBeNull();
    expect(resolveCanonicalPosition('')).toBeNull();
    expect(resolveCanonicalPosition('   ')).toBeNull();
    // Codes that exist in Coach OS's own 15-value secondary-position list
    // but were never part of the old builder's 10-value primary list —
    // e.g. Left Wing Back — must not be silently absorbed here either.
    expect(resolveCanonicalPosition('LWB')).toBeNull();
    expect(resolveCanonicalPosition('RWB')).toBeNull();
    expect(resolveCanonicalPosition('LM')).toBeNull();
    expect(resolveCanonicalPosition('RM')).toBeNull();
    expect(resolveCanonicalPosition('CF')).toBeNull();
    expect(resolveCanonicalPosition('some garbled legacy value')).toBeNull();
  });
});

describe('positionDisplayLabel — Player OS / Coach OS / staff, friendly live display', () => {
  it('shows the simplified category for a canonical value', () => {
    expect(positionDisplayLabel('midfielder')).toBe('Midfielder');
    expect(positionDisplayLabel('all_rounder')).toBe('All-rounder');
  });

  it('shows the simplified category for a recognised legacy code — a live profile, not frozen artwork, so this friendly translation is correct here', () => {
    expect(positionDisplayLabel('CB')).toBe('Defender');
    expect(positionDisplayLabel('ST')).toBe('Forward');
  });

  it('shows an unrecognised value as-is rather than hiding it', () => {
    expect(positionDisplayLabel('Sweeper')).toBe('Sweeper');
  });

  it('returns an empty string for nothing stored, never a placeholder word baked into the function', () => {
    expect(positionDisplayLabel(null)).toBe('');
    expect(positionDisplayLabel(undefined)).toBe('');
    expect(positionDisplayLabel('')).toBe('');
  });
});

describe('positionCardLabel — card artwork, approved-card compatibility', () => {
  it('renders the full uppercase word for a canonical value — a new or re-approved submission', () => {
    expect(positionCardLabel('goalkeeper')).toBe('GOALKEEPER');
    expect(positionCardLabel('all_rounder')).toBe('ALL-ROUNDER');
  });

  it('never translates a legacy code through the simplification — an already-approved card must keep showing its original specialist label unchanged, not "DEFENDER"', () => {
    expect(positionCardLabel('CB')).toBe('CB');
    expect(positionCardLabel('ST')).toBe('ST');
    expect(positionCardLabel('cdm')).toBe('CDM');
  });

  it('uppercases an unrecognised value without otherwise changing its wording', () => {
    expect(positionCardLabel('Sweeper')).toBe('SWEEPER');
  });

  it('uses the given fallback (or "POSITION") for nothing stored', () => {
    expect(positionCardLabel(null)).toBe('POSITION');
    expect(positionCardLabel(undefined, 'POS')).toBe('POS');
    expect(positionCardLabel('')).toBe('POSITION');
  });

  it('is a pure function — same input always produces the same output', () => {
    expect(positionCardLabel('midfielder')).toBe(positionCardLabel('midfielder'));
  });
});
