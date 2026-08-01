export type Role = 'owner' | 'coach';

export type PlayerTab = 'home' | 'journey' | 'card' | 'team' | 'profile';
export type CoachTab = 'home' | 'team' | 'celebrate' | 'verify' | 'profile';
export type Tab = PlayerTab | CoachTab;

export type TrustSource = 'club' | 'league' | 'coach' | 'parent' | 'player';
/** Purely a visual card-stock treatment (foil/metallic/standard finish) — never a scarcity claim by itself. Driven by RankTier below, one per moment. */
export type RarityTier = 'foil' | 'metallic' | 'standard';
/**
 * The real taxonomy (Collection OS Product Specification v1.0, Milestone 1) —
 * 'milestone' = the first time this exact achievement happened, 'recognized'
 * = coach-verified but not a first, 'standard' = everything else. Demo mode
 * hand-assigns this per moment to tell the same honest story real mode
 * computes automatically; it is never a random or purchased tier.
 */
export type RankTier = 'milestone' | 'recognized' | 'standard';

export type MomentId = 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'e7' | 'e8';

export type MatchFact = [string, string];
export type KeyMoment = [string, string, string];

export type Reward = { ic: string; label: string; sub: string; lit: boolean };

/** A single normalized "collected moment" — merges the source's EVENTS / RARITY / RW tables (all keyed by the same e1-e6 ids) into one record. */
export type Moment = {
  id: MomentId;
  year: string;
  title: string;
  date: string;
  ic: string;
  thumb: string;
  video?: string;
  trust: TrustSource;
  source: string;
  uploadedBy: string;
  verifiedBy: string;
  note: string;
  media: boolean;
  rarity: { label: string; color: string; tier: RarityTier };
  reward: {
    rank: RankTier;
    sub: string;
    rewards: Reward[];
    /** This moment's real, ever-counting position in the player's whole history — never a fraction of a fixed total. Mirrors RealMoment.careerOrdinal. */
    careerOrdinal: number;
    season: string;
    story?: string;
    coach?: string;
    coachName?: string;
    score?: string;
    opp?: string;
    facts?: MatchFact[];
    key?: KeyMoment[];
  };
};

export type AddMomentType = { id: string; label: string; emoji: string; sub: string };
export type AddPlayer = { id: string; name: string; team: string; num: number; grad: string };
export type AddEvent = { id: string; label: string; emoji: string };
export type AddAchievement = { id: string; label: string; emoji: string; rank: MomentId };

export type UploadedFile = {
  id: string;
  name: string;
  size: string;
  isVideo: boolean;
  url: string;
  /** Background-upload status against src/app/api/os/moments/upload. 'error' still lets the moment submit — the local preview isn't blocked on it. */
  uploadStatus: 'uploading' | 'done' | 'error';
  s3Key?: string;
};

/**
 * Derived server-side in getCoachOsData() from guardians + player_invites
 * counts/dates only — never a raw guardian row, never an email. 'none'/
 * 'pending'/'expired' are mutually exclusive with 'connected'/'multiple'
 * (a player either has guardians or has an outstanding invite, not both
 * states at once from the coach's point of view).
 */
export type GuardianStatus = 'none' | 'pending' | 'expired' | 'connected' | 'multiple';

/**
 * Shared with attribution: either a guardian or a coach can create one,
 * but every entry records its own real author + role — never merged into
 * one anonymous value. Capped at 3 active per player, enforced by
 * create_season_focus (0023_player_season_focus.sql), not client-side.
 */
export type SeasonFocusEntry = {
  id: string;
  label: string;
  createdBy: string;
  authorName: string | null;
  authorRole: 'guardian' | 'coach';
  createdAt: string;
  status: 'active' | 'completed' | 'archived';
};

/** Coach-authored only, append-only — no author shown, just a growing record of coach feedback. */
export type StrengthEntry = { id: string; label: string; createdAt: string };

/** Coach-authored history, never overwritten — Card/Coach Player Detail show the most recent ([0], since fetched newest-first). */
export type AssessmentEntry = { id: string; body: string; authorName: string | null; createdAt: string };

export type SquadPlayer = {
  id: string;
  name: string;
  num: number;
  pos: string;
  status: string;
  guardianStatus: GuardianStatus;
  guardianCount: number;
  /** Only set when guardianStatus is 'pending' or 'expired'. */
  latestInviteExpiresAt: string | null;
  /**
   * True only when guardianStatus is 'pending' — a live, unused,
   * unexpired invite exists for this player. Drives whether "Manage
   * invite" is offered; the invite code itself is deliberately NOT part
   * of this payload — it's fetched on demand (GET
   * /api/os/players/[id]/invite-link) only when the coach actually opens
   * Manage Invite or taps Copy Link, re-checking team membership at that
   * point rather than handing every code out on every Team-screen load.
   */
  hasManageableInvite: boolean;
  /** A coach's own football judgement, not a family fact — coach-only to set (see update_secondary_position), guardian can only view. Null until a coach sets one. */
  secondaryPosition: string | null;
  seasonFocus: SeasonFocusEntry[];
  strengths: StrengthEntry[];
  assessments: AssessmentEntry[];
  /**
   * The real team this player belongs to, or null for a player reached
   * only through a direct coach_players connection (coach-connection
   * milestone plan) — never a database-terminology leak, just enough for
   * Coach OS to group "my team rosters" apart from "players connected to
   * me directly" without inventing a fake team assignment.
   */
  teamId: string | null;
};

export type VerifyItem = { id: string; player: string; playerId: string; moment: string; thumb: string; by: string; date: string };
export type CoachActivityItem = { text: string; when: string; ic: string };
export type CelebrateGroup = { group: string; items: [string, string][] };

export type OsState = {
  tab: Tab;
  flipped: boolean;
  moment: MomentId | null;
  mStage: number;
  collectible: MomentId | null;
  addOpen: boolean;
  addStep: number;
  addType: string | null;
  aPlayer: string;
  aEvent: string | null;
  aAch: string | null;
  aDesc: string;
  aScore: string;
  addUnlock: boolean;
  /** True when a real-account moment submission actually failed server-side — surfaced instead of silently celebrating. */
  addSubmitError: boolean;
  /** True from the moment "ADD TO COLLECTION" is tapped until the request settles — guards against a double-tap firing a second POST and creating a duplicate moment. */
  addSubmitting: boolean;
  /** The real verification_status POST /api/os/moments actually assigned — read to show honest success copy, never assumed client-side. Null in demo mode. */
  addResultStatus: 'family_memory' | 'pending_verification' | null;
  files: UploadedFile[];
  dragging: boolean;
  role: Role;
  celeb: string | null;
  award: string | null;
  coachMsg: string;
  sent: boolean;
  activated: boolean;
  dark: boolean;
  /** Coach sessions only — a squad player drilled into from Team; null shows the Team list instead. */
  coachPlayerId: string | null;
  /** Whether the Story Updates overlay is open. */
  storyUpdatesOpen: boolean;
  /** A real moment id to scroll-to and briefly highlight in Collection — set by openStoryUpdate for recognition/moment_verified updates, self-clearing via actions.clearHighlightMoment(). Never a demo MomentId. */
  highlightMomentId: string | null;
};

export const initialOsState: OsState = {
  tab: 'home',
  flipped: false,
  moment: null,
  mStage: 1,
  collectible: null,
  addOpen: false,
  addStep: 0,
  addType: null,
  aPlayer: 'ollie',
  aEvent: null,
  aAch: null,
  aDesc: '',
  aScore: '',
  addUnlock: false,
  addSubmitError: false,
  addSubmitting: false,
  addResultStatus: null,
  files: [],
  dragging: false,
  role: 'owner',
  celeb: null,
  award: null,
  coachMsg: '',
  sent: false,
  activated: false,
  dark: false,
  coachPlayerId: null,
  storyUpdatesOpen: false,
  highlightMomentId: null,
};
