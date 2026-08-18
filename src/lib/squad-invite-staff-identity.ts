import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SquadInviteStaffPermission } from './squad-invite-mvp';

/**
 * All currently-active (non-revoked) Squad Invite permissions for a staff
 * member who has ALREADY been confirmed authenticated + staff by
 * requireSquadInvitePermission — this is display-only, never itself a gate.
 * It exists so the UI can show "Signed in as [email], permissions: [...]"
 * and explain (not enforce) which actions this account can take; every
 * mutation route's own single-permission requireSquadInvitePermission call
 * remains the sole authority (see require-squad-invite-permission.ts).
 */
export async function listSquadInviteStaffPermissions(staffProfileId: string): Promise<SquadInviteStaffPermission[]> {
  const { data } = await createServiceRoleClient()
    .from('squad_invite_staff_permissions')
    .select('permission')
    .eq('staff_profile_id', staffProfileId)
    .is('revoked_at', null);
  return (data ?? []).map((row) => row.permission as SquadInviteStaffPermission);
}
