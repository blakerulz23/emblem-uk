'use client';
import { useEffect, useState } from 'react';

type JoinedPlayer = { firstName: string; surnameInitial: string };

type DashboardResponse = {
  campaign: {
    teamName: string;
    ageGroup: string;
    deadlineAt: string | null;
    campaignStatus: string;
    completedCommitments: number;
    joinedPlayers: JoinedPlayer[];
  };
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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/squad-invites/${encodeURIComponent(campaignId)}/dashboard`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError('Progress is not available right now.');
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

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
          <p className="mt-2 text-sm">This is shown only so you can confirm these are your own players. No photo, full surname or contact detail is ever shown here — if a name doesn&apos;t look right, please contact Emblem staff directly.</p>
        </div>
      )}
      {campaign.deadlineAt && (
        <p className="mt-3 text-sm">
          Deadline: {new Date(campaign.deadlineAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
    </section>
  );
}
