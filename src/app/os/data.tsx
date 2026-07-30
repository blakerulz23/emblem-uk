import type {
  AddAchievement,
  AddEvent,
  AddMomentType,
  AddPlayer,
  AssessmentEntry,
  CelebrateGroup,
  CoachActivityItem,
  Moment,
  RankTier,
  SeasonFocusEntry,
  SquadPlayer,
  StrengthEntry,
  TrustSource,
  VerifyItem,
} from './types';

const assetPath = '/assets/emblem-os';
export const osAssetPath = assetPath;

export const ICN: Record<string, (color: string) => React.ReactElement> = {
  home: (c) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" />
    </svg>
  ),
  flag: (c) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 22V4" /><path d="M5 4h13l-2 4 2 4H5" />
    </svg>
  ),
  card: (c) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x={6} y={3} width={12} height={18} rx={2} /><circle cx={12} cy={9} r={2} /><path d="M9 15h6" />
    </svg>
  ),
  team: (c) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={9} cy={8} r={3} /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" /><path d="M16 5a3 3 0 0 1 0 6M21 20v-1a5 5 0 0 0-3-4.6" />
    </svg>
  ),
  user: (c) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={8} r={4} /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  star: (c) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17.8 6.1 20.3l1.3-6.2L2.7 9.5l6.3-.7z" />
    </svg>
  ),
  shield: (c) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

export const JIC: Record<string, (color: string) => React.ReactElement> = {
  ball: (c) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
      <circle cx={12} cy={12} r={9} /><path d="M12 7l4.3 3.1-1.6 5h-5.4l-1.6-5z" />
    </svg>
  ),
  camera: (c) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx={12} cy={13} r={3} />
    </svg>
  ),
  trophy: (c) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 14h4M9 20h6M12 14v6" />
    </svg>
  ),
  star: (c) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 21l-5 3 1.2-5.6L4 14.6l5.6-.6z" />
    </svg>
  ),
  captain: (c) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill={c} stroke="none">
      <path d="M12 2l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V5z" />
      <text x={12} y={15} textAnchor="middle" fontSize={9} fontFamily="Roboto" fontWeight={900} fill="#fff">C</text>
    </svg>
  ),
  shield: (c) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 2l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V5z" /><path d="M9 12l2 2 4-4" strokeLinecap="round" />
    </svg>
  ),
};

const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString();
const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();

/** Demo Season Focus — one guardian-authored, one coach-authored, deliberately never merged into one anonymous value. */
export const DEMO_SEASON_FOCUS: SeasonFocusEntry[] = [
  { id: 'demo-focus-1', label: 'Improve confidence on the ball', createdBy: 'demo-guardian', authorName: 'Rebecca Penny', authorRole: 'guardian', createdAt: '2026-07-10', status: 'active' },
  { id: 'demo-focus-2', label: 'Develop first touch under pressure', createdBy: 'demo-coach', authorName: 'Coach Danny', authorRole: 'coach', createdAt: '2026-07-15', status: 'active' },
];

/** Demo Recognised Strengths — coach-authored, append-only. */
export const DEMO_STRENGTHS: StrengthEntry[] = [
  { id: 'demo-strength-1', label: 'Passing', createdAt: '2026-06-01' },
  { id: 'demo-strength-2', label: 'Vision', createdAt: '2026-06-20' },
  { id: 'demo-strength-3', label: 'Work rate', createdAt: '2026-07-05' },
];

/** Demo Coach's Assessment history — one entry; Card shows the latest. */
export const DEMO_ASSESSMENTS: AssessmentEntry[] = [
  {
    id: 'demo-assessment-1',
    body: "Ollie's reading of the game has really grown this season — he's linking play well between defence and midfield. Keep working on first touch under pressure and he'll be even more of a threat.",
    authorName: 'Coach Danny',
    createdAt: '2026-07-20',
  },
];

export const SQUAD: SquadPlayer[] = [
  { id: 'ollie', name: 'Ollie Harrison', num: 7, pos: 'Midfielder', status: 'Recognised today', guardianStatus: 'connected', guardianCount: 1, latestInviteExpiresAt: null, hasManageableInvite: false, secondaryPosition: 'Winger', seasonFocus: DEMO_SEASON_FOCUS, strengths: DEMO_STRENGTHS, assessments: DEMO_ASSESSMENTS },
  { id: 'jack', name: 'Jack Bennett', num: 9, pos: 'Striker', status: 'Add recognition', guardianStatus: 'none', guardianCount: 0, latestInviteExpiresAt: null, hasManageableInvite: false, secondaryPosition: null, seasonFocus: [], strengths: [], assessments: [] },
  { id: 'leo', name: 'Leo Marsh', num: 4, pos: 'Defender', status: 'Add recognition', guardianStatus: 'pending', guardianCount: 0, latestInviteExpiresAt: inThreeDays, hasManageableInvite: true, secondaryPosition: null, seasonFocus: [], strengths: [], assessments: [] },
  { id: 'finn', name: 'Finn Doyle', num: 1, pos: 'Goalkeeper', status: 'Add recognition', guardianStatus: 'expired', guardianCount: 0, latestInviteExpiresAt: twoDaysAgo, hasManageableInvite: false, secondaryPosition: null, seasonFocus: [], strengths: [], assessments: [] },
  { id: 'reuben', name: 'Reuben Clarke', num: 8, pos: 'Midfielder', status: 'Recognised today', guardianStatus: 'multiple', guardianCount: 2, latestInviteExpiresAt: null, hasManageableInvite: false, secondaryPosition: null, seasonFocus: [], strengths: [], assessments: [] },
  { id: 'theo', name: 'Theo Nkosi', num: 11, pos: 'Winger', status: 'Add recognition', guardianStatus: 'none', guardianCount: 0, latestInviteExpiresAt: null, hasManageableInvite: false, secondaryPosition: null, seasonFocus: [], strengths: [], assessments: [] },
];

export const CELEBRATE_CATS: CelebrateGroup[] = [
  { group: 'Match', items: [['Player of the Match', '⭐'], ['First Goal', '⚽'], ['Hat Trick', '🎩'], ['Clean Sheet', '🧤']] },
  { group: 'Character', items: [['Great Teammate', '❤️'], ['Leadership', '🧠'], ['Hardest Worker', '💪'], ['Most Improved', '📈'], ["Coach's Award", '🎯']] },
];

export const VERIFY_QUEUE: VerifyItem[] = [
  { id: 'v1', player: 'Ollie Harrison', playerId: 'ollie', moment: 'First Goal', thumb: `${assetPath}/jn-firstgoal.png`, by: 'Rebecca Penny (Parent)', date: '12 March 2026' },
  { id: 'v2', player: 'Jack Bennett', playerId: 'jack', moment: 'Tournament Winner', thumb: `${assetPath}/jn-trophy.png`, by: 'Mark Bennett (Parent)', date: '7 June 2026' },
  { id: 'v3', player: 'Leo Marsh', playerId: 'leo', moment: 'Team Photo', thumb: `${assetPath}/jn-teamphoto.png`, by: 'Sara Marsh (Parent)', date: '22 April 2026' },
];

export const COACH_ACTIVITY: CoachActivityItem[] = [
  { text: 'You celebrated Ollie Harrison — Player of the Match', when: '2h ago', ic: 'star' },
  { text: 'You verified Reuben Clarke — First Assist', when: 'Yesterday', ic: 'shield' },
  { text: 'You added a team photo', when: '2 days ago', ic: 'camera' },
];

export const TRUST: Record<TrustSource, { label: string; dot: string }> = {
  club: { label: 'Official Club', dot: '#2E9E5B' },
  league: { label: 'League Verified', dot: '#2A6FDB' },
  coach: { label: 'Coach Verified', dot: '#E9A03B' },
  parent: { label: 'Family Memory', dot: '#B8783C' },
  player: { label: 'Player Reflection', dot: '#8E5BD0' },
};

/**
 * Real-data moment status badges — a distinct axis from TRUST above.
 * family_memory/coach_verified deliberately reuse TRUST's parent/coach
 * entries exactly (same label, same color); pending_verification is new,
 * using the neutral grey already established elsewhere in this file
 * (RARITY_BY_ACH's default) so "still waiting" reads as neither of the
 * other two, not a third shade of the same "verified" feeling.
 */
export const MOMENT_STATUS_BADGE: Record<'family_memory' | 'pending_verification' | 'coach_verified' | 'system_generated', { label: string; dot: string }> = {
  family_memory: TRUST.parent,
  pending_verification: { label: 'Awaiting Coach Recognition', dot: '#8A8378' },
  coach_verified: TRUST.coach,
  /**
   * A real, system-generated fact ("this card came to life") — never a
   * fabricated coach/family claim, so it gets its own honest label.
   * Deliberately not "Activated": that word is reserved for the family's
   * own first NFC tap-to-activate moment, a distinct, later real event —
   * this badge describes Builder approval, not activation.
   */
  system_generated: { label: 'Recorded by Emblem', dot: '#E97435' },
};

/**
 * Real taxonomy, not a random or purchased tier (Collection OS Product
 * Specification v1.0) — 'milestone' is structurally unfakeable (a genuine
 * first), 'recognized' means a coach verified it, 'standard' is everything
 * else. Same three tiers RealCollection.tsx computes automatically from
 * real data; demo mode hand-assigns them to tell the same honest story.
 */
export const RANK: Record<RankTier, { label: string; text: string; chip: string; ring: string }> = {
  milestone: { label: 'MILESTONE', text: 'linear-gradient(180deg,#FCE9A8,#E8B14C 55%,#C6892E)', chip: 'rgba(233,177,76,.16)', ring: '#E9B14C' },
  recognized: { label: 'RECOGNIZED', text: 'linear-gradient(180deg,#FBD9B0,#E97435 60%,#C4501C)', chip: 'rgba(233,116,53,.16)', ring: '#E97435' },
  standard: { label: 'STANDARD', text: 'linear-gradient(180deg,#F2EEE6,#CFC7B8)', chip: 'rgba(255,255,255,.1)', ring: '#8A8378' },
};

export const FRAME: Record<'foil' | 'metallic' | 'standard', { bg: string; pad: string; shadow: string }> = {
  foil: { bg: 'linear-gradient(135deg,#FCE9A8 0%,#E8B14C 30%,#FFF6DA 48%,#C6892E 70%,#E8B14C 100%)', pad: '3px', shadow: '0 16px 34px -16px rgba(233,177,76,.7),0 2px 8px -4px rgba(0,0,0,.4)' },
  metallic: { bg: 'linear-gradient(140deg,rgba(255,255,255,.92),__C__ 46%,rgba(20,17,15,.5))', pad: '2.5px', shadow: '0 13px 28px -16px rgba(0,0,0,.5)' },
  standard: { bg: 'linear-gradient(140deg,#EDE7DC,#C9C1B4)', pad: '2px', shadow: '0 9px 22px -16px rgba(0,0,0,.4)' },
};

export const ADD_TYPES: AddMomentType[] = [
  { id: 'photo', label: 'Take Photo', emoji: '📷', sub: 'Use your camera' },
  { id: 'video', label: 'Record Video', emoji: '🎥', sub: 'Capture the moment' },
  { id: 'upload', label: 'Upload Photos', emoji: '🖼️', sub: 'From your library' },
  { id: 'award', label: 'Add Award', emoji: '🏆', sub: 'Log an honour' },
  { id: 'report', label: 'Match Report', emoji: '📄', sub: 'Result & write-up' },
  { id: 'comment', label: 'Coach Comment', emoji: '⭐', sub: 'A word from the coach' },
];

export const ADD_PLAYERS: AddPlayer[] = [
  { id: 'ollie', name: 'Ollie Harrison', team: 'Curzon Ashton U10', num: 7, grad: 'linear-gradient(160deg,#E9C46A,#C98B3A)' },
  { id: 'mia', name: 'Mia Harrison', team: 'Curzon Ashton U8', num: 9, grad: 'linear-gradient(160deg,#8FB7E8,#3F6FA8)' },
];

export const ADD_EVENTS: AddEvent[] = [
  { id: 'training', label: 'Training', emoji: '🎽' },
  { id: 'league', label: 'League Match', emoji: '⚽' },
  { id: 'tournament', label: 'Tournament', emoji: '🏆' },
  { id: 'friendly', label: 'Friendly', emoji: '🤝' },
  { id: 'presentation', label: 'Presentation', emoji: '🎖️' },
  { id: 'custom', label: 'Custom', emoji: '➕' },
];

export const ADD_ACH: AddAchievement[] = [
  { id: 'goal', label: 'First Goal', emoji: '⚽', rank: 'e1' },
  { id: 'potm', label: 'Player of the Match', emoji: '⭐', rank: 'e4' },
  { id: 'tournament', label: 'Tournament Winner', emoji: '🏆', rank: 'e6' },
  { id: 'photo', label: 'Team Photo', emoji: '📸', rank: 'e2' },
  { id: 'captain', label: 'Captain', emoji: '🧢', rank: 'e5' },
  { id: 'cleansheet', label: 'Clean Sheet', emoji: '🥅', rank: 'e4' },
  { id: 'award', label: 'Award', emoji: '🎖️', rank: 'e4' },
  { id: 'custom', label: 'Custom', emoji: '➕', rank: 'e2' },
];

// Normalized moments — merges the source's parallel EVENTS / RARITY / RW
// lookup tables (all keyed by the same e1-e8 ids) into one typed table.
//
// Rarity is hand-assigned per the same real taxonomy RealCollection.tsx
// computes automatically (Milestone 1): 'milestone' = a genuine first for
// this player, 'recognized' = coach-verified but not a first, 'standard' =
// everything else. e1-e6 are honestly all firsts (a small early collection
// naturally is mostly milestones) — e7/e8 are deliberately repeat titles
// (a second Team Photo, a second Player of the Match) so the demo actually
// demonstrates all three tiers, the same way a real family's collection
// only starts showing 'recognized'/'standard' moments once repeats occur.
// careerOrdinal mirrors RealMoment.careerOrdinal — a real, ever-counting
// position, never a fraction of a fixed total.
export const MOMENTS: Record<string, Moment> = {
  e1: {
    id: 'e1', year: '2026', title: 'First Goal', date: '12 March 2026', ic: 'ball',
    thumb: `${assetPath}/jn-firstgoal.png`, video: `${assetPath}/jn-firstgoal.mp4`,
    trust: 'coach', source: 'Coach Danny', uploadedBy: 'Coach Danny', verifiedBy: 'Coach Danny',
    note: 'Left-foot finish from the edge of the box — his first competitive goal.', media: true,
    rarity: { label: 'MILESTONE', color: '#E8B23A', tier: 'foil' },
    reward: {
      rank: 'milestone', sub: 'Goal Scorer',
      rewards: [
        { ic: 'ball', label: 'Goal Scorer', sub: 'Unlocked', lit: true },
        { ic: 'star', label: 'Goal Counter', sub: '1 Goal', lit: true },
        { ic: 'shield', label: 'Milestone Badge', sub: 'Unlocked', lit: true },
      ],
      careerOrdinal: 1, season: '2026',
    },
  },
  e2: {
    id: 'e2', year: '2026', title: 'Team Photo', date: '22 April 2026', ic: 'camera',
    thumb: `${assetPath}/jn-teamphoto.png`,
    trust: 'coach', source: 'Curzon Ashton Juniors', uploadedBy: 'Coach Danny', verifiedBy: 'Coach Danny',
    note: 'End-of-season squad photo on the home pitch.', media: true,
    rarity: { label: 'MILESTONE', color: '#E8B23A', tier: 'foil' },
    reward: {
      rank: 'milestone', sub: 'Team Memory',
      rewards: [
        { ic: 'camera', label: 'Team Memory', sub: 'Photo added', lit: true },
        { ic: 'star', label: 'Season Gallery', sub: '+1 photo', lit: true },
      ],
      careerOrdinal: 2, season: '2026',
    },
  },
  e3: {
    id: 'e3', year: '2026', title: 'Tournament Winner', date: '7 June 2026', ic: 'trophy',
    thumb: `${assetPath}/jn-trophy.png`,
    trust: 'club', source: 'Curzon Ashton Juniors', uploadedBy: 'Rebecca Penny', verifiedBy: 'Curzon Ashton Juniors',
    note: 'Lifted the summer cup after a 2-1 final.', media: true,
    rarity: { label: 'MILESTONE', color: '#E8B23A', tier: 'foil' },
    reward: {
      rank: 'milestone', sub: 'Summer Shield Final',
      rewards: [
        { ic: 'trophy', label: 'Trophy', sub: 'Added', lit: true },
        { ic: 'camera', label: 'Team Photo', sub: 'Added', lit: true },
        { ic: 'star', label: 'Milestone', sub: 'Unlocked', lit: true },
        { ic: 'shield', label: 'Official Club', sub: 'Verified', lit: true },
      ],
      careerOrdinal: 3, season: '2026',
      story: 'Curzon Ashton lifted the Summer Shield after a 3-1 victory in the final. Ollie kept a clean sheet in the semi final to help the team reach the final.',
      coach: 'Ollie was outstanding throughout the tournament. Calm, composed and commanding at the back.',
      coachName: 'Coach James Walker',
      score: '3 – 1', opp: 'Hyde United',
      facts: [['Clean Sheets', '2'], ['Round', 'Final'], ['Competition', 'Summer Shield'], ['Venue', 'Curzon Ashton FC'], ['Attendance', '248']],
      key: [['12′', 'Ollie save from close range', 'star'], ['34′', 'Curzon Ashton goal', 'ball'], ['56′', 'Hyde United goal', 'ball'], ['78′', 'Curzon Ashton goal', 'ball'], ['90′', 'Full time', 'shield']],
    },
  },
  e4: {
    id: 'e4', year: '2026', title: 'Player of the Match', date: '18 June 2026', ic: 'star',
    thumb: `${assetPath}/jn-potm.png`,
    trust: 'coach', source: 'Coach Danny', uploadedBy: 'Coach Danny', verifiedBy: 'Coach Danny',
    note: 'Awarded for a commanding performance in goal.', media: false,
    rarity: { label: 'MILESTONE', color: '#E8B23A', tier: 'foil' },
    reward: {
      rank: 'milestone', sub: 'Player of the Match',
      rewards: [
        { ic: 'star', label: 'Award Cabinet', sub: '+1 award', lit: true },
        { ic: 'trophy', label: 'First Award', sub: 'Unlocked', lit: true },
      ],
      careerOrdinal: 4, season: '2026',
    },
  },
  e7: {
    id: 'e7', year: '2027', title: 'Team Photo', date: '10 April 2027', ic: 'camera',
    thumb: `${assetPath}/jn-teamphoto.png`,
    trust: 'parent', source: 'Rebecca Penny', uploadedBy: 'Rebecca Penny', verifiedBy: 'Rebecca Penny',
    note: 'Pre-season squad photo — his second year with the team.', media: true,
    rarity: { label: 'STANDARD', color: '#8A8378', tier: 'standard' },
    reward: {
      rank: 'standard', sub: 'Team Memory',
      rewards: [
        { ic: 'camera', label: 'Team Memory', sub: 'Photo added', lit: true },
      ],
      careerOrdinal: 5, season: '2027',
    },
  },
  e5: {
    id: 'e5', year: '2027', title: 'Captain', date: '15 September 2027', ic: 'captain',
    thumb: `${assetPath}/jn-captain.png`,
    trust: 'club', source: 'Curzon Ashton Juniors', uploadedBy: 'Coach Danny', verifiedBy: 'Curzon Ashton Juniors',
    note: 'Named team captain for the new season.', media: false,
    rarity: { label: 'MILESTONE', color: '#E8B23A', tier: 'foil' },
    reward: {
      rank: 'milestone', sub: 'Leadership Unlocked',
      rewards: [
        { ic: 'captain', label: 'Captain Badge', sub: 'Unlocked', lit: true },
        { ic: 'star', label: 'Leadership', sub: 'Unlocked', lit: true },
      ],
      careerOrdinal: 6, season: '2027',
    },
  },
  e8: {
    id: 'e8', year: '2027', title: 'Player of the Match', date: '2 November 2027', ic: 'star',
    thumb: `${assetPath}/jn-potm.png`,
    trust: 'coach', source: 'Coach Danny', uploadedBy: 'Coach Danny', verifiedBy: 'Coach Danny',
    note: 'A second Player of the Match award, this time in midfield.', media: false,
    rarity: { label: 'RECOGNIZED', color: '#E97435', tier: 'metallic' },
    reward: {
      rank: 'recognized', sub: 'Player of the Match',
      rewards: [
        { ic: 'star', label: 'Award Cabinet', sub: '+1 award', lit: true },
      ],
      careerOrdinal: 7, season: '2027',
    },
  },
  e6: {
    id: 'e6', year: '2028', title: 'County Selection', date: '3 May 2028', ic: 'shield',
    thumb: `${assetPath}/jn-county.png`,
    trust: 'league', source: 'Greater Manchester FA', uploadedBy: 'Rebecca Penny', verifiedBy: 'Greater Manchester FA',
    note: 'Selected for the county development squad.', media: false,
    rarity: { label: 'MILESTONE', color: '#E8B23A', tier: 'foil' },
    reward: {
      rank: 'milestone', sub: 'County Selected',
      rewards: [
        { ic: 'shield', label: 'Elite Badge', sub: 'Unlocked', lit: true },
        { ic: 'trophy', label: 'County Collection', sub: 'Unlocked', lit: true },
      ],
      careerOrdinal: 8, season: '2028',
    },
  },
};

export const MOMENT_ORDER: string[] = ['e1', 'e2', 'e3', 'e4', 'e7', 'e5', 'e8', 'e6'];

/** Looks up the rarity treatment for an Add-Moment achievement's linked moment id (e.g. ADD_ACH[n].rank). */
export function RARITY_BY_ACH(momentId: string): { label: string; color: string; tier: 'foil' | 'metallic' | 'standard' } {
  return MOMENTS[momentId]?.rarity || { label: 'STANDARD', color: '#8A8378', tier: 'standard' };
}

export function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
