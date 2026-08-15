'use client';

import { useEffect, useRef, useState } from 'react';
import ReviewActions from '@/app/staff/squad-invites/[reference]/ReviewActions';
import { DISPOSABLE_SQUAD_INVITE_NOTICE } from '@/lib/squad-invite-preview-safety';

declare global {
  interface Window {
    __staffHarnessNetworkLog?: string[];
  }
}

type Role = 'reviewer' | 'approver' | 'both';
type RequestStatus = 'submitted' | 'under_review' | 'changes_requested' | 'resubmitted' | 'approved' | 'rejected';

type SyntheticRequest = {
  id: string;
  public_reference: string;
  club_team_name: string;
  football_age_group: string;
  expected_squad_size: number;
  organiser_name: string;
  organiser_role: string;
  organiser_email_verified_at: string | null;
  proposed_deadline_at: string;
  delivery_recipient_name: string;
  delivery_recipient_role: string;
  uk_delivery_confirmed: boolean;
  badge_review_status: string;
  request_status: RequestStatus;
  submission_revision: number;
  organiser_visible_reason: string | null;
  restricted_staff_note: string | null;
  submitted_at: string;
  assigned_staff_profile_id: string | null;
  campaign_status: 'active' | null;
};

// The four current organiser declarations, using the real purpose enum from
// migration 0052_squad_invite_review_foundation.sql — synthetic values, real
// vocabulary, so this harness can't drift from what the schema enforces.
const DECLARATION_PURPOSES = ['organiser_authority', 'delivery_recipient_agreement', 'independent_participation', 'staff_review_required'] as const;

const initialRequest: SyntheticRequest = {
  id: 'harness-request-id',
  public_reference: 'SI-HARNESS-0001',
  club_team_name: 'Ashton Juniors Synthetic U10',
  football_age_group: 'Under 10',
  expected_squad_size: 12,
  organiser_name: 'Coach Jordan Synthetic',
  organiser_role: 'coach_or_club_representative',
  organiser_email_verified_at: '2026-08-10T09:00:00.000Z',
  proposed_deadline_at: '2026-09-15',
  delivery_recipient_name: 'Coach Jordan Synthetic',
  delivery_recipient_role: 'Head coach',
  uk_delivery_confirmed: true,
  badge_review_status: 'not_required',
  request_status: 'submitted',
  submission_revision: 1,
  organiser_visible_reason: null,
  restricted_staff_note: null,
  submitted_at: '2026-08-10T09:05:00.000Z',
  assigned_staff_profile_id: null,
  campaign_status: null,
};

function businessDaysOld(value: string) {
  let days = 0;
  const cursor = new Date(value);
  const today = new Date();
  cursor.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  while (cursor < today) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days++;
  }
  return days;
}

function displayStatusOf(r: SyntheticRequest) {
  if (r.request_status === 'approved') return r.campaign_status === 'active' ? 'active' : 'approved_setup_required';
  return r.request_status;
}

const REVIEWER_ACTIONS = new Set(['start_review', 'request_changes', 'reject']);
const APPROVER_ACTIONS = new Set(['approve']);

/**
 * Reproduces the permission rule read directly from the real route handlers
 * (src/app/api/staff/squad-invites/[id]/review/route.ts and .../approve/route.ts):
 * start_review/request_changes/reject require 'squad_invite_reviewer';
 * approve requires 'squad_invite_approver'. Those are two independent rows
 * in squad_invite_staff_permissions with no inheritance between them — this
 * mock enforces the identical independence so the harness can demonstrate
 * client-side handling of an allow/deny response. The rule itself was
 * verified by reading that source directly, not by exercising it live —
 * this mock cannot touch the real squad_invite_staff_permissions table.
 */
function roleAllows(role: Role, action: string) {
  if (role === 'both') return true;
  if (role === 'reviewer') return REVIEWER_ACTIONS.has(action);
  if (role === 'approver') return APPROVER_ACTIONS.has(action);
  return false;
}

export default function StaffReviewHarness() {
  const [view, setView] = useState<'queue' | 'detail'>('queue');
  const [role, setRole] = useState<Role>('both');
  const [request, setRequest] = useState<SyntheticRequest>(initialRequest);
  const [audit, setAudit] = useState<{ event_type: string; actor_role: string; created_at: string }[]>([
    { event_type: 'submitted', actor_role: 'organiser', created_at: initialRequest.submitted_at },
  ]);
  const [declarations] = useState(
    DECLARATION_PURPOSES.map((purpose) => ({ purpose, policy_version: `${purpose}_v1`, accepted_at: initialRequest.submitted_at, submission_revision: 1 }))
  );
  const [logLength, setLogLength] = useState(0);

  // A "latest state" ref so the one-time fetch override below always reads
  // current role/request/setters without needing to be reinstalled on every
  // render (which would risk racing an in-flight request against a stale
  // window.fetch reference).
  const stateRef = useRef({ role, request });
  stateRef.current = { role, request };

  const applyAction = (action: string, organiserVisibleReason: string, restrictedNote: string) => {
    setRequest((r) => {
      if (action === 'start_review') return { ...r, request_status: 'under_review' };
      if (action === 'request_changes') return { ...r, request_status: 'changes_requested', organiser_visible_reason: organiserVisibleReason, restricted_staff_note: restrictedNote };
      if (action === 'reject') return { ...r, request_status: 'rejected', organiser_visible_reason: organiserVisibleReason, restricted_staff_note: restrictedNote };
      if (action === 'approve') return { ...r, request_status: 'approved' };
      return r;
    });
    setAudit((a) => [...a, { event_type: action, actor_role: REVIEWER_ACTIONS.has(action) ? 'reviewer' : 'approver', created_at: new Date().toISOString() }]);
  };

  const simulateResubmission = () => {
    setRequest((r) => ({ ...r, request_status: 'resubmitted', submission_revision: r.submission_revision + 1 }));
    setAudit((a) => [...a, { event_type: 'resubmitted', actor_role: 'organiser', created_at: new Date().toISOString() }]);
  };

  // Installed exactly once per page load, before ReviewActions can ever
  // call fetch. Reads current role/request via stateRef so it never goes
  // stale, and applies state transitions through the same setters the rest
  // of the component uses. Every call — matched or not — is logged; only
  // the two endpoints in the required journey are answered, everything
  // else (cancel-approval, notification resend, anything unexpected) is
  // blocked and logged, never forwarded to the real network.
  useEffect(() => {
    if (window.__staffHarnessNetworkLog) return;
    window.__staffHarnessNetworkLog = [];
    const log = window.__staffHarnessNetworkLog;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const path = new URL(url, window.location.origin).pathname;
      const method = init?.method ?? 'GET';
      log.push(`${method} ${path}`);
      setLogLength(log.length);

      const { role: currentRole, request: currentRequest } = stateRef.current;
      const body = init?.body ? (JSON.parse(String(init.body)) as { action?: string; organiserVisibleReason?: string; restrictedNote?: string }) : {};

      if (path === `/api/staff/squad-invites/${currentRequest.id}/review`) {
        const action = body.action ?? '';
        if (!roleAllows(currentRole, action)) {
          return new Response(JSON.stringify({ error: 'Squad Invite permission required' }), { status: 403 });
        }
        if ((action === 'request_changes' || action === 'reject') && !(body.organiserVisibleReason ?? '').trim()) {
          return new Response(JSON.stringify({ error: 'An organiser-visible explanation is required' }), { status: 400 });
        }
        applyAction(action, body.organiserVisibleReason ?? '', body.restrictedNote ?? '');
        return new Response(JSON.stringify({ ok: true, result: { status: action } }), { status: 200 });
      }
      if (path === `/api/staff/squad-invites/${currentRequest.id}/approve`) {
        if (!roleAllows(currentRole, 'approve')) {
          return new Response(JSON.stringify({ error: 'Squad Invite permission required' }), { status: 403 });
        }
        applyAction('approve', '', '');
        return new Response(JSON.stringify({ ok: true, result: { status: 'approved' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'blocked in database-free harness' }), { status: 403 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ padding: '0.5rem 1rem', fontWeight: 700, background: '#111', color: '#fff', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{DISPOSABLE_SQUAD_INVITE_NOTICE}</span>
        <span style={{ opacity: 0.8, fontWeight: 500 }}>Staff review harness — no Supabase, no real network calls, payments remain disabled throughout the controlled pilot</span>
      </div>
      <div style={{ padding: '0.5rem 1rem', background: '#f5f5f5', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Viewing as:{' '}
          <select aria-label="Viewing as" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="both">Reviewer + approver</option>
            <option value="reviewer">Reviewer only</option>
            <option value="approver">Approver only</option>
          </select>
        </label>
        <span aria-live="polite">Network calls logged: {logLength}</span>
      </div>

      {view === 'queue' && (
        <main className="mx-auto max-w-5xl px-5 py-12">
          <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Internal · Staff only</p>
          <h1 className="mt-3 text-3xl font-bold">Player Queue → Squad Invites</h1>
          <nav className="mt-6 flex flex-wrap gap-2">
            <span>Player Orders</span>
            <strong>Squad Invites</strong>
            <span>Profile Setup</span>
            <span>Data Requests</span>
          </nav>
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              className="rounded-2xl border bg-white p-5 text-left w-full"
              onClick={() => setView('detail')}
              aria-label={`Open ${request.public_reference}`}
            >
              <strong>
                {request.club_team_name} · {request.football_age_group}
              </strong>
              <p>
                {request.public_reference} · {request.organiser_name} · {request.organiser_role.replaceAll('_', ' ')}
              </p>
              <p>
                Status: {displayStatusOf(request).replaceAll('_', ' ')} · Badge: {request.badge_review_status.replaceAll('_', ' ')}
              </p>
              <p>
                {request.assigned_staff_profile_id ? 'Assigned reviewer' : 'Unassigned'} ·{' '}
                {businessDaysOld(request.submitted_at) > 2
                  ? `Overdue (${businessDaysOld(request.submitted_at)} UK business days)`
                  : `Age ${businessDaysOld(request.submitted_at)} UK business day(s)`}
              </p>
              <p>Deadline: {request.proposed_deadline_at}</p>
            </button>
          </div>
        </main>
      )}

      {view === 'detail' && (
        <main className="mx-auto max-w-3xl px-5 py-12">
          <button type="button" onClick={() => setView('queue')}>
            ← Back to queue
          </button>
          <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Review Squad Invite</p>
          <h1 className="mt-3 text-3xl font-bold">{request.club_team_name}</h1>
          <dl className="mt-6 grid gap-3 rounded-2xl border bg-white p-6">
            <div>
              <dt>Request</dt>
              <dd>{request.public_reference}</dd>
            </div>
            <div>
              <dt>Age group / estimate</dt>
              <dd>
                {request.football_age_group} · {request.expected_squad_size}
              </dd>
            </div>
            <div>
              <dt>Organiser</dt>
              <dd>
                {request.organiser_name} · {request.organiser_role.replaceAll('_', ' ')}
              </dd>
            </div>
            <div>
              <dt>Email control</dt>
              <dd>{request.organiser_email_verified_at ? 'Verified' : 'Not verified'} — declared team role reviewed separately</dd>
            </div>
            <div>
              <dt>Delivery recipient</dt>
              <dd>
                {request.delivery_recipient_name}, {request.delivery_recipient_role}; UK delivery {request.uk_delivery_confirmed ? 'confirmed' : 'missing'}. Full address deferred.
              </dd>
            </div>
            <div>
              <dt>Badge</dt>
              <dd>{request.badge_review_status.replaceAll('_', ' ')}; approval is not proof of trademark ownership.</dd>
            </div>
            <div>
              <dt>Duplicate signal</dt>
              <dd>0 other open request(s) with the same display name</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{displayStatusOf(request).replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Declarations</dt>
              <dd>{declarations.map((x) => `${x.purpose} (${x.policy_version})`).join(', ')}</dd>
            </div>
            <div>
              <dt>Restricted note</dt>
              <dd>{request.restricted_staff_note || 'None'}</dd>
            </div>
          </dl>

          <ReviewActions requestId={request.id} status={request.request_status} outboxId={undefined} />

          {request.request_status === 'changes_requested' && (
            <div className="mt-4 rounded-xl border border-dashed p-4">
              <p className="text-sm">Harness-only control (no real organiser correction page is part of this staff harness):</p>
              <button type="button" onClick={simulateResubmission}>
                Simulate organiser resubmission
              </button>
            </div>
          )}

          <section className="mt-6 rounded-2xl border p-5">
            <h2 className="font-bold">Audit history</h2>
            {audit.map((x, i) => (
              <p key={`${x.created_at}-${i}`}>
                {x.event_type.replaceAll('_', ' ')} · {x.actor_role}
              </p>
            ))}
          </section>
          <section className="mt-6 rounded-2xl border p-5">
            <h2 className="font-bold">Notification outbox</h2>
            <p>No entries in this synthetic run.</p>
          </section>
          <p className="mt-5 text-sm">Reviewer and approver actions require separate server permissions. No child roster exists.</p>
        </main>
      )}
    </div>
  );
}
