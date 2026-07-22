'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResendInviteButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true);
    await fetch(`/api/orders/${orderId}/resend-invite`, { method: 'POST' });
    router.refresh();
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={resend}
      disabled={busy}
      style={{
        fontFamily: 'var(--font-sora), system-ui',
        fontWeight: 700,
        fontSize: 12.5,
        color: 'var(--accent)',
        background: 'var(--accent-tint)',
        padding: '8px 14px',
        borderRadius: 10,
        border: 'none',
        cursor: busy ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {busy ? 'Resending…' : 'Resend invite'}
    </button>
  );
}
