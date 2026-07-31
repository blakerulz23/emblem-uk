'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOsData, useRefreshOsData } from '../OsDataContext';
import { onActivateKey } from '../a11y';
import { usePresenceHeartbeat } from '../usePresenceHeartbeat';
import { useLiveContent, useJustUpdatedFlag } from '../useLiveContent';
import type { OsActions } from '../OsApp';
import { GuardianStatusRow } from './CoachTeam';
import GuardianInviteSheet from '../overlays/GuardianInviteSheet';
import EmptyState from './EmptyState';

/** "15 Aug 2026" — matches RealCollection/PlayerHome's date convention. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const sectionCard = { background: 'var(--os-card)', borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)' };
const sectionTitle = { fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)', marginBottom: 10 };
const inputStyle = { padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14, width: '100%', boxSizing: 'border-box' as const };
const addButtonStyle = (disabled: boolean) => ({
  background: disabled ? 'rgba(233,116,53,.4)' : '#E97435',
  color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px',
  fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: disabled ? 'default' : 'pointer', marginTop: 8,
});

/** Same glyph as StoryUpdateCard.tsx's season_focus_added icon — a local copy, matching this app's existing convention of small per-file icon helpers rather than a cross-file import between unrelated screens/overlays. */
function TargetIcon(c: string) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1" fill={c} stroke="none" />
    </svg>
  );
}

export default function CoachPlayerDetail({ playerId, actions }: { playerId: string; actions: OsActions }) {
  const router = useRouter();
  const { mode, squad, verifyQueue } = useOsData();
  const isReal = mode !== 'demo';
  const player = squad.find((p) => p.id === playerId);

  // A guardian adding/updating a Season Focus, or a fresh assessment
  // resolved elsewhere, appears here immediately while a coach is already
  // on this exact player's detail — no badge, no router.refresh(). `player`
  // above is re-derived from context on every render, so a refresh alone
  // is enough here (no local state to resync, unlike Card.tsx).
  const refreshOsData = useRefreshOsData();
  const [justUpdated, triggerJustUpdated] = useJustUpdatedFlag();
  // Gated on isReal — a demo player id isn't a real players.id, and demo
  // mode has no real session for the presence heartbeat to authenticate
  // with anyway (matches Card.tsx/RealCollection.tsx/CoachVerify.tsx's
  // identical isReal-gating of these same two hooks).
  usePresenceHeartbeat(isReal ? `coach-player:${playerId}` : null);
  useLiveContent('player_assessments', isReal ? `player_id=eq.${playerId}` : null, () => {
    refreshOsData();
    triggerJustUpdated();
  });
  useLiveContent('player_season_focus', isReal ? `player_id=eq.${playerId}` : null, () => {
    refreshOsData();
    triggerJustUpdated();
  });

  const [sheetOpen, setSheetOpen] = useState(false);

  const [editingSecondary, setEditingSecondary] = useState(false);
  const [secondaryDraft, setSecondaryDraft] = useState(player?.secondaryPosition ?? '');
  const [secondaryBusy, setSecondaryBusy] = useState(false);
  const [secondaryError, setSecondaryError] = useState('');

  const [assessmentDraft, setAssessmentDraft] = useState('');
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [assessmentError, setAssessmentError] = useState('');

  const [strengthDraft, setStrengthDraft] = useState('');
  const [strengthBusy, setStrengthBusy] = useState(false);
  const [strengthError, setStrengthError] = useState('');

  const [focusDraft, setFocusDraft] = useState('');
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusError, setFocusError] = useState('');

  if (!player) {
    return <EmptyState title="Player not found" body="This player may have been removed from your team." />;
  }

  const initials = player.name.split(' ').map((w) => w[0]).join('');
  const pending = verifyQueue.filter((v) => v.playerId === playerId);
  const latestAssessment = player.assessments[0] ?? null;
  const activeFocusCount = player.seasonFocus.filter((f) => f.status === 'active').length;

  const startEditSecondary = () => {
    setSecondaryDraft(player.secondaryPosition ?? '');
    setSecondaryError('');
    setEditingSecondary(true);
  };

  const saveSecondary = async () => {
    setSecondaryBusy(true);
    setSecondaryError('');
    try {
      const res = await fetch(`/api/os/players/${playerId}/secondary-position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secondaryPosition: secondaryDraft.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSecondaryError(data.error || 'Could not save that');
        return;
      }
      setEditingSecondary(false);
      router.refresh();
    } finally {
      setSecondaryBusy(false);
    }
  };

  const shareAssessment = async () => {
    const trimmed = assessmentDraft.trim();
    if (!trimmed) return;
    setAssessmentBusy(true);
    setAssessmentError('');
    try {
      const res = await fetch('/api/os/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, body: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAssessmentError(data.error || 'Could not share that assessment');
        return;
      }
      setAssessmentDraft('');
      setAssessmentOpen(false);
      router.refresh();
    } finally {
      setAssessmentBusy(false);
    }
  };

  const addStrength = async () => {
    const trimmed = strengthDraft.trim();
    if (!trimmed) return;
    setStrengthBusy(true);
    setStrengthError('');
    try {
      const res = await fetch('/api/os/strengths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, label: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStrengthError(data.error || 'Could not add that strength');
        return;
      }
      setStrengthDraft('');
      router.refresh();
    } finally {
      setStrengthBusy(false);
    }
  };

  const addFocus = async () => {
    const trimmed = focusDraft.trim();
    if (!trimmed || activeFocusCount >= 3) return;
    setFocusBusy(true);
    setFocusError('');
    try {
      const res = await fetch('/api/os/season-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, label: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFocusError(data.error || 'Could not add that focus');
        return;
      }
      setFocusDraft('');
      router.refresh();
    } finally {
      setFocusBusy(false);
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
      {/* Identity */}
      <div style={sectionCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(150deg,#E9C46A,#C98B3A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontFamily: 'Roboto', fontWeight: 900, fontSize: 17, color: '#fff' }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 18, color: 'var(--os-ink)' }}>{player.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--os-muted)' }}>#{player.num} · {player.pos}</div>
            <GuardianStatusRow player={player} onAction={() => setSheetOpen(true)} />
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--os-border)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--os-muted)', marginBottom: 6 }}>Secondary Position</div>
          {isReal && editingSecondary ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={secondaryDraft}
                onChange={(e) => setSecondaryDraft(e.target.value)}
                placeholder="e.g. Winger"
                autoFocus
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="button" onClick={saveSecondary} disabled={secondaryBusy} style={{ ...addButtonStyle(secondaryBusy), marginTop: 0, flex: '0 0 auto' }}>
                {secondaryBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : isReal ? (
            <div
              onClick={startEditSecondary}
              role="button"
              tabIndex={0}
              onKeyDown={onActivateKey(startEditSecondary)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, color: 'var(--os-ink)' }}>{player.secondaryPosition ?? 'Not set'}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#E97435' }}>Edit</span>
            </div>
          ) : (
            <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, color: 'var(--os-ink)' }}>{player.secondaryPosition ?? 'Not set'}</span>
          )}
          {secondaryError && <p role="alert" style={{ color: '#C0392B', fontSize: 12.5, marginTop: 6 }}>{secondaryError}</p>}
        </div>
      </div>

      {/* Pending recognition */}
      {pending.length > 0 && (
        <div
          onClick={actions.goCoachVerify}
          role="button"
          tabIndex={0}
          onKeyDown={onActivateKey(actions.goCoachVerify)}
          style={{ ...sectionCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13.5, color: 'var(--os-ink)' }}>
            {pending.length} moment{pending.length === 1 ? '' : 's'} waiting for your recognition
          </span>
          <span style={{ fontSize: 18, color: '#E97435' }}>→</span>
        </div>
      )}

      {/* Coach's Assessment — attribution reads first, small and quiet; the
          assessment itself is the hero (largest type, boldest weight, most
          whitespace). The Share button below is unstyled/untouched — it
          reads as secondary purely because the quote above it now dominates. */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Coach&apos;s Assessment</div>
        {latestAssessment ? (
          <div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: 'var(--os-ink)' }}>{latestAssessment.authorName ?? 'Coach'}</div>
            <div style={{ fontSize: 11, color: 'var(--os-muted)', marginBottom: 16 }}>{formatDate(latestAssessment.createdAt)}</div>
            <div style={{ position: 'relative', paddingLeft: 4 }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: -16, left: -4, fontFamily: 'Georgia, serif', fontSize: 46, fontWeight: 700, color: 'rgba(233,160,59,.22)', lineHeight: 1, userSelect: 'none' }}>&ldquo;</span>
              <p style={{ position: 'relative', fontFamily: 'Roboto', fontWeight: 700, fontSize: 17, lineHeight: 1.4, color: 'var(--os-ink)', margin: 0 }}>{latestAssessment.body}</p>
            </div>
          </div>
        ) : (
          <EmptyState title="No assessment yet" body="Share your assessment of this player's development so far." />
        )}
        {isReal && (assessmentOpen ? (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={assessmentDraft}
              onChange={(e) => setAssessmentDraft(e.target.value)}
              placeholder="How is this player developing?"
              rows={4}
              autoFocus
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'Roboto' }}
            />
            {assessmentError && <p role="alert" style={{ color: '#C0392B', fontSize: 12.5, marginTop: 6 }}>{assessmentError}</p>}
            <button type="button" onClick={shareAssessment} disabled={assessmentBusy || !assessmentDraft.trim()} style={addButtonStyle(assessmentBusy || !assessmentDraft.trim())}>
              {assessmentBusy ? 'Sharing…' : 'Share assessment'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAssessmentOpen(true)} style={addButtonStyle(false)}>
            Share assessment
          </button>
        ))}
      </div>

      {/* Recognised Strengths */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Recognised Strengths</div>
        {player.strengths.length === 0 ? (
          <EmptyState title="No strengths recognised yet" body="Add the qualities you've noticed in this player this season." />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {player.strengths.map((s) => (
              <span key={s.id} style={{ background: 'rgba(233,116,53,.1)', color: '#C4501C', fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, padding: '7px 12px', borderRadius: 999 }}>{s.label}</span>
            ))}
          </div>
        )}
        {isReal && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={strengthDraft}
              onChange={(e) => setStrengthDraft(e.target.value)}
              placeholder="e.g. Composure on the ball"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="button" onClick={addStrength} disabled={strengthBusy || !strengthDraft.trim()} style={{ ...addButtonStyle(strengthBusy || !strengthDraft.trim()), marginTop: 0, flex: '0 0 auto' }}>
              {strengthBusy ? 'Adding…' : 'Add'}
            </button>
          </div>
        )}
        {strengthError && <p role="alert" style={{ color: '#C0392B', fontSize: 12.5, marginTop: 6 }}>{strengthError}</p>}
      </div>

      {/* Season Focus — empty state reads label → icon → hero title →
          supporting copy → the (unchanged) add control below, which reads
          as dominant simply because everything above it is quiet. Populated
          rows read focus text as hero → status as a small "progress" pill →
          author/date as the smallest supporting line. */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Season Focus <span style={{ color: 'var(--os-muted)', fontWeight: 600 }}>({activeFocusCount}/3 active)</span></div>
        {player.seasonFocus.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '6px 4px 2px' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(233,116,53,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              {TargetIcon('#E97435')}
            </div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)', marginBottom: 6 }}>No Season Focus yet</div>
            <div style={{ fontSize: 13, color: 'var(--os-muted)', lineHeight: 1.5 }}>Set what this player is working on this season — you and their guardian can both contribute.</div>
          </div>
        ) : (
          player.seasonFocus.map((f) => (
            <div key={f.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--os-border)' }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)', marginBottom: 6 }}>{f.label}</div>
              <span style={{
                display: 'inline-block', fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase',
                color: f.status === 'active' ? '#2E9E5B' : 'var(--os-muted)',
                background: f.status === 'active' ? 'rgba(46,158,91,.12)' : 'rgba(0,0,0,.06)',
                padding: '3px 8px', borderRadius: 999, marginBottom: 5,
              }}>
                {f.status === 'active' ? 'Active' : f.status === 'completed' ? 'Completed' : 'Archived'}
              </span>
              <div style={{ fontSize: 11.5, color: 'var(--os-muted)' }}>
                {f.authorName ?? (f.authorRole === 'coach' ? 'Coach' : 'Guardian')} · {formatDate(f.createdAt)}
              </div>
            </div>
          ))
        )}
        {isReal && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={focusDraft}
              onChange={(e) => setFocusDraft(e.target.value)}
              placeholder={activeFocusCount >= 3 ? '3 active already — complete one first' : 'e.g. First touch under pressure'}
              disabled={activeFocusCount >= 3}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="button" onClick={addFocus} disabled={focusBusy || !focusDraft.trim() || activeFocusCount >= 3} style={{ ...addButtonStyle(focusBusy || !focusDraft.trim() || activeFocusCount >= 3), marginTop: 0, flex: '0 0 auto' }}>
              {focusBusy ? 'Adding…' : 'Add'}
            </button>
          </div>
        )}
        {focusError && <p role="alert" style={{ color: '#C0392B', fontSize: 12.5, marginTop: 6 }}>{focusError}</p>}
      </div>

      {sheetOpen && <GuardianInviteSheet player={player} onClose={() => setSheetOpen(false)} />}
    </>
  );
}
