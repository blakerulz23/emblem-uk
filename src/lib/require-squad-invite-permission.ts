import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import type { SquadInviteStaffPermission } from './squad-invite-mvp';

export async function requireSquadInvitePermission(client: SupabaseClient, permission: SquadInviteStaffPermission) {
  const staff = await requireStaff(client);
  if (!staff.ok) return staff;
  const { data } = await createServiceRoleClient().from('squad_invite_staff_permissions')
    .select('staff_profile_id').eq('staff_profile_id',staff.userId).eq('permission',permission).is('revoked_at',null).maybeSingle();
  if (!data) return { ok:false as const,status:403,error:'Squad Invite permission required' };
  return { ok:true as const,userId:staff.userId };
}
