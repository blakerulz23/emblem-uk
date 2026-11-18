import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Behaviour added after the Phase 1 review, driven through the plain
 * functions the components call (this repo has no DOM test library).
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} }) }));

import { MY_SEASON_ERRORS, checkObservationBody, hasUnstorableText, parentViewFromRaw, parseMySeasonView, stripUnstorableText, type MySeasonView } from '@/lib/my-season';
import { GENERIC_SAVE_ERROR, addMySeasonObservation, loadMySeasonView, saveMySeasonFocus, withdrawMySeasonObservation, type AddNoteResult, type LoadResult, type WriteResult } from './mySeasonClient';
import {
  MS_IDS,
  NOTE_ALREADY_WITHDRAWN,
  NOTE_NOT_LISTED,
  NOTE_PICK_CATEGORY,
  NOTE_UNCONFIRMED,
  WITHDRAW_FAILED,
  WITHDRAW_FOCUS,
  createHomeCardSync,
  closeAndReturnFocus,
  createWriteController,
  decideNoteOutcome,
  homeCardSignature,
  mySeasonOverlayPlayer,
  noteContentKey,
  noteHint,
  sendNoteFlow,
  submitWrite,
  type PendingFocus,
} from './mySeasonFlows';
import { MY_SEASON_COPY, NoteComposerView, NoteRow } from './mySeasonUi';
import MySeasonHomeCard from './screens/MySeasonHomeCard';
import {
  CoachMySeasonPanel,
  INITIAL_COACH_PANEL_UI,
  coachMySeasonEnabled,
  createCoachPanelActions,
  createCoachSeasonLoader,
  nextCoachState,
  withdrawFlow,
  type CoachMySeasonState,
  type CoachPanelUi,
} from './screens/CoachMySeasonSection';
import { MS_PLAYER_ID, buttonByText, expand, findAll, msContent, msNote, msWithdrawnNote } from './my-season-test-support';

const NOTE_ID = '50000000-0000-4000-8000-000000000001';
const BODY = 'Kept going after the second goal went in.';
const noop = () => {};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchOf = (r: Response | Error) => vi.fn(async () => {
  if (r instanceof Error) throw r;
  return r;
});
const coachView = (o = {}) => msContent({ access: 'coach', canEditFocus: true, canAddNote: true, ...o });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

function panel(state: CoachMySeasonState, ui: Partial<CoachPanelUi> = {}, onRetry = noop) {
  return (
    <CoachMySeasonPanel
      playerId={MS_PLAYER_ID}
      firstName="Riley"
      state={state}
      ui={{ ...INITIAL_COACH_PANEL_UI, ...ui }}
      onRetry={onRetry}
      reloadNotes={async () => null}
      onStartEditFocus={noop}
      onCancelEditFocus={noop}
      onFocusSaved={noop}
      onOpenComposer={noop}
      onCancelComposer={noop}
      onNoteSent={noop}
      onAskWithdraw={noop}
      onCancelWithdraw={noop}
      onConfirmWithdraw={noop}
    />
  );
}

/** The panel actions over a small fake of the component's state. */
function harness(withdraw: (id: string) => Promise<WriteResult> = async () => ({ ok: true })) {
  let ui: CoachPanelUi = { ...INITIAL_COACH_PANEL_UI };
  const log: string[] = [];
  const focus: PendingFocus[] = [];
  const setUi = vi.fn((p: Partial<CoachPanelUi>) => {
    ui = { ...ui, ...p };
  });
  const withdrawSpy = vi.fn(withdraw);
  const renew = vi.fn();
  const actions = createCoachPanelActions({
    getUi: () => ui,
    firstName: () => 'Riley',
    setUi,
    withdraw: withdrawSpy,
    erase: () => log.push('erase'),
    reload: () => log.push('reload'),
    focusNext: (p) => {
      log.push('focus');
      focus.push(p);
    },
    renewComposer: renew,
  });
  return { actions, setUi, focus, log, withdrawSpy, renew, ui: () => ui };
}

describe('A1: the withdraw confirm never focuses the destructive button', () => {
  it('opening the confirm focuses the warning, not "Withdraw note"', () => {
    const h = harness();
    h.actions.askWithdraw('o1');
    expect(h.focus).toEqual([{ ids: [MS_IDS.withdrawPrompt('o1')] }]);
    expect(h.focus[0].ids).not.toContain(MS_IDS.withdrawConfirm('o1'));
  });

  it('a failed withdrawal returns focus to the warning too', async () => {
    const h = harness(async () => ({ ok: false, error: 'No.' }));
    h.actions.askWithdraw('o1');
    await h.actions.confirmWithdraw('o1');
    expect(h.focus.at(-1)).toEqual(WITHDRAW_FOCUS.failed('o1'));
    expect(h.focus.at(-1)!.ids).not.toContain(MS_IDS.withdrawConfirm('o1'));
  });

  it('the warning is focusable and describes the button; the permanent wording stays', () => {
    const view = coachView({ observations: [msNote({ mine: true })] });
    const html = renderToStaticMarkup(panel({ status: 'ready', view }, { confirmingWithdrawId: 'o1' }));
    expect(html).toMatch(new RegExp(`<p id="${MS_IDS.withdrawPrompt('o1')}" tabindex="-1"[^>]*>Withdraw this note\\? The family will no longer see it, and the text will be permanently deleted\\.</p>`));
    expect(html).toMatch(new RegExp(`<button id="${MS_IDS.withdrawConfirm('o1')}"[^>]*aria-describedby="${MS_IDS.withdrawPrompt('o1')}"`));
  });

  it('confirming needs an open confirm for that note, so a repeated confirm erases nothing more', async () => {
    const h = harness();
    expect(await h.actions.confirmWithdraw('o1')).toBe(false);
    expect(h.withdrawSpy).not.toHaveBeenCalled();
    h.actions.askWithdraw('o1');
    expect(await h.actions.confirmWithdraw('o2')).toBe(false);
    expect(await h.actions.confirmWithdraw('o1')).toBe(true);
    expect(await h.actions.confirmWithdraw('o1')).toBe(false);
    expect(h.withdrawSpy).toHaveBeenCalledTimes(1);
  });
});

describe('A2: Home follows a fresh load', () => {
  const withNote = msContent({ observations: [msNote()] });
  const noNotes = msContent({ observations: [] });

  it('a withdrawn note in the fresh view refreshes Home once', () => {
    const sync = createHomeCardSync();
    const refresh = vi.fn();
    sync(withNote, noNotes, refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('no refresh when Home already matches', () => {
    const refresh = vi.fn();
    createHomeCardSync()(withNote, msContent({ observations: [msNote()] }), refresh);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('never loops: the same fresh view asks once, even if Home stays different', () => {
    const sync = createHomeCardSync();
    const refresh = vi.fn();
    for (let i = 0; i < 5; i++) sync(withNote, noNotes, refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    sync(noNotes, noNotes, refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a later, different change refreshes again', () => {
    const sync = createHomeCardSync();
    const refresh = vi.fn();
    sync(withNote, noNotes, refresh);
    sync(noNotes, noNotes, refresh);
    sync(noNotes, withNote, refresh);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('compares what the card shows: the note text, the focus title, not unrelated fields', () => {
    const base = homeCardSignature(withNote);
    expect(homeCardSignature(msContent({ observations: [msNote({ body: 'Something else entirely was said here.' })] }))).not.toBe(base);
    expect(homeCardSignature(msContent({ observations: [msNote()], activeFocus: { ...withNote.activeFocus!, title: 'New title' } }))).not.toBe(base);
    expect(homeCardSignature(msContent({ observations: [msNote(), msNote({ id: 'older', createdAt: '2020-01-01T00:00:00Z' })] }))).toBe(base);
    expect(homeCardSignature({ enabled: false })).not.toBe(base);
  });

  it('the overlay calls the sync after each ready load, and Home passes what it shows', () => {
    const overlay = readFileSync('src/app/os/overlays/MySeasonScreen.tsx', 'utf8');
    expect(overlay).toMatch(/load\.status === 'ready' && load\.view\) syncHomeCard\.current\(homeView, load\.view, onChanged\)/);
    expect(readFileSync('src/app/os/screens/PlayerHome.tsx', 'utf8')).toContain('homeView={mySeasonGuardianView}');
  });

  it('a fresh Home load is right when the only note was withdrawn', () => {
    // The family's RPC answer has no row; a guardian who wrote it gets the empty row.
    for (const observations of [[], [msWithdrawnNote()]]) {
      const view = parentViewFromRaw(msContent({ observations }));
      const html = renderToStaticMarkup(<MySeasonHomeCard view={view as ReturnType<typeof msContent>} onOpen={noop} />);
      expect(html).toContain('No coach notes yet.');
      expect(html).not.toContain('<q');
    }
  });
});

describe('F2: a failed Home refresh is retried when the overlay closes', () => {
  const stale = msContent({ observations: [msNote()] });
  const fresh = msContent({ observations: [] });
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('a failed refresh is not retried while open, then exactly once on close', async () => {
    const sync = createHomeCardSync();
    const refresh = vi.fn(async () => false);
    sync(stale, fresh, refresh);
    await settle();
    for (let i = 0; i < 3; i++) sync(stale, fresh, refresh);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    sync.retryOnClose(refresh);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
    sync.retryOnClose(refresh);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('a rejected refresh counts as failed', async () => {
    const sync = createHomeCardSync();
    const refresh = vi.fn(() => Promise.reject(new Error('offline')));
    sync(stale, fresh, refresh);
    await settle();
    sync.retryOnClose(refresh);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('a refresh that succeeded, or was not needed, is not repeated on close', async () => {
    const worked = createHomeCardSync();
    const ok = vi.fn(async () => true);
    worked(stale, fresh, ok);
    await settle();
    worked.retryOnClose(ok);
    await settle();
    expect(ok).toHaveBeenCalledTimes(1);

    const matched = createHomeCardSync();
    const unused = vi.fn(async () => true);
    matched(fresh, fresh, unused);
    matched.retryOnClose(unused);
    await settle();
    expect(unused).not.toHaveBeenCalled();
  });

  it('Home catching up by another route cancels the retry', async () => {
    const sync = createHomeCardSync();
    const refresh = vi.fn(async () => false);
    sync(stale, fresh, refresh);
    await settle();
    sync(fresh, fresh, refresh);
    sync.retryOnClose(refresh);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('closing during the refresh retries once if it then fails, and not if it works', async () => {
    for (const [answer, calls] of [[false, 2], [true, 1]] as const) {
      const gate = deferred<boolean>();
      const sync = createHomeCardSync();
      const refresh = vi.fn((): Promise<boolean> => (refresh.mock.calls.length === 1 ? gate.promise : Promise.resolve(false)));
      sync(stale, fresh, refresh);
      sync.retryOnClose(refresh);
      expect(refresh).toHaveBeenCalledTimes(1);
      gate.resolve(answer);
      await settle();
      expect(refresh).toHaveBeenCalledTimes(calls);
    }
  });

  it('the overlay retries from its close path, and Home passes a refresh that reports failure', () => {
    const overlay = readFileSync('src/app/os/overlays/MySeasonScreen.tsx', 'utf8');
    expect(overlay).toMatch(/const close = \(\) => \{\s*syncHomeCard\.current\.retryOnClose\(onChanged\);\s*onClose\(\);\s*\};/);
    expect(overlay).toMatch(/closeRef=\{closeRef\}\s*onClose=\{close\}/);
    expect(readFileSync('src/app/os/screens/PlayerHome.tsx', 'utf8')).toContain('onChanged={refreshOsData}');
  });
});

describe('F3: the overlay survives a Home refresh', () => {
  const riley = { playerId: MS_PLAYER_ID, playerName: 'Riley Hart' };
  const home = () => readFileSync('src/app/os/screens/PlayerHome.tsx', 'utf8');

  it('stays on the child it was opened for, whatever the refresh did to Home', () => {
    expect(mySeasonOverlayPlayer(true, riley, MS_PLAYER_ID)).toBe(riley);
    expect(mySeasonOverlayPlayer(true, riley, null)).toBe(riley);
    expect(mySeasonOverlayPlayer(true, riley, undefined)).toBe(riley);
  });

  it('is shown only while open, and never for a different child', () => {
    expect(mySeasonOverlayPlayer(false, riley, MS_PLAYER_ID)).toBeNull();
    expect(mySeasonOverlayPlayer(true, null, MS_PLAYER_ID)).toBeNull();
    expect(mySeasonOverlayPlayer(true, riley, '30000000-0000-4000-8000-000000000002')).toBeNull();
  });

  it('PlayerHome renders it from that player, not from the refreshed view', () => {
    const src = home();
    expect(src).toContain('mySeasonOverlayPlayer(mySeasonOpen, mySeasonOpenedFor, playerId)');
    expect(src).toMatch(/\{mySeasonPlayer && \(\s*<MySeasonScreen\s+playerId=\{mySeasonPlayer\.playerId\}\s+playerName=\{mySeasonPlayer\.playerName\}/);
    expect(src).not.toMatch(/mySeasonOpen && mySeasonGuardianView/);
  });

  it('a switch to another child really closes it, so it cannot reappear', () => {
    expect(home()).toMatch(/const mySeasonEnded = mySeasonOpen && !mySeasonPlayer;\s*useEffect\(\(\) => \{\s*if \(mySeasonEnded\) closeAndReturnFocus\(setMySeasonOpen, mySeasonOpenRef, mySeasonFocusFallbackRef\);/);
  });

  it('focus returns to the opener, or to the fallback once the opener has gone', () => {
    const setOpen = vi.fn();
    const opener = { focus: vi.fn() };
    const fallback = { focus: vi.fn() };
    closeAndReturnFocus(setOpen, { current: opener }, { current: fallback });
    expect(opener.focus).toHaveBeenCalledTimes(1);
    expect(fallback.focus).not.toHaveBeenCalled();
    closeAndReturnFocus(setOpen, { current: null }, { current: fallback });
    expect(fallback.focus).toHaveBeenCalledTimes(1);
    expect(setOpen.mock.calls).toEqual([[false], [false]]);
    expect(home()).toMatch(/ref=\{mySeasonFocusFallbackRef\}\s+onClick=\{actions\.goCollection\}/);
  });
});

describe('A3 + A4: a note is "sent" only when the list proves it', () => {
  const mine = (o = {}) => msNote({ id: NOTE_ID, mine: true, category: 'kept_going', body: BODY, ...o });
  const decide = (result: AddNoteResult, view: MySeasonView | null, knownIds: string[] = []) => decideNoteOutcome({ result, view, category: 'kept_going', body: BODY, knownIds });
  const ok: AddNoteResult = { ok: true, observationId: NOTE_ID };
  const lost: AddNoteResult = { ok: false, error: GENERIC_SAVE_ERROR, unknown: true };

  it('an id the list shows as active is sent; withdrawn or missing is not', () => {
    expect(decide(ok, coachView({ observations: [mine()] }))).toBe('sent');
    expect(decide(ok, coachView({ observations: [msWithdrawnNote({ id: NOTE_ID })] }))).toBe('already_withdrawn');
    expect(decide(ok, coachView({ observations: [] }))).toBe('not_listed');
  });

  it('with no list nothing can be said', () => {
    expect(decide(ok, null)).toBe('unconfirmed');
    expect(decide(lost, null)).toBe('unconfirmed');
    expect(decide(ok, { enabled: false })).toBe('unconfirmed');
  });

  it('a lost answer counts as sent only for a NEW note of mine with this exact content', () => {
    expect(decide(lost, coachView({ observations: [mine()] }))).toBe('sent');
    expect(decide(lost, coachView({ observations: [mine()] }), [NOTE_ID])).toBe('unconfirmed');
    expect(decide(lost, coachView({ observations: [mine({ mine: false })] }))).toBe('unconfirmed');
    expect(decide(lost, coachView({ observations: [mine({ body: 'A different note about the game.' })] }))).toBe('unconfirmed');
    expect(decide(lost, coachView({ observations: [mine({ category: 'spoke_up' })] }))).toBe('unconfirmed');
  });

  function run(post: (id: string) => Promise<AddNoteResult>, reload: () => Promise<MySeasonView | null>, controller = createWriteController(() => `key-${++run.n}`)) {
    const ui = { setBusy: vi.fn(), setError: vi.fn(), onSent: vi.fn(), onFailed: vi.fn() };
    const key = noteContentKey('kept_going', BODY);
    return {
      ui,
      controller,
      done: sendNoteFlow(controller, key, { post, reloadNotes: reload, category: 'kept_going', body: BODY, knownIds: [] }, ui),
    };
  }
  run.n = 0;

  it('unknown outcome, not in the list: the message, the error focus, and a retry with the SAME key', async () => {
    run.n = 0;
    const keys: string[] = [];
    const post = async (id: string): Promise<AddNoteResult> => {
      keys.push(id);
      return lost;
    };
    const reload = vi.fn(async () => coachView({ observations: [] }) as MySeasonView);
    const first = run(post, reload);
    expect(await first.done).toBe('failed');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.ui.setError).toHaveBeenLastCalledWith(NOTE_UNCONFIRMED);
    expect(NOTE_UNCONFIRMED).toBe("We couldn't confirm that was sent. Check the notes below before sending again.");
    expect(first.ui.onFailed).toHaveBeenCalledTimes(1);
    expect(first.ui.onSent).not.toHaveBeenCalled();
    expect(first.ui.setBusy.mock.calls.map((c) => c[0])).toEqual([true, false]);
    await run(post, reload, first.controller).done;
    expect(keys).toEqual(['key-1', 'key-1']);
  });

  it('unknown outcome, found in the list: treated as sent, no second post', async () => {
    const post = vi.fn(async (): Promise<AddNoteResult> => lost);
    const r = run(post, async () => coachView({ observations: [mine()] }));
    expect(await r.done).toBe('ok');
    expect(r.ui.onSent).toHaveBeenCalledWith('sent');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('a saved note whose reload failed stays unconfirmed and keeps its key; the retry cannot duplicate it', async () => {
    run.n = 10;
    const keys: string[] = [];
    const post = async (id: string): Promise<AddNoteResult> => {
      keys.push(id);
      return ok;
    };
    const failed = run(post, () => Promise.reject(new Error('offline')));
    expect(await failed.done).toBe('failed');
    expect(failed.ui.setError).toHaveBeenLastCalledWith(NOTE_UNCONFIRMED);
    expect(failed.ui.onSent).not.toHaveBeenCalled();
    const retry = run(post, async () => coachView({ observations: [mine()] }), failed.controller);
    expect(await retry.done).toBe('ok');
    expect(new Set(keys).size).toBe(1);
  });

  it('a retry that comes back withdrawn says so instead of "Sent"', async () => {
    const r = run(async () => ok, async () => coachView({ observations: [msWithdrawnNote({ id: NOTE_ID })] }));
    await r.done;
    expect(r.ui.onSent).toHaveBeenCalledWith('already_withdrawn');
    const h = harness();
    h.actions.noteSent('already_withdrawn');
    expect(h.ui().toast).toBe(NOTE_ALREADY_WITHDRAWN);
    expect(NOTE_ALREADY_WITHDRAWN).toBe("This note was already withdrawn, so it wasn't sent again.");
    expect(h.ui().composerOpen).toBe(false);
    expect(h.renew).toHaveBeenCalled();
    h.actions.noteSent('not_listed');
    expect(h.ui().toast).toBe(NOTE_NOT_LISTED);
    h.actions.noteSent('sent');
    expect(h.ui().toast).toBe(MY_SEASON_COPY.sentToast('Riley'));
  });

  it('a clear refusal is shown as it is, with no reload', async () => {
    const reload = vi.fn(async () => null);
    const r = run(async () => ({ ok: false, error: MY_SEASON_ERRORS.not_allowed.message, status: 403 }), reload);
    expect(await r.done).toBe('failed');
    expect(r.ui.setError).toHaveBeenLastCalledWith(MY_SEASON_ERRORS.not_allowed.message);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a second click during the send and its verification is ignored', async () => {
    const gate = deferred<MySeasonView | null>();
    const post = vi.fn(async (): Promise<AddNoteResult> => ok);
    const first = run(post, () => gate.promise);
    const second = run(post, async () => null, first.controller);
    expect(await second.done).toBe('ignored');
    gate.resolve(coachView({ observations: [mine()] }));
    expect(await first.done).toBe('ok');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('the client marks network failures, 5xx and an answer with no id as unknown, and 4xx as a clear refusal', async () => {
    const add = (r: Response | Error) => addMySeasonObservation(MS_PLAYER_ID, 'kept_going', BODY, NOTE_ID, fetchOf(r));
    expect(await add(new Error('offline'))).toMatchObject({ ok: false, unknown: true });
    expect(await add(json(503, {}))).toMatchObject({ ok: false, unknown: true, status: 503 });
    expect(await add(json(200, { ok: true, observationId: null }))).toMatchObject({ ok: false, unknown: true });
    expect(await add(new Response('not json', { status: 200 }))).toMatchObject({ ok: false, unknown: true });
    expect(await add(json(200, { ok: true, observationId: NOTE_ID }))).toEqual({ ok: true, observationId: NOTE_ID });
    expect((await add(json(403, { error: 'No.' }))).ok === false && 'unknown' in (await add(json(403, { error: 'No.' })))).toBe(false);
  });
});

describe('A5: withdraw failures', () => {
  it('a network failure shows the withdraw message, not the generic save one', async () => {
    const ui: Partial<CoachPanelUi>[] = [];
    const ok = await withdrawFlow('o1', { setUi: (p) => ui.push(p), withdraw: (id) => withdrawMySeasonObservation(id, fetchOf(new Error('offline'))), erase: noop, reload: noop, focusNext: noop });
    expect(ok).toBe(false);
    expect(ui.at(-1)).toEqual({ withdrawBusy: false, withdrawError: WITHDRAW_FAILED });
    expect(WITHDRAW_FAILED).not.toBe(GENERIC_SAVE_ERROR);
  });

  it('a clear refusal keeps the route copy', async () => {
    const ui: Partial<CoachPanelUi>[] = [];
    await withdrawFlow('o1', { setUi: (p) => ui.push(p), withdraw: (id) => withdrawMySeasonObservation(id, fetchOf(json(403, { error: MY_SEASON_ERRORS.not_allowed.message }))), erase: noop, reload: noop, focusNext: noop });
    expect(ui.at(-1)?.withdrawError).toBe(MY_SEASON_ERRORS.not_allowed.message);
  });
});

describe('A6: one withdrawal at a time', () => {
  it('while one runs, no other note can open, confirm or cancel', async () => {
    const gate = deferred<WriteResult>();
    const h = harness(() => gate.promise);
    h.actions.askWithdraw('o1');
    const running = h.actions.confirmWithdraw('o1');
    const calls = h.setUi.mock.calls.length;
    const focused = h.focus.length;
    h.actions.askWithdraw('o2');
    h.actions.cancelWithdraw();
    expect(await h.actions.confirmWithdraw('o1')).toBe(false);
    expect(h.setUi.mock.calls.length).toBe(calls);
    expect(h.focus.length).toBe(focused);
    expect(h.ui().confirmingWithdrawId).toBe('o1');
    expect(h.withdrawSpy).toHaveBeenCalledTimes(1);
    gate.resolve({ ok: false, error: 'No.' });
    await running;
    h.actions.askWithdraw('o2');
    expect(h.ui().confirmingWithdrawId).toBe('o2');
  });

  it('other notes\' Withdraw buttons are disabled while one is in flight', () => {
    const view = coachView({ observations: [msNote({ id: 'o1', mine: true }), msNote({ id: 'o2', mine: true })] });
    const state: CoachMySeasonState = { status: 'ready', view };
    const other = (ui: Partial<CoachPanelUi>) => findAll(expand(panel(state, ui)), (el) => el.props?.id === MS_IDS.withdraw('o2'))[0];
    expect(other({ confirmingWithdrawId: 'o1', withdrawBusy: true }).props.disabled).toBe(true);
    expect(other({ confirmingWithdrawId: 'o1', withdrawBusy: false }).props.disabled).toBe(false);
  });
});

describe('A7: focus after a successful withdrawal', () => {
  it('goes to the erased row at once, before the reload and independent of it', async () => {
    const h = harness();
    h.actions.askWithdraw('o1');
    h.log.length = 0;
    await h.actions.confirmWithdraw('o1');
    expect(h.log).toEqual(['erase', 'focus', 'reload']);
    expect(h.focus.at(-1)).toEqual({ ids: [MS_IDS.withdrawn('o1')] });
    expect(h.focus.at(-1)).not.toHaveProperty('waitWhileLoading');
  });

  it('the erased row is rendered from the local erase, with its focus target', () => {
    const html = renderToStaticMarkup(panel({ status: 'loading', view: coachView({ observations: [msWithdrawnNote({ id: 'o1' })] }) }));
    expect(html).toMatch(new RegExp(`<p id="${MS_IDS.withdrawn('o1')}" tabindex="-1"`));
  });
});

describe('A8: focus after a failed send', () => {
  it('Send receives the ref the composer focuses', () => {
    const sendRef = { current: null };
    const tree = expand(<NoteComposerView playerId={MS_PLAYER_ID} firstName="Riley" category="kept_going" body={BODY} busy={false} error="No." onCategory={noop} onBody={noop} onSend={noop} onCancel={noop} sendRef={sendRef} />);
    expect((buttonByText(tree, "Send to Riley's family") as unknown as { ref?: unknown }).ref ?? buttonByText(tree, "Send to Riley's family")!.props.ref).toBe(sendRef);
  });

  it('the composer passes onFailed to the send flow', () => {
    expect(readFileSync('src/app/os/mySeasonUi.tsx', 'utf8')).toMatch(/onFailed: \(\) => setTimeout\(\(\) => sendRef\.current\?\.focus\(\), 0\)/);
  });
});

describe('A9: the withdrawn line meets AA in both themes', () => {
  const css = readFileSync('src/app/os/os.css', 'utf8');
  const channel = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const tokens = (name: string) => Array.from(css.matchAll(new RegExp(`--os-${name}:\\s*(#[0-9A-Fa-f]{6})`, 'g')), (m) => m[1]);

  it('the soft text opacity gives at least 4.5:1 on every surface, light and dark', () => {
    const opacity = Number(/\.os-ms-soft \{ color: var\(--os-ink\); opacity: (\.\d+); \}/.exec(css)![1]);
    const [lightInk, darkInk] = tokens('ink');
    const [lightScreen, darkScreen] = tokens('screen');
    const [lightCard, darkCard] = tokens('card');
    for (const [ink, surface] of [[lightInk, lightScreen], [lightInk, lightCard], [darkInk, darkScreen], [darkInk, darkCard]]) {
      const bg = channel(surface);
      const shown = channel(ink).map((c, i) => c * opacity + bg[i] * (1 - opacity));
      expect(contrast(shown, bg), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('nothing around the line adds a second opacity', () => {
    const html = renderToStaticMarkup(<ul><NoteRow note={msWithdrawnNote()}><span>x</span></NoteRow></ul>);
    expect(html).not.toContain('opacity');
    const view = renderToStaticMarkup(panel({ status: 'ready', view: coachView({ observations: [msWithdrawnNote({ id: 'o1' })] }) }));
    expect(view).toMatch(new RegExp(`id="${MS_IDS.withdrawn('o1')}"[^>]*class="os-ms-soft os-ms-focus"`));
    expect(view.slice(view.indexOf('<ul'))).not.toContain('opacity');
  });
});

describe('A10: text the database cannot store', () => {
  const lone = 'Kept going \uD83D after the second goal.';

  it('is removed, leaving ordinary text and real emoji alone', () => {
    expect(stripUnstorableText('a\u0000b')).toBe('ab');
    expect(stripUnstorableText(lone)).toBe('Kept going  after the second goal.');
    expect(stripUnstorableText('Great game 💪 today')).toBe('Great game 💪 today');
    expect(hasUnstorableText(stripUnstorableText(`x\u0000${lone}\uDC00`))).toBe(false);
  });

  it('never reaches the route from a note or a focus', async () => {
    const bodies: string[] = [];
    const recording = (answer: unknown) => async (url: string, init?: RequestInit) => {
      bodies.push(`${init?.body}`);
      return url ? json(200, answer) : json(500, {});
    };
    await addMySeasonObservation(MS_PLAYER_ID, 'kept_going', `${BODY}\u0000`, NOTE_ID, recording({ ok: true, observationId: NOTE_ID }));
    expect(JSON.parse(bodies[0]).body).toBe(BODY);
    await saveMySeasonFocus(MS_PLAYER_ID, { title: 'Talk\u0000 more', whyItMatters: 'So \uD83D they hear', whatItLooksLike: 'Calling out', startedOn: '2026-11-18' }, NOTE_ID, recording({ ok: true }));
    const sent = JSON.parse(bodies[1]);
    expect(sent.title).toBe('Talk more');
    expect(sent.whyItMatters).toBe('So  they hear');
  });

  it('both forms clean the text as it is typed', () => {
    const ui = readFileSync('src/app/os/mySeasonUi.tsx', 'utf8');
    expect(ui).toContain('setBody(stripUnstorableText(v))');
    expect(ui).toContain("k === 'startedOn' ? e.target.value : stripUnstorableText(e.target.value)");
  });
});

describe('A11: enabled but unusable never falls back to the legacy form', () => {
  const invalid: LoadResult = { ok: false, signedOut: false, enabledInvalid: true };
  const unknown: LoadResult = { ok: false, signedOut: false };
  const idle: CoachMySeasonState = { status: 'loading', view: null };

  it('the client recognises the route code and a malformed enabled body', async () => {
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchOf(json(500, { error: 'x', code: 'view_invalid' })))).toEqual(invalid);
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchOf(json(200, { enabled: true, access: 'guardian' })))).toEqual(invalid);
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchOf(json(500, { error: 'x', code: 'failed' })))).toEqual(unknown);
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchOf(json(200, { enabled: 'yes' })))).toEqual(unknown);
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchOf(new Error('offline')))).toEqual(unknown);
  });

  it('enabled but invalid hides the legacy section; a failure that says nothing keeps it', () => {
    expect(coachMySeasonEnabled(nextCoachState(idle, invalid, false))).toBe(true);
    expect(coachMySeasonEnabled(nextCoachState(idle, unknown, false))).toBe(false);
    expect(coachMySeasonEnabled(nextCoachState(idle, { ok: false, signedOut: true }, false))).toBe(false);
    expect(coachMySeasonEnabled(nextCoachState(idle, { ok: true, view: { enabled: false } }, false))).toBe(false);
  });

  it('once known, a retry and a further failure keep it hidden; the server saying "off" brings it back', async () => {
    const answers: LoadResult[] = [invalid, unknown, { ok: true, view: { enabled: false } }];
    let state: CoachMySeasonState = { status: 'idle', view: null };
    const seen: boolean[] = [];
    const loader = createCoachSeasonLoader({
      load: async () => answers.shift()!,
      setState: (u) => {
        state = u(state);
        seen.push(coachMySeasonEnabled(state));
      },
      isCurrentPlayer: () => true,
    });
    await loader.run(MS_PLAYER_ID, false);
    expect(coachMySeasonEnabled(state)).toBe(true);
    seen.length = 0;
    await loader.run(MS_PLAYER_ID, true);
    expect(seen).toEqual([true, true]);
    await loader.run(MS_PLAYER_ID, true);
    expect(coachMySeasonEnabled(state)).toBe(false);
  });

  it('the panel shows the error with Retry, and a skeleton while retrying', () => {
    const onRetry = vi.fn();
    const state = nextCoachState(idle, invalid, false);
    expect(renderToStaticMarkup(panel(state))).toContain('data-testid="coach-my-season"');
    const tree = expand(panel(state, {}, onRetry));
    (buttonByText(tree, 'Retry')!.props.onClick as () => void)();
    expect(onRetry).toHaveBeenCalled();
    expect(renderToStaticMarkup(panel({ status: 'loading', view: null, knownEnabled: true }))).toContain('data-testid="my-season-skeleton"');
    expect(renderToStaticMarkup(panel(nextCoachState(idle, unknown, false)))).toBe('');
  });

  it('the parent load marks a malformed enabled view, which the wire can never claim', () => {
    expect(parentViewFromRaw({ enabled: true, access: 'guardian' })).toEqual({ enabled: true, access: 'none', reason: 'unavailable' });
    expect(parseMySeasonView({ enabled: true, access: 'none', reason: 'unavailable' })).toBeNull();
    expect(parentViewFromRaw({ enabled: false })).toBeNull();
    // Unreadable says nothing about the flag: never "off".
    expect(parentViewFromRaw({ enabled: 'yes' })).toEqual({ enabled: 'unknown' });
    expect(parentViewFromRaw(null)).toEqual({ enabled: 'unknown' });
    expect(parseMySeasonView({ enabled: 'unknown' })).toBeNull();
  });
});

describe('A12: smaller fixes', () => {
  it('the conflict copy is true and a conflict renews the key', async () => {
    expect(MY_SEASON_ERRORS.request_conflict.message).toBe("This couldn't be saved because it clashes with an earlier attempt. Please try again.");
    let n = 0;
    const ctl = createWriteController(() => `k${++n}`);
    const keys: string[] = [];
    const ui = { setBusy: noop, setError: noop, onDone: noop };
    const go = (r: WriteResult) => submitWrite(ctl, 'same', async (id) => {
      keys.push(id);
      return r;
    }, ui);
    await go({ ok: false, error: 'lost', unknown: true });
    await go({ ok: false, error: MY_SEASON_ERRORS.request_conflict.message, status: 409, code: 'request_conflict' });
    await go({ ok: true });
    expect(keys).toEqual(['k1', 'k1', 'k2']);
  });

  it('says a category is needed only when it is the one thing missing', () => {
    const valid = checkObservationBody(BODY);
    expect(noteHint(valid, null)).toBe(NOTE_PICK_CATEGORY);
    expect(noteHint(valid, 'kept_going')).not.toBe(NOTE_PICK_CATEGORY);
    expect(noteHint(checkObservationBody('short'), null)).not.toBe(NOTE_PICK_CATEGORY);
    expect(renderToStaticMarkup(<NoteComposerView playerId={MS_PLAYER_ID} firstName="Riley" category={null} body={BODY} busy={false} error={null} onCategory={noop} onBody={noop} onSend={noop} onCancel={noop} />)).toContain(NOTE_PICK_CATEGORY);
  });

  it('a withdrawn row shows when the note was written, and nothing of its content', () => {
    const html = renderToStaticMarkup(panel({ status: 'ready', view: coachView({ observations: [msWithdrawnNote({ id: 'o1' })] }) }));
    expect(html).toContain('Withdrawn. The family no longer sees this. Written 15 Nov 2026.');
  });
});

describe('A13: the stale-load guard and local erase', () => {
  const setup = () => {
    const pending: ReturnType<typeof deferred<LoadResult>>[] = [];
    let state: CoachMySeasonState = { status: 'idle', view: null };
    let current = true;
    const loader = createCoachSeasonLoader({
      load: () => {
        const d = deferred<LoadResult>();
        pending.push(d);
        return d.promise;
      },
      setState: (u) => {
        state = u(state);
      },
      isCurrentPlayer: () => current,
    });
    return { loader, pending, state: () => state, leavePlayer: () => (current = false) };
  };
  const withText = (): LoadResult => ({ ok: true, view: coachView({ observations: [msNote({ mine: true })] }) });
  const body = (s: CoachMySeasonState) => (s.view && 'observations' in s.view ? s.view.observations[0]?.body : undefined);

  it('a load started before a withdrawal can never restore the erased text', async () => {
    const t = setup();
    const first = t.loader.run(MS_PLAYER_ID, false);
    t.pending[0].resolve(withText());
    await first;
    expect(body(t.state())).toBe(msNote().body);

    const stale = t.loader.run(MS_PLAYER_ID, true);
    t.loader.erase('o1');
    expect(body(t.state())).toBeNull();
    t.pending[1].resolve(withText());
    await stale;
    expect(body(t.state())).toBeNull();
  });

  it('only the newest of two loads lands, though each caller still gets its own answer', async () => {
    const t = setup();
    const older = t.loader.run(MS_PLAYER_ID, false);
    const newer = t.loader.run(MS_PLAYER_ID, true);
    t.pending[1].resolve({ ok: true, view: coachView({ observations: [] }) });
    await newer;
    t.pending[0].resolve(withText());
    expect(await older).toMatchObject({ ok: true });
    expect(body(t.state())).toBeUndefined();
  });

  it('a load for a player no longer on screen is dropped', async () => {
    const t = setup();
    const run = t.loader.run(MS_PLAYER_ID, false);
    t.leavePlayer();
    t.pending[0].resolve(withText());
    await run;
    expect(t.state().view).toBeNull();
    expect(t.state().status).toBe('loading');
  });

  it('withdrawFlow erases before it reloads, and only on success', async () => {
    const order: string[] = [];
    await withdrawFlow('o1', { setUi: noop, withdraw: async () => ({ ok: true }), erase: () => order.push('erase'), reload: () => order.push('reload'), focusNext: noop });
    expect(order).toEqual(['erase', 'reload']);
    order.length = 0;
    await withdrawFlow('o1', { setUi: noop, withdraw: async () => ({ ok: false, error: 'No.' }), erase: () => order.push('erase'), reload: () => order.push('reload'), focusNext: noop });
    expect(order).toEqual([]);
  });

  it('the section wires the real erase and reload into its actions', () => {
    const source = readFileSync('src/app/os/screens/CoachMySeasonSection.tsx', 'utf8');
    expect(source).toContain('erase: (id) => latest.current.eraseWithdrawn(id)');
    expect(source).toContain('reload: () => latest.current.reload()');
    expect(source).toContain('onConfirmWithdraw={(id) => void actions.confirmWithdraw(id)}');
  });
});
