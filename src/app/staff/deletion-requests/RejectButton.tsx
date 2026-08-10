'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Reject request" records that staff reviewed a request and declined to
 * act on it — it never deletes anything. A non-empty reason is required
 * before "Confirm rejection" enables; the server independently
 * re-enforces this (the route rejects an empty reason; the table's own
 * CHECK constraint requires handled_by/at/reason together whenever
 * status = 'rejected') — this UI gate is belt-and-braces, not the only
 * thing stopping an empty rejection.
 */
export default function RejectButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reject = async () => {
    const trimmed = reason.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/staff/deletion-requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: trimmed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError((body && typeof body.error === 'string' && body.error) || 'Could not record the rejection — try again.');
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
          color: '#b91c1c', background: '#fef2f2',
          padding: '8px 14px', borderRadius: 10, border: 'none',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Reject request
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: '#fef2f2', minWidth: 280, maxWidth: 340 }}>
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
        This declines the request — it does not delete anything.
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)' }}>Rejection reason (required)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. could not verify the requester's identity"
          style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical' }}
        />
      </label>

      {error && <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: '#b91c1c' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => { setConfirming(false); setReason(''); setError(null); }}
          disabled={busy}
          style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: 'var(--ink-soft)', background: 'var(--surface)', padding: '8px 14px', borderRadius: 10, border: 'none', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={busy || !reason.trim()}
          style={{
            fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: '#fff',
            background: busy || !reason.trim() ? 'var(--ink-faint)' : '#b91c1c',
            padding: '8px 14px', borderRadius: 10, border: 'none',
            cursor: busy || !reason.trim() ? 'default' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Saving…' : 'Confirm rejection'}
        </button>
      </div>
    </div>
  );
}
