'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RejectCardButton({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const reject = async () => {
    setBusy(true);
    await fetch(`/api/staff/cards/${cardId}/reject`, { method: 'POST' });
    router.refresh();
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={reject}
      disabled={busy}
      style={{
        fontFamily: 'var(--font-sora), system-ui',
        fontWeight: 700,
        fontSize: 12.5,
        color: '#c2410c',
        background: '#fff7ed',
        padding: '8px 14px',
        borderRadius: 10,
        border: 'none',
        cursor: busy ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {busy ? 'Rejecting…' : 'Reject'}
    </button>
  );
}
