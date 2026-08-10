'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResolveButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async () => {
    const trimmed = note.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/staff/pending-auth-deletions/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: trimmed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError((body && typeof body.error === 'string' && body.error) || 'Could not record this — try again.');
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
        style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: '#047857', background: '#ecfdf5', padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Mark Auth deletion finished
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: '#ecfdf5', minWidth: 280 }}>
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
        Confirm you deleted this user via Supabase Auth Admin
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. deleted via dashboard, confirmed gone"
        style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical' }}
      />
      {error && <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: '#b91c1c' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => { setConfirming(false); setNote(''); setError(null); }} disabled={busy} style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: 'var(--ink-soft)', background: 'var(--surface)', padding: '8px 14px', borderRadius: 10, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
          Cancel
        </button>
        <button type="button" onClick={resolve} disabled={busy || !note.trim()} style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: '#fff', background: busy || !note.trim() ? 'var(--ink-faint)' : '#047857', padding: '8px 14px', borderRadius: 10, border: 'none', cursor: busy || !note.trim() ? 'default' : 'pointer' }}>
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
