'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { SquadPlayer } from '../types';

export function daysLeftLabel(expiresAt: string): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

async function copyInviteLink(code: string): Promise<boolean> {
  const url = `${window.location.origin}/os?invite=${encodeURIComponent(code)}`;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

const sheetButtonStyle: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: '#fff',
  border: '1px solid var(--os-border)',
  borderRadius: 12,
  padding: '13px 14px',
  fontFamily: 'Roboto',
  fontWeight: 700,
  fontSize: 14,
  color: 'var(--os-ink)',
  cursor: 'pointer',
  marginBottom: 8,
};

/**
 * One sheet, two entry points — reuses the exact same "enter an email"
 * form for both a fresh invite (none/expired) and "Invite another
 * guardian" from the manage view (pending), rather than two components.
 * That action creates a second, independently-keyed invite rather than
 * invalidating the existing pending one — hence "another," not
 * "different."
 * Every mutating action calls POST /api/os/invites, the same route and
 * dedup/reuse logic every other invite origin already goes through —
 * nothing new is invented here for creating or resending invites.
 */
export default function GuardianInviteSheet({ player, onClose }: { player: SquadPlayer; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'invite'>(player.hasManageableInvite ? 'view' : 'invite');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/os/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, invitedEmail: email.trim(), origin: 'coach_added_player' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send that invite');
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // Creates/reuses an invite with no email attached (a distinct dedup key
  // from an emailed invite — see createGuardianInvite), then copies its
  // link. No email is ever sent for this one; the coach hands it over
  // directly.
  const shareLinkInstead = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/os/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, origin: 'coach_added_player' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create an invite link');
        return;
      }
      const ok = await copyInviteLink(data.code);
      if (!ok) {
        setError('Could not copy the link — try again');
        return;
      }
      setCopied(true);
      router.refresh();
      setTimeout(onClose, 900);
    } finally {
      setBusy(false);
    }
  };

  // The code is never part of the Team-screen payload — fetched here,
  // on demand, only when the coach actually taps this button. The route
  // re-checks team membership itself before ever returning a code.
  const copyExistingLink = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/os/players/${player.id}/invite-link`);
      const data = await res.json();
      if (!res.ok || !data.code) {
        setError(data.error || 'No active invite link to copy');
        return;
      }
      const ok = await copyInviteLink(data.code);
      setCopied(ok);
      if (!ok) setError('Could not copy the link — try again');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/os/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, resend: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not resend that invite');
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    // Fixed, not absolute: unlike OsApp.tsx's own overlays (MomentStage,
    // CelebrateSheet, etc. — see the position:fixed wrappers added around
    // those), this sheet is rendered from CoachTeam/CoachPlayerDetail,
    // themselves inside the scrollable tab content — its nearest positioned
    // ancestor is no longer guaranteed to be exactly one viewport tall now
    // that the page scrolls for real (see .emblem-os-shell in os.css), so
    // it needs its own viewport-anchored containing block directly.
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 46, background: 'rgba(15,13,11,.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: '#F4F2EE', borderRadius: '26px 26px 0 0', padding: '10px 20px 26px' }}>
        <div style={{ width: 42, height: 5, borderRadius: 4, background: 'rgba(0,0,0,.18)', margin: '0 auto 16px' }} />

        {mode === 'view' ? (
          <>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)', marginBottom: 4 }}>Guardian Invite</div>
            <div style={{ fontSize: 13, color: 'var(--os-muted)', marginBottom: 4 }}>Status</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)', marginBottom: 18 }}>
              Pending{player.latestInviteExpiresAt ? ` · ${daysLeftLabel(player.latestInviteExpiresAt)}` : ''}
            </div>

            <button type="button" onClick={copyExistingLink} disabled={busy} style={sheetButtonStyle}>
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
            <button type="button" onClick={resend} disabled={busy} style={sheetButtonStyle}>
              {busy ? 'Resending…' : 'Resend invite'}
            </button>
            <button type="button" onClick={() => { setMode('invite'); setError(''); }} style={sheetButtonStyle}>
              Invite another guardian
            </button>
            {error && <p role="alert" style={{ color: '#C0392B', fontSize: 13, margin: '4px 0 8px' }}>{error}</p>}
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--os-muted)', fontSize: 13, cursor: 'pointer', marginTop: 4, display: 'block' }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)', marginBottom: 4 }}>Invite a guardian</div>
            <div style={{ fontSize: 13, color: 'var(--os-muted)', marginBottom: 16 }}>
              {player.name}&apos;s parent will get an email with a code to set up their profile.
            </div>
            <form onSubmit={sendInvite} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Parent's email"
                required
                style={{ padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
              />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                style={{ background: busy ? 'rgba(233,116,53,.5)' : '#E97435', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? 'Sending…' : 'Send invite'}
              </button>
            </form>
            <button type="button" onClick={shareLinkInstead} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--os-muted)', fontSize: 13, textDecoration: 'underline', cursor: busy ? 'default' : 'pointer', marginTop: 12, display: 'block' }}>
              {copied ? 'Link copied' : 'Or copy a shareable link instead'}
            </button>
            {error && <p role="alert" style={{ color: '#C0392B', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--os-muted)', fontSize: 13, cursor: 'pointer', marginTop: 14, display: 'block' }}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
