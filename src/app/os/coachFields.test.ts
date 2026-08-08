import { describe, expect, it } from 'vitest';
import {
  AGE_GROUP_OPTIONS,
  FOOT_OPTIONS,
  POSITION_OPTIONS,
  calculateAge,
  formatAge,
  formatFoot,
  formatFootballAgeGroup,
  formatHeightCm,
  positionLabel,
  validateDateOfBirth,
  validateHeightCm,
} from './coachFields';

const REFERENCE_TODAY = new Date('2026-08-08T12:00:00Z');

describe('calculateAge', () => {
  it('returns null for no date of birth — never 0', () => {
    expect(calculateAge(null, REFERENCE_TODAY)).toBeNull();
  });

  it('returns null for an unparsable date', () => {
    expect(calculateAge('not-a-date', REFERENCE_TODAY)).toBeNull();
  });

  it('counts a full year once the birthday has passed this year', () => {
    expect(calculateAge('2016-03-20', REFERENCE_TODAY)).toBe(10);
  });

  it('does not count this year until the birthday has actually happened', () => {
    expect(calculateAge('2016-09-12', REFERENCE_TODAY)).toBe(9);
  });

  it('handles a birthday that is today exactly', () => {
    expect(calculateAge('2018-08-08', REFERENCE_TODAY)).toBe(8);
  });

  it('demonstrates the "playing up" scenario: a young calculated age with an older assigned group is just two independent facts', () => {
    // DOB implies 8, nothing here computes or infers the assigned group —
    // that's a separate, coach-set value entirely (football_age_group).
    expect(calculateAge('2018-01-15', REFERENCE_TODAY)).toBe(8);
  });
});

describe('validateDateOfBirth', () => {
  it('rejects an unparsable date', () => {
    expect(validateDateOfBirth('not-a-date', REFERENCE_TODAY)).toMatch(/doesn.t look right/);
  });

  it('rejects a date in the future', () => {
    expect(validateDateOfBirth('2027-01-01', REFERENCE_TODAY)).toMatch(/future/);
  });

  it('rejects an implausibly old date (outside 3–19)', () => {
    expect(validateDateOfBirth('1990-01-01', REFERENCE_TODAY)).toMatch(/Check the year/);
  });

  it('rejects an implausibly young date (under 3)', () => {
    expect(validateDateOfBirth('2025-01-01', REFERENCE_TODAY)).toMatch(/Check the year/);
  });

  it('accepts a plausible youth-football date of birth', () => {
    expect(validateDateOfBirth('2016-03-20', REFERENCE_TODAY)).toBeNull();
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
  it('formatAge', () => {
    expect(formatAge(null)).toBe('Not set');
    expect(formatAge(0)).toBe('0'); // a genuine age of 0 is a real value, distinct from "unset"
    expect(formatAge(10)).toBe('10');
  });

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
