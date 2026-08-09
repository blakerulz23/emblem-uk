'use client';

import { useEffect, useState } from 'react';
import { useOsData, useRefreshOsData } from '../OsDataContext';
import { usePresenceHeartbeat } from '../usePresenceHeartbeat';
import { useLiveContent, useJustUpdatedFlag } from '../useLiveContent';
import type { VerifyItem } from '../types';

export default function CoachVerify() {
  const { mode, verifyQueue } = useOsData();
  const isReal = mode !== 'demo';
  const [items, setItems] = useState<VerifyItem[]>(verifyQueue);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keeps this screen's list in step with any live refresh of the wider
  // OsData snapshot (see below) — demo mode never refreshes, so this is a
  // no-op there.
  useEffect(() => {
    setItems(verifyQueue);
  }, [verifyQueue]);

  // A guardian uploading a moment that needs verification appears here
  // immediately while a coach is already on this screen — no badge, no
  // router.refresh(). Scoped by verification_status rather than a
  // team/player id (postgres_changes filters are single-column equality
  // only) — RLS ("moments: coaches can verify/update for their team")
  // already ensures this coach's subscription only ever receives moments
  // for their own team regardless.
  const refreshOsData = useRefreshOsData();
  const [justUpdated, triggerJustUpdated] = useJustUpdatedFlag();
  usePresenceHeartbeat(isReal ? 'verify' : null);
  useLiveContent('moments', isReal ? 'verification_status=eq.pending_verification' : null, () => {
    refreshOsData();
    triggerJustUpdated();
  });

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    if (mode === 'demo') {
      setItems((current) => current.filter((v) => v.id !== id));
      return;
    }
    // Guards against a second tap on the same item while its first request
    // is still in flight — a re-render mid-request could otherwise fire the
    // approve/reject call twice for one moment.
    if (busyId === id) return;
    setBusyId(id);
    setErrorId(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/os/moments/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ momentId: id, decision }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrorId(id);
        setErrorMessage((body && typeof body.error === 'string' && body.error) || 'Could not save your decision — try again.');
        return; // Item stays in the queue — never removed on failure.
      }
      setItems((current) => current.filter((v) => v.id !== id));
      refreshOsData();
    } catch {
      setErrorId(id);
      setErrorMessage('Could not save your decision — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {justUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 12, animation: 'faceIn .3s ease' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2E9E5B' }} />
          <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: '#2E9E5B' }}>Updated just now</span>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)', lineHeight: 1.1 }}>Recognition</div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>Moments waiting for your recognition.</div>
      </div>
      {items.length === 0 && (
        <div style={{ fontSize: 13.5, color: 'var(--os-muted)', textAlign: 'center', padding: '24px 0' }}>Nothing waiting on your recognition right now.</div>
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
              Recognize
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => decide(v.id, 'reject')}
              style={{ flex: '0 0 auto', textAlign: 'center', padding: '11px 16px', borderRadius: 11, border: '1px solid rgba(210,60,50,.3)', color: '#C0392B', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: busyId === v.id ? 'default' : 'pointer' }}
            >
              Not this time
            </div>
          </div>
          {errorId === v.id && errorMessage && (
            <p style={{ fontSize: 11.5, color: '#C0392B', margin: '10px 0 0', textAlign: 'center' }}>{errorMessage}</p>
          )}
        </div>
      ))}
    </>
  );
}
