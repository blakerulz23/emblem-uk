'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Same confirm pattern as RejectCardButton (name restated, consequence
 * explained, Cancel / final action) — Delete is the more consequential
 * of the two (no UI path back once dismissed, see the API route's own
 * comment), so it gets the identical treatment rather than a lighter one.
 */
export default function DeleteCardButton({ cardId, playerName }: { cardId: string; playerName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const del = async () => {
    setBusy(true);
    await fetch(`/api/staff/cards/${cardId}/delete`, { method: 'POST' });
    router.refresh();
    setBusy(false);
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 700,
          fontSize: 12.5,
          color: '#b91c1c',
          background: '#fef2f2',
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Delete
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '10px 12px', borderRadius: 10, background: '#fef2f2', minWidth: 220,
      }}
    >
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
        Delete {playerName}?
      </div>
      <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)' }}>
        This removes it from the production queue. The order, player and claim token are not affected.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          style={{
            fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
            color: 'var(--ink-soft)', background: 'var(--surface)',
            padding: '8px 14px', borderRadius: 10, border: 'none',
            cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={del}
          disabled={busy}
          style={{
            fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
            color: '#fff', background: busy ? 'var(--ink-faint)' : '#b91c1c',
            padding: '8px 14px', borderRadius: 10, border: 'none',
            cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
