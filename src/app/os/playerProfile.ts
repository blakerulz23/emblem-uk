import { computeOverallScore, MIDFIELDER_WEIGHTS } from './scoring';

/**
 * Typed data model for the Skills / Development / Coach areas of the Card
 * screen. Every score here is a coaching assessment, not a live measurement —
 * see scoring.ts for how category scores roll up into the overall score, and
 * for the (documented, not computed) coach/evidence/trend split behind an
 * individual skill score.
 */

export type CoachConfidence = 'High' | 'Medium' | 'Developing';

export type PlayerProfile = {
  name: string;
  position: string;
  club: string;
  age: number;
  height: string;
  preferredFoot: 'Left' | 'Right';
  /** Null for a real player with no coach assessment yet — never a demo/placeholder number. */
  overallScore: number | null;
  seasonalChange: number | null;
  /** A signed, time-limited S3 download URL — never a stored public link. Null until a guardian uploads one. */
  photoUrl: string | null;
  squadNumber: number | null;
  /** Derived from the team name (e.g. "U10"), not a separate stored field. */
  ageGroup: string | null;
  memberSinceYear: number | null;
  season: string | null;
  favouritePlayer: string | null;
  footballAmbition: string | null;
};

/** Pulls an age-group label like "U10" out of a team name — there's no separate stored field for it. */
export function extractAgeGroup(teamName: string | null | undefined): string | null {
  return teamName?.match(/U\d{1,2}\b/i)?.[0]?.toUpperCase() ?? null;
}

export type Skill = {
  id: string;
  label: string;
  score: number;
  seasonalChange: number;
  coachConfidence: CoachConfidence;
  /** Match-day facts a coach logged in support of this score — never the score's source of truth on their own. */
  evidence: string[];
  coachComments: string[];
  /** Related achievements shown as context. These never feed back into `score`. */
  recognitions: string[];
};

export type SkillCategoryId = 'attacking' | 'physical' | 'mental' | 'technical' | 'tactical';

export type SkillCategory = {
  id: SkillCategoryId;
  label: string;
  /** Emoji glyph, matching this app's existing category-icon convention. */
  icon: string;
  categoryScore: number;
  /** e.g. 12 means "top 12% in league" — shown as supporting context, never the headline figure. */
  leaguePercentile: number;
  skills: Skill[];
};

export type DevelopmentSeason = {
  season: string;
  overallScore: number;
  change: number;
  biggestImprovements: string[];
};

export type SeasonTarget = {
  /** Real goals only — undefined for CoachSummary's demo seasonTargets, which nothing writes back to. */
  id?: string;
  createdBy?: string;
  label: string;
  current: number;
  target: number;
  unit?: string;
  status: 'completed' | 'in-progress';
};

export type CoachSummary = {
  name: string;
  role: string;
  club: string;
  rating: number;
  verified: boolean;
  latestFeedback: string;
  strengths: string[];
  currentFocus: string[];
  playingStyle: string[];
  seasonTargets: SeasonTarget[];
  lastReviewed: string;
};

// ---------------------------------------------------------------------------
// Ollie Harrison — demo data
// ---------------------------------------------------------------------------

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    id: 'attacking',
    label: 'Attacking',
    icon: '⚽',
    categoryScore: 84,
    leaguePercentile: 12,
    skills: [
      {
        id: 'passing',
        label: 'Passing',
        score: 89,
        seasonalChange: 5,
        coachConfidence: 'High',
        evidence: ['6 assists this season', '14 key passes logged', '87% pass completion across the last 5 matches'],
        coachComments: ['Excellent through balls and much better decision-making under pressure.'],
        recognitions: ['Player of the Match', 'Great Teammate'],
      },
      {
        id: 'dribbling',
        label: 'Dribbling',
        score: 86,
        seasonalChange: 4,
        coachConfidence: 'Medium',
        evidence: ['Beat his first defender in open play 9 times in the last 4 matches'],
        coachComments: ['Close control has come on a lot — now looks to run at players rather than avoid them.'],
        recognitions: [],
      },
      {
        id: 'vision',
        label: 'Vision',
        score: 88,
        seasonalChange: 6,
        coachConfidence: 'High',
        evidence: ['Spotted the direct pass to the striker in behind on 5 separate occasions this month'],
        coachComments: ['Sees passes most players his age don’t — this is the sharpest improvement in his game this season.'],
        recognitions: ['Player of the Match'],
      },
      {
        id: 'finishing',
        label: 'Finishing',
        score: 79,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['2 goals from 5 shots on target this month'],
        coachComments: ['Composure in front of goal is improving but still a growth area.'],
        recognitions: [],
      },
      {
        id: 'movement',
        label: 'Movement',
        score: 82,
        seasonalChange: 4,
        coachConfidence: 'Medium',
        evidence: ['Found space between the lines consistently in the last 3 fixtures'],
        coachComments: ['Understands when to drop deep versus push on — a real step up from last season.'],
        recognitions: [],
      },
    ],
  },
  {
    id: 'physical',
    label: 'Physical',
    icon: '⚡',
    categoryScore: 82,
    leaguePercentile: 25,
    skills: [
      {
        id: 'agility',
        label: 'Agility',
        score: 88,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['Changed direction cleanly to escape a tight press in the last 2 matches'],
        coachComments: ['Quick feet in tight spaces — a real asset in midfield.'],
        recognitions: [],
      },
      {
        id: 'stamina',
        label: 'Stamina',
        score: 84,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['Maintained work rate into the final 10 minutes of the last 3 matches'],
        coachComments: ['Fitness has caught up with his game understanding this season.'],
        recognitions: [],
      },
      {
        id: 'speed',
        label: 'Speed',
        score: 80,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['Recovered to cover a defensive overlap twice in the last match'],
        coachComments: ['Not his standout attribute, but enough to do his job in the middle of the park.'],
        recognitions: [],
      },
      {
        id: 'jumping',
        label: 'Jumping',
        score: 82,
        seasonalChange: 2,
        coachConfidence: 'Developing',
        evidence: ['Won a contested header at a defensive corner this month'],
        coachComments: ['Not a focus area for his position, but competes fairly when needed.'],
        recognitions: [],
      },
      {
        id: 'strength',
        label: 'Strength',
        score: 76,
        seasonalChange: 2,
        coachConfidence: 'Developing',
        evidence: ['Held off a physical challenge to retain possession in the last match'],
        coachComments: ['Still growing into his frame — expected at this age group.'],
        recognitions: [],
      },
    ],
  },
  {
    id: 'mental',
    label: 'Mental',
    icon: '🧠',
    categoryScore: 86,
    leaguePercentile: 10,
    skills: [
      {
        id: 'decision-making',
        label: 'Decision Making',
        score: 89,
        seasonalChange: 4,
        coachConfidence: 'High',
        evidence: ['Completed 91% of first-time passing decisions under pressure', 'Chose the correct release option in 8 of 9 counter-attacks reviewed'],
        coachComments: ['Reads the moment before the ball arrives now — that’s the biggest single change this season.'],
        recognitions: [],
      },
      {
        id: 'composure',
        label: 'Composure',
        score: 88,
        seasonalChange: 3,
        coachConfidence: 'High',
        evidence: ['Kept possession under direct pressure in the box on 6 occasions this month'],
        coachComments: ['Doesn’t rush the ball anymore, even when closed down quickly.'],
        recognitions: ['Player of the Match'],
      },
      {
        id: 'concentration',
        label: 'Concentration',
        score: 86,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['Maintained defensive shape for full second-half spells in the last 3 matches'],
        coachComments: ['Focus dips occasionally late in games — one to keep an eye on.'],
        recognitions: [],
      },
      {
        id: 'bravery',
        label: 'Bravery',
        score: 87,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['Volunteered for every set-piece delivery this month, home or away'],
        coachComments: ['Wants the ball in big moments, which isn’t always the case at this age.'],
        recognitions: ['Great Teammate'],
      },
      {
        id: 'leadership',
        label: 'Leadership',
        score: 80,
        seasonalChange: 2,
        coachConfidence: 'Developing',
        evidence: ['Organised the midfield line during the second half vs Denton FC'],
        coachComments: ['Still developing his voice on the pitch — encouraging him to talk more.'],
        recognitions: [],
      },
    ],
  },
  {
    id: 'technical',
    label: 'Technical',
    icon: '🥾',
    categoryScore: 88,
    leaguePercentile: 8,
    skills: [
      {
        id: 'ball-control',
        label: 'Ball Control',
        score: 90,
        seasonalChange: 3,
        coachConfidence: 'High',
        evidence: ['First touch took him out of pressure cleanly in 90% of instances reviewed on matchday video'],
        coachComments: ['Rarely gives the ball away under the first press now.'],
        recognitions: [],
      },
      {
        id: 'kicking',
        label: 'Kicking',
        score: 89,
        seasonalChange: 3,
        coachConfidence: 'High',
        evidence: ['Consistently strikes the long diagonal with both accuracy and weight'],
        coachComments: ['Range of pass has genuinely improved his link-up play.'],
        recognitions: [],
      },
      {
        id: 'distribution',
        label: 'Distribution',
        score: 87,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['Switched play successfully under pressure in the last 2 matches'],
        coachComments: ['Starting to trust the longer pass, not just the safe one.'],
        recognitions: [],
      },
      {
        id: 'throwing',
        label: 'Throwing',
        score: 86,
        seasonalChange: 2,
        coachConfidence: 'Developing',
        evidence: ['Reliable long throw into the box at set pieces'],
        coachComments: ['A useful extra tool — not a focus area, but worth maintaining.'],
        recognitions: [],
      },
    ],
  },
  {
    id: 'tactical',
    label: 'Tactical',
    icon: '🎯',
    categoryScore: 90,
    leaguePercentile: 9,
    skills: [
      {
        id: 'positioning',
        label: 'Positioning',
        score: 92,
        seasonalChange: 3,
        coachConfidence: 'High',
        evidence: ['Held the correct midfield line in transition across the last 4 matches'],
        coachComments: ['Positional discipline is the most coach-like part of his game already.'],
        recognitions: [],
      },
      {
        id: 'anticipation',
        label: 'Anticipation',
        score: 90,
        seasonalChange: 3,
        coachConfidence: 'High',
        evidence: ['Won the ball back with an interception in a dangerous area 4 times this month'],
        coachComments: ['Reads where the next pass is going before most players on the pitch.'],
        recognitions: [],
      },
      {
        id: 'awareness',
        label: 'Awareness',
        score: 89,
        seasonalChange: 3,
        coachConfidence: 'Medium',
        evidence: ['Consistently checked his shoulder before receiving in the last 3 fixtures'],
        coachComments: ['Scanning habit is becoming automatic rather than reminded.'],
        recognitions: [],
      },
      {
        id: 'organisation',
        label: 'Organisation',
        score: 89,
        seasonalChange: 2,
        coachConfidence: 'Medium',
        evidence: ['Directed teammates into shape at defensive set pieces'],
        coachComments: ['Quiet but effective organiser — growing into a leadership role.'],
        recognitions: [],
      },
    ],
  },
];

const overallScore = computeOverallScore(
  Object.fromEntries(SKILL_CATEGORIES.map((c) => [c.id, c.categoryScore])),
  MIDFIELDER_WEIGHTS
);

export const PLAYER_PROFILE: PlayerProfile = {
  name: 'Ollie Harrison',
  position: 'Midfielder',
  club: 'Curzon Ashton Juniors U10',
  age: 10,
  height: '1.42m',
  preferredFoot: 'Right',
  overallScore,
  seasonalChange: 5,
  // Demo mode keeps its own hardcoded card-front image regardless of this
  // field — real mode is the only branch that reads photoUrl.
  photoUrl: null,
  squadNumber: 7,
  ageGroup: 'U10',
  memberSinceYear: 2026,
  season: '2026/27',
  favouritePlayer: 'Kevin De Bruyne',
  footballAmbition: 'Play academy football',
};

export const DEVELOPMENT_SEASONS: DevelopmentSeason[] = [
  { season: '24/25', overallScore: 76, change: 0, biggestImprovements: ['First season of coach-assessed tracking'] },
  { season: '25/26', overallScore: 82, change: 6, biggestImprovements: ['Passing', 'Positioning', 'Ball Control'] },
  { season: '26/27', overallScore: 87, change: 5, biggestImprovements: ['Vision', 'Passing', 'Decision Making', 'Dribbling'] },
];

export const COACH_SUMMARY: CoachSummary = {
  name: 'Coach Danny',
  role: 'Head Coach',
  club: 'Curzon Ashton U10',
  rating: 8.7,
  verified: true,
  latestFeedback: 'Ollie is becoming much more confident in possession. His vision and passing have improved significantly this season.',
  strengths: ['Passing', 'Vision', 'Work rate'],
  currentFocus: ['Weak foot', 'Communication', 'Defensive positioning'],
  playingStyle: ['Creative midfielder', 'Playmaker', 'Possession-focused'],
  seasonTargets: [
    { label: 'Score 5 goals', current: 5, target: 5, status: 'completed' },
    { label: 'Register 8 assists', current: 6, target: 8, status: 'in-progress' },
    { label: 'Reach a passing score of 90', current: 89, target: 90, status: 'in-progress' },
    { label: 'Attend 20 training sessions', current: 18, target: 20, status: 'in-progress' },
  ],
  lastReviewed: '12 March 2026',
};

/**
 * The season's biggest movers across every category, most-improved first.
 * Feeds both the Skills-tab "Driven by" line and the Development-tab
 * "Biggest improvements" list, so the two are always derived from one place.
 *
 * Ties are broken by this fixed category order (independent of the category
 * rail's display order) so the result is stable rather than depending on
 * incidental array position.
 */
const IMPROVEMENT_TIEBREAK_ORDER: SkillCategoryId[] = ['mental', 'attacking', 'technical', 'tactical', 'physical'];

export function getTopImprovements(
  categories: SkillCategory[],
  count: number
): { label: string; seasonalChange: number }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const all = IMPROVEMENT_TIEBREAK_ORDER.flatMap((id) => byId.get(id)?.skills ?? []);
  return [...all]
    .sort((a, b) => b.seasonalChange - a.seasonalChange)
    .slice(0, count)
    .map((s) => ({ label: s.label, seasonalChange: s.seasonalChange }));
}

export function findSkill(categories: SkillCategory[], skillId: string): { skill: Skill; category: SkillCategory } | null {
  for (const category of categories) {
    const skill = category.skills.find((s) => s.id === skillId);
    if (skill) return { skill, category };
  }
  return null;
}
