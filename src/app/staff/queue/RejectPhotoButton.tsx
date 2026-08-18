'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Content-moderation reject for a Squad Invite order's child photo —
 * two-step arm/confirm, same treatment as RejectCardButton, since this is
 * a more consequential action than the single-click ApproveOrderButton.
 * The reason is optional (staff should be able to act fast) but feeds the
 * audit trail and is what staff would tell the guardian when following up
 * manually — there's no in-app reshoot flow.
 */
export default function RejectPhotoButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reject = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/orders/${orderId}/reject-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!response.ok) {
        const responseBody = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(responseBody?.error || 'This photo could not be rejected.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
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
        Reject photo
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
        Reject this photo?
      </div>
      <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)' }}>
        This order can no longer be approved until the guardian is contacted and the photo is replaced.
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional, for the audit log)"
        rows={2}
        disabled={busy}
        style={{
          fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5,
          padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)',
          resize: 'vertical', background: '#fff', color: 'var(--ink)',
        }}
      />
      {error && (
        <p role="alert" style={{ margin: 0, fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>
          {error}
        </p>
      )}
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
          aria-busy={busy}
          style={{
            fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
            color: '#fff', background: busy ? 'var(--ink-faint)' : '#c2410c',
            padding: '8px 14px', borderRadius: 10, border: 'none',
            cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Rejecting…' : 'Reject photo'}
        </button>
      </div>
    </div>
  );
}
