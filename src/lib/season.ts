/**
 * Free-text UK football season string (e.g. "2026/27"), matching the
 * convention CreateTeamOnboarding.tsx already uses for teams.season.
 * Season runs Aug–May — before August, the current calendar year is
 * still inside the previous season.
 */
export function currentUkFootballSeason(date: Date = new Date()): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 7 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}
