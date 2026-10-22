import type { SupabaseClient } from '@supabase/supabase-js';
import { logRouteFailure } from '@/lib/route-failure';

/**
 * The application's trusted role write (migration 0088). It goes through a
 * service_role-only database function, never the signed-in session: 0089
 * removes the session's ability to write profiles.role, and service_role
 * itself holds no direct INSERT/UPDATE on profiles.
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

// Team-invite redemption is a single call to redeem_team_invite (see
// src/app/api/os/team-invites/redeem/route.ts), which claims the invite,
// sets the role and creates or reactivates the assignment atomically.
