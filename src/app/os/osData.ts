import { SQUAD, VERIFY_QUEUE, COACH_ACTIVITY } from './data';
import { PLAYER_PROFILE, SKILL_CATEGORIES, DEVELOPMENT_SEASONS, COACH_SUMMARY } from './playerProfile';
import type { PlayerProfile, SkillCategory, DevelopmentSeason, CoachSummary } from './playerProfile';
import type { SquadPlayer, VerifyItem, CoachActivityItem } from './types';

/**
 * The real player/team data a signed-in user can see. Shared by the server
 * fetcher (src/lib/os-data.ts) and the client Context (OsDataContext.tsx) —
 * kept in its own boundary-neutral module (no 'use client', no hooks) so
 * both a Server Component and a Client Component can import it directly.
 */
export type OsData = {
  squad: SquadPlayer[];
  verifyQueue: VerifyItem[];
  coachActivity: CoachActivityItem[];
  playerProfile: PlayerProfile;
  skillCategories: SkillCategory[];
  developmentSeasons: DevelopmentSeason[];
  coachSummary: CoachSummary;
};

/** Falls back to the original Ollie Harrison demo data when there's no Supabase project configured yet, or the signed-in profile has no linked player/team rows. */
export const DEMO_OS_DATA: OsData = {
  squad: SQUAD,
  verifyQueue: VERIFY_QUEUE,
  coachActivity: COACH_ACTIVITY,
  playerProfile: PLAYER_PROFILE,
  skillCategories: SKILL_CATEGORIES,
  developmentSeasons: DEVELOPMENT_SEASONS,
  coachSummary: COACH_SUMMARY,
};
