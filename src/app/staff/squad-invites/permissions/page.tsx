import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { listSquadInviteStaffPermissions } from '@/lib/squad-invite-staff-identity';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import StaffIdentityPanel from '../StaffIdentityPanel';
import PermissionToggle from './PermissionToggle';

export const dynamic = 'force-dynamic';

// The first *write* surface for squad_invite_staff_permissions — every
// grant before this was a raw SQL insert with zero trace in the codebase
// (confirmed via migration-0052-contract.test.ts, which asserts 0052 never
// grants anyone a permission implicitly). Gated on Approver, same tier as
// every other consequential Squad Invite action (approve, cancel-approval,
// finalise-pricing, lock-coach-card) — there is no separate admin tier in
// this schema, and this deliberately reuses Approver rather than inventing one.
export default async function SquadInvitePermissionsAdmin() {
  if (!isSquadInviteMvpEnabled()) notFound();
  const access = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!access.ok) {
    if (access.status === 401) redirect('/staff/login?next=/staff/squad-invites/permissions');
    notFound();
  }
  const [{ data: { user } }, staffPermissions] = await Promise.all([
    createClient().auth.getUser(),
    listSquadInviteStaffPermissions(access.userId),
  ]);
  const staffEmail = user?.email ?? '';
  const service = createServiceRoleClient();

  const [{ data: staffRows }, { data: permissionRows }] = await Promise.all([
    service.from('staff_accounts').select('profile_id,profiles(display_name)').order('created_at', { ascending: true }),
    service.from('squad_invite_staff_permissions').select('staff_profile_id,permission').is('revoked_at', null),
  ]);

  const heldByStaff = new Map<string, Set<string>>();
  for (const row of permissionRows ?? []) {
    if (!heldByStaff.has(row.staff_profile_id)) heldByStaff.set(row.staff_profile_id, new Set());
    heldByStaff.get(row.staff_profile_id)!.add(row.permission);
  }

  // staff_accounts/profiles carry no email — auth.users is the only place
  // it lives, so resolving each staff member's email needs the admin API
  // (same surface already used for account deletion in
  // src/app/api/os/account/delete/route.ts, just getUserById instead of
  // deleteUser). Staff accounts are provisioned manually and are few, so N
  // parallel lookups here is fine — listUsers() would return every parent/
  // guardian too, which this page must never do.
  const rows = await Promise.all(
    (staffRows ?? []).map(async (r) => {
      const profileRaw = r.profiles as unknown;
      const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { display_name: string | null } | null;
      const { data: userData } = await service.auth.admin.getUserById(r.profile_id);
      const held = heldByStaff.get(r.profile_id);
      return {
        profileId: r.profile_id,
        displayName: profile?.display_name ?? null,
        email: userData?.user?.email ?? 'Unknown',
        reviewer: held?.has('squad_invite_reviewer') ?? false,
        approver: held?.has('squad_invite_approver') ?? false,
      };
    }),
  );

  return <div className="mx-auto max-w-3xl px-5 py-12 pb-28">
    <Link href="/staff/squad-invites" className="text-sm font-bold text-orange-600 hover:text-orange-700">← Back to Squad Invite queue</Link>
    <p className="mt-4 text-sm font-bold uppercase tracking-widest text-orange-600">Staff permissions</p>
    <h1 className="mt-1 text-3xl font-bold">Manage Squad Invite access</h1>
    <StaffIdentityPanel email={staffEmail} permissions={staffPermissions} />
    <p className="mt-6 text-sm text-neutral-600">Any Approver can grant or revoke either permission for any staff account. Revoking the last remaining Approver is blocked — there must always be at least one.</p>
    <div className="mt-4 grid gap-3">
      {rows.map((r) => (
        <div key={r.profileId} className="rounded-2xl border bg-white p-5">
          <p className="font-bold">{r.displayName ?? r.email}</p>
          {r.displayName && <p className="text-sm text-neutral-600">{r.email}</p>}
          <div className="mt-3 flex flex-wrap gap-4">
            <PermissionToggle staffProfileId={r.profileId} permission="squad_invite_reviewer" label="Reviewer" granted={r.reviewer} />
            <PermissionToggle staffProfileId={r.profileId} permission="squad_invite_approver" label="Approver" granted={r.approver} />
          </div>
        </div>
      ))}
    </div>
  </div>;
}
