'use client';
import { useCallback, useEffect, useState } from 'react';
import CoachCardForm from './CoachCardForm';

type JoinedPlayer = { firstName: string; surnameInitial: string };
type CoachCardStatus = { fullName: string; roleTitle: string; configurationStatus: string } | null;

type DashboardResponse = {
  campaign: {
    teamName: string;
    ageGroup: string;
    deadlineAt: string | null;
    campaignStatus: string;
    completedCommitments: number;
    joinedPlayers: JoinedPlayer[];
    freeCoachCardConfirmed: boolean;
    coachCard: CoachCardStatus;
  };
};

const COACH_CARD_STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted — awaiting Emblem staff review.',
  locked: 'Locked for production ✓',
};

// Organiser-facing progress, deliberately bounded. The API this calls
// (/api/squad-invites/[id]/dashboard) returns aggregate counts plus a
// first-name + last-initial identifier per joined child — the same reduced
// form printed on the card itself — and nothing more: never a photo, full
// surname, email or any other field. This exists specifically so the
// organiser (who has real, first-hand knowledge of their own squad) can
// notice a name that doesn't belong, as a real-world check against a false
// parental-authority declaration — not as a general roster view. That
// boundary is enforced server-side by the route itself; this component has
// no way to widen it.
export default function CampaignDashboard({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [csrf, setCsrf] = useState('');
  const [concernOpen, setConcernOpen] = useState(false);
  const [concernNote, setConcernNote] = useState('');
  const [concernMessage, setConcernMessage] = useState('');
  const [concernSubmitting, setConcernSubmitting] = useState(false);

  const loadDashboard = useCallback((cancelledRef?: { cancelled: boolean }) => {
    fetch(`/api/squad-invites/${encodeURIComponent(campaignId)}/dashboard`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => {
        if (!cancelledRef?.cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelledRef?.cancelled) setError('Progress is not available right now.');
      });
  }, [campaignId]);

  useEffect(() => {
    const cancelledRef = { cancelled: false };
    loadDashboard(cancelledRef);
    void fetch('/api/squad-invite-organiser-auth/context')
      .then((r) => r.json())
      .then((x) => {
        if (!cancelledRef.cancelled) setCsrf(x.csrfToken);
      });
    return () => {
      cancelledRef.cancelled = true;
    };
  }, [campaignId, loadDashboard]);

  const submitConcern = async () => {
    if (concernSubmitting) return;
    setConcernSubmitting(true);
    setConcernMessage('');
    try {
      const r = await fetch(`/api/squad-invites/${encodeURIComponent(campaignId)}/flag-concern`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': csrf },
        body: JSON.stringify({ note: concernNote }),
      });
      if (r.ok) {
        setConcernMessage('Sent to Emblem staff for review. Thank you for checking.');
        setConcernNote('');
      } else {
        const body = await r.json().catch(() => null) as { error?: string } | null;
        setConcernMessage(body?.error || 'Could not send that right now.');
      }
    } finally {
      setConcernSubmitting(false);
    }
  };

  if (error) {
    return (
      <section className="mt-8 rounded-2xl border bg-white p-6">
        <h2 className="text-2xl font-bold">Squad progress</h2>
        <p role="alert" className="mt-3">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mt-8 rounded-2xl border bg-white p-6">
        <h2 className="text-2xl font-bold">Squad progress</h2>
        <p className="mt-3" aria-live="polite">Loading…</p>
      </section>
    );
  }

  const { campaign } = data;
  return (
    <section className="mt-8 rounded-2xl border bg-white p-6">
      <h2 className="text-2xl font-bold">Squad progress</h2>
      <p className="mt-3 text-4xl font-bold">{campaign.completedCommitments}</p>
      <p className="mt-1 text-sm">{campaign.completedCommitments === 1 ? 'child has' : 'children have'} joined and saved their card so far.</p>
      {campaign.joinedPlayers.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Players on record for this team</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {campaign.joinedPlayers.map((p, i) => (
              <li key={`${p.firstName}-${p.surnameInitial}-${i}`} className="rounded-full border bg-gray-50 px-3 py-1 text-sm">
                {p.firstName} {p.surnameInitial}.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">This is shown only so you can confirm these are your own players. No photo, full surname or contact detail is ever shown here.</p>
          {!concernOpen ? (
            <button type="button" className="mt-3 text-sm font-bold text-orange-600" onClick={() => setConcernOpen(true)}>
              A name here doesn&apos;t look right
            </button>
          ) : (
            <div className="mt-3 rounded-xl border p-4">
              <label className="block text-sm font-semibold" htmlFor="squad-progress-concern-note">
                What doesn&apos;t look right?
              </label>
              <textarea
                id="squad-progress-concern-note"
                className="mt-1 block w-full rounded-xl border p-3"
                value={concernNote}
                onChange={(e) => setConcernNote(e.target.value)}
                placeholder="e.g. I don't recognise this name as belonging to our team"
              />
              <p className="mt-2 text-xs">This goes straight to Emblem staff for review — never back to the family who joined.</p>
              <button
                type="button"
                className="mt-3 rounded-xl bg-orange-600 p-3 font-bold text-white disabled:opacity-60"
                disabled={!csrf || concernNote.trim().length < 3 || concernSubmitting}
                onClick={submitConcern}
              >
                {concernSubmitting ? 'Sending…' : 'Send to Emblem staff'}
              </button>
              {concernMessage && <p role="status" className="mt-2 text-sm">{concernMessage}</p>}
            </div>
          )}
        </div>
      )}
      {campaign.deadlineAt && (
        <p className="mt-3 text-sm">
          Deadline: {new Date(campaign.deadlineAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      {campaign.freeCoachCardConfirmed && csrf && (!campaign.coachCard || campaign.coachCard.configurationStatus === 'draft') && (
        <CoachCardForm campaignId={campaignId} csrf={csrf} initialStatus={campaign.coachCard} onSubmitted={() => loadDashboard()} />
      )}
      {campaign.freeCoachCardConfirmed && campaign.coachCard && campaign.coachCard.configurationStatus !== 'draft' && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Free coach card</p>
          <p className="mt-1 text-sm text-emerald-900">{campaign.coachCard.fullName}, {campaign.coachCard.roleTitle} — {COACH_CARD_STATUS_LABEL[campaign.coachCard.configurationStatus] ?? campaign.coachCard.configurationStatus}</p>
        </div>
      )}
    </section>
  );
}
