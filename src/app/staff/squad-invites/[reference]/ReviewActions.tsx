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

// Visual language only — every action still shows its own text label, and
// server permission/state enforcement (squad-invite-staff-action-explanations.ts)
// is completely unchanged by this. Approve/start review read as the
// forward-moving, positive steps (Emblem orange/green); Reject and Cancel
// approval are the ones that end or undo something, so they get a
// deliberately different, less "go" colour and a confirmation prompt below.
const ACTION_STYLE: Record<SquadInviteReviewAction, string> = {
  start_review: 'border-orange-600 bg-orange-600 text-white hover:bg-orange-700',
  approve: 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800',
  request_changes: 'border-amber-600 bg-white text-amber-800 hover:bg-amber-50',
  reject: 'border-red-600 bg-white text-red-700 hover:bg-red-50',
  cancel: 'border-red-600 bg-white text-red-700 hover:bg-red-50',
  resend: 'border-neutral-400 bg-white text-neutral-700 hover:bg-neutral-50',
};
const CONFIRM_ACTIONS = new Set<SquadInviteReviewAction>(['reject', 'cancel']);

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
  const [messageKind, setMessageKind] = useState<'success' | 'error' | ''>('');
  const [pending, setPending] = useState<SquadInviteReviewAction | null>(null);
  const hasReason = reason.trim().length > 0;

  const explain = (action: SquadInviteReviewAction) => explainSquadInviteAction(action, { email: staffEmail, permissions: staffPermissions, status, hasReason });

  const review = async (action: SquadInviteReviewAction) => {
    if (pending) return; // one in-flight action at a time — prevents a double click firing two mutations
    if (CONFIRM_ACTIONS.has(action) && !window.confirm(`${SQUAD_INVITE_ACTION_LABEL[action]} cannot be undone from here. Continue?`)) return;
    setPending(action);
    setMessage('');
    setMessageKind('');
    try {
      const path = action === 'approve' ? `/api/staff/squad-invites/${requestId}/approve` : action === 'cancel' ? `/api/staff/squad-invites/${requestId}/cancel-approval` : `/api/staff/squad-invites/${requestId}/review`;
      const body = action === 'cancel' ? { reason } : { action, organiserVisibleReason: reason, restrictedNote: note };
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        setMessage('Action recorded.');
        setMessageKind('success');
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
      setMessageKind('error');
    } finally {
      setPending(null);
    }
  };

  const resend = async () => {
    if (!outboxId || pending) return;
    setPending('resend');
    setMessage('');
    setMessageKind('');
    try {
      const r = await fetch(`/api/staff/squad-invites/${requestId}/notifications/${outboxId}/resend`, { method: 'POST' });
      if (r.ok) {
        setMessage('Resend sent to the organiser.');
        setMessageKind('success');
        router.refresh();
        return;
      }
      const responseBody = (await r.json().catch(() => null)) as { error?: string } | null;
      setMessage(responseBody?.error || explain('resend') || 'Resend preparation unavailable.');
      setMessageKind('error');
    } finally {
      setPending(null);
    }
  };

  const permissionSummary = squadInvitePermissionSummary(staffPermissions);

  return (
    <section className="mt-6 grid gap-4 rounded-2xl border bg-white p-6" aria-busy={pending !== null}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Review actions</h2>
        <span className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-neutral-700">{permissionSummary}</span>
      </div>

      <details className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <summary className="cursor-pointer select-none font-semibold">How these permissions work</summary>
        <ul className="mt-2 grid gap-1 pl-5 list-disc">
          <li>
            <strong>Reviewer</strong> can: Start review, Request changes and Reject.
          </li>
          <li>
            <strong>Approver</strong> can: Approve and manage approval-related actions — cancel an approval, prepare a resend.
          </li>
          <li>Reviewer permission does not imply Approver. Approver permission does not imply Reviewer.</li>
        </ul>
      </details>

      <label>
        Organiser-visible reason
        <textarea className="mt-1 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label>
        Restricted staff note
        <textarea className="mt-1 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" value={note} onChange={(e) => setNote(e.target.value)} />
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
                  'min-h-[44px] rounded-xl border-2 px-4 py-2 font-bold transition disabled:cursor-not-allowed ' +
                  (available ? `${ACTION_STYLE[action]} disabled:opacity-60` : 'border-neutral-300 bg-neutral-100 text-neutral-400')
                }
              >
                {pending === action ? 'Working…' : SQUAD_INVITE_ACTION_LABEL[action]}
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
                    'min-h-[44px] rounded-xl border-2 px-4 py-2 font-bold transition disabled:cursor-not-allowed ' +
                    (available ? `${ACTION_STYLE.cancel} disabled:opacity-60` : 'border-neutral-300 bg-neutral-100 text-neutral-400')
                  }
                >
                  {pending === 'cancel' ? 'Working…' : 'Cancel approval'}
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
                    'min-h-[44px] rounded-xl border-2 px-4 py-2 font-bold transition disabled:cursor-not-allowed ' +
                    (available ? `${ACTION_STYLE.resend} disabled:opacity-60` : 'border-neutral-300 bg-neutral-100 text-neutral-400')
                  }
                >
                  {pending === 'resend' ? 'Working…' : 'Prepare disabled/test resend'}
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

      <p className="text-sm text-neutral-600">These controls explain what this account can do. The API routes remain the actual authority and independently re-check permission, request state and required fields on every call.</p>
      {message && (
        <p role={messageKind === 'error' ? 'alert' : 'status'} aria-live="polite" className={messageKind === 'error' ? 'font-semibold text-red-700' : 'font-semibold text-emerald-700'}>
          {message}
        </p>
      )}
    </section>
  );
}
