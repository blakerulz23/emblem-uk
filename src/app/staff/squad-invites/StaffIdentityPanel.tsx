import Link from 'next/link';
import type { SquadInviteStaffPermission } from '@/lib/squad-invite-mvp';

const PERMISSION_BADGES: { key: SquadInviteStaffPermission; label: string }[] = [
  { key: 'squad_invite_reviewer', label: 'Reviewer' },
  { key: 'squad_invite_approver', label: 'Approver' },
];

// Staff-only, server-rendered inside the two Squad Invite staff pages —
// never imported by a public, organiser or parent route/projection. The
// email prop must always originate from the server-authenticated Supabase
// session (client.auth.getUser()), never from a request body, URL or
// searchParams — see the callers in page.tsx / [reference]/page.tsx.
export default function StaffIdentityPanel({ email, permissions }: { email: string; permissions: SquadInviteStaffPermission[] }) {
  const held = PERMISSION_BADGES.filter((badge) => permissions.includes(badge.key));
  return (
    <section aria-label="Signed-in staff identity" className="mt-6 rounded-2xl border bg-white p-5 text-sm">
      <p>
        <span className="font-bold uppercase tracking-wide text-xs text-neutral-500">Signed in as</span>
        <br />
        <span className="text-base font-semibold">{email}</span>
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-bold uppercase tracking-wide text-xs text-neutral-500">Squad Invite permissions</span>
      </p>
      <p className="mt-1 flex flex-wrap gap-2">
        {held.length > 0 ? (
          held.map((badge) => (
            <span key={badge.key} className="rounded-full border border-emerald-600 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
              {badge.label}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-red-600 bg-red-50 px-3 py-1 text-xs font-bold text-red-800">No Squad Invite permission</span>
        )}
      </p>
      {permissions.includes('squad_invite_approver') && (
        <p className="mt-3">
          <Link href="/staff/squad-invites/permissions" className="text-xs font-bold text-orange-600 hover:text-orange-700">Manage permissions</Link>
        </p>
      )}
    </section>
  );
}
