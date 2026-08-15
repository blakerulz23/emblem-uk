'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * squadInvite only changes the label/copy shown to staff — the endpoint is
 * the same POST /api/orders/[id]/approve for every order; that route
 * branches server-side on orders.source itself (see approve/route.ts) and
 * is what actually withholds the normal guardian/team invite email for a
 * Squad Invite order. This prop exists so staff are never told "Approve"
 * with no further context on a pilot order that was never paid for.
 */
export default function ApproveOrderButton({ orderId, squadInvite = false }: { orderId: string; squadInvite?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    await fetch(`/api/orders/${orderId}/approve`, { method: 'POST' });
    router.refresh();
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={approve}
      disabled={busy}
      title={squadInvite ? 'Moves this pilot card into production. No payment has been taken.' : undefined}
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
      {busy ? 'Approving…' : squadInvite ? 'Approve for pilot production' : 'Approve'}
    </button>
  );
}
