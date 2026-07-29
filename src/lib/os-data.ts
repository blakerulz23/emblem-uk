import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { DEMO_OS_DATA } from '@/app/os/osData';
import type { OsData, RealMoment, RealConnection, CoachTeamSummary } from '@/app/os/osData';
import type { SkillCategory, CoachSummary, DevelopmentSeason, SeasonTarget, PlayerProfile } from '@/app/os/playerProfile';
import { extractAgeGroup } from '@/app/os/playerProfile';
import { computeOverallScore, MIDFIELDER_WEIGHTS } from '@/app/os/scoring';
import { cardDefinitionToFaceData } from '@/lib/card-definition';
import type { CardDefinitionRow, CardFaceData } from '@/lib/card-definition';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import type { SquadPlayer, VerifyItem, GuardianStatus } from '@/app/os/types';

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
    if (a.effectiveDate && b.effectiveDate) return a.effectiveDate.localeCompare(b.effectiveDate);
    if (a.effectiveDate && !b.effectiveDate) return -1;
    if (!a.effectiveDate && b.effectiveDate) return 1;
    return 0;
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
    const { count } = await supabase
      .from('coach_team')
      .select('team_id', { count: 'exact', head: true })
      .eq('profile_id', user.id);
    hasTeam = (count ?? 0) > 0;
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

  if (profileRole === 'coach') {
    return getCoachOsData(supabase, userId);
  }
  return getParentOsData(supabase, userId, requestedPlayerId ?? undefined);
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

  const emptyConnections = { connections: [], viewerId: userId, coachDisplayName: null, coachClub: null, coachTeamsManaged: [], goals: [] };

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

  const [{ data: player }, { data: snapshots }, { data: momentRows }, { data: guardianRows }, { data: goalRows }, { data: claimedPlayerRows }, { data: seasonRows }, { data: cardRow }] = await Promise.all([
    supabase
      .from('players')
      .select('*, teams ( name, clubs ( name ), seasons ( label ) )')
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
  ]);

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

  // coach_team lookup depends on player.team_id, so it can't join the
  // Promise.all above — only known once `player` resolves.
  const { data: coachRows } = player.team_id
    ? await supabase
        .from('coach_team')
        .select('profile_id, profiles ( display_name )')
        .eq('team_id', player.team_id)
    : { data: [] as never[] };

  // Supabase's untyped client (no generated Database schema here)
  // mis-infers embedded-resource joins on a multi-row select as arrays in
  // its TypeScript types — but PostgREST's actual runtime response for a
  // many-to-one FK (confirmed directly against the real database) is a
  // single object, same as it is on a .maybeSingle() query. Cast past the
  // wrong inferred type rather than indexing [0] into something that was
  // never really a list.
  type ProfileNameRow = { profile_id: string; profiles: { display_name: string | null } | null };
  const connections: RealConnection[] = [
    ...((guardianRows ?? []) as unknown as (ProfileNameRow & { relationship: string | null })[]).map((g) => ({
      profileId: g.profile_id,
      displayName: g.profiles?.display_name ?? null,
      relationship: g.relationship,
      kind: 'guardian' as const,
    })),
    ...((coachRows ?? []) as unknown as ProfileNameRow[]).map((c) => ({
      profileId: c.profile_id,
      displayName: c.profiles?.display_name ?? null,
      relationship: null,
      kind: 'coach' as const,
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
    claimedPlayers,
    currentSeasonStatus,
    cardDefinition,
    cardPhotoUrl,
  };
}

async function getCoachOsData(supabase: ReturnType<typeof createClient>, userId: string): Promise<OsData> {
  const emptyConnections = { connections: [] as RealConnection[], viewerId: userId, coachDisplayName: null, coachClub: null, coachTeamsManaged: [] as CoachTeamSummary[], goals: [] as SeasonTarget[] };

  const { data: teamLinks } = await supabase
    .from('coach_team')
    .select('team_id, teams ( name, clubs ( name, badge_url ) )')
    .eq('profile_id', userId);
  const teamIds = (teamLinks ?? []).map((t) => t.team_id);

  if (!teamIds.length) {
    return { ...DEMO_OS_DATA, ...emptyConnections, mode: 'real', squad: [], verifyQueue: [], coachActivity: [], moments: [], teamId: null, claimedPlayers: [] };
  }

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();

  const { data: players } = await supabase
    .from('players')
    .select('id, name, position, squad_number, team_id')
    .in('team_id', teamIds);

  const playerIds = (players ?? []).map((p) => p.id);

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

  const squad: SquadPlayer[] = (players ?? []).map((p) => {
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
        moment: m.title,
        thumb: firstMedia ? await getSignedDownloadUrl(firstMedia.s3_key) : '',
        by: 'Parent',
        date: m.occurred_on ?? new Date(m.created_at).toLocaleDateString('en-GB'),
      };
    })
  );

  const playerCounts = new Map<string, number>();
  (players ?? []).forEach((p) => playerCounts.set(p.team_id, (playerCounts.get(p.team_id) ?? 0) + 1));

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
    claimedPlayers: [],
  };
}
