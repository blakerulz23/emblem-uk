'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Migration 0076: pressing "Confirm erasure" now DOES perform the
 * deletion — real, server-enforced, database and storage — not merely an
 * attestation that a human carried it out elsewhere. The checkbox is the
 * staff member's explicit go-ahead for that real action, and the note
 * field is a separate, required field, not folded into the checkbox. Both
 * are required before the button enables; the server independently
 * re-enforces both (a non-empty note, via the route; a non-null
 * completed_by/note together, via the table's own CHECK constraint) —
 * this UI gate is belt-and-braces, not the only thing stopping an empty
 * completion.
 */
const ATTESTATION_TEXT = 'I have verified this request and I am authorising permanent erasure of this child’s data now.';

export default function MarkCompletedButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [attested, setAttested] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = async () => {
    const trimmed = note.trim();
    if (!attested || !trimmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/staff/deletion-requests/${requestId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: trimmed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError((body && typeof body.error === 'string' && body.error) || 'Could not record completion — try again.');
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
          color: '#047857', background: '#ecfdf5',
          padding: '8px 14px', borderRadius: 10, border: 'none',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Confirm erasure
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: '#ecfdf5', minWidth: 280, maxWidth: 340 }}>
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
        This permanently deletes the player, their photos and moments, revokes their cards, and removes stored card artwork. It cannot be undone.
      </div>

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
        <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} style={{ marginTop: 2 }} />
        <span>{ATTESTATION_TEXT}</span>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)' }}>Completion note / reference (required)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. support ticket #, or a one-line summary of what was removed"
          style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical' }}
        />
      </label>

      {error && <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: '#b91c1c' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => { setConfirming(false); setAttested(false); setNote(''); setError(null); }}
          disabled={busy}
          style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: 'var(--ink-soft)', background: 'var(--surface)', padding: '8px 14px', borderRadius: 10, border: 'none', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={busy || !attested || !note.trim()}
          style={{
            fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: '#fff',
            background: busy || !attested || !note.trim() ? 'var(--ink-faint)' : '#047857',
            padding: '8px 14px', borderRadius: 10, border: 'none',
            cursor: busy || !attested || !note.trim() ? 'default' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Erasing…' : 'Confirm erasure'}
        </button>
      </div>
    </div>
  );
}
