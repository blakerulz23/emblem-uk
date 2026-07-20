'use client';

import { useState } from 'react';
import { useOsData } from '../OsDataContext';
import type { VerifyItem } from '../types';

export default function CoachVerify() {
  const { mode, verifyQueue } = useOsData();
  const [items, setItems] = useState<VerifyItem[]>(verifyQueue);
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    if (mode === 'demo') {
      setItems((current) => current.filter((v) => v.id !== id));
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch('/api/os/moments/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ momentId: id, decision }),
      });
      if (res.ok) {
        setItems((current) => current.filter((v) => v.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)', lineHeight: 1.1 }}>Verify moments</div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>Approved moments receive the Coach Verified badge.</div>
      </div>
      {items.length === 0 && (
        <div style={{ fontSize: 13.5, color: 'var(--os-muted)', textAlign: 'center', padding: '24px 0' }}>Nothing waiting on review right now.</div>
      )}
      {items.map((v) => (
        <div key={v.id} style={{ background: 'var(--os-card)', borderRadius: 18, padding: 14, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flex: '0 0 auto', position: 'relative', background: '#100E0C' }}>
              {v.thumb && <img src={v.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{v.moment}</div>
              <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 1 }}>{v.player}</div>
              <div style={{ fontSize: 11.5, color: 'var(--os-muted)', marginTop: 3 }}>Submitted by {v.by} · {v.date}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => decide(v.id, 'approve')}
              style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 11, background: busyId === v.id ? 'rgba(233,116,53,.5)' : '#E97435', color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: busyId === v.id ? 'default' : 'pointer', boxShadow: '0 8px 18px -10px rgba(233,116,53,.7)' }}
            >
              Approve
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => decide(v.id, 'reject')}
              style={{ flex: '0 0 auto', textAlign: 'center', padding: '11px 16px', borderRadius: 11, border: '1px solid rgba(210,60,50,.3)', color: '#C0392B', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: busyId === v.id ? 'default' : 'pointer' }}
            >
              Reject
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
