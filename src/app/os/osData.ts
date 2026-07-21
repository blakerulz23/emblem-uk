import { SQUAD, VERIFY_QUEUE, COACH_ACTIVITY } from './data';
import { PLAYER_PROFILE, SKILL_CATEGORIES, DEVELOPMENT_SEASONS, COACH_SUMMARY } from './playerProfile';
import type { PlayerProfile, SkillCategory, DevelopmentSeason, CoachSummary, SeasonTarget } from './playerProfile';
import type { SquadPlayer, VerifyItem, CoachActivityItem } from './types';

export type RealMomentMedia = { id: string; kind: 'photo' | 'video'; url: string };

/** A real guardian or coach with a relationship to the same claimed player — the "Connections & Privacy" list. */
export type RealConnection = {
  profileId: string;
  displayName: string | null;
  /** Guardians only ("Mother"/"Father"/etc.) — null for coach entries. */
  relationship: string | null;
  kind: 'guardian' | 'coach';
};

export type CoachTeamSummary = { id: string; name: string; playerCount: number };

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
  /** The signed-in profile's own id — lets a screen tell "is this mine" apart from "someone else's". */
  viewerId: string | null;
  /** Parent sessions only — every guardian and coach with a relationship to this claimed player. */
  connections: RealConnection[];
  /** Coach sessions only — the signed-in coach's own name. */
  coachDisplayName: string | null;
  /** Coach sessions only. */
  coachClub: { name: string; location: string | null } | null;
  /** Coach sessions only — one row per team this coach manages. */
  coachTeamsManaged: CoachTeamSummary[];
  /** Parent sessions only — this claimed player's season goals. */
  goals: SeasonTarget[];
};

/** Demo-mode goals, moved here from Profile.tsx so DEMO_OS_DATA is the one source of truth for demo content. */
const DEMO_GOALS: SeasonTarget[] = [
  { label: 'Keep 8 clean sheets', current: 6, target: 8, unit: 'clean sheets', status: 'in-progress' },
  { label: 'Play 20 matches', current: 14, target: 20, unit: 'matches', status: 'in-progress' },
  { label: 'Improve distribution', current: 45, target: 100, status: 'in-progress' },
  { label: 'Win a tournament', current: 1, target: 1, status: 'completed' },
];

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
  viewerId: null,
  connections: [
    { profileId: 'demo-guardian', displayName: 'Rebecca Penny', relationship: 'Mother', kind: 'guardian' },
    { profileId: 'demo-coach', displayName: 'James Walker', relationship: null, kind: 'coach' },
  ],
  coachDisplayName: 'Coach Danny',
  coachClub: { name: 'Curzon Ashton Juniors', location: 'Manchester, England' },
  coachTeamsManaged: [
    { id: 'demo-team-u10', name: 'Curzon Ashton U10', playerCount: 14 },
    { id: 'demo-team-u8', name: 'Curzon Ashton U8', playerCount: 11 },
  ],
  goals: DEMO_GOALS,
};
