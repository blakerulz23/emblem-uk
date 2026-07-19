export type Role = 'owner' | 'coach';

export type PlayerTab = 'home' | 'journey' | 'card' | 'team' | 'profile';
export type CoachTab = 'home' | 'team' | 'celebrate' | 'verify' | 'profile';
export type Tab = PlayerTab | CoachTab;

// Matches playerProfile.ts's SkillCategoryId — kept as a separate alias here
// (rather than importing it) so this foundational state-shape file doesn't
// depend on a specific screen's data module.
export type AttrCategory = 'attacking' | 'physical' | 'mental' | 'technical' | 'tactical';
export type CardBackTab = 'Skills' | 'Development' | 'Coach';

export type TrustSource = 'club' | 'league' | 'coach' | 'parent' | 'player';
export type RarityTier = 'foil' | 'metallic' | 'standard';
export type RankTier = 'legendary' | 'rare' | 'common';

export type MomentId = 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6';

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
    have: number;
    total: number;
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

export type UploadedFile = { id: string; name: string; size: string; isVideo: boolean; url: string };

export type SquadPlayer = { name: string; num: number; pos: string; status: string };

export type VerifyItem = { player: string; moment: string; thumb: string; by: string; date: string };
export type CoachActivityItem = { text: string; when: string; ic: string };
export type CelebrateGroup = { group: string; items: [string, string][] };

export type OsState = {
  tab: Tab;
  cat: AttrCategory;
  ctab: CardBackTab;
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
  files: UploadedFile[];
  dragging: boolean;
  role: Role;
  celeb: string | null;
  award: string | null;
  coachMsg: string;
  sent: boolean;
  activated: boolean;
  dark: boolean;
};

export const initialOsState: OsState = {
  tab: 'home',
  cat: 'attacking',
  ctab: 'Skills',
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
  files: [],
  dragging: false,
  role: 'owner',
  celeb: null,
  award: null,
  coachMsg: '',
  sent: false,
  activated: false,
  dark: false,
};
