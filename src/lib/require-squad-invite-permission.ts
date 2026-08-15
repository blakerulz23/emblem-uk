import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import type { SquadInviteStaffPermission } from './squad-invite-mvp';

/**
 * Accepts either one permission (exact match, used by every mutation
 * endpoint — start_review/request_changes/reject need reviewer; approve/
 * cancel-approval/resend need approver, never both) or a list (OR match,
 * used only by read-access checks that must accept any staff member with
 * squad-invite authority at all, regardless of which specific permission
 * they hold). A single string and a one-element array behave identically.
 */
export async function requireSquadInvitePermission(client: SupabaseClient, permission: SquadInviteStaffPermission | SquadInviteStaffPermission[]) {
  const staff = await requireStaff(client);
  if (!staff.ok) return staff;
  const permissions = Array.isArray(permission) ? permission : [permission];
  const { data } = await createServiceRoleClient().from('squad_invite_staff_permissions')
    .select('staff_profile_id').eq('staff_profile_id',staff.userId).in('permission',permissions).is('revoked_at',null).maybeSingle();
  if (!data) return { ok:false as const,status:403,error:'Squad Invite permission required' };
  return { ok:true as const,userId:staff.userId };
}
