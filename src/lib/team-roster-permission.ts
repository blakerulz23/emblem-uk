import type { SupabaseClient } from '@supabase/supabase-js';
import { COACH_ASSIGNMENT_STATE_COLUMNS, isActiveCoachAssignment } from '@/lib/coach-assignment';
import type { CoachAssignmentState } from '@/lib/coach-assignment';

/**
 * Adding a roster player to a team needs an active team assignment for
 * that team. A direct coach_players link (one player, no team) and
 * profiles.role never grant it. RLS ("players: coaches can add roster
 * players to their team", narrowed to active assignments by 0089) stays
 * the authority; the route checks first so a refused write gets a clean
 * 403 instead of a raw database error.
 */
export const ROSTER_ADD_DENIED_MESSAGE = 'You no longer have permission to add players to this team.';
export const ROSTER_ADD_FAILED_MESSAGE = 'Could not add the player. Please try again.';

/**
 * Whether Coach OS shows "+ Add Player". Coach OS data sets teamId only from
 * an active team assignment (lib/os-data.ts), and Parent OS data never sets
 * it, so an ended, expired, direct-link-only or role-only coach, and a dual
 * account in its Parent view, all get false.
 */
export function canAddRosterPlayers(data: { mode: 'demo' | 'real'; teamId: string | null }): boolean {
  return data.mode === 'real' && !!data.teamId;
}

export type TeamAssignmentCheck = 'active' | 'none' | 'error';

export async function checkActiveTeamAssignment(
  client: SupabaseClient,
  teamId: string,
  profileId: string
): Promise<TeamAssignmentCheck> {
  const { data, error } = await client
    .from('coach_team')
    .select(`team_id, ${COACH_ASSIGNMENT_STATE_COLUMNS}`)
    .eq('team_id', teamId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) return 'error';
  return data && isActiveCoachAssignment(data as CoachAssignmentState) ? 'active' : 'none';
}

/** PostgREST reports an RLS or privilege refusal as SQLSTATE 42501. */
export function isPermissionDenied(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '');
}
