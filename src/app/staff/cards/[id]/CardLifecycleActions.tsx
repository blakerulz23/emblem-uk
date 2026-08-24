'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const REASONS = ['lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other'] as const;

export default function CardLifecycleActions({
  cardId,
  accessStatus,
}: {
  cardId: string;
  accessStatus: 'suspended' | 'revoked' | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('other');
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [newClaimToken, setNewClaimToken] = useState<string | null>(null);

  const runAction = async (action: 'suspend' | 'unsuspend' | 'revoke') => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/staff/cards/${cardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'unsuspend' ? undefined : reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'That action failed');
        return;
      }
      setConfirmingRevoke(false);
      router.refresh();
    } catch {
      setError('That action failed — try again');
    } finally {
      setBusy(null);
    }
  };

  const runReplace = async () => {
    setBusy('replace');
    setError(null);
    try {
      const res = await fetch(`/api/staff/cards/${cardId}/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Replacement failed');
        return;
      }
      setNewClaimToken(data.newClaimToken ?? null);
      setConfirmingReplace(false);
      router.refresh();
    } catch {
      setError('Replacement failed — try again');
    } finally {
      setBusy(null);
    }
  };

  const btnStyle = (disabled: boolean) => ({
    padding: '10px 16px',
    borderRadius: 10,
    border: '1px solid #E5E1D8',
    background: disabled ? '#f2f0ec' : '#fff',
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? 'default' : 'pointer',
    marginRight: 8,
    marginBottom: 8,
  });

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6B6357', display: 'block', marginBottom: 4 }}>
          Reason (for suspend / revoke / replace)
        </label>
        <select value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} style={{ padding: 8, borderRadius: 8, border: '1px solid #E5E1D8' }}>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {accessStatus !== 'revoked' && (
        <>
          {accessStatus === 'suspended' ? (
            <button type="button" onClick={() => runAction('unsuspend')} disabled={busy !== null} style={btnStyle(busy !== null)}>
              {busy === 'unsuspend' ? 'Unsuspending…' : 'Unsuspend'}
            </button>
          ) : (
            <button type="button" onClick={() => runAction('suspend')} disabled={busy !== null} style={btnStyle(busy !== null)}>
              {busy === 'suspend' ? 'Suspending…' : 'Suspend'}
            </button>
          )}

          {!confirmingRevoke ? (
            <button type="button" onClick={() => setConfirmingRevoke(true)} disabled={busy !== null} style={{ ...btnStyle(busy !== null), color: '#C0392B', borderColor: '#C0392B' }}>
              Revoke…
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: '#C0392B' }}>Revoke permanently?</span>
              <button type="button" onClick={() => runAction('revoke')} disabled={busy !== null} style={{ ...btnStyle(busy !== null), background: '#C0392B', color: '#fff', borderColor: '#C0392B' }}>
                {busy === 'revoke' ? 'Revoking…' : 'Confirm revoke'}
              </button>
              <button type="button" onClick={() => setConfirmingRevoke(false)} disabled={busy !== null} style={btnStyle(busy !== null)}>
                Cancel
              </button>
            </span>
          )}

          {!confirmingReplace ? (
            <button type="button" onClick={() => setConfirmingReplace(true)} disabled={busy !== null} style={btnStyle(busy !== null)}>
              Replace…
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: '#6B6357' }}>Issue a new card and revoke this one?</span>
              <button type="button" onClick={runReplace} disabled={busy !== null} style={{ ...btnStyle(busy !== null), background: '#E97435', color: '#fff', borderColor: '#E97435' }}>
                {busy === 'replace' ? 'Creating…' : 'Confirm replace'}
              </button>
              <button type="button" onClick={() => setConfirmingReplace(false)} disabled={busy !== null} style={btnStyle(busy !== null)}>
                Cancel
              </button>
            </span>
          )}
        </>
      )}

      {accessStatus === 'revoked' && <p style={{ fontSize: 13, color: '#6B6357' }}>This card is permanently revoked. No further action is possible.</p>}

      {error && (
        <p role="alert" style={{ fontSize: 12.5, color: '#C0392B', marginTop: 10 }}>
          {error}
        </p>
      )}
      {newClaimToken && (
        <p role="status" style={{ fontSize: 12.5, color: '#2E9E5B', marginTop: 10 }}>
          New card created. Claim code for programming: <strong>{newClaimToken}</strong>
        </p>
      )}
    </div>
  );
}
