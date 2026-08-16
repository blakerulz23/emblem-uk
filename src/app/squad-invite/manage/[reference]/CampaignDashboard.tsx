'use client';
import { useEffect, useState } from 'react';

type DashboardResponse = {
  campaign: {
    teamName: string;
    ageGroup: string;
    deadlineAt: string | null;
    campaignStatus: string;
    completedCommitments: number;
  };
};

// Organiser-facing progress only — the API this calls
// (/api/squad-invites/[id]/dashboard) returns aggregate counts alone, never
// a parent name, child name, email or photo. That boundary is enforced
// server-side by the route itself; this component has no way to widen it.
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
      <p className="mt-4 text-sm">Player names, photos and contact details are never shown here — only this total, private to each family.</p>
      {campaign.deadlineAt && (
        <p className="mt-3 text-sm">
          Deadline: {new Date(campaign.deadlineAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
    </section>
  );
}
