import { SQUAD, VERIFY_QUEUE, COACH_ACTIVITY } from './data';
import { PLAYER_PROFILE, SKILL_CATEGORIES, DEVELOPMENT_SEASONS, COACH_SUMMARY } from './playerProfile';
import type { PlayerProfile, SkillCategory, DevelopmentSeason, CoachSummary } from './playerProfile';
import type { SquadPlayer, VerifyItem, CoachActivityItem } from './types';

export type RealMomentMedia = { id: string; kind: 'photo' | 'video'; url: string };

export type RealMoment = {
  id: string;
  title: string;
  occurredOn: string | null;
  trust: 'club' | 'league' | 'coach' | 'parent' | 'player';
  note: string | null;
  media: RealMomentMedia[];
};

/**
 * The real player/team data this signed-in user can see. Shared by the
 * server fetcher (src/lib/os-data.ts) and the client Context
 * (OsDataContext.tsx) — kept in its own boundary-neutral module (no 'use
 * client', no hooks) so both a Server Component and a Client Component can
 * import it directly.
 *
 * `mode` is the single discriminant every screen branches on to decide
 * between demo content and a real (possibly still-empty) account — per
 * Core Product Principle #6, a real claimed player must never silently
 * render demo content, so `mode === 'demo'` is reached only when Supabase
 * itself isn't configured (local dev safety net), never as a fallback for
 * an authenticated real account with empty sub-fields.
 */
export type OsData = {
  mode: 'demo' | 'real';
  squad: SquadPlayer[];
  verifyQueue: VerifyItem[];
  coachActivity: CoachActivityItem[];
  playerProfile: PlayerProfile;
  skillCategories: SkillCategory[];
  developmentSeasons: DevelopmentSeason[];
  coachSummary: CoachSummary | null;
  moments: RealMoment[];
  /** Coach sessions only — the team roster additions POST against. */
  teamId: string | null;
  /** Parent sessions only — the claimed player, needed for the invite-guardian action. */
  playerId: string | null;
};

export const DEMO_OS_DATA: OsData = {
  mode: 'demo',
  squad: SQUAD,
  verifyQueue: VERIFY_QUEUE,
  coachActivity: COACH_ACTIVITY,
  playerProfile: PLAYER_PROFILE,
  skillCategories: SKILL_CATEGORIES,
  developmentSeasons: DEVELOPMENT_SEASONS,
  coachSummary: COACH_SUMMARY,
  moments: [],
  teamId: null,
  playerId: null,
};
