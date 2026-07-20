import { createClient } from '@/lib/supabase/server';
import { DEMO_OS_DATA } from '@/app/os/osData';
import type { OsData, RealMoment } from '@/app/os/osData';
import type { SkillCategory, CoachSummary, DevelopmentSeason } from '@/app/os/playerProfile';
import { computeOverallScore, MIDFIELDER_WEIGHTS } from '@/app/os/scoring';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import type { SquadPlayer, VerifyItem } from '@/app/os/types';

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
export async function getOsData(userId: string | null, profileRole: 'parent' | 'coach' | null): Promise<OsData> {
  if (!userId || !SUPABASE_CONFIGURED) {
    return DEMO_OS_DATA;
  }

  const supabase = createClient();

  if (profileRole === 'coach') {
    return getCoachOsData(supabase, userId);
  }
  return getParentOsData(supabase, userId);
}

async function getParentOsData(supabase: ReturnType<typeof createClient>, userId: string): Promise<OsData> {
  const { data: guardianLinks } = await supabase.from('guardians').select('player_id').eq('profile_id', userId);
  const playerId = guardianLinks?.[0]?.player_id as string | undefined;

  if (!playerId) {
    return { ...DEMO_OS_DATA, mode: 'real', squad: [], verifyQueue: [], coachActivity: [], moments: [], playerId: null };
  }

  const [{ data: player }, { data: snapshots }, { data: momentRows }] = await Promise.all([
    supabase
      .from('players')
      .select('*, teams ( name, season, clubs ( name ) )')
      .eq('id', playerId)
      .maybeSingle(),
    supabase
      .from('player_skill_snapshots')
      .select('*')
      .eq('player_id', playerId)
      .order('season', { ascending: false }),
    supabase
      .from('moments')
      .select('*, moment_media (*)')
      .eq('player_id', playerId)
      .not('verified_at', 'is', null)
      .order('created_at', { ascending: false }),
  ]);

  if (!player) {
    return { ...DEMO_OS_DATA, mode: 'real', squad: [], verifyQueue: [], coachActivity: [], moments: [] };
  }

  const latestSnapshot = snapshots?.[0];
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
    (snapshots?.length ?? 0) >= 2
      ? [...(snapshots ?? [])]
          .reverse()
          .map((s) => ({
            season: s.season,
            overallScore: computeOverallScore(
              Object.fromEntries(((s.skills as SkillCategory[]) ?? []).map((c) => [c.id, c.categoryScore])),
              MIDFIELDER_WEIGHTS
            ),
            change: s.seasonal_change ?? 0,
            biggestImprovements: [],
          }))
      : [];

  const moments: RealMoment[] = await Promise.all(
    (momentRows ?? []).map(async (m) => ({
      id: m.id,
      title: m.title,
      occurredOn: m.occurred_on,
      trust: m.trust,
      note: m.note,
      media: await Promise.all(
        (m.moment_media ?? []).map(async (mm: { id: string; kind: 'photo' | 'video'; s3_key: string }) => ({
          id: mm.id,
          kind: mm.kind,
          url: await getSignedDownloadUrl(mm.s3_key),
        }))
      ),
    }))
  );

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
    },
    skillCategories,
    developmentSeasons,
    coachSummary: (latestSnapshot?.coach_summary as CoachSummary) ?? null,
    moments,
    teamId: null,
    playerId,
  };
}

async function getCoachOsData(supabase: ReturnType<typeof createClient>, userId: string): Promise<OsData> {
  const { data: teamLinks } = await supabase.from('coach_team').select('team_id').eq('profile_id', userId);
  const teamIds = (teamLinks ?? []).map((t) => t.team_id);

  if (!teamIds.length) {
    return { ...DEMO_OS_DATA, mode: 'real', squad: [], verifyQueue: [], coachActivity: [], moments: [], teamId: null };
  }

  const { data: players } = await supabase
    .from('players')
    .select('id, name, position, squad_number')
    .in('team_id', teamIds);

  const squad: SquadPlayer[] = (players ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    num: p.squad_number ?? 0,
    pos: p.position ?? '',
    status: 'Add recognition',
  }));

  const playerIds = (players ?? []).map((p) => p.id);
  const { data: pendingMoments } = playerIds.length
    ? await supabase
        .from('moments')
        .select('*, players ( name ), moment_media (*)')
        .in('player_id', playerIds)
        .is('verified_at', null)
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
  };
}
