import type { SupabaseClient } from '@supabase/supabase-js';

export type PlayerCapabilities = {
  isGuardian: boolean;
  isCoach: boolean;
};

const NONE: PlayerCapabilities = { isGuardian: false, isCoach: false };

/**
 * Determines what an authenticated viewer is allowed to *do* on a player's
 * public profile — never whether they're allowed to *see* it (that's the
 * public-safe query's job, and it never checks this). Mirrors the same
 * guardian-of-player / coach-of-team relationships every RLS policy in this
 * codebase already encodes, but as an explicit application-level check —
 * needed here because the public profile route sits outside RLS's reach on
 * purpose (see public-player-profile.ts).
 *
 * Always keyed off `userId` resolved server-side from the caller's own
 * session — never accept a client-supplied id for this check.
 */
export async function resolvePlayerCapabilities(
  serviceRole: SupabaseClient,
  playerId: string,
  userId: string | null
): Promise<PlayerCapabilities> {
  if (!userId) return NONE;

  const { data: player } = await serviceRole.from('players').select('team_id').eq('id', playerId).maybeSingle();

  const [{ data: guardianRow }, coachRow] = await Promise.all([
    serviceRole.from('guardians').select('player_id').eq('player_id', playerId).eq('profile_id', userId).maybeSingle(),
    player?.team_id
      ? serviceRole.from('coach_team').select('team_id').eq('team_id', player.team_id).eq('profile_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    isGuardian: !!guardianRow,
    isCoach: !!coachRow.data,
  };
}
