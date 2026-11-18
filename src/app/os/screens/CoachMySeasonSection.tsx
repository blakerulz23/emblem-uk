'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatMySeasonDate, type MySeasonView } from '@/lib/my-season';
import { loadMySeasonView, shouldLookUpCoachMySeason, withdrawMySeasonObservation } from '../mySeasonClient';
import { MS_IDS, usePendingFocus } from '../mySeasonFlows';
import {
  FocusEditor,
  MY_SEASON_COPY,
  MsButton,
  MySeasonError,
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
 * mode, deploy kill switch off, player on a team). Until the answer says
 * `enabled: true` nothing new is rendered and the legacy Season Focus
 * section stays exactly as it was; a failed first load is also silent for
 * the same reason (we cannot tell the feature is on). Once enabled, reload
 * failures show the error state with Retry.
 */

export type CoachMySeasonState = { status: 'idle' | 'loading' | 'ready' | 'error'; view: MySeasonView | null; signedOut?: boolean };

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
  const [state, setState] = useState<CoachMySeasonState>({ status: 'idle', view: null });
  const latestPlayer = useRef(playerId);
  latestPlayer.current = playerId;

  const run = useCallback(async (keepView: boolean) => {
    const forPlayer = playerId;
    setState((s) => ({ status: 'loading', view: keepView ? s.view : null }));
    const result = await loadMySeasonView(forPlayer);
    if (latestPlayer.current !== forPlayer) return;
    setState((s) => (result.ok ? { status: 'ready', view: result.view } : { status: 'error', view: keepView ? s.view : null, signedOut: result.signedOut }));
  }, [playerId]);

  useEffect(() => {
    startCoachMySeasonLookup(allowed, { reset: () => setState({ status: 'idle', view: null }), run });
  }, [allowed, run]);

  const reload = useCallback(() => {
    if (allowed) void run(true);
  }, [allowed, run]);

  return { state, reload, enabled: state.view?.enabled === true };
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

/**
 * The withdraw step as a plain async flow (no React), so tests can drive
 * it: confirm -> busy -> server -> reload, or keep the note and show an
 * error on failure.
 */
export async function withdrawFlow(
  observationId: string,
  deps: { setUi: (p: Partial<CoachPanelUi>) => void; withdraw: (id: string) => Promise<{ ok: boolean; error?: string }>; reload: () => void }
): Promise<boolean> {
  deps.setUi({ withdrawBusy: true, withdrawError: null });
  const result = await deps.withdraw(observationId).catch(() => ({ ok: false, error: undefined }));
  if (!result.ok) {
    deps.setUi({ withdrawBusy: false, withdrawError: result.error ?? "Couldn't withdraw that note. Try again." });
    return false;
  }
  deps.setUi({ withdrawBusy: false, confirmingWithdrawId: null, withdrawError: null });
  deps.reload();
  return true;
}

export default function CoachMySeasonSection({
  playerId,
  playerName,
  state,
  reload,
}: {
  playerId: string;
  playerName: string;
  state: CoachMySeasonState;
  reload: () => void;
}) {
  const [ui, setUiState] = useState<CoachPanelUi>(INITIAL_COACH_PANEL_UI);
  const setUi = useCallback((p: Partial<CoachPanelUi>) => setUiState((s) => ({ ...s, ...p })), []);
  // A new composer (fresh idempotency key) for each note.
  const [composerKey, setComposerKey] = useState(0);
  // Where keyboard focus goes after a step unmounts (editor, composer,
  // withdraw confirm), once the target exists.
  const focusNext = usePendingFocus(state.status === 'loading');

  useEffect(() => {
    setUiState(INITIAL_COACH_PANEL_UI);
  }, [playerId]);

  // The "Sent" toast clears itself; the timer is dropped on unmount or a new toast.
  useEffect(() => scheduleToastClear(ui.toast, () => setUi({ toast: null })), [ui.toast, setUi]);

  const first = (playerName ?? '').trim().split(/\s+/)[0] || 'this player';

  return (
    <CoachMySeasonPanel
      playerId={playerId}
      firstName={first}
      state={state}
      ui={ui}
      composerKey={composerKey}
      onRetry={reload}
      onStartEditFocus={() => setUi({ editingFocus: true, composerOpen: false, toast: null })}
      onCancelEditFocus={() => {
        setUi({ editingFocus: false });
        focusNext({ ids: [MS_IDS.coachChangeFocus] });
      }}
      onFocusSaved={() => {
        setUi({ editingFocus: false });
        focusNext({ ids: [MS_IDS.coachChangeFocus] });
        reload();
      }}
      onOpenComposer={() => setUi({ composerOpen: true, editingFocus: false, toast: null })}
      onCancelComposer={() => {
        setUi({ composerOpen: false });
        focusNext({ ids: [MS_IDS.coachAddNote] });
      }}
      onNoteSent={() => {
        setComposerKey((k) => k + 1);
        setUi({ composerOpen: false, toast: MY_SEASON_COPY.sentToast(first) });
        focusNext({ ids: [MS_IDS.coachAddNote] });
        reload();
      }}
      onAskWithdraw={(id) => {
        setUi({ confirmingWithdrawId: id, withdrawError: null, toast: null });
        focusNext({ ids: [MS_IDS.withdrawConfirm(id)] });
      }}
      onCancelWithdraw={() => {
        const id = ui.confirmingWithdrawId;
        setUi({ confirmingWithdrawId: null, withdrawError: null });
        if (id) focusNext({ ids: [MS_IDS.withdraw(id)] });
      }}
      onConfirmWithdraw={(id) =>
        void withdrawFlow(id, { setUi, withdraw: (x) => withdrawMySeasonObservation(x), reload }).then((ok) =>
          // Done: the note's "Withdrawn" line once the reload shows it (its
          // Withdraw button if the reload failed). Failed: back to the confirm.
          focusNext(ok ? { ids: [MS_IDS.withdrawn(id), MS_IDS.withdraw(id)], waitWhileLoading: true } : { ids: [MS_IDS.withdrawConfirm(id)] })
        )
      }
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
  onStartEditFocus: () => void;
  onCancelEditFocus: () => void;
  onFocusSaved: () => void;
  onOpenComposer: () => void;
  onCancelComposer: () => void;
  onNoteSent: () => void;
  onAskWithdraw: (id: string) => void;
  onCancelWithdraw: () => void;
  onConfirmWithdraw: (id: string) => void;
}) {
  const view = state.view;
  // Nothing at all unless the server said the feature is on for this player.
  if (!view || view.enabled !== true) return null;

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
        <NoteComposer key={composerKey} playerId={playerId} firstName={firstName} onSent={onNoteSent} onCancel={onCancelComposer} />
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
              return <p id={MS_IDS.withdrawn(n.id)} tabIndex={-1} className="os-ms-soft" style={{ margin: '6px 0 0', fontSize: 13, fontStyle: 'italic' }}>{MY_SEASON_COPY.withdrawnNote}</p>;
            }
            if (!n.mine) return null;
            if (ui.confirmingWithdrawId === n.id) {
              return (
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }} data-testid="withdraw-confirm">
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--os-ink)' }}>{MY_SEASON_COPY.withdrawConfirm}</p>
                  {ui.withdrawError && <p role="alert" className="os-ms-error" style={{ margin: 0, fontSize: 13 }}>{ui.withdrawError}</p>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <MsButton id={MS_IDS.withdrawConfirm(n.id)} onClick={() => onConfirmWithdraw(n.id)} disabled={ui.withdrawBusy}>{ui.withdrawBusy ? 'Withdrawing…' : 'Withdraw note'}</MsButton>
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
