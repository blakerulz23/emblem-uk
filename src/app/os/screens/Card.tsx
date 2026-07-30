'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import { useOsData } from '../OsDataContext';
import { CardFace } from '@/lib/card-definition';
import { onActivateKey } from '../a11y';
import EmptyState from './EmptyState';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';

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

export default function CardScreen({ state, actions }: { state: OsState; actions: OsActions }) {
  const { mode, playerId, playerProfile: PLAYER_PROFILE, cardDefinition, cardPhotoUrl, seasonFocus, strengths, assessments } = useOsData();
  const isReal = mode !== 'demo';
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [firstName, ...restName] = PLAYER_PROFILE.name.split(' ');
  const lastName = restName.join(' ');

  const [focusDraft, setFocusDraft] = useState('');
  const [showAddFocus, setShowAddFocus] = useState(false);
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusError, setFocusError] = useState('');
  const activeFocusCount = seasonFocus.filter((f) => f.status === 'active').length;

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

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !playerId || uploading) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    await fetch(`/api/os/players/${playerId}/photo`, { method: 'POST', body: form });
    setUploading(false);
    router.refresh();
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
      <div style={{ position: 'relative', background: 'var(--os-card)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 12px 30px -14px rgba(0,0,0,.2)', marginBottom: 12 }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(115deg,transparent 0 22px,rgba(233,116,53,.05) 22px 24px)' }} />
        <div style={{ position: 'relative', padding: 20 }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, lineHeight: .95, color: 'var(--os-ink)' }}>{firstName.toUpperCase()}<br />{lastName.toUpperCase()}</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 13, color: '#E97435', margin: '6px 0 12px' }}>{PLAYER_PROFILE.position.toUpperCase()}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#15130F' }} />
            <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11.5, color: '#6B6357' }}>{PLAYER_PROFILE.club.toUpperCase()}</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>AGE</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{PLAYER_PROFILE.age}</div></div>
            <div style={{ borderLeft: '1px solid var(--os-border)', paddingLeft: 16 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>HEIGHT</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{PLAYER_PROFILE.height}</div></div>
            <div style={{ borderLeft: '1px solid var(--os-border)', paddingLeft: 16 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>FOOT</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{PLAYER_PROFILE.preferredFoot.toUpperCase()}</div></div>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--os-border)' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>SECONDARY POSITION</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{PLAYER_PROFILE.secondaryPosition ?? 'Not set'}</div>
          </div>
        </div>
      </div>

      {/* A trusted coach's current read of this player — present tense, honest empty state until a real assessment exists. Never fabricated, never a placeholder score. Read-only here — a coach shares from Coach Player Detail, never from here. */}
      <div style={sectionCard}>
        <div style={sectionLabel}>COACH&apos;S ASSESSMENT</div>
        {assessments[0] ? (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--os-ink)', margin: '0 0 6px' }}>{assessments[0].body}</p>
            <div style={{ fontSize: 12, color: 'var(--os-muted)' }}>{assessments[0].authorName ?? 'Coach'} · {formatDate(assessments[0].createdAt)}</div>
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

      {/* Shared, with attribution — the one write affordance on this face: a guardian can add a Season Focus, same as a coach can from their own screen. */}
      <div style={sectionCard}>
        <div style={sectionLabel}>SEASON FOCUS {seasonFocus.length > 0 ? `(${activeFocusCount}/3 active)` : ''}</div>
        {seasonFocus.length === 0 ? (
          <EmptyState
            title="No Season Focus yet."
            body={`Set what ${firstName || 'this player'} is working on this season — their coach can see it too.`}
          />
        ) : (
          seasonFocus.map((f) => (
            <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--os-border)' }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, color: 'var(--os-ink)' }}>{f.label}</div>
              <div style={{ fontSize: 12, color: 'var(--os-muted)', marginTop: 2 }}>
                {f.authorName ?? (f.authorRole === 'coach' ? 'Coach' : 'Guardian')} · {formatDate(f.createdAt)}
                {f.status !== 'active' && ` · ${f.status === 'completed' ? 'Completed' : 'Archived'}`}
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
