'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';

export default function CreateTeamOnboarding() {
  const router = useRouter();
  const [clubName, setClubName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [season, setSeason] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');

    const res = await fetch('/api/os/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubName: clubName.trim(), teamName: teamName.trim(), season: season.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus('error');
      setErrorMsg(data.error || 'Could not create your team');
      return;
    }

    router.refresh();
  };

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
        justifyContent: 'center',
        padding: '36px 30px',
        textAlign: 'center',
      }}
    >
      <img
        src={`${osAssetPath}/emblem-wordmark.png`}
        alt="Emblem"
        style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 40 }}
      />
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: '#F4F1EC', marginBottom: 10 }}>Create your team</div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 28px' }}>
        You&apos;ll add players and share their claim codes once your team&apos;s set up.
      </p>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          placeholder="Club name"
          required
          style={{ boxSizing: 'border-box', minHeight: 48, borderRadius: 12, border: '1px solid rgba(233,116,53,.35)', background: 'rgba(255,255,255,.04)', color: '#F4F1EC', fontFamily: 'Roboto', fontSize: 15, padding: '0 16px', outline: 'none' }}
        />
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team name (e.g. U10)"
          required
          style={{ boxSizing: 'border-box', minHeight: 48, borderRadius: 12, border: '1px solid rgba(233,116,53,.35)', background: 'rgba(255,255,255,.04)', color: '#F4F1EC', fontFamily: 'Roboto', fontSize: 15, padding: '0 16px', outline: 'none' }}
        />
        <input
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          placeholder="Season (e.g. 2026/27)"
          required
          style={{ boxSizing: 'border-box', minHeight: 48, borderRadius: 12, border: '1px solid rgba(233,116,53,.35)', background: 'rgba(255,255,255,.04)', color: '#F4F1EC', fontFamily: 'Roboto', fontSize: 15, padding: '0 16px', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            background: status === 'loading' ? 'rgba(233,116,53,.5)' : '#E97435',
            color: '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, minHeight: 48,
            padding: '15px 30px', borderRadius: 14, border: 'none',
            cursor: status === 'loading' ? 'default' : 'pointer',
            boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
          }}
        >
          {status === 'loading' ? 'Creating…' : 'Create team'}
        </button>
      </form>

      {status === 'error' && (
        <p role="alert" style={{ fontSize: 13, color: '#E9745C', marginTop: 14, maxWidth: 280 }}>{errorMsg}</p>
      )}
    </div>
  );
}
