'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SquadInviteStaffPermission } from '@/lib/squad-invite-mvp';
import {
  SQUAD_INVITE_ACTION_LABEL,
  SQUAD_INVITE_ACTION_PERMISSION,
  explainSquadInviteAction,
  squadInvitePermissionSummary,
  type SquadInviteReviewAction,
} from '@/lib/squad-invite-staff-action-explanations';

const PERMISSION_LABEL: Record<SquadInviteStaffPermission, string> = {
  squad_invite_reviewer: 'Reviewer',
  squad_invite_approver: 'Approver',
};

// The four actions every request moves through, always shown so their
// availability (and why) is visible regardless of the request's current
// state — Cancel approval and Prepare resend stay conditionally rendered
// below since they only conceptually exist once approved / once a
// notification exists, not as steps of this core workflow.
const CORE_ACTIONS: SquadInviteReviewAction[] = ['start_review', 'request_changes', 'reject', 'approve'];

export default function ReviewActions({
  requestId,
  status,
  outboxId,
  staffEmail,
  staffPermissions,
}: {
  requestId: string;
  status: string;
  outboxId?: string;
  staffEmail: string;
  staffPermissions: SquadInviteStaffPermission[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const hasReason = reason.trim().length > 0;

  const explain = (action: SquadInviteReviewAction) => explainSquadInviteAction(action, { email: staffEmail, permissions: staffPermissions, status, hasReason });

  const review = async (action: SquadInviteReviewAction) => {
    const path = action === 'approve' ? `/api/staff/squad-invites/${requestId}/approve` : action === 'cancel' ? `/api/staff/squad-invites/${requestId}/cancel-approval` : `/api/staff/squad-invites/${requestId}/review`;
    const body = action === 'cancel' ? { reason } : { action, organiserVisibleReason: reason, restrictedNote: note };
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) {
      setMessage('Action recorded.');
      // Re-fetches this Server Component's data (status, audit history,
      // permission-gated button availability) in place — router.refresh()
      // only re-runs the server data fetch, it doesn't remount this client
      // component, so the reason/note fields and this message survive it.
      router.refresh();
      return;
    }
    // The server's own error text is already safe, specific, user-facing
    // copy (see review/approve/cancel-approval route.ts) — relayed
    // directly rather than replaced with a generic message, since it
    // reflects what actually happened server-side (e.g. another staff
    // member changed the request's state between page load and this
    // click), which the pre-flight explanation above cannot know about.
    // The pre-flight explanation is the fallback only if the response
    // carried no error text at all.
    const responseBody = (await r.json().catch(() => null)) as { error?: string } | null;
    setMessage(responseBody?.error || explain(action) || 'Action unavailable.');
  };

  const resend = async () => {
    if (!outboxId) return;
    const r = await fetch(`/api/staff/squad-invites/${requestId}/notifications/${outboxId}/resend`, { method: 'POST' });
    if (r.ok) {
      setMessage('Resend sent to the organiser.');
      router.refresh();
      return;
    }
    const responseBody = (await r.json().catch(() => null)) as { error?: string } | null;
    setMessage(responseBody?.error || explain('resend') || 'Resend preparation unavailable.');
  };

  const permissionSummary = squadInvitePermissionSummary(staffPermissions);

  return (
    <section className="mt-6 grid gap-4 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">Review actions</h2>

      <p className="text-sm">
        You are signed in as <strong>{staffEmail}</strong>. This account has{' '}
        <strong>{permissionSummary === 'No Squad Invite permission' ? 'no Squad Invite permission' : `${permissionSummary} permission`}</strong>.
      </p>

      <ul className="grid gap-1 pl-5 text-sm list-disc">
        <li>
          <strong>Reviewer</strong> can: Start review, Request changes and Reject.
        </li>
        <li>
          <strong>Approver</strong> can: Approve and manage approval-related actions — cancel an approval, prepare a resend.
        </li>
        <li>Reviewer permission does not imply Approver. Approver permission does not imply Reviewer.</li>
      </ul>

      <label>
        Organiser-visible reason
        <textarea className="mt-1 block w-full rounded-xl border p-3" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label>
        Restricted staff note
        <textarea className="mt-1 block w-full rounded-xl border p-3" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="flex flex-wrap gap-4">
        {CORE_ACTIONS.map((action) => {
          const explanation = explain(action);
          const available = explanation === null;
          const describedById = `squad-invite-action-${action}-explanation`;
          return (
            <div key={action} className="flex max-w-[240px] flex-col gap-1">
              <button
                type="button"
                onClick={() => review(action)}
                disabled={!available}
                aria-describedby={available ? undefined : describedById}
                className={
                  available
                    ? 'rounded-xl border-2 border-emerald-700 bg-emerald-700 px-4 py-2 font-bold text-white'
                    : 'cursor-not-allowed rounded-xl border-2 border-neutral-300 bg-neutral-100 px-4 py-2 font-bold text-neutral-400'
                }
              >
                {SQUAD_INVITE_ACTION_LABEL[action]}
              </button>
              <span className="text-xs text-neutral-500">Requires {PERMISSION_LABEL[SQUAD_INVITE_ACTION_PERMISSION[action]]}</span>
              {!available && (
                <p id={describedById} className="text-xs text-red-700">
                  {explanation}
                </p>
              )}
            </div>
          );
        })}

        {status === 'approved' &&
          (() => {
            const explanation = explain('cancel');
            const available = explanation === null;
            return (
              <div className="flex max-w-[240px] flex-col gap-1">
                <button
                  type="button"
                  onClick={() => review('cancel')}
                  disabled={!available}
                  aria-describedby={available ? undefined : 'squad-invite-action-cancel-explanation'}
                  className={
                    available
                      ? 'rounded-xl border-2 border-emerald-700 bg-emerald-700 px-4 py-2 font-bold text-white'
                      : 'cursor-not-allowed rounded-xl border-2 border-neutral-300 bg-neutral-100 px-4 py-2 font-bold text-neutral-400'
                  }
                >
                  Cancel approval
                </button>
                <span className="text-xs text-neutral-500">Requires Approver</span>
                {!available && (
                  <p id="squad-invite-action-cancel-explanation" className="text-xs text-red-700">
                    {explanation}
                  </p>
                )}
              </div>
            );
          })()}

        {outboxId &&
          (() => {
            const explanation = explain('resend');
            const available = explanation === null;
            return (
              <div className="flex max-w-[240px] flex-col gap-1">
                <button
                  type="button"
                  onClick={resend}
                  disabled={!available}
                  aria-describedby={available ? undefined : 'squad-invite-action-resend-explanation'}
                  className={
                    available
                      ? 'rounded-xl border-2 border-emerald-700 bg-emerald-700 px-4 py-2 font-bold text-white'
                      : 'cursor-not-allowed rounded-xl border-2 border-neutral-300 bg-neutral-100 px-4 py-2 font-bold text-neutral-400'
                  }
                >
                  Prepare disabled/test resend
                </button>
                <span className="text-xs text-neutral-500">Requires Approver</span>
                {!available && (
                  <p id="squad-invite-action-resend-explanation" className="text-xs text-red-700">
                    {explanation}
                  </p>
                )}
              </div>
            );
          })()}
      </div>

      <p className="text-sm">These controls explain what this account can do. The API routes remain the actual authority and independently re-check permission, request state and required fields on every call.</p>
      {message && <p role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
