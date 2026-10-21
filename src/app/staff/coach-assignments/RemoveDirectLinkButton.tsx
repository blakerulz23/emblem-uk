'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Removes one direct coach-player connection, with a required reason. The
 * coach loses access to that one player; the history stays in the audit
 * trail. Separate from ending a team assignment.
 */
export default function RemoveDirectLinkButton({ playerId, coachProfileId, label }: { playerId: string; coachProfileId: string; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const trimmed = reason.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/staff/coach-player-links/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, coachProfileId, reason: trimmed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError((body && typeof body.error === 'string' && body.error) || 'Could not remove the connection — try again.');
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  };

  const btn = (bg: string, color: string, disabled = false) => ({
    fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color,
    background: disabled ? 'var(--ink-faint)' : bg, padding: '7px 12px', borderRadius: 10, border: 'none',
    cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' as const,
  });

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} style={btn('#fef2f2', '#b91c1c')}>
        Remove connection…
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', minWidth: 260, maxWidth: 320 }}>
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
        {label} will stop seeing this player.
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)' }}>Reason (required)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="e.g. family asked us to remove this coach"
          style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
        />
      </label>
      {error && <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: '#b91c1c' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => { setConfirming(false); setReason(''); setError(null); }} disabled={busy} style={btn('var(--surface)', 'var(--ink-soft)')}>
          Cancel
        </button>
        <button type="button" onClick={remove} disabled={busy || !reason.trim()} style={btn('#b91c1c', '#fff', busy || !reason.trim())}>
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}
