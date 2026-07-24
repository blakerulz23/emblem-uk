'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Club = { id: string; name: string };
type Team = { id: string; name: string; season: string };

function currentUkFootballSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 7 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Squad orders have no automatic club/team match — see migration 0009's
 * reasoning: auto-matching a typed club name risks silently merging two
 * different real clubs sharing a common name. A staff member explicitly
 * picks an existing club/team or creates a new one every time, prefilled
 * with whatever the customer typed at checkout for convenience only.
 */
export default function ApproveTeamOrderButton({
  orderId,
  purchaserEmail,
  clubNameHint,
  teamNameHint,
}: {
  orderId: string;
  purchaserEmail: string;
  clubNameHint: string | null;
  teamNameHint: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubMode, setClubMode] = useState<'existing' | 'new'>('new');
  const [selectedClubId, setSelectedClubId] = useState('');
  const [newClubName, setNewClubName] = useState(clubNameHint ?? '');

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMode, setTeamMode] = useState<'existing' | 'new'>('new');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [newTeamName, setNewTeamName] = useState(teamNameHint ?? '');
  const [newTeamSeason, setNewTeamSeason] = useState(currentUkFootballSeason());

  useEffect(() => {
    fetch('/api/os/clubs')
      .then((r) => r.json())
      .then((data) => setClubs(data.clubs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (clubMode !== 'existing' || !selectedClubId) {
      setTeams([]);
      return;
    }
    fetch(`/api/os/teams?clubId=${encodeURIComponent(selectedClubId)}`)
      .then((r) => r.json())
      .then((data) => setTeams(data.teams ?? []))
      .catch(() => {});
  }, [clubMode, selectedClubId]);

  const resolvedClubName = clubMode === 'existing' ? clubs.find((c) => c.id === selectedClubId)?.name ?? '' : newClubName.trim();
  const resolvedTeamName = teamMode === 'existing' ? teams.find((t) => t.id === selectedTeamId)?.name ?? '' : newTeamName.trim();

  const canReview =
    (clubMode === 'existing' ? !!selectedClubId : !!newClubName.trim()) &&
    (teamMode === 'existing' ? !!selectedTeamId : !!newTeamName.trim() && !!newTeamSeason.trim());

  const approve = async () => {
    setBusy(true);
    setError(null);
    const club = clubMode === 'existing' ? { mode: 'existing', id: selectedClubId } : { mode: 'new', name: newClubName.trim() };
    const team =
      teamMode === 'existing'
        ? { mode: 'existing', id: selectedTeamId }
        : { mode: 'new', name: newTeamName.trim(), season: newTeamSeason.trim() };

    const res = await fetch(`/api/orders/${orderId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club, team }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not approve this order');
      setBusy(false);
      return;
    }
    router.refresh();
  };

  const selectStyle = {
    width: '100%', minHeight: 38, borderRadius: 8, border: '1px solid var(--line)',
    fontFamily: 'var(--font-manrope), system-ui', fontSize: 13, padding: '0 10px', background: '#fff',
  } as const;

  if (step === 'confirm') {
    return (
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', display: 'grid', gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13, color: 'var(--ink)' }}>
          Approve as: <strong>{resolvedTeamName}</strong>, <strong>{resolvedClubName}</strong> — invite will be sent to{' '}
          <strong>{purchaserEmail}</strong>
        </div>
        {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            style={{
              fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: '#fff',
              background: busy ? 'var(--ink-faint)' : '#047857', padding: '10px 16px', borderRadius: 10,
              border: 'none', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Approving…' : 'Confirm & send invite'}
          </button>
          <button
            type="button"
            onClick={() => setStep('pick')}
            disabled={busy}
            style={{
              fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink-soft)',
              background: 'transparent', padding: '10px 16px', borderRadius: 10, border: '1px solid var(--line)',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', display: 'grid', gap: 10, minWidth: 260 }}>
      <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Club
      </div>
      <select value={clubMode === 'existing' ? selectedClubId : '__new__'} onChange={(e) => {
        if (e.target.value === '__new__') { setClubMode('new'); setSelectedClubId(''); }
        else { setClubMode('existing'); setSelectedClubId(e.target.value); }
      }} style={selectStyle}>
        <option value="__new__">+ New club{newClubName.trim() ? `: ${newClubName.trim()}` : ''}</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {clubMode === 'new' && (
        <input
          type="text"
          value={newClubName}
          onChange={(e) => setNewClubName(e.target.value)}
          placeholder="Club name"
          style={selectStyle}
        />
      )}

      <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Team
      </div>
      {clubMode === 'existing' && teams.length > 0 && (
        <select value={teamMode === 'existing' ? selectedTeamId : '__new__'} onChange={(e) => {
          if (e.target.value === '__new__') { setTeamMode('new'); setSelectedTeamId(''); }
          else { setTeamMode('existing'); setSelectedTeamId(e.target.value); }
        }} style={selectStyle}>
          <option value="__new__">+ New team{newTeamName.trim() ? `: ${newTeamName.trim()}` : ''}</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.season})</option>
          ))}
        </select>
      )}
      {(teamMode === 'new' || clubMode === 'new' || teams.length === 0) && (
        <>
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name (e.g. U10)"
            style={selectStyle}
          />
          <input
            type="text"
            value={newTeamSeason}
            onChange={(e) => setNewTeamSeason(e.target.value)}
            placeholder="Season (e.g. 2026/27)"
            style={selectStyle}
          />
        </>
      )}

      <button
        type="button"
        onClick={() => setStep('confirm')}
        disabled={!canReview}
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: '#fff',
          background: canReview ? '#047857' : 'var(--ink-faint)', padding: '10px 16px', borderRadius: 10,
          border: 'none', cursor: canReview ? 'pointer' : 'default',
        }}
      >
        Review & approve
      </button>
    </div>
  );
}
