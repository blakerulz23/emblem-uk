'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { eraseObservationFromView, formatMySeasonDate, type MySeasonView } from '@/lib/my-season';
import { MY_SEASON_SESSION_ENDED, loadMySeasonView, shouldLookUpCoachMySeason, withdrawMySeasonObservation, type LoadResult, type WriteResult } from '../mySeasonClient';
import {
  MS_IDS,
  NOTE_ALREADY_WITHDRAWN,
  NOTE_NOT_LISTED,
  WITHDRAW_FAILED,
  WITHDRAW_FOCUS,
  usePendingFocus,
  type NoteSentKind,
  type PendingFocus,
} from '../mySeasonFlows';
import {
  FocusEditor,
  MY_SEASON_COPY,
  MsButton,
  MySeasonError,
  MySeasonSkeleton,
  NoteComposer,
  NoteList,
  msEyebrow,
  msWrap,
} from '../mySeasonUi';

/**
 * My Season on the coach's player screen.
 *
 * useCoachMySeason asks GET /api/os/my-season for this one player when the
 * screen opens, and only when shouldLookUpCoachMySeason allows it (real
 * mode, deploy kill switch off, player on a team). coachLookupStatus turns
 * that into one explicit state, and legacyFocusGate decides what the legacy
 * Season Focus may do in it: its Add works only when no lookup is needed or
 * the server has confirmed the feature is off. While the answer is on its
 * way the existing focuses stay readable and Add is disabled; after a failed
 * lookup Add stays disabled and Retry is offered. Once the server has said it
 * is on, including "on, but the view was unusable", the legacy section is
 * hidden and failures show the My Season error state with Retry.
 */

export type CoachMySeasonState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  view: MySeasonView | null;
  signedOut?: boolean;
  /** The server has said the feature is on for this player, even if no view is held. */
  knownEnabled?: boolean;
  /** Whose answer this is. A state for another player says nothing about this one. */
  playerId?: string;
};

/** My Season replaces the legacy section for this player. */
export function coachMySeasonEnabled(state: CoachMySeasonState): boolean {
  return state.view?.enabled === true || state.knownEnabled === true;
}

export type CoachLookupStatus = 'not-needed' | 'loading' | 'confirmed-off' | 'enabled' | 'failed' | 'session-ended';

/**
 * The state as it applies to `playerId`. The screen re-renders with a new
 * player before its effect starts the new lookup, so an answer about the
 * previous player must read as "still loading", never as this player's.
 */
export function coachStateForPlayer(state: CoachMySeasonState, playerId: string, allowed: boolean): CoachMySeasonState {
  if (!allowed) return { status: 'idle', view: null };
  return state.playerId === playerId ? state : { status: 'loading', view: null, playerId };
}

/** The one explicit answer to "do we know whether My Season applies here?". */
export function coachLookupStatus(allowed: boolean, state: CoachMySeasonState): CoachLookupStatus {
  if (!allowed) return 'not-needed';
  if (state.view?.enabled === true) return 'enabled';
  if (state.status === 'idle' || state.status === 'loading') return 'loading';
  if (state.status === 'error') return state.signedOut ? 'session-ended' : 'failed';
  return state.view?.enabled === false ? 'confirmed-off' : 'failed';
}

export const LEGACY_FOCUS_COPY = {
  checking: "Checking this player's season...",
  failed: "We couldn't check this player's season. Check your connection and try again.",
  sessionEnded: MY_SEASON_SESSION_ENDED,
} as const;

export type LegacyFocusGate = { canAdd: boolean; notice: 'checking' | 'failed' | 'session-ended' | null };

/** What the legacy Season Focus may do: only a settled "no My Season here" leaves Add working. */
export function legacyFocusGate(status: CoachLookupStatus): LegacyFocusGate {
  switch (status) {
    case 'not-needed':
    case 'confirmed-off':
      return { canAdd: true, notice: null };
    case 'loading':
      return { canAdd: false, notice: 'checking' };
    case 'session-ended':
      return { canAdd: false, notice: 'session-ended' };
    default:
      return { canAdd: false, notice: 'failed' };
  }
}

/**
 * The legacy section's status line. "Checking" sits in the card's bottom
 * padding (the card is position: relative while it shows), so the card does
 * not change height when the answer arrives.
 */
export function LegacyFocusNotice({ gate, onRetry }: { gate: LegacyFocusGate; onRetry: () => void }) {
  if (gate.notice === 'checking') {
    return (
      <p role="status" data-testid="legacy-focus-checking" style={{ position: 'absolute', left: 16, right: 16, bottom: 1, margin: 0, fontSize: 11.5, lineHeight: '14px', color: 'var(--os-muted)' }}>
        {LEGACY_FOCUS_COPY.checking}
      </p>
    );
  }
  if (gate.notice === 'session-ended') {
    return <p role="alert" data-testid="legacy-focus-session-ended" style={{ color: '#C0392B', fontSize: 12.5, margin: '10px 0 0' }}>{LEGACY_FOCUS_COPY.sessionEnded}</p>;
  }
  if (gate.notice === 'failed') {
    return (
      <div role="alert" data-testid="legacy-focus-failed" style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <p style={{ color: '#C0392B', fontSize: 12.5, margin: 0 }}>{LEGACY_FOCUS_COPY.failed}</p>
        <MsButton variant="ghost" onClick={onRetry} style={{ justifySelf: 'start' }}>Retry</MsButton>
      </div>
    );
  }
  return null;
}

/** The state after a load finished. */
export function nextCoachState(s: CoachMySeasonState, result: LoadResult, keepView: boolean): CoachMySeasonState {
  if (result.ok) return { status: 'ready', view: result.view, knownEnabled: result.view.enabled === true, playerId: s.playerId };
  const view = keepView ? s.view : null;
  return {
    status: 'error',
    view,
    signedOut: result.signedOut,
    knownEnabled: result.enabledInvalid === true || (keepView && coachMySeasonEnabled(s)),
    playerId: s.playerId,
  };
}

/**
 * Loading and local erasure, without React. Only the newest load may land,
 * and an erase outdates every load already running, so a response from
 * before a withdrawal can never put the erased text back.
 */
export function createCoachSeasonLoader(deps: {
  load: (playerId: string) => Promise<LoadResult>;
  setState: (update: (s: CoachMySeasonState) => CoachMySeasonState) => void;
  isCurrentPlayer: (playerId: string) => boolean;
}) {
  let seq = 0;
  return {
    async run(playerId: string, keepView: boolean): Promise<LoadResult> {
      const mine = ++seq;
      deps.setState((s) => {
        // Never carry another player's view or "enabled" into this load.
        const keep = keepView && (s.playerId === undefined || s.playerId === playerId);
        return { status: 'loading', view: keep ? s.view : null, knownEnabled: keep && coachMySeasonEnabled(s), playerId };
      });
      const result = await deps.load(playerId);
      if (deps.isCurrentPlayer(playerId) && mine === seq) deps.setState((s) => nextCoachState(s, result, keepView));
      return result;
    },
    erase(observationId: string) {
      seq += 1;
      deps.setState((s) => (s.view ? { ...s, view: eraseObservationFromView(s.view, observationId) } : s));
    },
  };
}

/**
 * The hook's effect, as a plain function so the flag-off gate is tested
 * directly: when the lookup is not allowed it only resets (no request);
 * otherwise it starts exactly one load.
 */
export function startCoachMySeasonLookup(allowed: boolean, deps: { reset: () => void; run: (keepView: boolean) => unknown }): void {
  if (!allowed) {
    deps.reset();
    return;
  }
  void deps.run(false);
}

/** How long the "Sent" toast stays before clearing itself. */
export const COACH_TOAST_MS = 5000;

/** Starts the toast's auto-clear timer; returns the cleanup (unmount / new toast). */
export function scheduleToastClear(toast: string | null, clear: () => void, ms: number = COACH_TOAST_MS): (() => void) | undefined {
  if (!toast) return undefined;
  const t = setTimeout(clear, ms);
  return () => clearTimeout(t);
}

export function useCoachMySeason({ playerId, isReal, lookup, teamId }: { playerId: string; isReal: boolean; lookup: boolean | undefined; teamId: string | null | undefined }) {
  const allowed = shouldLookUpCoachMySeason({ isReal, lookup, teamId });
  const [rawState, setState] = useState<CoachMySeasonState>({ status: 'idle', view: null });
  const state = coachStateForPlayer(rawState, playerId, allowed);
  const latestPlayer = useRef(playerId);
  latestPlayer.current = playerId;
  const loader = useRef<ReturnType<typeof createCoachSeasonLoader> | null>(null);
  if (!loader.current) {
    loader.current = createCoachSeasonLoader({ load: (id) => loadMySeasonView(id), setState, isCurrentPlayer: (id) => latestPlayer.current === id });
  }

  const run = useCallback((keepView: boolean) => loader.current!.run(playerId, keepView), [playerId]);

  useEffect(() => {
    startCoachMySeasonLookup(allowed, { reset: () => setState({ status: 'idle', view: null }), run });
  }, [allowed, run]);

  /** Resolves with this load's own answer (null when lookups are not allowed). */
  const reload = useCallback((): Promise<LoadResult | null> => (allowed ? run(true) : Promise.resolve(null)), [allowed, run]);

  const eraseWithdrawn = useCallback((observationId: string) => loader.current!.erase(observationId), []);

  return { state, reload, eraseWithdrawn, enabled: coachMySeasonEnabled(state), lookup: coachLookupStatus(allowed, state) };
}

export type CoachPanelUi = {
  editingFocus: boolean;
  composerOpen: boolean;
  toast: string | null;
  confirmingWithdrawId: string | null;
  withdrawBusy: boolean;
  withdrawError: string | null;
};

export const INITIAL_COACH_PANEL_UI: CoachPanelUi = {
  editingFocus: false,
  composerOpen: false,
  toast: null,
  confirmingWithdrawId: null,
  withdrawBusy: false,
  withdrawError: null,
};

type WithdrawDeps = {
  setUi: (p: Partial<CoachPanelUi>) => void;
  withdraw: (id: string) => Promise<WriteResult>;
  erase: (id: string) => void;
  reload: () => unknown;
  focusNext: (p: PendingFocus) => void;
};

/**
 * The withdraw step as a plain async flow (no React), so tests can drive
 * it: busy -> server -> erase the text from local state and focus the erased
 * row -> reload; or keep the note, show an error and focus the warning.
 */
export async function withdrawFlow(observationId: string, deps: WithdrawDeps): Promise<boolean> {
  deps.setUi({ withdrawBusy: true, withdrawError: null });
  const result = await deps.withdraw(observationId).catch((): WriteResult => ({ ok: false, error: WITHDRAW_FAILED, unknown: true }));
  if (!result.ok) {
    // No usable answer: the withdraw-specific message, not the generic save one.
    deps.setUi({ withdrawBusy: false, withdrawError: result.unknown ? WITHDRAW_FAILED : result.error });
    deps.focusNext(WITHDRAW_FOCUS.failed(observationId));
    // Refused: the note may have changed under us (staff may have removed it),
    // so show what is true now, which also drops any erased text.
    if (result.code === 'not_allowed') deps.reload();
    return false;
  }
  deps.erase(observationId);
  deps.setUi({ withdrawBusy: false, confirmingWithdrawId: null, withdrawError: null });
  deps.focusNext(WITHDRAW_FOCUS.done(observationId));
  deps.reload();
  return true;
}

/**
 * The panel's withdraw and note-sent handlers, without React. While a
 * withdrawal is running nothing else may start or move the confirm step, so
 * its result and error stay on the note they belong to.
 */
export function createCoachPanelActions(deps: WithdrawDeps & { getUi: () => CoachPanelUi; firstName: () => string; renewComposer: () => void }) {
  let withdrawing = false;
  return {
    askWithdraw(id: string) {
      if (withdrawing) return;
      deps.setUi({ confirmingWithdrawId: id, withdrawError: null, toast: null });
      deps.focusNext(WITHDRAW_FOCUS.ask(id));
    },
    cancelWithdraw() {
      const id = deps.getUi().confirmingWithdrawId;
      if (withdrawing) return;
      deps.setUi({ confirmingWithdrawId: null, withdrawError: null });
      if (id) deps.focusNext(WITHDRAW_FOCUS.cancel(id));
    },
    async confirmWithdraw(id: string): Promise<boolean> {
      if (withdrawing || deps.getUi().confirmingWithdrawId !== id) return false;
      withdrawing = true;
      try {
        return await withdrawFlow(id, deps);
      } finally {
        withdrawing = false;
      }
    },
    noteSent(kind: NoteSentKind) {
      const toast = kind === 'sent' ? MY_SEASON_COPY.sentToast(deps.firstName()) : kind === 'already_withdrawn' ? NOTE_ALREADY_WITHDRAWN : NOTE_NOT_LISTED;
      deps.renewComposer();
      deps.setUi({ composerOpen: false, toast });
      deps.focusNext({ ids: [MS_IDS.coachAddNote] });
    },
  };
}

export default function CoachMySeasonSection({
  playerId,
  playerName,
  state,
  reload,
  eraseWithdrawn,
}: {
  playerId: string;
  playerName: string;
  state: CoachMySeasonState;
  reload: () => Promise<LoadResult | null>;
  eraseWithdrawn: (observationId: string) => void;
}) {
  const [ui, setUiState] = useState<CoachPanelUi>(INITIAL_COACH_PANEL_UI);
  const setUi = useCallback((p: Partial<CoachPanelUi>) => setUiState((s) => ({ ...s, ...p })), []);
  // A new composer (fresh idempotency key) for each note.
  const [composerKey, setComposerKey] = useState(0);
  // Where keyboard focus goes after a step unmounts (editor, composer,
  // withdraw confirm), once the target exists.
  const focusNext = usePendingFocus();

  useEffect(() => {
    setUiState(INITIAL_COACH_PANEL_UI);
  }, [playerId]);

  // The "Sent" toast clears itself; the timer is dropped on unmount or a new toast.
  useEffect(() => scheduleToastClear(ui.toast, () => setUi({ toast: null })), [ui.toast, setUi]);

  const first = (playerName ?? '').trim().split(/\s+/)[0] || 'this player';

  const latest = useRef({ ui, first, reload, eraseWithdrawn });
  latest.current = { ui, first, reload, eraseWithdrawn };
  const actions = useMemo(
    () =>
      createCoachPanelActions({
        getUi: () => latest.current.ui,
        firstName: () => latest.current.first,
        setUi,
        focusNext,
        withdraw: (id) => withdrawMySeasonObservation(id),
        erase: (id) => latest.current.eraseWithdrawn(id),
        reload: () => latest.current.reload(),
        renewComposer: () => setComposerKey((k) => k + 1),
      }),
    // One set of actions per player: the running-withdrawal guard belongs to this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId, setUi, focusNext]
  );

  return (
    <CoachMySeasonPanel
      playerId={playerId}
      firstName={first}
      state={state}
      ui={ui}
      composerKey={composerKey}
      onRetry={() => void reload()}
      reloadNotes={async () => {
        const result = await reload();
        return result?.ok ? result.view : null;
      }}
      onStartEditFocus={() => setUi({ editingFocus: true, composerOpen: false, toast: null })}
      onCancelEditFocus={() => {
        setUi({ editingFocus: false });
        focusNext({ ids: [MS_IDS.coachChangeFocus] });
      }}
      onFocusSaved={() => {
        setUi({ editingFocus: false });
        focusNext({ ids: [MS_IDS.coachChangeFocus] });
        void reload();
      }}
      onOpenComposer={() => setUi({ composerOpen: true, editingFocus: false, toast: null })}
      onCancelComposer={() => {
        setUi({ composerOpen: false });
        focusNext({ ids: [MS_IDS.coachAddNote] });
      }}
      onNoteSent={actions.noteSent}
      onAskWithdraw={actions.askWithdraw}
      onCancelWithdraw={actions.cancelWithdraw}
      onConfirmWithdraw={(id) => void actions.confirmWithdraw(id)}
    />
  );
}

export function CoachMySeasonPanel({
  playerId,
  firstName,
  state,
  ui,
  composerKey = 0,
  onRetry,
  reloadNotes,
  onStartEditFocus,
  onCancelEditFocus,
  onFocusSaved,
  onOpenComposer,
  onCancelComposer,
  onNoteSent,
  onAskWithdraw,
  onCancelWithdraw,
  onConfirmWithdraw,
}: {
  playerId: string;
  firstName: string;
  state: CoachMySeasonState;
  ui: CoachPanelUi;
  composerKey?: number;
  onRetry: () => void;
  reloadNotes: () => Promise<MySeasonView | null>;
  onStartEditFocus: () => void;
  onCancelEditFocus: () => void;
  onFocusSaved: () => void;
  onOpenComposer: () => void;
  onCancelComposer: () => void;
  onNoteSent: (kind: NoteSentKind) => void;
  onAskWithdraw: (id: string) => void;
  onCancelWithdraw: () => void;
  onConfirmWithdraw: (id: string) => void;
}) {
  const view = state.view;
  // Nothing at all unless the server said the feature is on for this player.
  if (!coachMySeasonEnabled(state)) return null;

  const wrap = (children: ReactNode) => (
    <section
      aria-labelledby="ms-coach-h"
      data-testid="coach-my-season"
      style={{ background: 'var(--os-card)', borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)', display: 'grid', gap: 14 }}
    >
      <h2 id="ms-coach-h" style={{ margin: 0, fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>My Season</h2>
      {children}
    </section>
  );

  // On, but no usable view yet (the server's was malformed, or a retry is running).
  if (!view || view.enabled !== true) {
    return wrap(state.status === 'loading' ? <MySeasonSkeleton /> : <MySeasonError onRetry={onRetry} signedOut={state.signedOut} />);
  }

  if (view.access === 'none') {
    const text =
      view.reason === 'private_coach'
        ? MY_SEASON_COPY.privateCoach(firstName)
        : view.reason === 'former_coach'
          ? MY_SEASON_COPY.formerCoach(firstName)
          : MY_SEASON_COPY.accountReview;
    return wrap(
      <div data-testid={`my-season-none-${view.reason}`} style={{ background: 'var(--os-screen)', borderRadius: 14, padding: 14 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--os-ink)' }}>{text}</p>
      </div>
    );
  }

  const focus = view.activeFocus;
  const busyReload = state.status === 'loading';

  return wrap(
    <>
      {state.status === 'error' && <MySeasonError onRetry={onRetry} signedOut={state.signedOut} />}
      {busyReload && <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Updating My Season</span>}

      <div style={{ background: 'var(--os-screen)', borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 4 }}>
        <span className="os-ms-soft" style={{ ...msEyebrow, fontSize: 12 }}>{firstName}&apos;s focus</span>
        {focus ? (
          <>
            <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)', ...msWrap }}>{focus.title}</span>
            <span className="os-ms-soft" style={{ fontSize: 12.5 }}>Since {formatMySeasonDate(focus.startedOn)}</span>
          </>
        ) : (
          <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 15, color: 'var(--os-ink)' }}>{MY_SEASON_COPY.noFocus}</span>
        )}
      </div>

      {ui.editingFocus && view.canEditFocus ? (
        <FocusEditor playerId={playerId} firstName={firstName} hasActiveFocus={!!focus} onSaved={onFocusSaved} onCancel={onCancelEditFocus} />
      ) : ui.composerOpen && view.canAddNote ? (
        <NoteComposer
          key={composerKey}
          playerId={playerId}
          firstName={firstName}
          onSent={onNoteSent}
          onCancel={onCancelComposer}
          reloadNotes={reloadNotes}
          knownNoteIds={view.observations.map((n) => n.id)}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: view.canEditFocus && view.canAddNote ? '1fr 1fr' : '1fr', gap: 10 }}>
          {view.canEditFocus && <MsButton id={MS_IDS.coachChangeFocus} variant="ghost" onClick={onStartEditFocus}>{focus ? 'Change focus' : 'Set a focus'}</MsButton>}
          {view.canAddNote && <MsButton id={MS_IDS.coachAddNote} onClick={onOpenComposer}>Add a note</MsButton>}
        </div>
      )}

      {!view.canAddNote && (
        <p data-testid="my-season-own-child" style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--os-ink)', background: 'var(--os-screen)', borderRadius: 12, padding: '12px 14px' }}>
          {MY_SEASON_COPY.ownChild}
        </p>
      )}

      <div role="status" aria-live="polite">
        {ui.toast && (
          <p style={{ margin: 0, fontSize: 14, background: 'var(--os-ink)', color: 'var(--os-screen)', borderRadius: 12, padding: '10px 12px' }}>{ui.toast}</p>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <h3 className="os-ms-soft" style={{ ...msEyebrow, fontSize: 12 }}>Notes for {firstName}</h3>
        <NoteList
          notes={view.observations}
          empty="No notes yet."
          renderExtra={(n) => {
            if (n.withdrawn) {
              return (
                <p id={MS_IDS.withdrawn(n.id)} tabIndex={-1} className="os-ms-soft os-ms-focus" style={{ margin: '6px 0 0', fontSize: 13, fontStyle: 'italic' }}>
                  {n.removedByStaff ? MY_SEASON_COPY.removedByStaffNote : MY_SEASON_COPY.withdrawnNote} Written {formatMySeasonDate(n.createdAt)}.
                </p>
              );
            }
            if (!n.mine) return null;
            if (ui.confirmingWithdrawId === n.id) {
              return (
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }} data-testid="withdraw-confirm">
                  {/* Takes focus when this step opens: the destructive button never does. */}
                  <p id={MS_IDS.withdrawPrompt(n.id)} tabIndex={-1} className="os-ms-focus" style={{ margin: 0, fontSize: 13.5, color: 'var(--os-ink)' }}>{MY_SEASON_COPY.withdrawConfirm}</p>
                  {ui.withdrawError && <p role="alert" className="os-ms-error" style={{ margin: 0, fontSize: 13 }}>{ui.withdrawError}</p>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <MsButton id={MS_IDS.withdrawConfirm(n.id)} ariaDescribedBy={MS_IDS.withdrawPrompt(n.id)} onClick={() => onConfirmWithdraw(n.id)} disabled={ui.withdrawBusy}>{ui.withdrawBusy ? 'Withdrawing…' : 'Withdraw note'}</MsButton>
                    <MsButton variant="ghost" onClick={onCancelWithdraw} disabled={ui.withdrawBusy}>Keep it</MsButton>
                  </div>
                </div>
              );
            }
            return (
              <button
                id={MS_IDS.withdraw(n.id)}
                type="button"
                onClick={() => onAskWithdraw(n.id)}
                disabled={ui.withdrawBusy}
                className="os-ms-focus os-ms-accent"
                style={{ marginTop: 4, minHeight: 44, padding: '0 2px', background: 'none', border: 'none', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
              >
                Withdraw
              </button>
            );
          }}
        />
      </div>
    </>
  );
}
