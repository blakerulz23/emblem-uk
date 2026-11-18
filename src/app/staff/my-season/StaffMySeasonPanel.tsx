'use client';

import { useEffect, useMemo, useReducer, useRef, type CSSProperties } from 'react';
import { STAFF_REASON_MAX, charLength, checkStaffRemovalReason, formatMySeasonDate, mySeasonCategory, type MySeasonStaffObservation } from '@/lib/my-season';
import {
  INITIAL_STAFF_PAGE,
  STAFF_MY_SEASON_COPY,
  canSubmitRemoval,
  createStaffController,
  staffPageReducer,
  type StaffAction,
  type StaffPageState,
} from './staffMySeasonFlow';

const font = 'var(--font-manrope), system-ui';
const heading = 'var(--font-sora), system-ui';
const danger = '#b91c1c';
const btn = (bg: string, color: string, disabled = false): CSSProperties => ({
  fontFamily: heading, fontWeight: 700, fontSize: 13, color: disabled ? '#fff' : color, background: disabled ? 'var(--ink-faint)' : bg,
  padding: '9px 14px', borderRadius: 10, border: 'none', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
});
/**
 * Fixed colours, not theme variables, so every state of Find notes keeps at
 * least 4.5:1 contrast whatever the page theme. Loading is a disabled state.
 */
export const FIND_NOTES_COLOURS = {
  enabled: { background: '#B34715', color: '#FFFFFF' },
  disabled: { background: '#E8E8EC', color: '#4A4C55' },
} as const;
export const findNotesButton = (disabled: boolean): CSSProperties => ({
  ...btn('', '', false),
  ...(disabled ? FIND_NOTES_COLOURS.disabled : FIND_NOTES_COLOURS.enabled),
  cursor: disabled ? 'default' : 'pointer',
});
const fieldStyle: CSSProperties = { fontFamily: font, fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box' };

export const STAFF_MS_IDS = {
  player: 'staff-ms-player',
  reason: 'staff-ms-reason',
  reasonHint: 'staff-ms-reason-hint',
  removalError: 'staff-ms-removal-error',
  status: 'staff-ms-status',
  listError: 'staff-ms-list-error',
  remove: (noteId: string) => `staff-ms-remove-${noteId}`,
} as const;

/** Where a focus request goes: the first of these that exists on the page. */
export function staffFocusCandidates(focus: NonNullable<StaffPageState['focus']>, returnFocusNoteId: string | null): string[] {
  switch (focus) {
    case 'player':
      return [STAFF_MS_IDS.player];
    case 'reason':
      return [STAFF_MS_IDS.reason];
    case 'removal-error':
      return [STAFF_MS_IDS.removalError];
    case 'status':
      return [STAFF_MS_IDS.status];
    case 'list-error':
      return [STAFF_MS_IDS.listError];
    case 'remove-control':
      // The note may have closed meanwhile, taking its Remove button with it.
      return returnFocusNoteId ? [STAFF_MS_IDS.remove(returnFocusNoteId), STAFF_MS_IDS.status] : [STAFF_MS_IDS.status];
  }
}

/** The page's markup from state alone, so every state can be render-tested. */
export function StaffMySeasonView({
  state,
  dispatch,
  onLookup,
  onReload,
  onRemove,
}: {
  state: StaffPageState;
  dispatch: (a: StaffAction) => void;
  onLookup: () => void;
  onReload: () => void;
  onRemove: () => void;
}) {
  const { removal } = state;
  const loading = state.list === 'loading';

  const row = (n: MySeasonStaffObservation) => {
    const open = removal?.id === n.id;
    const cat = n.state === 'active' ? mySeasonCategory(n.category) : null;
    const canSend = open && canSubmitRemoval(removal);
    const reasonTooShort = open && !!removal && checkStaffRemovalReason(removal.reason).tooShort;
    const reasonRefused = open && removal?.errorCode === 'invalid_reason';
    const describedBy = ['staff-ms-reason-warning', reasonTooShort ? STAFF_MS_IDS.reasonHint : null, reasonRefused ? STAFF_MS_IDS.removalError : null].filter(Boolean).join(' ');
    return (
      <li key={n.id} style={{ listStyle: 'none', borderTop: '1px solid var(--border)', padding: '12px 0' }}>
        {n.state === 'active' ? (
          <>
            <div style={{ fontFamily: heading, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{cat?.label}</div>
            <p style={{ fontFamily: font, fontSize: 14, color: 'var(--ink)', margin: '4px 0', overflowWrap: 'anywhere' }}>{n.body}</p>
          </>
        ) : (
          <p style={{ fontFamily: font, fontSize: 13.5, fontStyle: 'italic', color: 'var(--ink-soft)', margin: '0 0 4px' }}>
            {n.state === 'removed' ? STAFF_MY_SEASON_COPY.stateRemoved : n.state === 'closed' ? STAFF_MY_SEASON_COPY.stateClosed : STAFF_MY_SEASON_COPY.stateWithdrawn}
          </p>
        )}
        <div style={{ fontFamily: font, fontSize: 12, color: 'var(--ink-soft)' }}>
          {n.coachName ?? 'A former coach'}{n.formerCoach && n.coachName ? ' (no longer on the team)' : ''} · {formatMySeasonDate(n.createdAt)}
        </div>

        {n.state === 'active' && !open && (
          <button id={STAFF_MS_IDS.remove(n.id)} type="button" onClick={() => dispatch({ type: 'open-removal', id: n.id })} disabled={!!removal?.busy} style={{ ...btn('#fef2f2', danger, !!removal?.busy), marginTop: 8 }}>
            Remove…
          </button>
        )}

        {open && removal && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRemove();
            }}
            aria-busy={removal.busy}
            style={{ display: 'grid', gap: 8, marginTop: 10, padding: '12px 14px', borderRadius: 10, background: '#fef2f2' }}
          >
            <label htmlFor={STAFF_MS_IDS.reason} style={{ fontFamily: heading, fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>Reason (required)</label>
            <p id="staff-ms-reason-warning" style={{ fontFamily: font, fontSize: 12.5, color: danger, margin: 0 }}>{STAFF_MY_SEASON_COPY.reasonWarning}</p>
            <textarea
              id={STAFF_MS_IDS.reason}
              value={removal.reason}
              onChange={(e) => dispatch({ type: 'reason', value: e.target.value })}
              maxLength={STAFF_REASON_MAX}
              rows={3}
              required
              disabled={removal.busy}
              aria-describedby={describedBy}
              aria-invalid={reasonRefused || undefined}
              style={fieldStyle}
            />
            <div style={{ fontFamily: font, fontSize: 12, color: 'var(--ink-soft)' }}>{charLength(removal.reason.trim())} / {STAFF_REASON_MAX}</div>
            {reasonTooShort && <p id={STAFF_MS_IDS.reasonHint} style={{ fontFamily: font, fontSize: 12.5, color: 'var(--ink-soft)', margin: 0 }}>{STAFF_MY_SEASON_COPY.reasonTooShort}</p>}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: font, fontSize: 13, color: 'var(--ink)' }}>
              <input type="checkbox" checked={removal.confirmed} disabled={removal.busy} onChange={(e) => dispatch({ type: 'confirmed', value: e.target.checked })} />
              <span>{STAFF_MY_SEASON_COPY.confirm}</span>
            </label>
            {removal.error && (
              <p id={STAFF_MS_IDS.removalError} role="alert" tabIndex={-1} style={{ fontFamily: font, fontSize: 13, color: danger, margin: 0 }}>{removal.error}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" disabled={!canSend} aria-describedby={reasonTooShort ? STAFF_MS_IDS.reasonHint : undefined} style={btn(danger, '#fff', !canSend)}>
                {removal.busy ? 'Removing…' : removal.error && !reasonRefused ? 'Retry removal' : 'Remove permanently'}
              </button>
              <button type="button" onClick={() => dispatch({ type: 'cancel-removal' })} disabled={removal.busy} style={btn('var(--surface)', 'var(--ink-soft)')}>Cancel</button>
            </div>
          </form>
        )}
      </li>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onLookup();
        }}
        style={{ display: 'grid', gap: 6 }}
      >
        <label htmlFor={STAFF_MS_IDS.player} style={{ fontFamily: heading, fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>Player ID</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id={STAFF_MS_IDS.player}
            value={state.playerIdDraft}
            onChange={(e) => dispatch({ type: 'draft', value: e.target.value })}
            autoComplete="off"
            spellCheck={false}
            style={{ ...fieldStyle, flex: '1 1 280px', width: 'auto' }}
          />
          <button type="submit" disabled={loading || !!removal?.busy} style={findNotesButton(loading || !!removal?.busy)}>{loading ? 'Loading…' : 'Find notes'}</button>
        </div>
      </form>

      <p id={STAFF_MS_IDS.status} role="status" aria-live="polite" tabIndex={-1} style={{ fontFamily: font, fontSize: 13.5, color: 'var(--ink)', margin: 0, minHeight: 18 }}>
        {state.announcement || (loading ? 'Loading notes…' : '')}
      </p>

      {state.list === 'error' && state.listError && (
        <div role="alert" style={{ display: 'grid', gap: 8 }}>
          <p id={STAFF_MS_IDS.listError} tabIndex={-1} style={{ fontFamily: font, fontSize: 13.5, color: danger, margin: 0 }}>{state.listError}</p>
          {state.playerId && <button type="button" onClick={onReload} style={{ ...btn('var(--surface)', 'var(--ink-soft)'), justifySelf: 'start' }}>Retry</button>}
        </div>
      )}

      {state.list === 'ready' && state.notes.length === 0 && (
        <p style={{ fontFamily: font, fontSize: 14, color: 'var(--ink-soft)', margin: 0 }}>{STAFF_MY_SEASON_COPY.noNotes}</p>
      )}
      {state.notes.length > 0 && <ul style={{ margin: 0, padding: 0 }}>{state.notes.map(row)}</ul>}
    </div>
  );
}

export default function StaffMySeasonPanel() {
  const [state, dispatch] = useReducer(staffPageReducer, INITIAL_STAFF_PAGE);
  const latest = useRef(state);
  latest.current = state;
  const controller = useMemo(() => createStaffController({ getState: () => latest.current, dispatch }), []);

  useEffect(() => {
    if (!state.focus) return;
    const target = staffFocusCandidates(state.focus, state.returnFocusNoteId).find((id) => document.getElementById(id));
    if (target) document.getElementById(target)?.focus();
    dispatch({ type: 'focus-done' });
  }, [state.focus, state.returnFocusNoteId]);

  return (
    <StaffMySeasonView
      state={state}
      dispatch={dispatch}
      onLookup={() => void controller.lookup()}
      onReload={() => void controller.reload()}
      onRemove={() => void controller.remove()}
    />
  );
}
