'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOsData, useRefreshOsData } from '../OsDataContext';
import { onActivateKey } from '../a11y';
import { usePresenceHeartbeat } from '../usePresenceHeartbeat';
import { useLiveContent, useJustUpdatedFlag } from '../useLiveContent';
import type { OsActions } from '../OsApp';
import { GuardianStatusRow } from './CoachTeam';
import GuardianInviteSheet from '../overlays/GuardianInviteSheet';
import EmptyState from './EmptyState';
import type { PreferredFoot } from '../coachFields';
import { AGE_GROUP_OPTIONS, FOOT_OPTIONS, POSITION_OPTIONS, positionLabel, validateHeightCm } from '../coachFields';

/** "15 Aug 2026" — matches RealCollection/PlayerHome's date convention. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const sectionCard = { background: 'var(--os-card)', borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)' };
const sectionTitle = { fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)', marginBottom: 10 };
const inputStyle = { padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14, width: '100%', boxSizing: 'border-box' as const };
const fieldLabel = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' as const, color: 'var(--os-muted)' };
const clearLinkStyle = { background: 'none', border: 'none', padding: '2px 4px', minHeight: 28, fontFamily: 'Roboto', fontWeight: 700, fontSize: 11.5, color: 'var(--os-muted)', cursor: 'pointer' as const };
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
  const { mode, squad, verifyQueue, coachTeamsManaged, viewerId } = useOsData();
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

  // Player information — football age group, height, preferred foot,
  // secondary position, all coach-managed, one atomic Save. Exact date of
  // birth is deliberately not collected anywhere in Emblem (Gate 2 privacy
  // decision, migration 0073_remove_exact_dob_stage_a.sql) — this screen
  // used to also show a coach-only date-of-birth field here; it was
  // removed, not hidden, and update_player_coach_fields' signature no
  // longer accepts a date of birth at all.
  //
  // All four fields below are already present on `player` (bulk-loaded
  // with the rest of the squad) — the coach-fields GET route is still
  // called here, but only for the signed photoUrl, fetched on demand for
  // this one player.
  const [coachFieldsLoading, setCoachFieldsLoading] = useState(true);
  const [coachFieldsLoadError, setCoachFieldsLoadError] = useState(false);
  // Same coach-fields fetch also returns a signed photo URL — see the GET
  // route's own comment for why it's fetched here (on demand, this one
  // player) rather than bulk-loaded onto every squad row.
  const [coachPhotoUrl, setCoachPhotoUrl] = useState<string | null>(null);

  const [ageGroupDraft, setAgeGroupDraft] = useState<string | null>(player?.footballAgeGroup ?? null);
  const [heightDraft, setHeightDraft] = useState(player?.heightCm != null ? String(player.heightCm) : '');
  const [footDraft, setFootDraft] = useState<PreferredFoot | null>(player?.preferredFoot ?? null);
  const [secondaryPositionDraft, setSecondaryPositionDraft] = useState<string | null>(player?.secondaryPosition ?? null);
  const [coachFieldsSaveStatus, setCoachFieldsSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Re-fetch the signed photo URL whenever this screen opens for a
  // (potentially different) player — never bundled into the squad list
  // fetch. Reset to a neutral blank state at the start, not just on
  // success, so switching from one player's detail straight to another's
  // (this component re-renders with a new playerId prop rather than
  // remounting) never briefly shows the previous player's photo.
  useEffect(() => {
    if (!isReal) {
      setCoachFieldsLoading(false);
      return;
    }
    let cancelled = false;
    setCoachPhotoUrl(null);
    setCoachFieldsLoading(true);
    setCoachFieldsLoadError(false);
    fetch(`/api/os/players/${playerId}/coach-fields`)
      .then((res) => {
        if (!res.ok) throw new Error('failed to load');
        return res.json() as Promise<{ photoUrl: string | null }>;
      })
      .then((data) => {
        if (cancelled) return;
        setCoachPhotoUrl(data.photoUrl);
      })
      .catch(() => {
        if (!cancelled) setCoachFieldsLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setCoachFieldsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isReal, playerId]);

  // The other four fields *are* already on `player` (bulk-loaded with the
  // squad) — re-synced here so switching between players' detail screens
  // (a re-render, not a remount) never leaves a stale draft from whichever
  // player was open before.
  useEffect(() => {
    setAgeGroupDraft(player?.footballAgeGroup ?? null);
    setHeightDraft(player?.heightCm != null ? String(player.heightCm) : '');
    setFootDraft(player?.preferredFoot ?? null);
    setSecondaryPositionDraft(player?.secondaryPosition ?? null);
    setCoachFieldsSaveStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const heightValidationError = validateHeightCm(heightDraft);
  const heightDraftNum = heightDraft.trim() === '' ? null : Number(heightDraft);

  const coachFieldsDirty =
    ageGroupDraft !== (player?.footballAgeGroup ?? null) ||
    heightDraftNum !== (player?.heightCm ?? null) ||
    footDraft !== (player?.preferredFoot ?? null) ||
    secondaryPositionDraft !== (player?.secondaryPosition ?? null);

  const coachFieldsCanSave =
    coachFieldsDirty && !heightValidationError && coachFieldsSaveStatus !== 'saving' && !coachFieldsLoading;

  const saveCoachFields = async () => {
    if (!coachFieldsCanSave) return;
    setCoachFieldsSaveStatus('saving');
    try {
      const res = await fetch(`/api/os/players/${playerId}/coach-fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          footballAgeGroup: ageGroupDraft,
          heightCm: heightDraftNum,
          preferredFoot: footDraft,
          secondaryPosition: secondaryPositionDraft,
        }),
      });
      if (!res.ok) {
        setCoachFieldsSaveStatus('error');
        return;
      }
      setCoachFieldsSaveStatus('success');
      // Squad (footballAgeGroup/heightCm/preferredFoot/secondaryPosition/
      // coachFieldsUpdatedAt) comes from the server component's own
      // getOsData() call — router.refresh() is what makes those four
      // reflect the save, same pattern this file's other write actions
      // already use (shareAssessment/addStrength/addFocus below).
      router.refresh();
      setTimeout(() => setCoachFieldsSaveStatus('idle'), 1800);
    } catch {
      setCoachFieldsSaveStatus('error');
    }
  };

  const cancelCoachFields = () => {
    setAgeGroupDraft(player?.footballAgeGroup ?? null);
    setHeightDraft(player?.heightCm != null ? String(player.heightCm) : '');
    setFootDraft(player?.preferredFoot ?? null);
    setSecondaryPositionDraft(player?.secondaryPosition ?? null);
    setCoachFieldsSaveStatus('idle');
  };

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

  // Leave (self) — only ever meaningful when this coach's own access to
  // this exact player isn't also backed by real team membership. A
  // player having *a* team (player.teamId) doesn't by itself mean this
  // coach is on it — coachTeamsManaged is the signed-in coach's own team
  // list, so checking against that (not just player.teamId) is what
  // correctly covers "team-linked player, but I'm a separate direct/
  // private coach, not one of their team coaches" as well as "no team at
  // all." Team-derived access must never show this action — removing a
  // stray direct row alongside it would have no real effect, and would
  // be confusing to offer.
  const isDirectAccessOnly = !player?.teamId || !coachTeamsManaged.some((t) => t.id === player.teamId);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState(false);

  const leaveConnection = async () => {
    if (!viewerId || leaveBusy) return;
    setLeaveBusy(true);
    setLeaveError(false);
    try {
      const res = await fetch(`/api/os/players/${playerId}/coach-connections/${viewerId}`, { method: 'DELETE' });
      if (!res.ok) {
        setLeaveError(true);
        return;
      }
      // Refresh BEFORE closing — otherwise closeCoachPlayer() reveals
      // Individual Players immediately using the still-stale squad
      // snapshot (this player briefly flashing back into a list they
      // were just removed from), only correcting itself once the
      // refetch below resolves a moment later.
      await refreshOsData();
      actions.closeCoachPlayer();
    } catch {
      setLeaveError(true);
    } finally {
      setLeaveBusy(false);
    }
  };

  if (!player) {
    return <EmptyState title="Player not found" body="This player may have been removed from your team." />;
  }

  const initials = player.name.split(' ').map((w) => w[0]).join('');
  const pending = verifyQueue.filter((v) => v.playerId === playerId);
  const latestAssessment = player.assessments[0] ?? null;
  const activeFocusCount = player.seasonFocus.filter((f) => f.status === 'active').length;

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
          <div style={{ width: 52, height: 52, borderRadius: '50%', flex: '0 0 auto', position: 'relative', overflow: 'hidden', background: coachPhotoUrl ? '#00000010' : 'linear-gradient(150deg,#E9C46A,#C98B3A)' }}>
            {coachPhotoUrl ? (
              <img src={coachPhotoUrl} alt={player.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
            ) : (
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Roboto', fontWeight: 900, fontSize: 17, color: '#fff' }}>{initials}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 18, color: 'var(--os-ink)' }}>{player.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--os-muted)' }}>#{player.num} · {player.pos}</div>
            <GuardianStatusRow player={player} onAction={() => setSheetOpen(true)} />
          </div>
        </div>
      </div>

      {/* Player information — football age group, height, preferred foot,
          secondary position. Same controls, same single-Save interaction
          as the approved design prototype's Coach Player Details screen;
          the date-of-birth field this screen used to also show here was
          removed as part of Gate 2's exact-DOB removal work. */}
      <div style={sectionCard}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={sectionTitle}>Player information</span>
          <span style={{ fontSize: 11, color: 'var(--os-muted)' }}>
            {player.coachFieldsUpdatedAt ? `Updated ${formatDate(player.coachFieldsUpdatedAt)}` : 'Not yet updated'}
          </span>
        </div>

        {!isReal ? (
          // Demo mode previews the read layout only.
          <>
            <PlayerInfoRow label="Football age group" value={player.footballAgeGroup ?? 'Not set'} />
            <PlayerInfoRow label="Height" value={player.heightCm ? `${player.heightCm} cm` : 'Not set'} />
            <PlayerInfoRow label="Preferred foot" value={player.preferredFoot ?? 'Not set'} />
            <PlayerInfoRow label="Secondary position" value={positionLabel(player.secondaryPosition)} last />
          </>
        ) : coachFieldsLoading ? (
          <p style={{ fontSize: 13, color: 'var(--os-muted)' }}>Loading…</p>
        ) : coachFieldsLoadError ? (
          <p role="alert" style={{ fontSize: 13, color: '#C0392B' }}>Couldn&apos;t load this player&apos;s details — try again.</p>
        ) : (
          <>
            {/* Football age group — Emblem does not collect exact date of
                birth (Gate 2 privacy decision, migration
                0073_remove_exact_dob_stage_a.sql). A player with no
                football age group set still loads and works normally;
                this field is never inferred from anything, only ever set
                explicitly by an authorised coach below. */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={fieldLabel}>Assigned football age group</span>
                {ageGroupDraft && <button type="button" onClick={() => setAgeGroupDraft(null)} style={clearLinkStyle}>Clear</button>}
              </div>
              <div className="coach-field-hscroll" role="radiogroup" aria-label="Assigned football age group" style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}>
                {AGE_GROUP_OPTIONS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={ageGroupDraft === g}
                    onClick={() => setAgeGroupDraft(g)}
                    style={{
                      flex: '0 0 auto', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, padding: '9px 14px', minHeight: 40, borderRadius: 999,
                      border: `1px solid ${ageGroupDraft === g ? '#E97435' : 'var(--os-border)'}`,
                      background: ageGroupDraft === g ? 'rgba(233,116,53,.12)' : 'var(--os-card)',
                      color: ageGroupDraft === g ? '#C4501C' : 'var(--os-ink)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--os-muted)', margin: '6px 0 0' }}>
                Not the same as age — a player can be assigned an older group if they&apos;re playing up.
              </p>
            </div>

            {/* Height */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={fieldLabel}>Height</span>
                {heightDraft && <button type="button" onClick={() => setHeightDraft('')} style={clearLinkStyle}>Clear</button>}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={heightDraft}
                  onChange={(e) => setHeightDraft(e.target.value)}
                  placeholder="e.g. 138"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  aria-invalid={!!heightValidationError}
                  aria-describedby="coach-height-help"
                />
                <span aria-hidden="true" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: 'var(--os-muted)' }}>cm</span>
              </div>
              {heightValidationError && <p id="coach-height-help" style={{ fontSize: 12, color: '#C0392B', margin: '6px 0 0' }}>{heightValidationError}</p>}
            </div>

            {/* Preferred foot */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={fieldLabel}>Preferred foot</span>
                {footDraft && <button type="button" onClick={() => setFootDraft(null)} style={clearLinkStyle}>Clear</button>}
              </div>
              <div role="radiogroup" aria-label="Preferred foot" style={{ display: 'flex', borderRadius: 12, border: '1px solid var(--os-border)', overflow: 'hidden' }}>
                {FOOT_OPTIONS.map((f, i) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={footDraft === f}
                    onClick={() => setFootDraft(f)}
                    style={{
                      flex: 1, minHeight: 44, border: 'none', borderLeft: i > 0 ? '1px solid var(--os-border)' : 'none',
                      background: footDraft === f ? '#E97435' : 'var(--os-card)', color: footDraft === f ? '#fff' : 'var(--os-ink)',
                      fontFamily: 'Roboto', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Secondary position */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={fieldLabel}>Secondary position</span>
                {secondaryPositionDraft && <button type="button" onClick={() => setSecondaryPositionDraft(null)} style={clearLinkStyle}>Clear</button>}
              </div>
              <div role="radiogroup" aria-label="Secondary position" style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}>
                {POSITION_OPTIONS.filter((p) => p.code !== player.pos && p.label !== player.pos).map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    role="radio"
                    aria-checked={secondaryPositionDraft === p.code}
                    title={p.label}
                    onClick={() => setSecondaryPositionDraft(p.code)}
                    style={{
                      flex: '0 0 auto', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, padding: '9px 14px', minHeight: 40, borderRadius: 999,
                      border: `1px solid ${secondaryPositionDraft === p.code ? '#E97435' : 'var(--os-border)'}`,
                      background: secondaryPositionDraft === p.code ? 'rgba(233,116,53,.12)' : 'var(--os-card)',
                      color: secondaryPositionDraft === p.code ? '#C4501C' : 'var(--os-ink)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {p.code}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--os-muted)', margin: '6px 0 0' }}>
                {player.pos} is already the primary position, so it isn&apos;t offered here.
              </p>
            </div>

            {coachFieldsSaveStatus === 'error' && (
              <p role="alert" style={{ fontSize: 12.5, color: '#C0392B', margin: '14px 0 0' }}>Couldn&apos;t save those changes — your edits are still here, try again.</p>
            )}
            {coachFieldsSaveStatus === 'success' && (
              <p role="status" style={{ fontSize: 12.5, color: '#2E9E5B', margin: '14px 0 0' }}>Saved</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={cancelCoachFields}
                disabled={!coachFieldsDirty || coachFieldsSaveStatus === 'saving'}
                style={{ flex: 1, minHeight: 46, borderRadius: 12, background: 'none', border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, color: 'var(--os-ink)', cursor: coachFieldsDirty ? 'pointer' : 'default', opacity: coachFieldsDirty ? 1 : 0.5 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCoachFields}
                disabled={!coachFieldsCanSave}
                style={{ flex: 1, minHeight: 46, borderRadius: 12, background: coachFieldsCanSave ? '#E97435' : 'rgba(233,116,53,.35)', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: '#fff', cursor: coachFieldsCanSave ? 'pointer' : 'default' }}
              >
                {coachFieldsSaveStatus === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
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

      {/* Coach's Assessment — the quote reads first (hero weight/size, a
          solid quote-mark icon beside it, not a faint background
          watermark), with attribution and date following as quiet
          supporting context. This is where a coach shares a new
          assessment — Card.tsx's About face shows the same content
          read-only, never with a write affordance. */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Coach&apos;s Assessment</div>
        {latestAssessment ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span aria-hidden="true" style={{ flex: '0 0 auto', fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 34, lineHeight: 0.5, color: '#E97435', marginTop: 10 }}>&ldquo;</span>
              <p style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 17, lineHeight: 1.4, color: 'var(--os-ink)', margin: 0 }}>{latestAssessment.body}</p>
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--os-muted)' }}>— {latestAssessment.authorName ?? 'Coach'}</div>
            <div style={{ fontSize: 11, color: 'var(--os-muted)', marginTop: 1 }}>{formatDate(latestAssessment.createdAt)}</div>
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

      {isReal && isDirectAccessOnly && (
        <div style={sectionCard}>
          {confirmingLeave ? (
            <div>
              <p style={{ fontSize: 12.5, color: 'var(--os-muted)', margin: '0 0 10px' }}>
                You&apos;ll lose access to this player. Existing assessments and history will remain.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={leaveConnection}
                  disabled={leaveBusy}
                  style={{ background: '#C0392B', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: leaveBusy ? 'default' : 'pointer' }}
                >
                  {leaveBusy ? 'Leaving…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingLeave(false)}
                  disabled={leaveBusy}
                  style={{ background: 'none', border: '1px solid var(--os-border)', borderRadius: 10, padding: '10px 16px', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: 'var(--os-ink)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
              {leaveError && <p role="alert" style={{ color: '#C0392B', fontSize: 12.5, marginTop: 8 }}>Couldn&apos;t leave — try again.</p>}
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setConfirmingLeave(true)}
              onKeyDown={onActivateKey(() => setConfirmingLeave(true))}
              style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#C0392B', cursor: 'pointer' }}
            >
              Leave player connection
            </div>
          )}
        </div>
      )}

      {sheetOpen && <GuardianInviteSheet player={player} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

/** Demo-mode's read-only preview of a Player information row — real mode
 * uses the interactive controls above instead. */
function PlayerInfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: last ? 'none' : '1px solid rgba(0,0,0,.05)' }}>
      <span style={{ fontSize: 13.5, color: '#6B6357' }}>{label}</span>
      <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: 'var(--os-ink)' }}>{value}</span>
    </div>
  );
}
