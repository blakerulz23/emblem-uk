'use client';

import { useState } from 'react';

export default function UnsuspendCardButton({ cardId }: { cardId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const unsuspend = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/os/cards/${cardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unsuspend' }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      // Full reload rather than router.refresh() — this same URL (?card=...)
      // needs to re-run page.tsx's server-side resolution from scratch now
      // that the card is active again, the same one-shot re-resolution
      // pattern the rest of this file's server logic already relies on.
      window.location.reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={unsuspend}
        disabled={busy}
        style={{
          background: '#E97435',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          padding: '12px 20px',
          fontFamily: 'Roboto',
          fontWeight: 800,
          fontSize: 14,
          minHeight: 46,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Turning back on…' : 'Turn card back on'}
      </button>
      {error && (
        <p role="alert" style={{ fontSize: 12.5, color: '#C0392B', marginTop: 10 }}>
          Couldn&apos;t turn this card back on — try again.
        </p>
      )}
    </div>
  );
}
