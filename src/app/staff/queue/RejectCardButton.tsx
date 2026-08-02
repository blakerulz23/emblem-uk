'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Same two-step confirm mechanism as DeleteCardButton (the one existing
 * confirmation pattern on this page) — Reject now carries the same
 * production-safety treatment as Delete, since a misclick on the wrong
 * row in a long list is otherwise silent and hard to notice.
 */
export default function RejectCardButton({ cardId, playerName }: { cardId: string; playerName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const reject = async () => {
    setBusy(true);
    await fetch(`/api/staff/cards/${cardId}/reject`, { method: 'POST' });
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
          color: '#c2410c',
          background: '#fff7ed',
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Reject
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '10px 12px', borderRadius: 10, background: '#fff7ed', minWidth: 220,
      }}
    >
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
        Reject {playerName}?
      </div>
      <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)' }}>
        This will return this card to: Waiting for Setup. Nothing else will change.
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
          onClick={reject}
          disabled={busy}
          style={{
            fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
            color: '#fff', background: busy ? 'var(--ink-faint)' : '#c2410c',
            padding: '8px 14px', borderRadius: 10, border: 'none',
            cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
