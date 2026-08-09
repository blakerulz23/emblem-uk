'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import { useOsData, useRefreshOsData } from '../OsDataContext';
import { CardFace } from '@/lib/card-definition';
import { onActivateKey } from '../a11y';
import { usePresenceHeartbeat } from '../usePresenceHeartbeat';
import { useLiveContent, useJustUpdatedFlag } from '../useLiveContent';
import EmptyState from './EmptyState';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';
import { formatAge, formatFoot, formatHeightCm, positionLabel } from '../coachFields';
import { useOsPhotoUpload } from '../useOsPhotoUpload';

/**
 * The digital twin of the physical collectible, present-tense only
 * (Collection OS Product Specification v1.0). Front renders the real Card
 * Definition Builder authored for this card via the shared CardFace
 * renderer (src/lib/card-definition.tsx) when one is linked — never a
 * re-implementation of that design. Back is who this player is right now
 * plus a trusted coach's current read of them, when one is real — zero
 * historical moment content, since Collection owns all of that.
 */
/** "15 Aug 2026" — matches RealCollection/PlayerHome's date convention. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const sectionLabel = { fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 12 };
const sectionCard = { background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 14 };

/** Same glyph as StoryUpdateCard.tsx's season_focus_added icon — a local copy, matching this app's existing convention of small per-file icon helpers rather than a cross-file import between unrelated screens/overlays. */
function TargetIcon(c: string) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1" fill={c} stroke="none" />
    </svg>
  );
}

export default function CardScreen({ state, actions }: { state: OsState; actions: OsActions }) {
  const { mode, playerId, playerProfile: PLAYER_PROFILE, cardDefinition, cardPhotoUrl, seasonFocus, strengths, assessments } = useOsData();
  const isReal = mode !== 'demo';
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status: photoStatus, error: photoError, uploadPhoto } = useOsPhotoUpload(playerId);
  const uploading = photoStatus === 'uploading';
  const [firstName, ...restName] = PLAYER_PROFILE.name.split(' ');
  const lastName = restName.join(' ');

  const [focusDraft, setFocusDraft] = useState('');
  const [showAddFocus, setShowAddFocus] = useState(false);
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusError, setFocusError] = useState('');
  const activeFocusCount = seasonFocus.filter((f) => f.status === 'active').length;

  // Live sync: while a guardian is actually looking at About, an assessment
  // or season-focus change from the coach's side appears here immediately
  // via refreshOsData() — never a badge, never router.refresh(). The
  // presence heartbeat this mounts is exactly what src/lib/story-updates.ts
  // checks to decide the resulting Story Update should be born already-read.
  const refreshOsData = useRefreshOsData();
  const [justUpdated, triggerJustUpdated] = useJustUpdatedFlag();
  const viewingAbout = isReal && state.flipped && !!playerId;
  usePresenceHeartbeat(viewingAbout ? `about:${playerId}` : null);
  useLiveContent('player_assessments', viewingAbout ? `player_id=eq.${playerId}` : null, () => {
    refreshOsData();
    triggerJustUpdated();
  });
  useLiveContent('player_season_focus', viewingAbout ? `player_id=eq.${playerId}` : null, () => {
    refreshOsData();
    triggerJustUpdated();
  });

  const addFocus = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = focusDraft.trim();
    if (!trimmed || !playerId || activeFocusCount >= 3 || focusBusy) return;
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
      setShowAddFocus(false);
      router.refresh();
    } finally {
      setFocusBusy(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadPhoto(file);
  };

  if (!state.flipped) {
    return (
      <div style={{ animation: 'faceIn .45s ease' }}>
        {isReal && cardDefinition ? (
          <div
            onClick={actions.flipCard}
            onMouseMove={actions.tiltMove}
            onMouseLeave={actions.tiltReset}
            style={{ width: 300, maxWidth: '100%', margin: '14px auto 14px', cursor: 'pointer' }}
          >
            {/* CardFace/CardArt already apply their own border-radius and shadow, scaled to size — no wrapper chrome needed here. */}
            <CardFace data={cardDefinition} side="front" size={300} photoUrl={cardPhotoUrl} />
          </div>
        ) : isReal && !PLAYER_PROFILE.photoUrl ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Add a card photo"
            style={{
              position: 'relative', width: 300, maxWidth: '100%', aspectRatio: '3 / 4', margin: '14px auto 14px',
              borderRadius: 18, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--os-card)',
              border: '2px dashed var(--os-border)',
            }}
          >
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handlePhotoChange} style={{ display: 'none' }} />
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
            <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, color: 'var(--os-ink)' }}>{uploading ? 'Uploading…' : 'Add a photo'}</span>
            {photoStatus === 'error' && (
              <span style={{ fontFamily: 'Roboto', fontSize: 11.5, color: '#C0392B', textAlign: 'center', padding: '0 16px' }}>{photoError ?? 'Could not upload photo — try again.'}</span>
            )}
          </div>
        ) : (
          <div onClick={actions.flipCard} onMouseMove={actions.tiltMove} onMouseLeave={actions.tiltReset} style={{ position: 'relative', width: 300, maxWidth: '100%', margin: '14px auto 14px', borderRadius: 18, overflow: 'hidden', boxShadow: '0 26px 50px -18px rgba(0,0,0,.55)', cursor: 'pointer' }}>
            <img
              src={isReal && PLAYER_PROFILE.photoUrl ? PLAYER_PROFILE.photoUrl : `${osAssetPath}/card-ollie-front.png`}
              alt={`${PLAYER_PROFILE.name} card front`}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>
        )}
        <div onClick={actions.flipCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 6, padding: 12, borderRadius: 12, background: '#15130F', color: '#F4F1EC', fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F4F1EC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
          Tap to flip the card
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'faceIn .45s ease' }}>
      {/* Identity-led player-information card — approved arrangement from
          the design prototype (src/app/os/prototype-player-profile,
          AboutView.tsx's "A" arrangement), chosen over the trading-card-
          dossier alternative because it degrades cleanly with 0 of the 4
          coach-managed facts set, not just all 4 (see the prototype's
          Empty-details demo state). Portrait replaces the old black-circle
          club-badge placeholder — this card's photo is the same
          PLAYER_PROFILE.photoUrl Profile.tsx's own photo upload sets, not a
          second, independent image. */}
      <div style={{ background: 'var(--os-card)', borderRadius: 22, padding: 20, boxShadow: '0 12px 30px -14px rgba(0,0,0,.2)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ width: 66, height: 84, borderRadius: 16, flex: '0 0 auto', position: 'relative', overflow: 'hidden', background: PLAYER_PROFILE.photoUrl ? '#00000010' : 'linear-gradient(150deg,#E9C46A,#C98B3A)' }}>
            {PLAYER_PROFILE.photoUrl ? (
              <img src={PLAYER_PROFILE.photoUrl} alt={PLAYER_PROFILE.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
            ) : (
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: '#fff' }}>
                {firstName[0]}{lastName[0] ?? ''}
              </span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)', lineHeight: 1.1 }}>{PLAYER_PROFILE.name}</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 12.5, color: '#E97435', marginTop: 5 }}>{PLAYER_PROFILE.position.toUpperCase()}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <AboutStatTile label="Age" value={formatAge(PLAYER_PROFILE.age)} />
          <AboutStatTile label="Height" value={formatHeightCm(PLAYER_PROFILE.heightCm)} />
          <AboutStatTile label="Preferred foot" value={formatFoot(PLAYER_PROFILE.preferredFoot)} />
          <AboutStatTile label="Secondary position" value={positionLabel(PLAYER_PROFILE.secondaryPosition)} />
        </div>
      </div>

      {justUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 10, animation: 'faceIn .3s ease' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2E9E5B' }} />
          <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: '#2E9E5B' }}>Updated just now</span>
        </div>
      )}

      {/* A trusted coach's current read of this player — present tense, honest empty state until a real assessment exists. Never fabricated, never a placeholder score. Read-only here — a coach shares from Coach Player Detail, never from here.
          The quote itself reads first — hero weight/size, a solid quote-mark icon beside it (not a faint background watermark) — with attribution and date following underneath as quiet supporting context. */}
      <div style={sectionCard}>
        <div style={sectionLabel}>COACH&apos;S ASSESSMENT</div>
        {assessments[0] ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span aria-hidden="true" style={{ flex: '0 0 auto', fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 34, lineHeight: 0.5, color: '#E97435', marginTop: 10 }}>&ldquo;</span>
              <p style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 17, lineHeight: 1.4, color: 'var(--os-ink)', margin: 0 }}>{assessments[0].body}</p>
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--os-muted)' }}>— {assessments[0].authorName ?? 'Coach'}</div>
            <div style={{ fontSize: 11, color: 'var(--os-muted)', marginTop: 1 }}>{formatDate(assessments[0].createdAt)}</div>
          </div>
        ) : (
          <EmptyState
            title="No coach assessment yet."
            body={`When a coach shares their read on ${firstName || 'this player'}'s game, it'll appear here.`}
          />
        )}
      </div>

      {/* Coach-authored, append-only — read-only here, same as Coach's Assessment. */}
      <div style={sectionCard}>
        <div style={sectionLabel}>RECOGNISED STRENGTHS</div>
        {strengths.length === 0 ? (
          <EmptyState
            title="No strengths recognised yet."
            body={`When a coach recognises what ${firstName || 'this player'} does well, it'll appear here.`}
          />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {strengths.map((s) => (
              <span key={s.id} style={{ background: 'rgba(233,116,53,.1)', color: '#C4501C', fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, padding: '7px 12px', borderRadius: 999 }}>{s.label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Shared, with attribution — the one write affordance on this face: a guardian can add a Season Focus, same as a coach can from their own screen.
          Empty state reads label → icon → hero title → supporting copy → the (unchanged) CTA below it, which reads as dominant simply because everything above it is now quiet. Populated rows read label(above) → focus text as hero → status as a small "progress" pill → author/date as the smallest supporting line. */}
      <div style={sectionCard}>
        <div style={sectionLabel}>SEASON FOCUS {seasonFocus.length > 0 ? `(${activeFocusCount}/3 active)` : ''}</div>
        {seasonFocus.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '6px 4px 2px' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(233,116,53,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              {TargetIcon('#E97435')}
            </div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)', marginBottom: 6 }}>No Season Focus yet.</div>
            <div style={{ fontSize: 13, color: 'var(--os-muted)', lineHeight: 1.5 }}>{`Set what ${firstName || 'this player'} is working on this season — their coach can see it too.`}</div>
          </div>
        ) : (
          seasonFocus.map((f) => (
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
          <div style={{ marginTop: showAddFocus ? 0 : 8 }}>
            {!showAddFocus ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => activeFocusCount < 3 && setShowAddFocus(true)}
                onKeyDown={onActivateKey(() => activeFocusCount < 3 && setShowAddFocus(true))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 11, border: '1px dashed var(--os-border)', color: activeFocusCount >= 3 ? 'var(--os-muted)' : '#E97435', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, cursor: activeFocusCount >= 3 ? 'default' : 'pointer' }}
              >
                {activeFocusCount >= 3 ? '3 active already — complete one first' : '+ Add a Season Focus'}
              </div>
            ) : (
              <form onSubmit={addFocus} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                <input
                  type="text"
                  required
                  value={focusDraft}
                  onChange={(e) => setFocusDraft(e.target.value)}
                  placeholder="e.g. First touch under pressure"
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontSize: 14 }}
                />
                <button
                  type="submit"
                  disabled={focusBusy || !focusDraft.trim()}
                  style={{ padding: 12, borderRadius: 11, background: '#E97435', color: '#fff', border: 'none', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: focusBusy ? 'default' : 'pointer' }}
                >
                  {focusBusy ? 'Adding…' : 'Add Season Focus'}
                </button>
                {focusError && <p style={{ fontSize: 12.5, color: '#C0392B', margin: 0 }}>{focusError}</p>}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One of the four Identity-led stat tiles — label above, value below, "Not
 * set" styled identically to a real value (never greyed out differently),
 * matching the prototype's own treatment: a missing coach-managed fact
 * reads as calm and normal, not broken or urgent. */
function AboutStatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--os-screen)', borderRadius: 12, padding: '11px 13px' }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--os-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{value}</div>
    </div>
  );
}
