'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import { useOsData, useRefreshOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';
import type { SeasonTarget } from '../playerProfile';
import { onActivateKey } from '../a11y';
import { useOsPhotoUpload } from '../useOsPhotoUpload';
import AccountSettings from '../overlays/AccountSettings';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The four outcomes the milestone spec requires be distinguished — never
 * collapsed into a single "invite created" message. The copyable link
 * below this text is shown regardless of emailStatus in every case
 * (email delivery is never a requirement for the invite to exist), so
 * the copy only ever needs to set the right expectation about whether
 * an email is also on its way.
 */
function coachInviteSuccessCopy(reused: boolean, emailStatus: 'sent' | 'failed' | 'skipped_no_email'): string {
  if (reused) {
    if (emailStatus === 'sent') return "An active invite already exists — we've resent the email. You can also copy the link below.";
    if (emailStatus === 'failed') return "An active invite already exists, but we couldn't resend the email. Copy the link below and send it yourself.";
    return 'An active invite already exists. You can resend this link.';
  }
  if (emailStatus === 'sent') return 'Invite created and emailed to the coach. You can also copy the link below.';
  if (emailStatus === 'failed') return "Invite created, but we couldn't send the email. Copy the link below and send it yourself.";
  return 'Invite created. Copy the link and send it to the coach.';
}

// Foot and squad number are deliberately not repeated here — foot is
// already what's printed on the player's own Card (its present-tense
// identity face), and squad number already lives in the header stat-strip.
// Primary Position DOES belong here (unlike foot) — About owns *displaying*
// football identity, but Profile is the only place a guardian actually
// *edits* it, so it needs a home in Player Preferences alongside the other
// editable/preference facts (Collection OS Product Specification v1.0's
// overlap table, revised in the Profile/About duplication audit).
type PreferenceRow = { label: string; value: string; badge?: string };

const DEMO_IDENTITY: PreferenceRow[] = [
  { label: 'Primary position', value: 'Midfielder' },
  { label: 'Football age group', value: 'U10', badge: 'Set by coach' },
  { label: 'Favourite player', value: 'Kevin De Bruyne' },
  { label: 'Football ambition', value: 'Play academy football' },
];

/** Reproduces the three demo presentation states from one shape: a literal fraction, a vague "in progress", or "Completed". */
function goalDisplay(g: SeasonTarget) {
  const pct = Math.min(100, Math.round((g.current / g.target) * 100));
  if (g.status === 'completed') return { val: 'Completed', valColor: '#2E9E5B', bar: '#2E9E5B', pct };
  if (g.unit) return { val: `${g.current} / ${g.target}`, valColor: '#15130F', bar: 'linear-gradient(90deg,#F26722,#E97435)', pct };
  return { val: 'In progress', valColor: '#2A6FDB', bar: '#2A6FDB', pct };
}

export default function Profile({ actions }: { actions: OsActions }) {
  const router = useRouter();
  const { mode, playerId, playerProfile, connections, goals, viewerId } = useOsData();
  const isReal = mode !== 'demo';
  const identityRows: PreferenceRow[] = isReal
    ? [
        { label: 'Primary position', value: playerProfile.position || 'Not set' },
        // Coach-managed — the badge, not an input, is what communicates
        // that (see Player Preferences' Edit form below, which never
        // includes this row). Matches the approved prototype's own
        // ProfileView.tsx exactly.
        { label: 'Football age group', value: playerProfile.footballAgeGroup ?? 'Not set', badge: 'Set by coach' },
        { label: 'Favourite player', value: playerProfile.favouritePlayer ?? 'Not set' },
        { label: 'Football ambition', value: playerProfile.footballAmbition ?? 'Not set' },
      ]
    : DEMO_IDENTITY;
  const refreshOsData = useRefreshOsData();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Add Coach — a separate flow from Add Guardian (see sendInvite below),
  // deliberately not sharing state or a submit handler with it even
  // though the visual shape is similar, per the product requirement that
  // "family or coach" is no longer presented as one combined action.
  const [showCoachInvite, setShowCoachInvite] = useState(false);
  const [coachEmail, setCoachEmail] = useState('');
  const [coachInviteStatus, setCoachInviteStatus] = useState<'idle' | 'sending' | 'created' | 'error'>('idle');
  const [coachInviteResult, setCoachInviteResult] = useState<{ url: string; reused: boolean; emailStatus: 'sent' | 'failed' | 'skipped_no_email' } | null>(null);
  const [coachInviteError, setCoachInviteError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const resetCoachInvite = () => {
    setShowCoachInvite(false);
    setCoachEmail('');
    setCoachInviteStatus('idle');
    setCoachInviteResult(null);
    setCoachInviteError(null);
    setLinkCopied(false);
  };

  const sendCoachInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || coachInviteStatus === 'sending') return;
    const normalized = coachEmail.trim().toLowerCase();
    if (!normalized || !EMAIL_RE.test(normalized)) {
      setCoachInviteError('Enter a valid email address.');
      return;
    }
    setCoachInviteError(null);
    setCoachInviteStatus('sending');
    try {
      const res = await fetch('/api/os/coach-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, invitedEmail: normalized }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setCoachInviteStatus('error');
        setCoachInviteError(json?.error ?? 'Could not create the invite — try again.');
        return;
      }
      setCoachInviteResult({ url: json.url as string, reused: !!json.reused, emailStatus: json.emailStatus });
      setCoachInviteStatus('created');
    } catch {
      setCoachInviteStatus('error');
      setCoachInviteError('Could not create the invite — try again.');
    }
  };

  const copyCoachInviteLink = async () => {
    if (!coachInviteResult) return;
    try {
      await navigator.clipboard.writeText(coachInviteResult.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the link is still visible and
      // selectable in the field itself, so this is a soft failure only.
    }
  };

  // Revoke — direct coach connections only (see the Connections render
  // below, gated on c.teamContext === null). Calls the existing
  // Milestone 2 route directly; refreshOsData() re-fetches the whole
  // OsData snapshot afterward, the same resync pattern already
  // established for moment visibility (RealCollection.tsx) rather than
  // patching local state or a full page reload.
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [revokingCoachId, setRevokingCoachId] = useState<string | null>(null);
  const [revokeErrorId, setRevokeErrorId] = useState<string | null>(null);

  const revokeCoach = async (coachProfileId: string) => {
    if (!playerId || revokingCoachId) return;
    setRevokingCoachId(coachProfileId);
    setRevokeErrorId(null);
    try {
      const res = await fetch(`/api/os/players/${playerId}/coach-connections/${coachProfileId}`, { method: 'DELETE' });
      if (!res.ok) {
        setRevokeErrorId(coachProfileId);
        return;
      }
      // Refresh BEFORE clearing confirmingRevokeId — otherwise the
      // confirm UI closes immediately using the still-stale connections
      // snapshot, briefly re-showing the just-revoked coach as a normal,
      // still-connected row until the refetch below resolves a moment
      // later. Same ordering fix already applied to Coach Player
      // Detail's leaveConnection for the identical reason.
      await refreshOsData();
      setConfirmingRevokeId(null);
    } catch {
      setRevokeErrorId(coachProfileId);
    } finally {
      setRevokingCoachId(null);
    }
  };
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [favouritePlayer, setFavouritePlayer] = useState(playerProfile.favouritePlayer ?? '');
  const [footballAmbition, setFootballAmbition] = useState(playerProfile.footballAmbition ?? '');
  const [position, setPosition] = useState(playerProfile.position ?? '');
  const [editStatus, setEditStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [positionNotice, setPositionNotice] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { status: photoStatus, error: photoError, uploadPhoto } = useOsPhotoUpload(playerId);
  const uploadingPhoto = photoStatus === 'uploading';

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadPhoto(file);
  };

  // Share Profile — enabling is deliberately tied to this one explicit
  // action (never automatic on player creation or on claim, see
  // 0039_guardian_public_profile_control.sql), via the guardian-only
  // update_player_public_visibility RPC. The
  // link itself is always the canonical /player/[publicPlayerId] route —
  // its own field allowlist (src/lib/public-player-profile.ts) is what
  // keeps DOB/age/coach-only fields out, not anything decided here.
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);

  const setPublicVisibility = async (enabled: boolean): Promise<boolean> => {
    if (!playerId) return false;
    const res = await fetch(`/api/os/players/${playerId}/public-profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) return false;
    router.refresh();
    return true;
  };

  const shareProfile = async () => {
    if (!playerId || !playerProfile.publicPlayerId || shareBusy) return;
    setShareBusy(true);
    setShareStatus('idle');
    setShareError(null);
    try {
      if (!playerProfile.publicIdEnabled) {
        const ok = await setPublicVisibility(true);
        if (!ok) {
          setShareStatus('error');
          setShareError("Couldn't turn on the public link — try again.");
          return;
        }
      }
      const url = `${window.location.origin}/player/${playerProfile.publicPlayerId}`;
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: `${playerProfile.name} on Emblem`, url });
          return; // Native share sheet handled its own feedback.
        } catch (err) {
          // A user-cancelled share is not a failure — nothing to report.
          if (err instanceof Error && err.name === 'AbortError') return;
          // Any other native-share failure falls through to the clipboard.
        }
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareStatus('copied');
        setTimeout(() => setShareStatus((s) => (s === 'copied' ? 'idle' : s)), 2500);
      } else {
        setShareStatus('error');
        setShareError("Couldn't copy the link automatically — copy it from your browser's address bar instead.");
      }
    } catch {
      setShareStatus('error');
      setShareError("Couldn't share the link — try again.");
    } finally {
      setShareBusy(false);
    }
  };

  const turnOffPublicLink = async () => {
    if (!playerId || shareBusy) return;
    setShareBusy(true);
    setShareStatus('idle');
    setShareError(null);
    const ok = await setPublicVisibility(false);
    setShareBusy(false);
    if (!ok) {
      setShareStatus('error');
      setShareError("Couldn't turn off the public link — try again.");
    }
  };

  const saveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || editStatus === 'saving') return;
    setEditStatus('saving');
    setPositionNotice(null);
    const trimmedPosition = position.trim();
    const identityRequest = fetch(`/api/os/players/${playerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favouritePlayer, footballAmbition }),
    });
    // Position has its own route (guardian-only update_primary_position
    // RPC, distinct from secondary_position's coach-only RPC) — never sent
    // blank, since the route rejects an empty value and every player has a
    // real position. A collision with a coach-set secondary_position is
    // resolved atomically server-side (secondary_position cleared, never a
    // raw constraint error) — surfaced below, not silently dropped.
    const positionRequest = trimmedPosition
      ? fetch(`/api/os/players/${playerId}/position`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: trimmedPosition }),
        })
      : null;
    const [identityRes, positionRes] = await Promise.all([identityRequest, positionRequest]);
    if (!identityRes.ok || (positionRes && !positionRes.ok)) {
      setEditStatus('error');
      return;
    }
    if (positionRes) {
      const positionResult = (await positionRes.json()) as { secondaryPositionCleared?: boolean };
      if (positionResult.secondaryPositionCleared) {
        setPositionNotice('Secondary position cleared — it matched the new primary position.');
      }
    }
    setEditStatus('idle');
    setShowEdit(false);
    router.refresh();
  };

  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalLabel, setGoalLabel] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalUnit, setGoalUnit] = useState('');
  const [addGoalStatus, setAddGoalStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [goalUpdateStatus, setGoalUpdateStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || !goalLabel.trim() || addGoalStatus === 'sending') return;
    const target = Number(goalTarget);
    if (!target || target <= 0) return;
    setAddGoalStatus('sending');
    const res = await fetch('/api/os/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, label: goalLabel.trim(), target, unit: goalUnit.trim() || undefined }),
    });
    if (!res.ok) {
      setAddGoalStatus('error');
      return;
    }
    setAddGoalStatus('idle');
    setShowAddGoal(false);
    setGoalLabel('');
    setGoalTarget('');
    setGoalUnit('');
    router.refresh();
  };

  const saveGoalProgress = async (goalId: string) => {
    const current = Number(editingValue);
    if (Number.isNaN(current) || goalUpdateStatus === 'saving') return;
    setGoalUpdateStatus('saving');
    const res = await fetch(`/api/os/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current }),
    });
    if (!res.ok) {
      setGoalUpdateStatus('error');
      return;
    }
    setGoalUpdateStatus('idle');
    setEditingGoalId(null);
    router.refresh();
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || !inviteEmail.trim()) return;
    setInviteStatus('sending');
    const res = await fetch('/api/os/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, invitedEmail: inviteEmail.trim() }),
    });
    setInviteStatus(res.ok ? 'sent' : 'error');
  };

  return (
    <>
      <div onMouseMove={actions.tiltMove} onMouseLeave={actions.tiltReset} style={{ background: 'var(--os-card)', borderRadius: 20, padding: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 16 }}>
        {positionNotice && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#FFF4E8', border: '1px solid #F0C896', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
            <span style={{ fontFamily: 'Roboto', fontSize: 12.5, color: '#8A5A1E' }}>{positionNotice}</span>
            <button
              type="button"
              onClick={() => setPositionNotice(null)}
              aria-label="Dismiss"
              style={{ background: 'none', border: 'none', color: '#8A5A1E', fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: 2 }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, marginBottom: playerProfile.photoUrl || photoError ? 6 : 16 }}>
          {isReal && !playerProfile.photoUrl ? (
            <div
              onClick={() => photoInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Add a photo"
              data-tiltz="26"
              style={{ width: 96, height: 120, borderRadius: 14, flex: '0 0 auto', position: 'relative', overflow: 'hidden', border: '2px dashed var(--os-border)', background: 'var(--os-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
            >
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handlePhotoChange} style={{ display: 'none' }} />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
              <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 10.5, color: 'var(--os-ink)', textAlign: 'center' }}>{uploadingPhoto ? 'Uploading…' : 'Add photo'}</span>
            </div>
          ) : (
            <div
              onClick={isReal ? () => photoInputRef.current?.click() : undefined}
              role={isReal ? 'button' : undefined}
              tabIndex={isReal ? 0 : undefined}
              aria-label={isReal ? 'Replace photo' : undefined}
              data-tiltz="26"
              style={{ width: 96, height: 120, borderRadius: 14, background: 'linear-gradient(160deg,#E9C46A,#C98B3A)', flex: '0 0 auto', position: 'relative', overflow: 'hidden', cursor: isReal ? 'pointer' : 'default' }}
            >
              {isReal && <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handlePhotoChange} style={{ display: 'none' }} />}
              <img
                src={isReal && playerProfile.photoUrl ? playerProfile.photoUrl : `${osAssetPath}/player-ollie.png`}
                alt={playerProfile.name}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
              />
              {isReal && uploadingPhoto && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 10.5, color: '#fff', textAlign: 'center' }}>Uploading…</span>
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 19, color: 'var(--os-ink)' }}>{playerProfile.name.toUpperCase()}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#E97435"><path d="M12 1l2.5 2.2 3.3-.4 1 3.2 3 1.5-1.2 3.1 1.2 3.1-3 1.5-1 3.2-3.3-.4L12 23l-2.5-2.2-3.3.4-1-3.2-3-1.5 1.2-3.1L2.2 10l3-1.5 1-3.2 3.3.4z" /><path d="M9.5 12.5l1.8 1.8 3.5-3.8" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
        </div>
        {photoStatus === 'success' && (
          <p style={{ fontSize: 11.5, color: '#2E9E5B', margin: '0 0 12px' }}>Photo updated.</p>
        )}
        {photoStatus === 'error' && (
          <p style={{ fontSize: 11.5, color: '#C0392B', margin: '0 0 12px' }}>{photoError ?? 'Could not upload photo — try again.'} The existing photo has been kept.</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--os-border)', borderBottom: '1px solid var(--os-border)', padding: '12px 0', marginBottom: 14 }}>
          <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>MEMBER SINCE</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.memberSinceYear ?? '—'}</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>SQUAD NUMBER</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.squadNumber ?? '—'}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>SEASON</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.season ?? '—'}</div></div>
        </div>
        {isReal && playerProfile.publicPlayerId && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={shareProfile}
              onKeyDown={onActivateKey(shareProfile)}
              style={{
                textAlign: 'center', padding: 11, borderRadius: 11, border: '1px solid var(--os-border)',
                fontFamily: 'Roboto', fontWeight: 800, fontSize: 13,
                color: shareStatus === 'copied' ? '#2E9E5B' : 'var(--os-ink)',
                cursor: shareBusy ? 'default' : 'pointer', opacity: shareBusy ? 0.6 : 1,
              }}
            >
              {shareBusy ? 'Sharing…' : shareStatus === 'copied' ? 'Link copied!' : 'Share Profile'}
            </div>
            {shareStatus === 'error' && shareError && (
              <p style={{ fontSize: 11.5, color: '#C0392B', textAlign: 'center', margin: '8px 0 0' }}>{shareError}</p>
            )}
            {playerProfile.publicIdEnabled && (
              <div
                role="button"
                tabIndex={0}
                onClick={turnOffPublicLink}
                onKeyDown={onActivateKey(turnOffPublicLink)}
                style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5, color: 'var(--os-muted)', textDecoration: 'underline', cursor: shareBusy ? 'default' : 'pointer' }}
              >
                Public link is on — turn off
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)' }}>PLAYER PREFERENCES</div>
          {isReal && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowEdit((v) => !v)}
              style={{ fontSize: 12.5, fontWeight: 700, color: '#E97435', cursor: 'pointer' }}
            >
              {showEdit ? 'Close' : 'Edit'}
            </div>
          )}
        </div>
        {identityRows.map((row) => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)', gap: 10 }}>
            <span style={{ fontSize: 13.5, color: '#6B6357' }}>{row.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: '#E97435', textAlign: 'right' }}>{row.value}</span>
              {row.badge && (
                <span style={{ flex: '0 0 auto', fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--os-muted)', background: 'rgba(0,0,0,.05)', padding: '3px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {row.badge}
                </span>
              )}
            </span>
          </div>
        ))}
        {isReal && showEdit && (
          <form onSubmit={saveIdentity} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Position"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
            />
            <input
              type="text"
              value={favouritePlayer}
              onChange={(e) => setFavouritePlayer(e.target.value)}
              placeholder="Favourite player"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
            />
            <input
              type="text"
              value={footballAmbition}
              onChange={(e) => setFootballAmbition(e.target.value)}
              placeholder="Football ambition"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
            />
            <button
              type="submit"
              disabled={editStatus === 'saving'}
              style={{ padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: editStatus === 'saving' ? 'default' : 'pointer' }}
            >
              {editStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {editStatus === 'error' && <p style={{ fontSize: 12.5, color: '#C0392B', margin: 0 }}>Could not save — try again.</p>}
          </form>
        )}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 14 }}>{isReal ? 'SEASON GOALS' : '2026 SEASON GOALS'}</div>
        {isReal && goals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>No season goals yet.</div>
            <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 4 }}>A coach or guardian can add one.</div>
          </div>
        )}
        {goals.map((g) => {
          const { val, valColor, bar, pct } = goalDisplay(g);
          const canEdit = isReal && g.id && g.createdBy === viewerId;
          return (
            <div key={g.id ?? g.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, color: 'var(--os-ink)' }}>{g.label}</span>
                <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: valColor }}>{val}</span>
              </div>
              <div style={{ height: 7, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: bar, borderRadius: 5 }} /></div>
              {canEdit && (
                editingGoalId === g.id ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      type="number"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      style={{ width: 80, boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 13 }}
                    />
                    <button
                      type="button"
                      onClick={() => saveGoalProgress(g.id!)}
                      disabled={goalUpdateStatus === 'saving'}
                      style={{ padding: '7px 14px', borderRadius: 8, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
                    >
                      {goalUpdateStatus === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { setEditingGoalId(g.id!); setEditingValue(String(g.current)); setGoalUpdateStatus('idle'); }}
                    style={{ marginTop: 6, fontSize: 12, color: '#E97435', fontFamily: 'Roboto', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Update progress
                  </div>
                )
              )}
            </div>
          );
        })}
        {isReal && (
          <div style={{ marginTop: showAddGoal ? 0 : 8 }}>
            {!showAddGoal ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowAddGoal(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 11, border: '1px dashed var(--os-border)', color: '#E97435', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                + Add a goal
              </div>
            ) : (
              <form onSubmit={addGoal} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                <input
                  type="text"
                  required
                  value={goalLabel}
                  onChange={(e) => setGoalLabel(e.target.value)}
                  placeholder="Goal (e.g. Keep 8 clean sheets)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    required
                    min={1}
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="Target (e.g. 8)"
                    style={{ flex: 1, boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
                  />
                  <input
                    type="text"
                    value={goalUnit}
                    onChange={(e) => setGoalUnit(e.target.value)}
                    placeholder="Unit (optional)"
                    style={{ flex: 1, boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={addGoalStatus === 'sending'}
                  style={{ padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: addGoalStatus === 'sending' ? 'default' : 'pointer' }}
                >
                  {addGoalStatus === 'sending' ? 'Adding…' : 'Add goal'}
                </button>
                {addGoalStatus === 'error' && <p style={{ fontSize: 12.5, color: '#C0392B', margin: 0 }}>Could not add goal — try again.</p>}
              </form>
            )}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 12 }}>CONNECTIONS</div>
        {connections.filter((c) => c.kind === 'guardian').map((c) => (
          <div key={c.profileId} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#d9a679,#b07344)', flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Managed by</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>{c.displayName ?? 'Guardian'}</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>{c.relationship ?? 'Guardian'}</div></div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </div>
        ))}
        {connections.filter((c) => c.kind === 'coach').map((c) => {
          const isDirect = c.teamContext === null;
          return (
            <div key={c.profileId} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#3a3a3a,#111)', flex: '0 0 auto' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--os-muted)' }}>{isDirect ? 'Private Coach' : 'Coach'}</div>
                <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>{c.displayName ?? 'Coach'}</div>
                {c.teamContext && <div style={{ fontSize: 11, color: 'var(--os-muted)' }}>{c.teamContext}</div>}
              </div>
              {/* Only a direct-only connection is revocable here — a team-
                  derived coach (or one who has both) keeps access through
                  the team regardless, so no revoke affordance is offered
                  for that row at all. */}
              {isReal && isDirect && (
                confirmingRevokeId === c.profileId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flex: '0 0 auto' }}>
                    <span style={{ fontSize: 10, color: 'var(--os-muted)', textAlign: 'right', maxWidth: 120 }}>Access ends; history stays.</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => revokeCoach(c.profileId)}
                        disabled={revokingCoachId === c.profileId}
                        style={{ background: '#C0392B', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontFamily: 'Roboto', fontWeight: 700, fontSize: 11.5, cursor: revokingCoachId === c.profileId ? 'default' : 'pointer' }}
                      >
                        {revokingCoachId === c.profileId ? 'Removing…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingRevokeId(null)}
                        disabled={revokingCoachId === c.profileId}
                        style={{ background: 'none', border: '1px solid var(--os-border)', borderRadius: 8, padding: '6px 10px', fontFamily: 'Roboto', fontWeight: 700, fontSize: 11.5, color: 'var(--os-ink)', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                    {revokeErrorId === c.profileId && <span style={{ fontSize: 10, color: '#C0392B' }}>Couldn&apos;t remove — try again.</span>}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingRevokeId(c.profileId)}
                    style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: '#C0392B', textDecoration: 'underline', cursor: 'pointer', flex: '0 0 auto' }}
                  >
                    Remove coach
                  </button>
                )
              )}
            </div>
          );
        })}
        {isReal && connections.filter((c) => c.kind === 'coach').length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--os-muted)', margin: '10px 0 0' }}>No coach connected yet.</p>
        )}

        {!showInvite && !showCoachInvite && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowInvite(true)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 12, background: 'rgba(233,116,53,.1)', border: '1px solid rgba(233,116,53,.3)', color: '#C4501C', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4501C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 3 1M18 8v6M21 11h-6" /></svg>
              Add Guardian
            </div>
            {isReal && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowCoachInvite(true)}
                onKeyDown={onActivateKey(() => setShowCoachInvite(true))}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 12, background: 'rgba(233,116,53,.1)', border: '1px solid rgba(233,116,53,.3)', color: '#C4501C', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4501C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 3 1M18 8v6M21 11h-6" /></svg>
                Add Coach
              </div>
            )}
          </div>
        )}

        {showInvite && (
          <form onSubmit={sendInvite} style={{ marginTop: 14 }}>
            {inviteStatus === 'sent' ? (
              <p style={{ fontSize: 13, color: '#2E9E5B', textAlign: 'center' }}>Invite sent to {inviteEmail}.</p>
            ) : (
              <>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Their email address"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14, marginBottom: 8 }}
                />
                <button
                  type="submit"
                  disabled={inviteStatus === 'sending'}
                  style={{ width: '100%', padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: inviteStatus === 'sending' ? 'default' : 'pointer' }}
                >
                  {inviteStatus === 'sending' ? 'Sending…' : 'Send invite'}
                </button>
                {inviteStatus === 'error' && <p style={{ fontSize: 12.5, color: '#C0392B', marginTop: 6 }}>Could not send the invite — try again.</p>}
              </>
            )}
          </form>
        )}

        {isReal && showCoachInvite && (
          <div style={{ marginTop: 14 }}>
            {coachInviteStatus === 'created' && coachInviteResult ? (
              <>
                <p style={{ fontSize: 13, color: coachInviteResult.emailStatus === 'failed' ? '#C4501C' : '#2E9E5B', textAlign: 'center', margin: '0 0 10px' }}>
                  {coachInviteSuccessCopy(coachInviteResult.reused, coachInviteResult.emailStatus)}
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    readOnly
                    value={coachInviteResult.url}
                    onFocus={(e) => e.target.select()}
                    style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 12.5, color: 'var(--os-ink)' }}
                  />
                  <button
                    type="button"
                    onClick={copyCoachInviteLink}
                    style={{ flex: '0 0 auto', padding: '0 16px', borderRadius: 10, background: linkCopied ? '#2E9E5B' : '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                  >
                    {linkCopied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--os-muted)', margin: '0 0 10px' }}>This link expires in 7 days.</p>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={resetCoachInvite}
                  style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--os-muted)', cursor: 'pointer' }}
                >
                  Done
                </div>
              </>
            ) : (
              <form onSubmit={sendCoachInvite}>
                <p style={{ fontSize: 12.5, color: 'var(--os-muted)', margin: '0 0 8px' }}>Invite a coach to follow this player&apos;s development.</p>
                <input
                  type="email"
                  required
                  value={coachEmail}
                  onChange={(e) => setCoachEmail(e.target.value)}
                  placeholder="Coach's email address"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14, marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    disabled={coachInviteStatus === 'sending'}
                    style={{ flex: 1, padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: coachInviteStatus === 'sending' ? 'default' : 'pointer' }}
                  >
                    {coachInviteStatus === 'sending' ? 'Creating…' : 'Create invite'}
                  </button>
                  <button
                    type="button"
                    onClick={resetCoachInvite}
                    disabled={coachInviteStatus === 'sending'}
                    style={{ padding: '0 16px', borderRadius: 11, background: 'none', border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: 'var(--os-ink)', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
                {coachInviteError && <p style={{ fontSize: 12.5, color: '#C0392B', marginTop: 6 }}>{coachInviteError}</p>}
              </form>
            )}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 12 }}>ACCOUNT MANAGEMENT</div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Open Account Settings"
          onClick={() => setShowAccountSettings(true)}
          onKeyDown={onActivateKey(() => setShowAccountSettings(true))}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Account Settings</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
      </div>

      {showAccountSettings && isReal && playerId && (
        <AccountSettings
          playerId={playerId}
          playerName={playerProfile.name}
          publicIdEnabled={playerProfile.publicIdEnabled}
          publicPlayerId={playerProfile.publicPlayerId}
          onClose={() => setShowAccountSettings(false)}
          onPublicVisibilityChanged={refreshOsData}
        />
      )}
    </>
  );
}
