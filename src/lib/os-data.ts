import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { DEMO_OS_DATA } from '@/app/os/osData';
import type { OsData, RealMoment, RealConnection, CoachTeamSummary, StoryUpdate } from '@/app/os/osData';
import type { SkillCategory, CoachSummary, DevelopmentSeason, SeasonTarget, PlayerProfile } from '@/app/os/playerProfile';
import { extractAgeGroup } from '@/app/os/playerProfile';
import { computeOverallScore, MIDFIELDER_WEIGHTS } from '@/app/os/scoring';
import { cardDefinitionToFaceData } from '@/lib/card-definition';
import type { CardDefinitionRow, CardFaceData } from '@/lib/card-definition';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import type { SquadPlayer, VerifyItem, GuardianStatus, SeasonFocusEntry, StrengthEntry, AssessmentEntry } from '@/app/os/types';

type CardDefinitionDbRow = {
  id: string;
  status: 'draft' | 'approved';
  template_id: string;
  sport: CardDefinitionRow['sport'];
  name: string;
  number: string | null;
  team: string;
  position: string | null;
  logo: string | null;
  photo: CardDefinitionRow['photo'];
  stats: CardDefinitionRow['stats'];
};

function toCardDefinitionRow(row: CardDefinitionDbRow): CardDefinitionRow {
  return {
    id: row.id,
    status: row.status,
    templateId: row.template_id,
    sport: row.sport,
    name: row.name,
    number: row.number,
    team: row.team,
    position: row.position,
    logo: row.logo,
    photo: row.photo,
    stats: row.stats,
  };
}

/**
 * Derives the coach-facing guardian status from counts/dates only —
 * never a raw guardian row. 'none'/'pending'/'expired' only apply when
 * guardianCount is 0: a used, expired invite that already produced a
 * guardian is irrelevant once that guardian exists.
 */
// Never DEMO_OS_DATA's playerProfile ("Ollie Harrison") — a real,
// authenticated account whose player lookup comes up empty must show a
// genuinely empty state, not fake demo content mistaken for real data.
// Core Product Principle #6, enforced here the same way `squad: []` and
// `claimedPlayers: []` already are for their own empty cases.
const EMPTY_PLAYER_PROFILE: PlayerProfile = {
  name: '',
  position: '',
  club: '',
  age: 0,
  height: '',
  preferredFoot: 'Right',
  overallScore: null,
  seasonalChange: null,
  photoUrl: null,
  squadNumber: null,
  ageGroup: null,
  memberSinceYear: null,
  season: null,
  favouritePlayer: null,
  footballAmbition: null,
  secondaryPosition: null,
};

function deriveGuardianStatus(
  guardianCount: number,
  latestInvite: { expiresAt: string } | undefined
): GuardianStatus {
  if (guardianCount >= 2) return 'multiple';
  if (guardianCount === 1) return 'connected';
  if (!latestInvite) return 'none';
  return new Date(latestInvite.expiresAt) > new Date() ? 'pending' : 'expired';
}

type SeasonRangeRow = { label: string; starts_on: string | null; ends_on: string | null; status: string };

/**
 * Matches a moment's date against the real seasons table by range —
 * computed here, never stored. `dateStr` should already be a plain
 * YYYY-MM-DD string (occurred_on, or created_at truncated to its date
 * portion as a fallback for moments with no occurred_on, e.g. coach
 * recognitions via /api/os/celebrate never set it).
 */
function resolveSeason(dateStr: string | null, seasons: SeasonRangeRow[]): { label: string | null; status: 'active' | 'closed' | null } {
  if (!dateStr) return { label: null, status: null };
  const match = seasons.find((s) => s.starts_on && s.ends_on && dateStr >= s.starts_on && dateStr <= s.ends_on);
  if (!match) return { label: null, status: null };
  return { label: match.label, status: match.status === 'closed' ? 'closed' : 'active' };
}

type RarityTier = 'milestone' | 'recognized' | 'standard';
type RarityInput = {
  id: string;
  title: string;
  effectiveDate: string | null;
  /**
   * The real, always-present, full-precision creation timestamp — used only
   * to break ties when two moments share the same day-granularity
   * effectiveDate (e.g. a system-generated moment with a real occurred_on
   * and a same-day submission whose null occurred_on fell back to its own
   * created_at truncated to a date). Without this, a same-day tie falls
   * through to whatever order the moments arrived in from the DB query
   * (newest-first, for display) — silently reversing two same-day moments'
   * true chronological order.
   */
  createdAt: string;
  status: 'family_memory' | 'pending_verification' | 'coach_verified' | 'system_generated';
  seasonLabel: string | null;
};

/**
 * Structural rarity + chronological ordinals, computed from real facts —
 * never a random tier, never relative to a fixed deck size. A moment is
 * 'milestone' the first time this exact title appears in this player's
 * whole history (a real, unfakeable first — it can only happen once),
 * 'recognized' if coach-verified but not a first, otherwise 'standard'.
 * Ordinals count up forever from real chronological position — no
 * denominator, so this is identically correct at 3 moments or 300.
 *
 * Known, accepted limitation: "first of type" is grouped by exact title
 * string (the same client convention ADD_ACH/CELEBRATE_CATS already
 * constrains most submissions to), not an enforced category column — a
 * typo'd or "Custom" title could fragment the grouping. Real and shippable
 * today; a moments.category enum would harden it, left as optional future
 * work rather than blocking this.
 */
function computeRarityAndOrdinals(entries: RarityInput[]): Map<string, { rarity: RarityTier; careerOrdinal: number; seasonOrdinal: number }> {
  const ascending = [...entries].sort((a, b) => {
    if (a.effectiveDate && b.effectiveDate && a.effectiveDate !== b.effectiveDate) {
      return a.effectiveDate.localeCompare(b.effectiveDate);
    }
    if (a.effectiveDate && !b.effectiveDate) return -1;
    if (!a.effectiveDate && b.effectiveDate) return 1;
    // Same effectiveDate (including both null, or a day-level collision
    // between a real occurred_on and a created_at-derived fallback) —
    // break the tie with the real, full-precision timestamp so same-day
    // moments still land in their true order instead of DB query order.
    return a.createdAt.localeCompare(b.createdAt);
  });

  const seenTitles = new Set<string>();
  const seasonCounters = new Map<string, number>();
  const result = new Map<string, { rarity: RarityTier; careerOrdinal: number; seasonOrdinal: number }>();

  ascending.forEach((entry, i) => {
    const careerOrdinal = i + 1;
    const seasonKey = entry.seasonLabel ?? 'Earlier';
    const seasonOrdinal = (seasonCounters.get(seasonKey) ?? 0) + 1;
    seasonCounters.set(seasonKey, seasonOrdinal);

    let rarity: RarityTier;
    if (!seenTitles.has(entry.title)) {
      rarity = 'milestone';
      seenTitles.add(entry.title);
    } else if (entry.status === 'coach_verified') {
      rarity = 'recognized';
    } else {
      rarity = 'standard';
    }

    result.set(entry.id, { rarity, careerOrdinal, seasonOrdinal });
  });

  return result;
}

export type OsSession = {
  userId: string;
  email: string | null;
};

export type OsAccount = {
  session: OsSession | null;
  profileRole: 'parent' | 'coach' | null;
  /** Parent: has at least one guardians row. */
  hasClaimedPlayer: boolean;
  /** Coach: has at least one coach_team row. */
  hasTeam: boolean;
};

const SUPABASE_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Reads the current Supabase session + profile role + claim/team state. Everything false/null when Supabase isn't configured or the visitor hasn't signed in yet. */
export async function getOsAccount(): Promise<OsAccount> {
  if (!SUPABASE_CONFIGURED) {
    return { session: null, profileRole: null, hasClaimedPlayer: false, hasTeam: false };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { session: null, profileRole: null, hasClaimedPlayer: false, hasTeam: false };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const profileRole = (profile?.role as 'parent' | 'coach' | undefined) ?? null;

  let hasClaimedPlayer = false;
  let hasTeam = false;

  if (profileRole === 'parent') {
    const { count } = await supabase
      .from('guardians')
      .select('player_id', { count: 'exact', head: true })
      .eq('profile_id', user.id);
    hasClaimedPlayer = (count ?? 0) > 0;
  } else if (profileRole === 'coach') {
    // Despite its name (kept to avoid a rename ripple across
    // ActivationGate/page.tsx/OsApp — its only consumer is the single
    // "coach with no coaching access yet -> CreateTeamOnboarding" check),
    // this now means "has any real coaching access, team or direct" —
    // a coach reachable only via coach_players (Milestone 2's direct
    // connection) must still reach Coach OS and see Individual Players,
    // not get stuck at team-creation onboarding for a team they were
    // never going to need.
    const [{ count: teamCount }, { count: directCount }] = await Promise.all([
      supabase.from('coach_team').select('team_id', { count: 'exact', head: true }).eq('profile_id', user.id),
      supabase.from('coach_players').select('player_id', { count: 'exact', head: true }).eq('profile_id', user.id),
    ]);
    hasTeam = (teamCount ?? 0) > 0 || (directCount ?? 0) > 0;
  }

  return {
    session: { userId: user.id, email: user.email ?? null },
    profileRole,
    hasClaimedPlayer,
    hasTeam,
  };
}

/**
 * Fetches this signed-in user's real Emblem OS data. `DEMO_OS_DATA` is
 * returned *only* when Supabase itself isn't configured (local dev safety
 * net) — never as a fallback for a real, authenticated account, per Core
 * Product Principle #6. A parent/coach with nothing claimed yet shouldn't
 * normally reach this function at all (ActivationGate routes them to the
 * claim/team-creation flow first) — the empty-real-data branches here are
 * a defensive fallback, not the primary path.
 */
export async function getOsData(
  userId: string | null,
  profileRole: 'parent' | 'coach' | null,
  requestedPlayerId?: string | null
): Promise<OsData> {
  if (!userId || !SUPABASE_CONFIGURED) {
    return DEMO_OS_DATA;
  }

  const supabase = createClient();

  // Fetched once here rather than duplicated inside getParentOsData/
  // getCoachOsData — recipient_profile_id = auth.uid() is identical for
  // both roles, so there's nothing role-specific about this query. RLS
  // ("story_updates: recipient can select their own") is the only
  // authorization needed; the ordinary session client already scopes this
  // correctly with no service-role client involved.
  const { data: storyUpdateRows } = await supabase
    .from('story_updates')
    .select('*')
    .eq('recipient_profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  const storyUpdates: StoryUpdate[] = (storyUpdateRows ?? []).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    category: r.category,
    title: r.title,
    body: r.body,
    playerId: r.player_id,
    relatedMomentId: r.related_moment_id,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
  const unreadStoryUpdateCount = storyUpdates.filter((u) => !u.readAt).length;

  const base =
    profileRole === 'coach'
      ? await getCoachOsData(supabase, userId)
      : await getParentOsData(supabase, userId, requestedPlayerId ?? undefined);

  return { ...base, storyUpdates, unreadStoryUpdateCount };
}

async function getParentOsData(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  requestedPlayerId?: string
): Promise<OsData> {
  // No timestamp column to order by "first claimed" — player_id is still
  // a fully deterministic, stable ordering (a fixed UUID per player never
  // changes), just not a semantically meaningful one. That's an
  // acceptable trade to avoid a schema migration for a default-child
  // choice nothing else depends on.
  const { data: guardianLinks } = await supabase
    .from('guardians')
    .select('player_id')
    .eq('profile_id', userId)
    .order('player_id', { ascending: true });

  const linkedIds = (guardianLinks ?? []).map((g) => g.player_id as string);
  const linkedIdSet = new Set(linkedIds);
  // A ?player= for a player this guardian doesn't actually guard falls
  // back to their own default (oldest-claimed) child rather than
  // erroring — RLS independently blocks the downstream queries from ever
  // returning another guardian's data regardless, so this is a clean-UX
  // fallback, not the security boundary.
  const playerId = requestedPlayerId && linkedIdSet.has(requestedPlayerId) ? requestedPlayerId : linkedIds[0];

  // storyUpdates/unreadStoryUpdateCount are always overridden by the outer
  // getOsData() wrapper's spread — these are inert placeholders that only
  // exist to satisfy OsData's type here.
  const emptyConnections = { connections: [], viewerId: userId, coachDisplayName: null, coachClub: null, coachTeamsManaged: [], goals: [], seasonFocus: [], strengths: [], assessments: [], storyUpdates: [] as StoryUpdate[], unreadStoryUpdateCount: 0 };

  if (!playerId) {
    return {
      ...emptyConnections,
      mode: 'real',
      squad: [],
      verifyQueue: [],
      coachActivity: [],
      playerProfile: EMPTY_PLAYER_PROFILE,
      skillCategories: [],
      developmentSeasons: [],
      coachSummary: null,
      moments: [],
      teamId: null,
      playerId: null,
      claimedPlayers: [],
      currentSeasonStatus: null,
      cardDefinition: null,
      cardPhotoUrl: null,
    };
  }

  const [{ data: rawPlayer }, { data: snapshots }, { data: momentRows }, { data: guardianRows }, { data: goalRows }, { data: claimedPlayerRows }, { data: seasonRows }, { data: cardRow }, { data: seasonFocusRows }, { data: strengthRows }, { data: assessmentRows }] = await Promise.all([
    // Explicit column list, not select('*') — compatibility groundwork for
    // the upcoming Coach Player Details schema change, which will revoke
    // broad table-level SELECT and re-grant only an explicit list; `*`
    // would error outright the moment that lands if this query still asked
    // for it. Every column referenced anywhere below is named here, one
    // for one — no behaviour change today, only a syntax change.
    supabase
      .from('players')
      .select('id, name, "position", age, height, preferred_foot, photo_key, squad_number, created_at, favourite_player, football_ambition, secondary_position, team_id, teams ( name, clubs ( name ), seasons ( label ) )')
      .eq('id', playerId)
      .maybeSingle(),
    supabase
      .from('player_skill_snapshots')
      .select('*, seasons ( label, starts_on )')
      .eq('player_id', playerId),
    // Every moment regardless of verification_status — Family Memory and
    // Pending Verification are both real, immediately-visible states now,
    // not just a staging area before a coach acts. verification_status is
    // fixed at submission/approval time (see migration 0011) and read
    // straight through below, never re-derived from current team/coach
    // state.
    // card_definitions embed only ever populates for a system-generated
    // card_created moment (Milestone 4B) — never duplicated data, always a
    // fresh reference resolved at read time via card_definition_id.
    supabase
      .from('moments')
      .select('*, moment_media (*), card_definitions ( * )')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('guardians')
      .select('profile_id, relationship, profiles ( display_name )')
      .eq('player_id', playerId),
    supabase
      .from('player_goals')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: true }),
    // Every child this guardian has claimed — powers the child switcher.
    // Only fetched/rendered anywhere in authenticated parent context.
    supabase
      .from('players')
      .select('id, name')
      .in('id', linkedIds),
    // Every real season, global (not scoped to this player's team) — small
    // table, used only to bucket moments into season chapters by date
    // range client-side. No new column on moments, no migration.
    supabase
      .from('seasons')
      .select('label, starts_on, ends_on, status')
      .order('starts_on', { ascending: false }),
    // The Card Definition Builder authored for this player's most recent
    // card, if one has been linked (see migration 0019_card_definitions.sql
    // and src/lib/card-definition.tsx). Null for every card claimed before
    // that integration existed — Card.tsx falls back to today's raw-photo
    // rendering in that case, never a fabricated design.
    supabase
      .from('cards')
      .select('card_definitions ( * )')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Season Focus — shared with attribution; the profiles embed resolves
    // the real author name regardless of whether they're a guardian or
    // coach (0023_player_season_focus.sql's new coach-side profiles
    // policies cover the coach-authored case).
    supabase
      .from('player_season_focus')
      .select('*, profiles ( display_name )')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
    // Recognised Strengths — coach-authored, append-only, no author shown.
    supabase
      .from('player_strengths')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
    // Coach's Assessment history — newest first; the UI only ever shows
    // assessments[0], but the full history is carried through rather than
    // discarded, consistent with never destructively overwriting a record.
    supabase
      .from('player_assessments')
      .select('*, profiles ( display_name )')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
  ]);

  // Cast past the wrong inferred type, same reasoning as cardDefinitionDbRow
  // below and the untyped-client quirk documented throughout this file:
  // supabase-js's compile-time select-string parser infers `teams` (a
  // to-one FK embed — a player has at most one team) as an array here, not
  // something the explicit column list above caused.
  type PlayerRow = {
    id: string; name: string; position: string | null; age: number | null; height: string | null;
    preferred_foot: 'Left' | 'Right' | null; photo_key: string | null; squad_number: number | null;
    created_at: string | null; favourite_player: string | null; football_ambition: string | null;
    secondary_position: string | null; team_id: string | null;
    teams: { name: string; clubs: { name: string } | null; seasons: { label: string } | null } | null;
  };
  const player = rawPlayer as unknown as PlayerRow | null;

  const seasonRanges: SeasonRangeRow[] = (seasonRows ?? []) as unknown as SeasonRangeRow[];

  // Same untyped-client many-to-one quirk documented throughout this file —
  // cards.card_definition_id is a single FK, so the embed is one object at
  // runtime despite how the client infers it.
  const cardDefinitionDbRow = (cardRow as unknown as { card_definitions: CardDefinitionDbRow | null } | null)?.card_definitions ?? null;
  const cardDefinition: CardFaceData | null = cardDefinitionDbRow ? cardDefinitionToFaceData(toCardDefinitionRow(cardDefinitionDbRow)) : null;
  const cardPhotoUrl = cardDefinitionDbRow?.photo?.storageKey ? await getSignedDownloadUrl(cardDefinitionDbRow.photo.storageKey) : null;

  // Sorted client-side rather than via `.order(col, { foreignTable })` —
  // that PostgREST option orders rows *within* a one-to-many embed, not a
  // many-to-one joined column like this snapshot-to-season relationship,
  // so it can't be relied on to reorder these parent rows correctly.
  const orderedSnapshots = [...(snapshots ?? [])].sort((a, b) => {
    const aDate = a.seasons?.starts_on;
    const bDate = b.seasons?.starts_on;
    if (aDate && bDate) return bDate.localeCompare(aDate);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return (b.seasons?.label ?? '').localeCompare(a.seasons?.label ?? '');
  });

  const claimedPlayers = (claimedPlayerRows ?? []).map((p) => ({ id: p.id as string, name: p.name as string }));

  if (!player) {
    return {
      ...emptyConnections,
      mode: 'real',
      squad: [],
      verifyQueue: [],
      coachActivity: [],
      playerProfile: EMPTY_PLAYER_PROFILE,
      skillCategories: [],
      developmentSeasons: [],
      coachSummary: null,
      moments: [],
      teamId: null,
      playerId: null,
      claimedPlayers,
      currentSeasonStatus: null,
      cardDefinition: null,
      cardPhotoUrl: null,
    };
  }

  const goals: SeasonTarget[] = (goalRows ?? []).map((g) => ({
    id: g.id,
    createdBy: g.created_by,
    label: g.label,
    current: g.current,
    target: g.target,
    unit: g.unit ?? undefined,
    status: g.status,
  }));

  // Same untyped-client many-to-one embed quirk as guardianRows/coachRows
  // above — one player_season_focus/player_assessments row references at
  // most one profiles row via created_by.
  type ProfileNameEmbed = { display_name: string | null } | null;
  type SeasonFocusDbRow = {
    id: string; label: string; created_by: string; author_role: 'guardian' | 'coach';
    status: 'active' | 'completed' | 'archived'; created_at: string; profiles: ProfileNameEmbed;
  };
  type AssessmentDbRow = { id: string; body: string; created_at: string; profiles: ProfileNameEmbed };

  const seasonFocus: SeasonFocusEntry[] = ((seasonFocusRows ?? []) as unknown as SeasonFocusDbRow[]).map((f) => ({
    id: f.id,
    label: f.label,
    createdBy: f.created_by,
    authorName: f.profiles?.display_name ?? null,
    authorRole: f.author_role,
    createdAt: f.created_at,
    status: f.status,
  }));
  const strengths: StrengthEntry[] = (strengthRows ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    createdAt: s.created_at,
  }));
  const assessments: AssessmentEntry[] = ((assessmentRows ?? []) as unknown as AssessmentDbRow[]).map((a) => ({
    id: a.id,
    body: a.body,
    authorName: a.profiles?.display_name ?? null,
    createdAt: a.created_at,
  }));

  // coach_team lookup depends on player.team_id, so it can't join the
  // Promise.all above — only known once `player` resolves.
  const { data: coachRows } = player.team_id
    ? await supabase
        .from('coach_team')
        .select('profile_id, profiles ( display_name )')
        .eq('team_id', player.team_id)
    : { data: [] as never[] };

  // Direct (team-independent) coach connections — coach_players.player_id
  // is readable by this guardian via "coach_players: guardians can see
  // their player's connections" (0030_coach_players.sql). There is,
  // however, no "guardians can view their direct coach's profile" RLS
  // policy yet (the mirror-image gap to the one Milestone 3.1 fixed in
  // the other direction) — resolving display_name here goes through
  // service-role for just this lookup, the exact same narrow workaround
  // getCoachOsData already uses below for guardian counts, rather than
  // opening a new migration in a UI-focused milestone.
  const { data: directCoachRows } = await supabase.from('coach_players').select('profile_id').eq('player_id', playerId);
  const directCoachProfileIds = (directCoachRows ?? []).map((d) => d.profile_id as string);
  const { data: directCoachProfiles } = directCoachProfileIds.length
    ? await createServiceRoleClient().from('profiles').select('id, display_name').in('id', directCoachProfileIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const directCoachNameById = new Map((directCoachProfiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));

  // Supabase's untyped client (no generated Database schema here)
  // mis-infers embedded-resource joins on a multi-row select as arrays in
  // its TypeScript types — but PostgREST's actual runtime response for a
  // many-to-one FK (confirmed directly against the real database) is a
  // single object, same as it is on a .maybeSingle() query. Cast past the
  // wrong inferred type rather than indexing [0] into something that was
  // never really a list.
  type ProfileNameRow = { profile_id: string; profiles: { display_name: string | null } | null };
  const teamCoachRows = (coachRows ?? []) as unknown as ProfileNameRow[];
  const teamCoachProfileIds = new Set(teamCoachRows.map((c) => c.profile_id));
  // Club + team name joined (e.g. "Ashton FC U11") — null when the player
  // has no team at all, which is the only time every coach on this list
  // is necessarily direct-only.
  const teamContext = player.teams
    ? [player.teams.clubs?.name, player.teams.name].filter(Boolean).join(' ') || null
    : null;

  const connections: RealConnection[] = [
    ...((guardianRows ?? []) as unknown as (ProfileNameRow & { relationship: string | null })[]).map((g) => ({
      profileId: g.profile_id,
      displayName: g.profiles?.display_name ?? null,
      relationship: g.relationship,
      kind: 'guardian' as const,
      teamContext: null,
    })),
    ...teamCoachRows.map((c) => ({
      profileId: c.profile_id,
      displayName: c.profiles?.display_name ?? null,
      relationship: null,
      kind: 'coach' as const,
      teamContext,
    })),
    // Deduped against the team list above — a coach connected both ways
    // is represented once, with team context, never as two rows.
    ...directCoachProfileIds
      .filter((id) => !teamCoachProfileIds.has(id))
      .map((id) => ({
        profileId: id,
        displayName: directCoachNameById.get(id) ?? null,
        relationship: null,
        kind: 'coach' as const,
        teamContext: null,
      })),
  ];

  const latestSnapshot = orderedSnapshots[0];
  const skillCategories = (latestSnapshot?.skills as SkillCategory[]) ?? [];
  const overallScore = latestSnapshot
    ? computeOverallScore(
        Object.fromEntries(skillCategories.map((c) => [c.id, c.categoryScore])),
        MIDFIELDER_WEIGHTS
      )
    : null;

  // "Progress will appear after two or more assessments" — needs the full
  // history, not just the latest, to know how many exist.
  const developmentSeasons: DevelopmentSeason[] =
    orderedSnapshots.length >= 2
      ? [...orderedSnapshots]
          .reverse()
          .map((s) => ({
            season: s.seasons?.label,
            overallScore: computeOverallScore(
              Object.fromEntries(((s.skills as SkillCategory[]) ?? []).map((c) => [c.id, c.categoryScore])),
              MIDFIELDER_WEIGHTS
            ),
            change: s.seasonal_change ?? 0,
            biggestImprovements: [],
          }))
      : [];

  // Coach recognitions (via /api/os/celebrate) never set occurred_on —
  // created_at is the honest fallback for those, truncated to a plain
  // date so it compares correctly against seasons.starts_on/ends_on.
  // Computed as its own synchronous pass (season match + rarity/ordinals
  // both need every moment's date/season up front, before the async
  // per-moment media-signing pass below runs).
  const enrichedMomentRows = (momentRows ?? []).map((m) => {
    const effectiveDate = m.occurred_on ?? (m.created_at as string | undefined)?.slice(0, 10) ?? null;
    const { label: seasonLabel, status: seasonStatus } = resolveSeason(effectiveDate, seasonRanges);
    return { raw: m, effectiveDate, seasonLabel, seasonStatus };
  });

  const rarityAndOrdinals = computeRarityAndOrdinals(
    enrichedMomentRows.map((e) => ({
      id: e.raw.id as string,
      title: e.raw.title as string,
      effectiveDate: e.effectiveDate,
      createdAt: e.raw.created_at as string,
      status: e.raw.verification_status as 'family_memory' | 'pending_verification' | 'coach_verified' | 'system_generated',
      seasonLabel: e.seasonLabel,
    }))
  );

  const moments: RealMoment[] = await Promise.all(
    enrichedMomentRows.map(async ({ raw: m, seasonLabel, seasonStatus }) => {
      const computed = rarityAndOrdinals.get(m.id as string)!;
      // Same untyped-client many-to-one quirk documented throughout this
      // file — a moment references at most one card_definitions row.
      const linkedDefinitionDbRow = (m as unknown as { card_definitions: CardDefinitionDbRow | null }).card_definitions;
      const cardDefinition: CardFaceData | null = linkedDefinitionDbRow ? cardDefinitionToFaceData(toCardDefinitionRow(linkedDefinitionDbRow)) : null;
      const cardPhotoUrl = linkedDefinitionDbRow?.photo?.storageKey ? await getSignedDownloadUrl(linkedDefinitionDbRow.photo.storageKey) : null;
      return {
        id: m.id,
        title: m.title,
        occurredOn: m.occurred_on,
        createdAt: m.created_at,
        trust: m.trust,
        status: m.verification_status,
        note: m.note,
        media: await Promise.all(
          (m.moment_media ?? []).map(async (mm: { id: string; kind: 'photo' | 'video'; s3_key: string }) => ({
            id: mm.id,
            kind: mm.kind,
            url: await getSignedDownloadUrl(mm.s3_key),
          }))
        ),
        seasonLabel,
        seasonStatus,
        rarity: computed.rarity,
        careerOrdinal: computed.careerOrdinal,
        seasonOrdinal: computed.seasonOrdinal,
        cardDefinition,
        cardPhotoUrl,
        // Already selected via this query's select('*') — migration 0029
        // added the column, this just exposes it to the client for the
        // first time. Narrowed to 'private'/'public' at the type level
        // (see RealMoment) since no code path ever writes the two reserved
        // schema values.
        visibility: m.visibility === 'public' ? 'public' : 'private',
      };
    })
  );

  const currentSeasonLabel = player.teams?.seasons?.label ?? null;
  const matchedCurrentSeason = currentSeasonLabel ? seasonRanges.find((s) => s.label === currentSeasonLabel) : undefined;
  const currentSeasonStatus: 'active' | 'closed' | null = matchedCurrentSeason
    ? (matchedCurrentSeason.status === 'closed' ? 'closed' : 'active')
    : null;

  return {
    mode: 'real',
    squad: [],
    verifyQueue: [],
    coachActivity: [],
    playerProfile: {
      name: player.name,
      position: player.position ?? '',
      club: player.teams?.clubs?.name ?? '',
      age: player.age ?? 0,
      height: player.height ?? '',
      preferredFoot: (player.preferred_foot as 'Left' | 'Right') ?? 'Right',
      overallScore,
      seasonalChange: latestSnapshot?.seasonal_change ?? null,
      photoUrl: player.photo_key ? await getSignedDownloadUrl(player.photo_key) : null,
      squadNumber: player.squad_number ?? null,
      ageGroup: extractAgeGroup(player.teams?.name),
      memberSinceYear: player.created_at ? new Date(player.created_at).getFullYear() : null,
      season: player.teams?.seasons?.label ?? null,
      favouritePlayer: player.favourite_player ?? null,
      footballAmbition: player.football_ambition ?? null,
      secondaryPosition: player.secondary_position ?? null,
    },
    skillCategories,
    developmentSeasons,
    coachSummary: (latestSnapshot?.coach_summary as CoachSummary) ?? null,
    moments,
    teamId: null,
    playerId,
    viewerId: userId,
    connections,
    coachDisplayName: null,
    coachClub: null,
    coachTeamsManaged: [],
    goals,
    seasonFocus,
    strengths,
    assessments,
    claimedPlayers,
    currentSeasonStatus,
    cardDefinition,
    cardPhotoUrl,
    // Overridden by getOsData()'s outer spread, same as emptyConnections above.
    storyUpdates: [],
    unreadStoryUpdateCount: 0,
  };
}

async function getCoachOsData(supabase: ReturnType<typeof createClient>, userId: string): Promise<OsData> {
  const emptyConnections = {
    connections: [] as RealConnection[],
    viewerId: userId,
    coachDisplayName: null,
    coachClub: null,
    coachTeamsManaged: [] as CoachTeamSummary[],
    goals: [] as SeasonTarget[],
    // Overrides DEMO_OS_DATA's demo content in the "coach with no team yet"
    // early return below, which spreads ...DEMO_OS_DATA first — without
    // these, fake Season Focus/Strengths/Assessments would leak into what
    // must be a genuinely empty real state (Core Product Principle #6).
    seasonFocus: [] as SeasonFocusEntry[],
    strengths: [] as StrengthEntry[],
    assessments: [] as AssessmentEntry[],
  };

  const { data: teamLinks } = await supabase
    .from('coach_team')
    .select('team_id, teams ( name, clubs ( name, badge_url ) )')
    .eq('profile_id', userId);
  const teamIds = (teamLinks ?? []).map((t) => t.team_id);

  // Direct (team-independent) connections — coach_players.profile_id is
  // scoped to exactly this coach's own rows by RLS ("coach_players: a
  // coach can see their own connections", 0030_coach_players.sql). A
  // player reached only this way carries no team_id and is never folded
  // into teamIds/coachTeamsManaged/playerCounts below.
  const { data: directLinks } = await supabase.from('coach_players').select('player_id').eq('profile_id', userId);
  const directPlayerIds = (directLinks ?? []).map((d) => d.player_id as string);

  if (!teamIds.length && !directPlayerIds.length) {
    return { ...DEMO_OS_DATA, ...emptyConnections, mode: 'real', squad: [], verifyQueue: [], coachActivity: [], moments: [], teamId: null, claimedPlayers: [] };
  }

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();

  const [{ data: teamPlayers }, { data: directPlayersRaw }] = await Promise.all([
    teamIds.length
      ? supabase.from('players').select('id, name, position, squad_number, team_id, secondary_position').in('team_id', teamIds)
      : Promise.resolve({ data: [] as { id: string; name: string; position: string | null; squad_number: number | null; team_id: string | null; secondary_position: string | null }[] }),
    directPlayerIds.length
      ? supabase.from('players').select('id, name, position, squad_number, team_id, secondary_position').in('id', directPlayerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; position: string | null; squad_number: number | null; team_id: string | null; secondary_position: string | null }[] }),
  ]);

  // De-duplicated by id — a player connected to this coach both ways
  // (real team membership AND a separate direct connection) still
  // appears exactly once. Team membership is kept when both exist (it's
  // the richer, roster-scoped copy); the direct connection grants the
  // same capabilities regardless of which copy is kept, so this is a
  // display choice, not an authorization one.
  const seenPlayerIds = new Set<string>();
  const players = [...(teamPlayers ?? []), ...(directPlayersRaw ?? [])].filter((p) => {
    if (seenPlayerIds.has(p.id)) return false;
    seenPlayerIds.add(p.id);
    return true;
  });

  const playerIds = players.map((p) => p.id);

  // guardians has no coach-select RLS policy (only "a parent can see
  // their own links") — rather than add one, this reads via service-role
  // scoped to playerIds, which is already a coach-authorized set at this
  // point (players above came back through RLS's "visible to assigned
  // coaches" policy). Only a per-player count ever leaves this function —
  // no guardian row, no profile_id, no email.
  const { data: guardianRows } = playerIds.length
    ? await createServiceRoleClient().from('guardians').select('player_id').in('player_id', playerIds)
    : { data: [] as { player_id: string }[] };
  const guardianCounts = new Map<string, number>();
  (guardianRows ?? []).forEach((g) => guardianCounts.set(g.player_id as string, (guardianCounts.get(g.player_id as string) ?? 0) + 1));

  // player_invites already has a coach-select policy — no service-role
  // needed here, the ordinary session client is enough. Deliberately
  // never selects `code` — the code is only ever fetched on demand, via
  // GET /api/os/players/[id]/invite-link, when the coach actually opens
  // Manage Invite or taps Copy Link.
  const { data: inviteRows } = playerIds.length
    ? await supabase
        .from('player_invites')
        .select('player_id, expires_at')
        .in('player_id', playerIds)
        .is('used_at', null)
        .order('created_at', { ascending: false })
    : { data: [] as { player_id: string; expires_at: string }[] };
  const latestInviteByPlayer = new Map<string, { expiresAt: string }>();
  (inviteRows ?? []).forEach((inv) => {
    const playerId = inv.player_id as string;
    if (!latestInviteByPlayer.has(playerId)) {
      latestInviteByPlayer.set(playerId, { expiresAt: inv.expires_at as string });
    }
  });

  // Season Focus / Recognised Strengths / Coach's Assessment for every
  // player on this coach's teams, batch-fetched the same way
  // guardianRows/inviteRows are above, then grouped per player_id — one
  // query each rather than one per squad row.
  const { data: seasonFocusRows } = playerIds.length
    ? await supabase
        .from('player_season_focus')
        .select('*, profiles ( display_name )')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] as never[] };
  const { data: strengthRows } = playerIds.length
    ? await supabase
        .from('player_strengths')
        .select('*')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] as never[] };
  const { data: assessmentRows } = playerIds.length
    ? await supabase
        .from('player_assessments')
        .select('*, profiles ( display_name )')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] as never[] };

  type ProfileNameEmbed = { display_name: string | null } | null;
  type SeasonFocusDbRow = {
    id: string; player_id: string; label: string; created_by: string; author_role: 'guardian' | 'coach';
    status: 'active' | 'completed' | 'archived'; created_at: string; profiles: ProfileNameEmbed;
  };
  type AssessmentDbRow = { id: string; player_id: string; body: string; created_at: string; profiles: ProfileNameEmbed };

  const seasonFocusByPlayer = new Map<string, SeasonFocusEntry[]>();
  ((seasonFocusRows ?? []) as unknown as SeasonFocusDbRow[]).forEach((f) => {
    const list = seasonFocusByPlayer.get(f.player_id) ?? [];
    list.push({
      id: f.id,
      label: f.label,
      createdBy: f.created_by,
      authorName: f.profiles?.display_name ?? null,
      authorRole: f.author_role,
      createdAt: f.created_at,
      status: f.status,
    });
    seasonFocusByPlayer.set(f.player_id, list);
  });

  const strengthsByPlayer = new Map<string, StrengthEntry[]>();
  (strengthRows ?? []).forEach((s) => {
    const list = strengthsByPlayer.get(s.player_id) ?? [];
    list.push({ id: s.id, label: s.label, createdAt: s.created_at });
    strengthsByPlayer.set(s.player_id, list);
  });

  const assessmentsByPlayer = new Map<string, AssessmentEntry[]>();
  ((assessmentRows ?? []) as unknown as AssessmentDbRow[]).forEach((a) => {
    const list = assessmentsByPlayer.get(a.player_id) ?? [];
    list.push({ id: a.id, body: a.body, authorName: a.profiles?.display_name ?? null, createdAt: a.created_at });
    assessmentsByPlayer.set(a.player_id, list);
  });

  const squad: SquadPlayer[] = players.map((p) => {
    const guardianCount = guardianCounts.get(p.id) ?? 0;
    const latestInvite = latestInviteByPlayer.get(p.id);
    const guardianStatus = deriveGuardianStatus(guardianCount, latestInvite);
    return {
      id: p.id,
      name: p.name,
      num: p.squad_number ?? 0,
      pos: p.position ?? '',
      status: 'Add recognition',
      guardianStatus,
      guardianCount,
      latestInviteExpiresAt: guardianStatus === 'pending' || guardianStatus === 'expired' ? latestInvite?.expiresAt ?? null : null,
      hasManageableInvite: guardianStatus === 'pending',
      secondaryPosition: p.secondary_position ?? null,
      seasonFocus: seasonFocusByPlayer.get(p.id) ?? [],
      strengths: strengthsByPlayer.get(p.id) ?? [],
      assessments: assessmentsByPlayer.get(p.id) ?? [],
      teamId: p.team_id ?? null,
    };
  });
  const { data: pendingMoments } = playerIds.length
    ? await supabase
        .from('moments')
        .select('*, players ( name ), moment_media (*)')
        .in('player_id', playerIds)
        .eq('verification_status', 'pending_verification')
        .order('created_at', { ascending: false })
    : { data: [] as never[] };

  const verifyQueue: VerifyItem[] = await Promise.all(
    (pendingMoments ?? []).map(async (m) => {
      const firstMedia = (m.moment_media ?? [])[0] as { s3_key: string } | undefined;
      return {
        id: m.id,
        player: m.players?.name ?? '',
        playerId: m.player_id,
        moment: m.title,
        thumb: firstMedia ? await getSignedDownloadUrl(firstMedia.s3_key) : '',
        by: 'Parent',
        date: m.occurred_on ?? new Date(m.created_at).toLocaleDateString('en-GB'),
      };
    })
  );

  // Team-linked players only — a direct connection never inflates a
  // team's displayed roster count (coachTeamsManaged[].playerCount below
  // reads this map only by real team_id, but the filter keeps a stray
  // null-keyed entry out entirely rather than relying on that).
  const playerCounts = new Map<string, number>();
  players.forEach((p) => {
    if (p.team_id) playerCounts.set(p.team_id, (playerCounts.get(p.team_id) ?? 0) + 1);
  });

  // Same wrong-array-inference quirk as the guardians/coach_team join
  // above — teams and clubs are genuinely single objects per coach_team
  // row at runtime (confirmed directly against the real database), despite
  // how the untyped client's TypeScript types this multi-row select.
  type TeamLinkRow = { team_id: string; teams: { name: string; clubs: { name: string; badge_url: string | null } | null } | null };
  const teamLinkRows = (teamLinks ?? []) as unknown as TeamLinkRow[];
  const coachTeamsManaged: CoachTeamSummary[] = teamLinkRows.map((t) => ({
    id: t.team_id,
    name: t.teams?.name ?? '',
    playerCount: playerCounts.get(t.team_id) ?? 0,
  }));
  const firstClub = teamLinkRows[0]?.teams?.clubs;
  const coachClub = firstClub ? { name: firstClub.name, location: null } : null;

  return {
    // playerProfile/skillCategories/etc. aren't rendered anywhere in the
    // coach view — kept as harmless demo placeholders rather than adding a
    // second nullable-everything shape just for a session type nothing reads.
    ...DEMO_OS_DATA,
    mode: 'real',
    squad,
    verifyQueue,
    coachActivity: [],
    moments: [],
    teamId: teamIds[0] ?? null,
    playerId: null,
    viewerId: userId,
    connections: [],
    coachDisplayName: profile?.display_name ?? null,
    coachClub,
    coachTeamsManaged,
    goals: [],
    // Coach sessions carry Season Focus/Strengths/Assessments per-player on
    // `squad[].seasonFocus` etc. (already populated above), never at this
    // top level — zeroed here for the same reason `goals` is, so
    // DEMO_OS_DATA's demo content can't leak into a real coach session.
    seasonFocus: [],
    strengths: [],
    assessments: [],
    claimedPlayers: [],
  };
}
