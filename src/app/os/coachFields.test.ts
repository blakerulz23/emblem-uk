import { describe, expect, it } from 'vitest';
import {
  AGE_GROUP_OPTIONS,
  FOOT_OPTIONS,
  POSITION_OPTIONS,
  formatFoot,
  formatFootballAgeGroup,
  formatHeightCm,
  positionLabel,
  validateHeightCm,
} from './coachFields';

describe('exact date of birth is not part of this module', () => {
  it('exposes no calculateAge/validateDateOfBirth/formatAge export', async () => {
    const mod = (await import('./coachFields')) as Record<string, unknown>;
    expect('calculateAge' in mod).toBe(false);
    expect('validateDateOfBirth' in mod).toBe(false);
    expect('formatAge' in mod).toBe(false);
  });
});

describe('validateHeightCm', () => {
  it('accepts an empty string (optional, clearable)', () => {
    expect(validateHeightCm('')).toBeNull();
  });

  it('rejects a non-numeric value', () => {
    expect(validateHeightCm('abc')).toMatch(/number/);
  });

  it('rejects a value below the plausible range', () => {
    expect(validateHeightCm('40')).toMatch(/between/);
  });

  it('rejects a value above the plausible range', () => {
    expect(validateHeightCm('300')).toMatch(/between/);
  });

  it('accepts a value inside the plausible range', () => {
    expect(validateHeightCm('138')).toBeNull();
  });

  it('accepts the exact boundary values (80 and 220)', () => {
    expect(validateHeightCm('80')).toBeNull();
    expect(validateHeightCm('220')).toBeNull();
  });
});

describe('format helpers — never 0, never a raw fallback, always "Not set"', () => {
  it('formatHeightCm', () => {
    expect(formatHeightCm(null)).toBe('Not set');
    expect(formatHeightCm(138)).toBe('138 cm');
  });

  it('formatFoot', () => {
    expect(formatFoot(null)).toBe('Not set');
    expect(formatFoot('Both')).toBe('Both');
  });

  it('formatFootballAgeGroup', () => {
    expect(formatFootballAgeGroup(null)).toBe('Not set');
    expect(formatFootballAgeGroup('U10')).toBe('U10');
  });
});

describe('option lists — match the DB check constraints in 0036_player_coach_fields_secure_expand.sql', () => {
  it('AGE_GROUP_OPTIONS is exactly U7 through U18', () => {
    expect(AGE_GROUP_OPTIONS).toEqual(['U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18']);
  });

  it('FOOT_OPTIONS is exactly Left/Right/Both', () => {
    expect(FOOT_OPTIONS).toEqual(['Left', 'Right', 'Both']);
  });

  it('POSITION_OPTIONS has exactly the fifteen codes the secondary_position constraint allows', () => {
    expect(POSITION_OPTIONS.map((p) => p.code).sort()).toEqual(
      ['CAM', 'CB', 'CDM', 'CF', 'CM', 'GK', 'LB', 'LM', 'LW', 'LWB', 'RB', 'RM', 'RW', 'RWB', 'ST'].sort()
    );
  });
});

describe('positionLabel', () => {
  it('returns "Not set" for null', () => {
    expect(positionLabel(null)).toBe('Not set');
  });

  it('returns the full label for a known code', () => {
    expect(positionLabel('CDM')).toBe('Defensive Midfielder');
  });

  it('falls back to the raw code for an unrecognized value rather than throwing', () => {
    expect(positionLabel('XX')).toBe('XX');
  });
});
