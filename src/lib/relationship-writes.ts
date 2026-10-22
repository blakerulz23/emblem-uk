import type { SupabaseClient } from '@supabase/supabase-js';
import { logRouteFailure } from '@/lib/route-failure';

/**
 * The application's trusted relationship writes (migration 0088). Both go
 * through service_role-only database functions, never the signed-in
 * session: 0089 removes the session's ability to write profiles.role and
 * coach_team, and service_role itself holds no direct INSERT/UPDATE on
 * profiles or UPDATE on coach_team.
 */

export type ProfileRole = 'parent' | 'coach';

/**
 * Creates the profile if it's missing and sets `role` only when the profile
 * has none. Never overwrites an existing role: a coach claiming their own
 * child stays a coach, a parent accepting a coach invite stays a parent.
 * The role is only a view preference; access comes from relationships.
 * Applies `displayName` when one is given.
 *
 * A failure is logged with its code only and reported as `{ ok: false }`:
 * callers answer with their own fixed message, never the database's.
 */
export async function ensureProfileRole(
  serviceRole: SupabaseClient,
  profileId: string,
  role: ProfileRole,
  displayName?: string | null
): Promise<{ ok: true; role: ProfileRole } | { ok: false }> {
  const { data, error } = await serviceRole.rpc('ensure_profile_role', {
    p_profile_id: profileId,
    p_role: role,
    p_display_name: displayName?.trim() || null,
  });
  if (error) {
    logRouteFailure('ensure_profile_role', error);
    return { ok: false };
  }
  return { ok: true, role: data as ProfileRole };
}

/**
 * Makes (team, profile) an active coach assignment: inserts a new one with
 * its creation details, or reactivates an ended or expired one. An active
 * assignment is left as it is. `actorProfileId` is the account that
 * initiated it (for a team invite, the person redeeming it), recorded in
 * the relationship audit trail.
 */
export async function activateCoachAssignment(
  serviceRole: SupabaseClient,
  params: { teamId: string; profileId: string; createdVia: 'team_invite' | 'staff'; actorProfileId: string }
): Promise<{ ok: true; changed: boolean } | { ok: false }> {
  const { data, error } = await serviceRole.rpc('activate_coach_assignment', {
    p_team_id: params.teamId,
    p_profile_id: params.profileId,
    p_created_via: params.createdVia,
    p_actor_profile_id: params.actorProfileId,
  });
  if (error) {
    logRouteFailure('activate_coach_assignment', error);
    return { ok: false };
  }
  return { ok: true, changed: data === true };
}
