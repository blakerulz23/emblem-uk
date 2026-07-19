import { createClient } from '@/lib/supabase/server';
import { DEMO_OS_DATA } from '@/app/os/osData';
import type { OsData } from '@/app/os/osData';
import type { SkillCategory } from '@/app/os/playerProfile';
import { computeOverallScore, MIDFIELDER_WEIGHTS } from '@/app/os/scoring';

export type OsSession = {
  userId: string;
  email: string | null;
};

export type OsAccount = {
  session: OsSession | null;
  profileRole: 'parent' | 'coach' | null;
};

/** Reads the current Supabase session + profile role. Null session/role when Supabase isn't configured or the visitor hasn't signed in yet. */
export async function getOsAccount(): Promise<OsAccount> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { session: null, profileRole: null };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { session: null, profileRole: null };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

  return {
    session: { userId: user.id, email: user.email ?? null },
    profileRole: (profile?.role as 'parent' | 'coach' | undefined) ?? null,
  };
}

/**
 * Fetches the real player/team data this signed-in user is a guardian of
 * (or coaches), for whichever player the RLS policies let them see first.
 * Falls back to the Ollie Harrison demo data when Supabase isn't configured,
 * or the profile has no linked player yet — e.g. right after sign-up, before
 * a card has ever been linked to a real child.
 */
export async function getOsData(userId: string | null): Promise<OsData> {
  if (!userId || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEMO_OS_DATA;
  }

  const supabase = createClient();

  const { data: guardianLinks } = await supabase.from('guardians').select('player_id').eq('profile_id', userId);
  const playerId = guardianLinks?.[0]?.player_id as string | undefined;

  if (!playerId) return DEMO_OS_DATA;

  const [{ data: player }, { data: snapshot }] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).maybeSingle(),
    supabase
      .from('player_skill_snapshots')
      .select('*')
      .eq('player_id', playerId)
      .order('season', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!player || !snapshot) return DEMO_OS_DATA;

  const skillCategories = snapshot.skills as SkillCategory[];
  const overallScore = computeOverallScore(
    Object.fromEntries(skillCategories.map((c) => [c.id, c.categoryScore])),
    MIDFIELDER_WEIGHTS
  );

  return {
    squad: DEMO_OS_DATA.squad,
    verifyQueue: DEMO_OS_DATA.verifyQueue,
    coachActivity: DEMO_OS_DATA.coachActivity,
    playerProfile: {
      name: player.name,
      position: player.position ?? DEMO_OS_DATA.playerProfile.position,
      club: DEMO_OS_DATA.playerProfile.club,
      age: player.age ?? DEMO_OS_DATA.playerProfile.age,
      height: player.height ?? DEMO_OS_DATA.playerProfile.height,
      preferredFoot: (player.preferred_foot as 'Left' | 'Right') ?? DEMO_OS_DATA.playerProfile.preferredFoot,
      overallScore,
      seasonalChange: snapshot.seasonal_change ?? 0,
    },
    skillCategories,
    developmentSeasons: DEMO_OS_DATA.developmentSeasons,
    coachSummary: (snapshot.coach_summary as OsData['coachSummary']) ?? DEMO_OS_DATA.coachSummary,
  };
}
