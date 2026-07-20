'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import SignIn from './SignIn';

type RecoverCard = { cardId: string; playerId: string | null; playerName: string | null };
type RecoverOrder = { orderId: string; orderRef: string; source: string; cards: RecoverCard[] };

/**
 * The no-card fallback — a verified purchaser email is just a different
 * way of identifying the same claimable card as the primary code path, not
 * a separate ownership system. No special recovery email is ever sent
 * here; signing in is the only email involved (SignIn.tsx, reused
 * unchanged), and once authenticated, `auth.email()` is the only lookup
 * key (see src/app/api/os/recover/route.ts) — there's no way to search by
 * a typed, unverified email anywhere in this flow.
 */
export default function RecoverByEmail({ hasSession }: { hasSession: boolean }) {
  const router = useRouter();
  const [orders, setOrders] = useState<RecoverOrder[] | null>(null);
  const [handoffCardId, setHandoffCardId] = useState<string | null>(null);
  const [handoffEmail, setHandoffEmail] = useState('');
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [sentHandoff, setSentHandoff] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession) return;
    fetch('/api/os/recover')
      .then((res) => res.json())
      .then((data) => setOrders(data.orders ?? []));
  }, [hasSession]);

  if (!hasSession) {
    return <SignIn />;
  }

  const claimSelf = async (cardId: string) => {
    setBusyCardId(cardId);
    const res = await fetch('/api/os/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, decision: 'self' }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setBusyCardId(null);
    }
  };

  const sendHandoff = async (e: React.FormEvent, cardId: string) => {
    e.preventDefault();
    if (!handoffEmail.trim()) return;
    setBusyCardId(cardId);
    const res = await fetch('/api/os/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, decision: 'handoff', handoffEmail: handoffEmail.trim() }),
    });
    setBusyCardId(null);
    if (res.ok) {
      setSentHandoff(cardId);
      setHandoffCardId(null);
    }
  };

  const allCards = (orders ?? []).flatMap((o) => o.cards.map((c) => ({ ...c, orderRef: o.orderRef })));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: 'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 30px 36px',
        textAlign: 'center',
        overflowY: 'auto',
      }}
    >
      <img
        src={`${osAssetPath}/emblem-wordmark.png`}
        alt="Emblem"
        style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 32 }}
      />
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: '#F4F1EC', marginBottom: 10 }}>
        Cards linked to your account
      </div>

      {orders === null && <p style={{ fontSize: 14, color: '#B8AE9F' }}>Looking…</p>}

      {orders !== null && allCards.length === 0 && (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280 }}>
          Nothing available to recover yet — your order may still be waiting on approval, or you may not have any orders under this email.
        </p>
      )}

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {allCards.map((c) => (
          <div key={c.cardId} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(233,116,53,.25)', borderRadius: 16, padding: '16px 18px' }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: '#F4F1EC', marginBottom: 2 }}>
              {c.playerName ?? 'Personalised card'}
            </div>
            <div style={{ fontSize: 11.5, color: '#8B8478', marginBottom: 14 }}>Order {c.orderRef}</div>

            {sentHandoff === c.cardId ? (
              <p style={{ fontSize: 13, color: '#2E9E5B' }}>Invite sent.</p>
            ) : handoffCardId === c.cardId ? (
              <form onSubmit={(e) => sendHandoff(e, c.cardId)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="email"
                  required
                  value={handoffEmail}
                  onChange={(e) => setHandoffEmail(e.target.value)}
                  placeholder="Their email address"
                  style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(233,116,53,.35)', background: 'rgba(255,255,255,.04)', color: '#F4F1EC', fontFamily: 'Roboto', fontSize: 14 }}
                />
                <button type="submit" disabled={busyCardId === c.cardId} style={{ background: '#E97435', color: '#0B0A09', border: 'none', borderRadius: 10, padding: '11px 16px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                  {busyCardId === c.cardId ? 'Sending…' : 'Send invite'}
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => claimSelf(c.cardId)}
                  disabled={busyCardId === c.cardId}
                  style={{ background: '#E97435', color: '#0B0A09', border: 'none', borderRadius: 10, padding: '11px 16px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                >
                  {busyCardId === c.cardId ? 'Claiming…' : 'This is my child'}
                </button>
                <button
                  type="button"
                  onClick={() => setHandoffCardId(c.cardId)}
                  style={{ background: 'none', border: '1px solid rgba(233,116,53,.35)', borderRadius: 10, padding: '10px 16px', color: '#F4F1EC', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Send to the right parent
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
