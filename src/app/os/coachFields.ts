/**
 * Shared, zero-import definitions for the five coach-managed player fields
 * (date of birth / football age group / height / preferred foot / secondary
 * position) — deliberately its own file with no imports so it (and its own
 * test file) can be imported by this project's JSX-free vitest config
 * without pulling in anything React/Supabase (see refreshGeometry.ts for
 * the established reason this pattern exists in this codebase).
 *
 * Every option list here is the client-side mirror of a real constraint in
 * supabase/migrations/0036_player_coach_fields_secure_expand.sql — kept in sync
 * by hand, not generated, matching how this codebase already hand-maintains
 * its Supabase row-shape types elsewhere (src/lib/os-data.ts) rather than
 * using `supabase gen types`. The database is still the source of truth:
 * these lists exist so the UI can offer the right choices and give an
 * inline error before a round trip, not as a substitute for
 * update_player_coach_fields' own server-side validation.
 */

export type PreferredFoot = 'Left' | 'Right' | 'Both';

export const FOOT_OPTIONS: PreferredFoot[] = ['Left', 'Right', 'Both'];

/** Matches players_football_age_group_valid in 0036_player_coach_fields_secure_expand.sql. */
export const AGE_GROUP_OPTIONS: string[] = ['U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18'];

/** Matches players_secondary_position_valid in 0036_player_coach_fields_secure_expand.sql. */
export const POSITION_OPTIONS: { code: string; label: string }[] = [
  { code: 'GK', label: 'Goalkeeper' },
  { code: 'CB', label: 'Centre Back' },
  { code: 'LB', label: 'Left Back' },
  { code: 'RB', label: 'Right Back' },
  { code: 'LWB', label: 'Left Wing Back' },
  { code: 'RWB', label: 'Right Wing Back' },
  { code: 'CDM', label: 'Defensive Midfielder' },
  { code: 'CM', label: 'Central Midfielder' },
  { code: 'CAM', label: 'Attacking Midfielder' },
  { code: 'LM', label: 'Left Midfielder' },
  { code: 'RM', label: 'Right Midfielder' },
  { code: 'LW', label: 'Left Winger' },
  { code: 'RW', label: 'Right Winger' },
  { code: 'CF', label: 'Centre Forward' },
  { code: 'ST', label: 'Striker' },
];

export function positionLabel(code: string | null): string {
  if (!code) return 'Not set';
  return POSITION_OPTIONS.find((p) => p.code === code)?.label ?? code;
}

export const MIN_HEIGHT_CM = 80;
export const MAX_HEIGHT_CM = 220;
const MIN_PLAUSIBLE_AGE = 3;
const MAX_PLAUSIBLE_AGE = 19;

/** Whole years as of `today` (defaults to the real current date — a
 * parameter only so this stays a pure, testable function). Mirrors
 * update_player_coach_fields' own age(current_date, dob) computation and
 * get_player_age's — kept in sync by hand, same reasoning as the option
 * lists above. */
export function calculateAge(dobIso: string | null, today: Date = new Date()): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const hasHadBirthdayThisYear =
    today.getUTCMonth() > dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() >= dob.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/** Null (never a message) means valid. today defaults to the real current
 * date for the same reason as calculateAge — a parameter only for tests. */
export function validateDateOfBirth(dobIso: string, today: Date = new Date()): string | null {
  const d = new Date(dobIso);
  if (Number.isNaN(d.getTime())) return "That date doesn't look right.";
  if (d.getTime() > today.getTime()) return 'Date of birth can’t be in the future.';
  const age = calculateAge(dobIso, today);
  if (age === null || age < MIN_PLAUSIBLE_AGE || age > MAX_PLAUSIBLE_AGE) return `Check the year — that would make them ${age}.`;
  return null;
}

export function validateHeightCm(raw: string): string | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return 'Enter a number.';
  if (n < MIN_HEIGHT_CM || n > MAX_HEIGHT_CM) return `Enter a height between ${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM}cm.`;
  return null;
}

export function formatAge(age: number | null): string {
  return age === null ? 'Not set' : String(age);
}

export function formatHeightCm(cm: number | null): string {
  return cm === null ? 'Not set' : `${cm} cm`;
}

export function formatFoot(foot: PreferredFoot | null): string {
  return foot ?? 'Not set';
}

export function formatFootballAgeGroup(group: string | null): string {
  return group ?? 'Not set';
}
