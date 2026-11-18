'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { notesSinceFocus, visibleFamilyObservations, type MySeasonView } from '@/lib/my-season';
import { loadMySeasonView } from '../mySeasonClient';
import {
  EarlierFocusList,
  FocusEditor,
  FocusSummary,
  MY_SEASON_COPY,
  MsButton,
  MySeasonError,
  MySeasonSkeleton,
  NoteList,
  PrivacyLine,
  msCard,
  msEyebrow,
} from '../mySeasonUi';

/**
 * The family's My Season screen: a full-screen overlay opened from Home's
 * "This Season" card (same fixed dialog pattern as Account Settings). It
 * loads a fresh view on open so a coach's newest note is always there,
 * and reloads after the guardian changes the focus. Only ever mounted when
 * os-data said My Season is enabled for this player.
 */

export type MySeasonLoadState = { status: 'loading' | 'ready' | 'error'; view: MySeasonView | null };

export default function MySeasonScreen({
  playerId,
  playerName,
  onClose,
  onChanged,
}: {
  playerId: string;
  playerName: string;
  onClose: () => void;
  /** Called after a successful write so Home's card refreshes too. */
  onChanged: () => void;
}) {
  const [load, setLoad] = useState<MySeasonLoadState>({ status: 'loading', view: null });
  const [editing, setEditing] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(async () => {
    setLoad((s) => ({ status: 'loading', view: s.view }));
    const result = await loadMySeasonView(playerId);
    setLoad((s) => (result.ok ? { status: 'ready', view: result.view } : { status: 'error', view: s.view }));
  }, [playerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <MySeasonScreenView
      playerId={playerId}
      playerName={playerName}
      load={load}
      editing={editing}
      closeRef={closeRef}
      onClose={onClose}
      onRetry={() => void reload()}
      onStartEdit={() => setEditing(true)}
      onCancelEdit={() => setEditing(false)}
      onSaved={() => {
        setEditing(false);
        void reload();
        onChanged();
      }}
    />
  );
}

export function MySeasonScreenView({
  playerId,
  playerName,
  load,
  editing,
  closeRef,
  onClose,
  onRetry,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  load: MySeasonLoadState;
  editing: boolean;
  closeRef?: Ref<HTMLButtonElement>;
  onClose: () => void;
  onRetry: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const first = (playerName ?? '').trim().split(/\s+/)[0] || 'your player';
  const view = load.view;
  const content = view && view.enabled && view.access !== 'none' ? view : null;

  let body: ReactNode;
  if (!content && load.status === 'loading') body = <MySeasonSkeleton />;
  else if (!content && load.status === 'error') body = <MySeasonError onRetry={onRetry} />;
  else if (!content) {
    body = view && view.enabled && view.access === 'none' && view.reason === 'account_review'
      ? <p style={{ margin: 0, fontSize: 15, color: 'var(--os-ink)' }}>{MY_SEASON_COPY.accountReview}</p>
      : <p style={{ margin: 0, fontSize: 15, color: 'var(--os-ink)' }}>My Season isn&apos;t available for {first} right now.</p>;
  } else {
    const notes = visibleFamilyObservations(content);
    const focus = content.activeFocus;
    const since = focus ? notesSinceFocus(notes, focus) : [];
    body = (
      <>
        {load.status === 'error' && <MySeasonError onRetry={onRetry} />}
        <section aria-labelledby="ms-focus-h" style={{ display: 'grid', gap: 10 }}>
          <h2 id="ms-focus-h" className="os-ms-accent" style={msEyebrow}>My Focus</h2>
          <div style={{ ...msCard, display: 'grid', gap: 14 }}>
            {editing ? (
              <FocusEditor playerId={playerId} firstName={first} hasActiveFocus={!!focus} onSaved={onSaved} onCancel={onCancelEdit} />
            ) : focus ? (
              <>
                <FocusSummary focus={focus} />
                <div style={{ borderTop: '1px solid var(--os-border)', paddingTop: 12, display: 'grid', gap: 10 }}>
                  <h3 className="os-ms-soft" style={{ ...msEyebrow, fontSize: 12 }}>Notes since this focus</h3>
                  <NoteList notes={since} empty={MY_SEASON_COPY.noNotesSinceFocus} />
                </div>
              </>
            ) : (
              <div>
                <h3 style={{ margin: 0, fontFamily: 'Roboto', fontWeight: 800, fontSize: 18, color: 'var(--os-ink)' }}>{MY_SEASON_COPY.noFocus}</h3>
                {content.canEditFocus && <p className="os-ms-soft" style={{ margin: '4px 0 0', fontSize: 14 }}>{MY_SEASON_COPY.noFocusFamilyBody(first)}</p>}
              </div>
            )}
            {!editing && content.canEditFocus && (
              <MsButton variant="ghost" onClick={onStartEdit} style={{ justifySelf: 'start' }}>{focus ? 'Change focus' : 'Set a focus'}</MsButton>
            )}
          </div>
        </section>

        <section aria-labelledby="ms-noticed-h" style={{ display: 'grid', gap: 10 }}>
          <h2 id="ms-noticed-h" className="os-ms-accent" style={msEyebrow}>What your coach noticed</h2>
          <div style={msCard}>
            <NoteList notes={notes} empty={MY_SEASON_COPY.noNotesFamily(first)} />
          </div>
        </section>

        {content.earlierFocuses.length > 0 && (
          <section aria-labelledby="ms-earlier-h" style={{ display: 'grid', gap: 10 }}>
            <h2 id="ms-earlier-h" className="os-ms-accent" style={msEyebrow}>Earlier focus</h2>
            <div style={msCard}>
              <EarlierFocusList focuses={content.earlierFocuses} />
            </div>
          </section>
        )}

        <PrivacyLine text={MY_SEASON_COPY.familyPrivacy(first)} />
      </>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="My Season"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--os-screen)', display: 'flex', flexDirection: 'column', fontFamily: 'Roboto' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 14px 8px', flex: '0 0 auto' }}>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Back to Home"
          className="os-ms-focus"
          style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--os-border)', background: 'var(--os-card)', color: 'var(--os-ink)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto' }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 style={{ margin: 0, fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.12em', fontSize: 20, textTransform: 'uppercase', color: 'var(--os-ink)' }}>My Season</h1>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 16px 40px', display: 'grid', gap: 18, alignContent: 'start' }}>
        <p role="note" style={{ ...msCard, margin: 0, display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45, color: 'var(--os-ink)', boxShadow: 'none' }}>
          <span aria-hidden="true">👪</span>
          <span>{MY_SEASON_COPY.familyContext(first)}</span>
        </p>
        {body}
      </div>
    </div>
  );
}
