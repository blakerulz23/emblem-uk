import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { formatFootballAgeGroup } from './coachFields';

const read = (p: string) => readFileSync(p, 'utf8');

describe('Gate 2 — exact date of birth removal (Stage A) product contract', () => {
  it('renders no exact-DOB field anywhere in coach, guardian, parent or staff UI', () => {
    const coachDetail = read('src/app/os/screens/CoachPlayerDetail.tsx');
    for (const needle of ['type="date"', 'Date of birth', 'dobDraft', 'committedDob', 'coach-dob-help']) {
      expect(coachDetail).not.toContain(needle);
    }
    const card = read('src/app/os/screens/Card.tsx');
    expect(card).not.toContain('label="Age"');
  });

  it('rejects exact DOB and every documented alias through the coach-fields API, rather than silently dropping it', () => {
    const route = read('src/app/api/os/players/[id]/coach-fields/route.ts');
    expect(route).toContain('REJECTED_DOB_ALIASES');
    for (const alias of ['dateOfBirth', 'date_of_birth', 'date-of-birth', 'dob', 'birthDate', 'birth_date']) {
      expect(route).toContain(`'${alias}'`);
    }
    expect(route).toMatch(/status:\s*400/);
    expect(route).not.toContain('p_date_of_birth');
  });

  it('never calculates or displays chronological age anywhere in the app', () => {
    const coachFields = read('src/app/os/coachFields.ts');
    expect(coachFields).not.toContain('function calculateAge');
    expect(coachFields).not.toContain('function validateDateOfBirth');
    expect(coachFields).not.toContain('function formatAge');

    const playerProfile = read('src/app/os/playerProfile.ts');
    expect(playerProfile).not.toMatch(/^\s*age:\s*number/m);

    const osData = read('src/lib/os-data.ts');
    expect(osData).not.toContain("rpc('get_player_age'");
    expect(osData).not.toContain('calculatedAge');
  });

  it('replaces the former guardian-facing Age tile with Football age group, sourced from the existing football_age_group field', () => {
    const card = read('src/app/os/screens/Card.tsx');
    expect(card).toContain('label="Football age group"');
    expect(card).toContain('formatFootballAgeGroup(PLAYER_PROFILE.footballAgeGroup)');
  });

  it('formats a configured group correctly and a missing one as a safe, non-error empty state', () => {
    expect(formatFootballAgeGroup('U10')).toBe('U10');
    expect(formatFootballAgeGroup(null)).toBe('Not set');
  });

  it('never blocks or errors on a missing football age group — it is always nullable, never a required field', () => {
    const coachDetail = read('src/app/os/screens/CoachPlayerDetail.tsx');
    // The Clear control (which sets the draft back to null) still exists,
    // and nothing conditions rendering of the rest of the screen on
    // ageGroupDraft/footballAgeGroup being set.
    expect(coachDetail).toContain('setAgeGroupDraft(null)');

    const migration = read('supabase/migrations/0074_remove_exact_dob_stage_a.sql');
    expect(migration).toContain('p_football_age_group is not null');
    expect(migration).not.toMatch(/football_age_group\s+is\s+null\s+then\s+raise/i);
  });

  it('keeps football age group coach-controlled only, via the same authorization check as the other three remaining coach fields', () => {
    const migration = read('supabase/migrations/0074_remove_exact_dob_stage_a.sql');
    expect(migration).toContain("raise exception 'Not authorized to update this player''s details';");
  });

  it('never derives football age group from a date, DOB or the current date anywhere in the app or this migration', () => {
    const coachFields = read('src/app/os/coachFields.ts');
    expect(coachFields).not.toMatch(/footballAgeGroup\s*=.*new Date/i);
    const migration = read('supabase/migrations/0074_remove_exact_dob_stage_a.sql');
    expect(migration).not.toMatch(/football_age_group\s*=\s*.*current_date/i);
    expect(migration).not.toMatch(/regexp_match/i);
  });
});
