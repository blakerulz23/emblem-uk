import type { createServiceRoleClient } from '@/lib/supabase/server';

export type StaffNotificationRecipientScope = 'all_staff' | 'squad_invite_reviewer' | 'squad_invite_approver';

/**
 * Resolves who should receive a staff notification of a given scope, right
 * now, at dispatch time — never a stored recipient list, since staff
 * accounts/permissions can change between enqueue and send.
 *
 * Neither `staff_accounts` nor `profiles` carries an email column — email
 * lives only in auth.users, so each profile's address is resolved via
 * `auth.admin.getUserById`, the exact pattern already used in
 * src/app/staff/squad-invites/permissions/page.tsx. Fine at this team's
 * size (staff accounts are provisioned manually and are few); this does
 * not scale to a large staff roster without a cache, same caveat that
 * page's own comment already carries.
 */
export async function resolveStaffNotificationRecipients(
  service: ReturnType<typeof createServiceRoleClient>,
  scope: StaffNotificationRecipientScope,
): Promise<string[]> {
  let profileIds: string[];

  if (scope === 'all_staff') {
    const { data } = await service.from('staff_accounts').select('profile_id');
    profileIds = (data ?? []).map((r) => r.profile_id as string);
  } else {
    const { data } = await service
      .from('squad_invite_staff_permissions')
      .select('staff_profile_id')
      .eq('permission', scope)
      .is('revoked_at', null);
    profileIds = (data ?? []).map((r) => r.staff_profile_id as string);
  }

  const emails = await Promise.all(
    profileIds.map(async (profileId) => {
      const { data } = await service.auth.admin.getUserById(profileId);
      return data?.user?.email ?? null;
    }),
  );

  return emails.filter((email): email is string => Boolean(email));
}
