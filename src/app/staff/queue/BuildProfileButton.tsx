'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BuildProfileButton({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await fetch(`/api/staff/cards/${cardId}/submit`, { method: 'POST' });
    router.refresh();
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={submit}
      disabled={busy}
      style={{
        fontFamily: 'var(--font-sora), system-ui',
        fontWeight: 700,
        fontSize: 13,
        color: '#fff',
        background: busy ? 'var(--ink-faint)' : '#047857',
        padding: '10px 16px',
        borderRadius: 10,
        border: 'none',
        cursor: busy ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {busy ? 'Submitting…' : 'Build Profile'}
    </button>
  );
}
