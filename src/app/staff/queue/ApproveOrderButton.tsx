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
  const [error, setError] = useState('');

  // Previously this fetch's response was never checked — a rejection (most
  // commonly a Squad Invite order failing the payment-required gate once
  // squad_invite_payment_mode_enabled() is on, see approve/route.ts) left
  // staff clicking a button that silently did nothing, with no way to tell
  // "not paid yet" from "broken". The server logic itself is unchanged;
  // this only surfaces the error text it was already returning.
  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/orders/${orderId}/approve`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || 'This order could not be approved.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        type="button"
        onClick={approve}
        disabled={busy}
        aria-busy={busy}
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
      {error && (
        <p role="alert" style={{ margin: 0, maxWidth: 220, textAlign: 'right', fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>
          {error}
        </p>
      )}
    </div>
  );
}
