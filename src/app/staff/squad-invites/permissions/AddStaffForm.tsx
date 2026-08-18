'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Promotes an email that already has ANY Emblem account to staff
 * (promote_email_to_staff, migration 0061) — existing accounts only, no
 * invite flow. Grants zero Squad Invite permissions itself; once the new
 * row appears below, use the existing PermissionToggle buttons to grant
 * Reviewer/Approver.
 */
export default function AddStaffForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const submit = async () => {
    if (pending || !email.includes('@')) return;
    setPending(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const response = await fetch('/api/staff/squad-invites/permissions/add-staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => null) as { error?: string; alreadyStaff?: boolean } | null;
      if (!response.ok) {
        setMessage(body?.error || 'Could not add this staff member.');
        setMessageIsError(true);
        return;
      }
      setMessage(body?.alreadyStaff ? 'Already a staff member — see them below.' : 'Added — see them below to grant Reviewer/Approver.');
      setMessageIsError(false);
      setEmail('');
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border bg-white p-5" aria-busy={pending}>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Add a staff member</p>
      <p className="mt-1 text-sm text-neutral-600">Only works for an email that already has an Emblem account of any kind.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="add-staff-email" className="sr-only">Email address</label>
        <input
          id="add-staff-email"
          type="email"
          placeholder="name@example.com"
          className="min-h-[44px] block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !email.includes('@')}
          className="min-h-[44px] shrink-0 rounded-xl bg-orange-600 px-5 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {message && (
        <p role={messageIsError ? 'alert' : 'status'} className={`mt-2 text-sm font-semibold ${messageIsError ? 'text-red-700' : 'text-emerald-700'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
