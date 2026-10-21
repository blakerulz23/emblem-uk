'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type TeamOption = { id: string; label: string };

const button = (bg: string, color: string, disabled = false) => ({
  fontFamily: 'var(--font-sora), system-ui',
  fontWeight: 700,
  fontSize: 12.5,
  color,
  background: disabled ? 'var(--ink-faint)' : bg,
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  whiteSpace: 'nowrap' as const,
});
const field = { fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' };
const labelText = { fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)' };

/**
 * Approve (into a new or an existing team, optionally with an access end
 * date) or reject (with a reason the coach sees). The season for a new
 * team is a label resolved on the server; no id is ever sent from here.
 */
export default function TeamRequestActions({ requestId, teams, defaultSeason }: { requestId: string; teams: TeamOption[]; defaultSeason: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'closed' | 'approve' | 'reject'>('closed');
  const [teamMode, setTeamMode] = useState<'new' | 'existing'>('new');
  const [season, setSeason] = useState(defaultSeason);
  const [teamId, setTeamId] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError((data && typeof data.error === 'string' && data.error) || 'That didn’t save — try again.');
      setBusy(false);
      return;
    }
    setBusy(false);
    setMode('closed');
    router.refresh();
  };

  if (mode === 'closed') {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setMode('approve')} style={button('var(--accent)', '#fff')}>
          Approve…
        </button>
        <button type="button" onClick={() => setMode('reject')} style={button('#fef2f2', '#b91c1c')}>
          Reject…
        </button>
      </div>
    );
  }

  if (mode === 'reject') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: '#fef2f2', minWidth: 280, maxWidth: 340 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>Reason (the coach sees this)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} style={{ ...field, resize: 'vertical' }} />
        </label>
        {error && <div style={{ ...labelText, color: '#b91c1c' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setMode('closed')} disabled={busy} style={button('var(--surface)', 'var(--ink-soft)')}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => send(`/api/staff/team-requests/${requestId}/reject`, { reason: reason.trim() })}
            disabled={busy || !reason.trim()}
            style={button('#b91c1c', '#fff', busy || !reason.trim())}
          >
            {busy ? 'Saving…' : 'Confirm rejection'}
          </button>
        </div>
      </div>
    );
  }

  const canApprove = teamMode === 'new' ? !!season.trim() : !!teamId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--accent-tint)', minWidth: 280, maxWidth: 360 }}>
      <div style={{ display: 'flex', gap: 14 }}>
        {(['new', 'existing'] as const).map((m) => (
          <label key={m} style={{ ...labelText, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="radio" name={`team-mode-${requestId}`} checked={teamMode === m} onChange={() => setTeamMode(m)} />
            {m === 'new' ? 'Create this club and team' : 'Use an existing team'}
          </label>
        ))}
      </div>
      {teamMode === 'new' ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>Season</span>
          <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. 2026/27" maxLength={40} style={field} />
        </label>
      ) : (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>Team</span>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={field}>
            <option value="">Choose a team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelText}>Access ends (optional)</span>
        <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} style={field} />
      </label>
      {error && <div style={{ ...labelText, color: '#b91c1c' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setMode('closed')} disabled={busy} style={button('var(--surface)', 'var(--ink-soft)')}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            send(`/api/staff/team-requests/${requestId}/approve`, {
              mode: teamMode,
              ...(teamMode === 'new' ? { season: season.trim() } : { teamId }),
              ...(expiresOn ? { expiresOn } : {}),
            })
          }
          disabled={busy || !canApprove}
          style={button('var(--accent)', '#fff', busy || !canApprove)}
        >
          {busy ? 'Approving…' : 'Approve and make coach'}
        </button>
      </div>
    </div>
  );
}
