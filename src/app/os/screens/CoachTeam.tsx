'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';

export default function CoachTeam({ actions }: { actions: OsActions }) {
  const router = useRouter();
  const { mode, squad: SQUAD, teamId } = useOsData();
  const isReal = mode !== 'demo';
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [squadNumber, setSquadNumber] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [showCodeInstead, setShowCodeInstead] = useState(false);

  const resetAdd = () => {
    setShowAdd((v) => !v);
    setClaimToken(null);
    setInvitedEmail(null);
    setShowCodeInstead(false);
  };

  const addPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/os/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          name: name.trim(),
          position: position.trim() || undefined,
          squadNumber: squadNumber ? Number(squadNumber) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not add player');
        return;
      }
      setClaimToken(data.claimToken);
      setInvitedEmail(null);
      setShowCodeInstead(false);

      // Preferred digital flow when the coach has the parent's email —
      // reuses the existing second-guardian invite route unmodified. The
      // claim code above is the canonical fallback either way: if this
      // fails, the coach can still relay the code by hand, so a failure
      // here must never block or error out the rest of the flow.
      const email = parentEmail.trim();
      if (email) {
        try {
          const inviteRes = await fetch('/api/os/invites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: data.playerId, invitedEmail: email }),
          });
          if (inviteRes.ok) setInvitedEmail(email);
        } catch {
          // Claim code fallback above still works — no error surfaced here.
        }
      }

      setName('');
      setPosition('');
      setSquadNumber('');
      setParentEmail('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)', lineHeight: 1.1 }}>
            {isReal ? 'Your team' : 'Curzon Ashton U10'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>
            {SQUAD.length} player{SQUAD.length === 1 ? '' : 's'}
          </div>
        </div>
        {isReal && (
          <button
            type="button"
            onClick={resetAdd}
            style={{ background: '#E97435', color: '#fff', border: 'none', borderRadius: 11, padding: '10px 14px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', flex: '0 0 auto' }}
          >
            + Add Player
          </button>
        )}
      </div>

      {showAdd && (
        <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)' }}>
          {claimToken ? (
            <div style={{ textAlign: 'center' }}>
              {invitedEmail && !showCodeInstead ? (
                <>
                  <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)', marginBottom: 6 }}>Invitation sent to {invitedEmail}</div>
                  <div style={{ fontSize: 13, color: 'var(--os-muted)', marginBottom: 14 }}>They&apos;ll get an email with a code to set up the player&apos;s profile.</div>
                  <button type="button" onClick={() => setShowCodeInstead(true)} style={{ background: 'none', border: 'none', color: 'var(--os-muted)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', marginBottom: 14, display: 'block', width: '100%' }}>
                    Show code instead
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--os-muted)', marginBottom: 8 }}>Share this code with the player&apos;s parent — they&apos;ll enter it when they sign up.</div>
                  <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, letterSpacing: '.2em', color: 'var(--os-ink)', marginBottom: 12 }}>{claimToken}</div>
                </>
              )}
              <button type="button" onClick={resetAdd} style={{ background: 'none', border: '1px solid var(--os-border)', borderRadius: 10, padding: '9px 16px', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--os-ink)' }}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={addPlayer} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" required
                style={{ padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position"
                  style={{ flex: 1, padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }} />
                <input value={squadNumber} onChange={(e) => setSquadNumber(e.target.value)} placeholder="Squad #" inputMode="numeric"
                  style={{ width: 90, padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }} />
              </div>
              <input value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="Parent's email (optional)" type="email"
                style={{ padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }} />
              <button type="submit" disabled={busy || !name.trim()} style={{ background: busy ? 'rgba(233,116,53,.5)' : '#E97435', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Adding…' : 'Add player'}
              </button>
              {error && <p role="alert" style={{ color: '#C0392B', fontSize: 13 }}>{error}</p>}
            </form>
          )}
        </div>
      )}

      {SQUAD.map((p) => {
        const initials = p.name.split(' ').map((w) => w[0]).join('');
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--os-card)', borderRadius: 16, padding: 12, boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)', marginBottom: 11 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(150deg,#E9C46A,#C98B3A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontFamily: 'Roboto', fontWeight: 900, fontSize: 15, color: '#fff' }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--os-muted)' }}>#{p.num} · {p.pos}</div>
            </div>
            <div onClick={() => actions.openCeleb(p.id)} style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, background: '#E97435', color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, padding: '10px 14px', borderRadius: 11, cursor: 'pointer', boxShadow: '0 8px 18px -10px rgba(233,116,53,.7)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>Celebrate
            </div>
          </div>
        );
      })}
    </>
  );
}
