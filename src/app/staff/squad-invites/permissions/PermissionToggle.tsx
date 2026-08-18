'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Permission = 'squad_invite_reviewer' | 'squad_invite_approver';

/**
 * Revoke gets a confirm() prompt — the one hard-to-reverse action here
 * (grant is always safely re-doable; revoking the last Approver is refused
 * server-side by revoke_squad_invite_staff_permission regardless, but the
 * confirm still matters for the ordinary case of removing someone's access).
 */
export default function PermissionToggle({
  staffProfileId, permission, label, granted,
}: {
  staffProfileId: string;
  permission: Permission;
  label: string;
  granted: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (pending) return;
    if (granted && !window.confirm(`Revoke ${label} from this account?`)) return;
    setPending(true);
    setError('');
    try {
      const path = granted ? '/api/staff/squad-invites/permissions/revoke' : '/api/staff/squad-invites/permissions/grant';
      const response = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffProfileId, permission }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error || 'Could not update this permission.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-busy={pending}
        className={
          'min-h-[40px] rounded-xl border-2 px-4 py-2 text-sm font-bold transition disabled:opacity-60 ' +
          (granted ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50')
        }
      >
        {pending ? 'Updating…' : `${label}: ${granted ? 'Granted' : 'Not granted'}`}
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
