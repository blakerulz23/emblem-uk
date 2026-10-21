'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import BackLink from './BackLink';
import type { TeamRequestSummary } from '@/lib/os-view';

const inputStyle = {
  boxSizing: 'border-box' as const,
  minHeight: 48,
  borderRadius: 12,
  border: '1px solid rgba(233,116,53,.35)',
  background: 'rgba(255,255,255,.04)',
  color: '#F4F1EC',
  fontFamily: 'Roboto',
  fontSize: 15,
  padding: '0 16px',
  outline: 'none',
};

const primaryButton = (busy: boolean) => ({
  background: busy ? 'rgba(233,116,53,.5)' : '#E97435',
  color: '#0B0A09',
  fontFamily: 'Roboto',
  fontWeight: 800,
  fontSize: 15,
  minHeight: 48,
  padding: '15px 30px',
  borderRadius: 14,
  border: 'none',
  cursor: busy ? 'default' : 'pointer',
  boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
});

const linkButton = {
  background: 'none',
  border: 'none',
  color: '#E97435',
  fontFamily: 'Roboto',
  fontWeight: 700,
  fontSize: 13.5,
  cursor: 'pointer',
  padding: 8,
};

/**
 * A coach asks for a team; staff approve it and set the team up. Replaces
 * self-service team creation (CreateTeamOnboarding): nothing here grants
 * access, and nothing writes a role. Shows the person's latest request:
 * pending (with cancel), rejected (with the reason and a way to ask again),
 * or the form.
 */
export default function TeamRequestOnboarding({
  request,
  onChooseParent,
  onClose,
}: {
  request: TeamRequestSummary | null;
  /** Shown during onboarding: "I'm a parent or guardian" goes to card claiming instead. */
  onChooseParent?: () => void;
  /** Shown when opened from inside the app (an existing parent asking to coach). */
  onClose?: () => void;
}) {
  const router = useRouter();
  const [askAgain, setAskAgain] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [clubName, setClubName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const showPending = request?.status === 'pending';
  const showRejected = request?.status === 'rejected' && !askAgain;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    const res = await fetch('/api/os/team-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, clubName, teamName, ageGroup, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrorMsg(data.error || 'Could not send your request — try again.');
      setBusy(false);
      return;
    }
    setAskAgain(false);
    setBusy(false);
    router.refresh();
  };

  const cancel = async () => {
    if (!request || busy) return;
    setBusy(true);
    setErrorMsg('');
    const res = await fetch(`/api/os/team-requests/${request.id}/cancel`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error || 'Could not cancel — try again.');
    }
    setBusy(false);
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
        overflowY: 'auto',
      }}
    >
      {onClose ? (
        <button type="button" onClick={onClose} style={{ ...linkButton, position: 'absolute', top: 18, left: 18 }}>
          ← Back
        </button>
      ) : (
        <BackLink href="/" label="Back to site" />
      )}
      <img
        src={`${osAssetPath}/emblem-wordmark.png`}
        alt="Emblem"
        style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 32 }}
      />

      {showPending && request ? (
        <>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>REQUEST SENT</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: '#F4F1EC', marginBottom: 10 }}>We&apos;re setting up your team</div>
          <div style={{ width: '100%', maxWidth: 300, border: '1px solid rgba(233,116,53,.35)', borderRadius: 14, padding: '14px 16px', margin: '6px 0 18px', textAlign: 'left' }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: '#F4F1EC' }}>{request.clubName}</div>
            <div style={{ fontSize: 13.5, color: '#B8AE9F', marginTop: 3 }}>
              {request.teamName}
              {request.ageGroup ? ` · ${request.ageGroup}` : ''}
            </div>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 290, margin: '0 0 22px' }}>
            Our team checks every request before a coach can see any players. You&apos;ll get access here as soon as it&apos;s approved.
          </p>
          <button type="button" onClick={cancel} disabled={busy} style={linkButton}>
            {busy ? 'Cancelling…' : 'Cancel request'}
          </button>
        </>
      ) : showRejected && request ? (
        <>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: '#F4F1EC', marginBottom: 10 }}>We couldn&apos;t approve this request</div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 290, margin: '0 0 12px' }}>
            {request.clubName} · {request.teamName}
          </p>
          {request.decisionNote && (
            <p style={{ fontSize: 14, lineHeight: 1.55, color: '#F4F1EC', maxWidth: 290, margin: '0 0 22px', fontStyle: 'italic' }}>&ldquo;{request.decisionNote}&rdquo;</p>
          )}
          <button type="button" onClick={() => setAskAgain(true)} style={primaryButton(false)}>
            Send a new request
          </button>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: '#F4F1EC', marginBottom: 10 }}>Request your team</div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 290, margin: '0 0 24px' }}>
            Tell us which team you coach. We&apos;ll check it and set it up, then you can add players and share their claim codes.
          </p>
          <form onSubmit={submit} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={80} style={inputStyle} />
            <input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="Club name" aria-label="Club name" required minLength={2} maxLength={120} style={inputStyle} />
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name (e.g. U10 Blues)" aria-label="Team name" required maxLength={120} style={inputStyle} />
            <input value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} placeholder="Age group (optional)" aria-label="Age group" maxLength={40} style={inputStyle} />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything that helps us check (optional)"
              aria-label="Note for our team"
              maxLength={1000}
              rows={2}
              style={{ ...inputStyle, minHeight: 64, padding: '12px 16px', resize: 'vertical' }}
            />
            <button type="submit" disabled={busy} style={primaryButton(busy)}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: '#8B8478', maxWidth: 290, margin: '18px 0 0' }}>
            Got a team invite link from your club? Open it on this device to join your team straight away.
          </p>
        </>
      )}

      {errorMsg && (
        <p role="alert" style={{ fontSize: 13, color: '#E9745C', marginTop: 14, maxWidth: 280 }}>
          {errorMsg}
        </p>
      )}

      {onChooseParent && !showPending && (
        <button type="button" onClick={onChooseParent} style={{ ...linkButton, marginTop: 14 }}>
          I&apos;m a parent or guardian instead
        </button>
      )}
    </div>
  );
}
