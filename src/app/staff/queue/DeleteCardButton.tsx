'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The only staff-queue action with a confirmation step — Delete is a
 * one-way removal from view (see the API route's own comment: it's a
 * soft flag, but there's no UI path back to an item once dismissed).
 * A plain inline two-click swap rather than a modal, since nothing else
 * in this page uses a dialog primitive.
 */
export default function DeleteCardButton({ cardId }: { cardId: string }) {
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        type="button"
        onClick={del}
        disabled={busy}
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 700,
          fontSize: 12.5,
          color: '#fff',
          background: busy ? 'var(--ink-faint)' : '#b91c1c',
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          cursor: busy ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Deleting…' : 'Confirm delete?'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 700,
          fontSize: 12.5,
          color: 'var(--ink-soft)',
          background: 'var(--surface)',
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          cursor: busy ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Cancel
      </button>
    </div>
  );
}
