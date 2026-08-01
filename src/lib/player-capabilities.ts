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

  // isCoach is team-based coach access OR direct coach_players access —
  // the two permanent, independent paths from the coach-connection
  // architecture milestone plan. Neither check implies anything about
  // the other; a direct row only ever matches this exact playerId, so it
  // can never widen into siblings, a team roster, or club/league access.
  // This is the one place that OR is ever evaluated — every caller
  // (public-profile capability check, the guardian-bypass redirect,
  // future Coach OS/Coach Player Detail authorization) reads only the
  // resulting boolean, never re-derives it.
  const [{ data: guardianRow }, coachTeamRow, coachDirectRow] = await Promise.all([
    serviceRole.from('guardians').select('player_id').eq('player_id', playerId).eq('profile_id', userId).maybeSingle(),
    player?.team_id
      ? serviceRole.from('coach_team').select('team_id').eq('team_id', player.team_id).eq('profile_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
    serviceRole.from('coach_players').select('player_id').eq('player_id', playerId).eq('profile_id', userId).maybeSingle(),
  ]);

  return {
    isGuardian: !!guardianRow,
    isCoach: !!coachTeamRow.data || !!coachDirectRow.data,
  };
}

/**
 * Every profile_id currently eligible to act as this player's coach —
 * team-based (coach_team via player.team_id) unioned with direct
 * (coach_players), de-duplicated. This is the single centralised place
 * "eligible coach = team coach OR direct coach" is computed for
 * recipient fan-out and existence checks (hasEligibleCoach-style logic)
 * — every call site listed in the coach-connection milestone plan
 * (moment upload, season focus notification, invite/claim notification)
 * reads this instead of re-deriving the union itself.
 *
 * `client` may be either the session-scoped client or a service-role
 * client — both work under RLS today: a guardian's own session can
 * already read coach_team for their player's team (0006's
 * is_guardian_of_team_player) and coach_players for their own player
 * (0030's guardian-select policy), so callers acting on behalf of a
 * guardian don't need to escalate to service-role just for this.
 */
export async function getEligibleCoachProfileIds(client: SupabaseClient, playerId: string): Promise<string[]> {
  const { data: player } = await client.from('players').select('team_id').eq('id', playerId).maybeSingle();

  const [teamCoachRows, directCoachRows] = await Promise.all([
    player?.team_id
      ? client.from('coach_team').select('profile_id').eq('team_id', player.team_id)
      : Promise.resolve({ data: [] as { profile_id: string }[] }),
    client.from('coach_players').select('profile_id').eq('player_id', playerId),
  ]);

  const ids = new Set<string>();
  (teamCoachRows.data ?? []).forEach((r) => ids.add(r.profile_id as string));
  (directCoachRows.data ?? []).forEach((r) => ids.add(r.profile_id as string));
  return Array.from(ids);
}
