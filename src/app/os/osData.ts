import { SQUAD, VERIFY_QUEUE, COACH_ACTIVITY, DEMO_SEASON_FOCUS, DEMO_STRENGTHS, DEMO_ASSESSMENTS } from './data';
import { PLAYER_PROFILE, SKILL_CATEGORIES, DEVELOPMENT_SEASONS, COACH_SUMMARY } from './playerProfile';
import type { PlayerProfile, SkillCategory, DevelopmentSeason, CoachSummary, SeasonTarget } from './playerProfile';
import type { SquadPlayer, VerifyItem, CoachActivityItem, SeasonFocusEntry, StrengthEntry, AssessmentEntry } from './types';
import type { CardFaceData } from '@/lib/card-definition';
// Type-only import — fully erased at build time, so this never pulls
// src/lib/story-updates.ts's server-only createServiceRoleClient into any
// client bundle that imports osData.ts (e.g. OsDataContext.tsx).
import type { StoryUpdateEventType, StoryUpdateCategory } from '@/lib/story-updates';

/** The client-facing shape of one story_updates row — see supabase/migrations/0025_story_updates.sql. */
export type StoryUpdate = {
  id: string;
  eventType: StoryUpdateEventType;
  category: StoryUpdateCategory;
  title: string;
  body: string;
  playerId: string;
  relatedMomentId: string | null;
  readAt: string | null;
  createdAt: string;
};

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
  /**
   * Fixed at submission/approval time (see migration 0011) — never
   * re-derived from the player's current team/coach state, so an existing
   * moment's status can't silently change if the player later joins a team.
   */
  status: 'family_memory' | 'pending_verification' | 'coach_verified' | 'system_generated';
  note: string | null;
  media: RealMomentMedia[];
  /**
   * Computed at fetch time by matching this moment's date against the real
   * `seasons` table (starts_on/ends_on) — never a stored column. Powers
   * Collection's season-chapter grouping with zero schema change. Null if
   * the date falls outside every known season's range.
   */
  seasonLabel: string | null;
  /** The real status of that same matched season — drives the open/closed chapter treatment. Null alongside seasonLabel. */
  seasonStatus: 'active' | 'closed' | null;
  /**
   * Structural rarity, computed at fetch time from real facts about this
   * moment and its place in the player's own history — never a random tier,
   * never relative to a fixed total. 'milestone' = the earliest moment of
   * this exact title this player has ever had (a real, unfakeable first).
   * 'recognized' = coach_verified but not a first. 'standard' = everything
   * else. See computeRarityAndOrdinals in src/lib/os-data.ts.
   */
  rarity: 'milestone' | 'recognized' | 'standard';
  /** This moment's 1-indexed position in the player's whole real chronological history. Only ever increases — no denominator, no fixed total. */
  careerOrdinal: number;
  /** This moment's 1-indexed position within its own season (or the 'Earlier' bucket for undated moments) — mirrors careerOrdinal but scoped to one season. */
  seasonOrdinal: number;
  /**
   * The real Card Definition this moment references (Milestone 4B — "seed
   * Collection from Builder"), when this is a system-generated card_created
   * moment. Null for every ordinary user-submitted moment. Never duplicates
   * card artwork data onto the moment row itself — always resolved fresh
   * from card_definitions via this reference.
   */
  cardDefinition: CardFaceData | null;
  /** A freshly signed URL for cardDefinition's photo, resolved server-side. Null alongside cardDefinition. */
  cardPhotoUrl: string | null;
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
  /** Parent sessions only — this claimed player's Season Focus entries (both active and completed/archived). */
  seasonFocus: SeasonFocusEntry[];
  /** Parent sessions only — this claimed player's Recognised Strengths, coach-authored. */
  strengths: StrengthEntry[];
  /** Parent sessions only — this claimed player's Coach's Assessment history, newest first; Card shows assessments[0]. */
  assessments: AssessmentEntry[];
  /** Parent sessions only — every child this guardian has claimed, oldest-claimed first. Powers the child switcher (only ever rendered in authenticated parent context, never for coaches or signed-out visitors). */
  claimedPlayers: { id: string; name: string }[];
  /** Parent sessions only — the real status of the claimed player's current season (matches playerProfile.season by label). Drives the player card's open/closed chapter treatment. Null until a season is resolved. */
  currentSeasonStatus: 'active' | 'closed' | null;
  /**
   * The Card Definition Builder authored for this player's card, when one
   * is linked (see src/lib/card-definition.tsx). Null for demo mode
   * (which keeps its own static asset) and for real cards claimed before
   * this integration existed — Card.tsx falls back to today's raw-photo
   * rendering in that case, never a fabricated design.
   */
  cardDefinition: CardFaceData | null;
  /** A freshly signed URL for cardDefinition's photo, resolved server-side — never a stored/public link. Null alongside cardDefinition. */
  cardPhotoUrl: string | null;
  /** This viewer's own Story Updates, newest first — real for both parent and coach sessions; always empty in demo mode (no fabricated notification history). */
  storyUpdates: StoryUpdate[];
  /** Derived from storyUpdates (readAt === null) — never independently stored. */
  unreadStoryUpdateCount: number;
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
  seasonFocus: DEMO_SEASON_FOCUS,
  strengths: DEMO_STRENGTHS,
  assessments: DEMO_ASSESSMENTS,
  claimedPlayers: [],
  currentSeasonStatus: null,
  cardDefinition: null,
  cardPhotoUrl: null,
  storyUpdates: [],
  unreadStoryUpdateCount: 0,
};
