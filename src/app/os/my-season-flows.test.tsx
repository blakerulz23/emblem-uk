import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The stateful My Season flows, driven directly. There is no DOM library
 * in this repo (no jsdom / happy-dom / testing-library), so the editors'
 * and dialog's logic lives in plain functions (mySeasonFlows.ts, the
 * client calls, the coach section helpers) that the components call, and
 * those are exercised here with a mocked fetch and fake events.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { MY_SEASON_ERRORS, checkObservationBody, focusDraftProblems, isoDateUtc, type FocusDraft, type FocusField } from '@/lib/my-season';
import {
  GENERIC_SAVE_ERROR,
  MY_SEASON_LOAD_ERROR,
  MY_SEASON_SESSION_ENDED,
  addMySeasonObservation,
  loadErrorMessage,
  loadMySeasonView,
  saveMySeasonFocus,
  shouldLookUpCoachMySeason,
  withdrawMySeasonObservation,
} from './mySeasonClient';
import {
  MS_IDS,
  MY_SEASON_FORM_COPY,
  closeAndReturnFocus,
  createWriteController,
  focusContentKey,
  focusDraftDirty,
  focusFieldMessages,
  focusStartMax,
  focusSubmitAction,
  holdEscapeIfDirty,
  mySeasonDialogKeyDown,
  noteContentKey,
  noteDirty,
  noteHint,
  noteLimitAnnouncement,
  resolvePendingFocus,
  submitWrite,
  tomorrowLocalIso,
  trapTab,
} from './mySeasonFlows';
import { FocusEditor, FocusSummary, EarlierFocusList, MySeasonError, NoteComposerView } from './mySeasonUi';
import { MySeasonScreenView } from './overlays/MySeasonScreen';
import { CoachMySeasonPanel, COACH_TOAST_MS, INITIAL_COACH_PANEL_UI, scheduleToastClear, startCoachMySeasonLookup } from './screens/CoachMySeasonSection';
import { MS_PLAYER_ID, MS_TEAM_ID, msContent, msFocus, msNote } from './my-season-test-support';

const REQ_A = '11111111-1111-4111-8111-111111111111';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const noop = () => {};

/** A fetch mock that records calls and answers from a queue (default 200 {ok:true}). */
function fetchQueue(...answers: (Response | Error | (() => Promise<Response>))[]) {
  const calls: { url: string; init?: RequestInit; body: Record<string, unknown> | null }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next();
    return next ?? json(200, { ok: true });
  });
  return { fn, calls };
}

const draft = (o: Partial<FocusDraft> = {}): FocusDraft => ({
  title: 'Talk more on the pitch',
  whyItMatters: 'So my teammates know where I am.',
  whatItLooksLike: 'Calling for the ball in every game.',
  startedOn: '2026-11-18',
  ...o,
});
const NOW = new Date('2026-11-18T12:00:00Z');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('client calls (mocked fetch)', () => {
  it('loadMySeasonView: 200 with a valid view is ok; no-store; the player id is encoded', async () => {
    const { fn, calls } = fetchQueue(json(200, msContent()));
    expect(await loadMySeasonView(MS_PLAYER_ID, fn)).toEqual({ ok: true, view: msContent() });
    expect(calls[0].url).toBe(`/api/os/my-season?playerId=${MS_PLAYER_ID}`);
    expect(calls[0].init).toEqual({ cache: 'no-store' });
    await loadMySeasonView('a b&c', fetchQueue().fn);
  });

  it('loadMySeasonView: 401 is signedOut (session ended copy); 404/500, malformed JSON and a network throw are not', async () => {
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchQueue(json(401, { error: 'Sign in required.' })).fn)).toEqual({ ok: false, signedOut: true });
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchQueue(json(500, {})).fn)).toEqual({ ok: false, signedOut: false });
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchQueue(json(404, {})).fn)).toEqual({ ok: false, signedOut: false });
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchQueue(json(200, { enabled: 'yes' })).fn)).toEqual({ ok: false, signedOut: false });
    expect(await loadMySeasonView(MS_PLAYER_ID, fetchQueue(new Error('offline')).fn)).toEqual({ ok: false, signedOut: false });
    expect(loadErrorMessage(true)).toBe('Your session has ended. Sign in again.');
    expect(loadErrorMessage(false)).toBe(MY_SEASON_LOAD_ERROR);
  });

  it('saveMySeasonFocus: POSTs the trimmed draft with the request id', async () => {
    const { fn, calls } = fetchQueue();
    expect(await saveMySeasonFocus(MS_PLAYER_ID, draft({ title: '  Talk more  ' }), REQ_A, fn)).toEqual({ ok: true });
    expect(calls[0].url).toBe('/api/os/my-season/focus');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].body).toEqual({ playerId: MS_PLAYER_ID, title: 'Talk more', whyItMatters: 'So my teammates know where I am.', whatItLooksLike: 'Calling for the ball in every game.', startedOn: '2026-11-18', requestId: REQ_A });
  });

  it('writes: 409 shows the route copy (no Refresh button promised); 401 the session copy; 5xx without JSON and a throw the generic copy', async () => {
    const conflict = MY_SEASON_ERRORS.request_conflict;
    expect(conflict.status).toBe(409);
    expect(conflict.message).toBe('This was already saved. Close and reopen My Season to see it.');
    expect(conflict.message).not.toMatch(/refresh/i);
    expect(await saveMySeasonFocus(MS_PLAYER_ID, draft(), REQ_A, fetchQueue(json(409, { error: conflict.message, code: 'request_conflict' })).fn))
      .toEqual({ ok: false, error: conflict.message, status: 409 });
    expect(await saveMySeasonFocus(MS_PLAYER_ID, draft(), REQ_A, fetchQueue(json(401, { error: 'Sign in required.' })).fn))
      .toEqual({ ok: false, error: MY_SEASON_SESSION_ENDED, status: 401 });
    expect(await saveMySeasonFocus(MS_PLAYER_ID, draft(), REQ_A, fetchQueue(new Response('<html>', { status: 502 })).fn))
      .toEqual({ ok: false, error: GENERIC_SAVE_ERROR, status: 502 });
    expect(await addMySeasonObservation(MS_PLAYER_ID, 'kept_going', 'Kept going all game long today.', REQ_A, fetchQueue(new Error('offline')).fn))
      .toEqual({ ok: false, error: GENERIC_SAVE_ERROR });
    expect(await withdrawMySeasonObservation('o1', fetchQueue(json(403, { error: MY_SEASON_ERRORS.not_allowed.message })).fn))
      .toEqual({ ok: false, error: MY_SEASON_ERRORS.not_allowed.message, status: 403 });
  });

  it('addMySeasonObservation trims the body; withdraw POSTs to the encoded id with no body', async () => {
    const add = fetchQueue();
    await addMySeasonObservation(MS_PLAYER_ID, 'spoke_up', '  Told Sam where the space was.  ', REQ_A, add.fn);
    expect(add.calls[0].url).toBe('/api/os/my-season/observations');
    expect(add.calls[0].body).toEqual({ playerId: MS_PLAYER_ID, category: 'spoke_up', body: 'Told Sam where the space was.', requestId: REQ_A });
    const w = fetchQueue();
    expect(await withdrawMySeasonObservation('o/1', w.fn)).toEqual({ ok: true });
    expect(w.calls[0].url).toBe('/api/os/my-season/observations/o%2F1/withdraw');
    expect(w.calls[0].init?.method).toBe('POST');
    expect(w.calls[0].init?.body).toBeUndefined();
  });

  it('the route no longer has a "not found" code (unknown notes are refused like anyone else\'s)', () => {
    expect('not_found' in MY_SEASON_ERRORS).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('flag off: the coach lookup gate (replaces the render-only fetch check)', () => {
  const combos = [
    { isReal: false, lookup: true, teamId: MS_TEAM_ID },
    { isReal: true, lookup: false, teamId: MS_TEAM_ID },
    { isReal: true, lookup: undefined, teamId: MS_TEAM_ID },
    { isReal: true, lookup: true, teamId: null },
    { isReal: true, lookup: true, teamId: undefined },
  ];

  it('with My Season off the hook effect only resets and never calls fetch', () => {
    for (const c of combos) {
      const { fn } = fetchQueue();
      const reset = vi.fn();
      startCoachMySeasonLookup(shouldLookUpCoachMySeason(c), { reset, run: () => loadMySeasonView(MS_PLAYER_ID, fn) });
      expect(fn, JSON.stringify(c)).not.toHaveBeenCalled();
      expect(reset).toHaveBeenCalledTimes(1);
    }
  });

  it('with it allowed, exactly one GET for the opened player and no reset', () => {
    const { fn, calls } = fetchQueue(json(200, msContent()));
    const reset = vi.fn();
    const run = vi.fn((keep: boolean) => (keep ? null : loadMySeasonView(MS_PLAYER_ID, fn)));
    startCoachMySeasonLookup(shouldLookUpCoachMySeason({ isReal: true, lookup: true, teamId: MS_TEAM_ID }), { reset, run });
    expect(run).toHaveBeenCalledWith(false);
    expect(calls.map((c) => c.url)).toEqual([`/api/os/my-season?playerId=${MS_PLAYER_ID}`]);
    expect(reset).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('focus editor', () => {
  const fields: FocusField[] = ['title', 'whyItMatters', 'whatItLooksLike', 'startedOn'];

  it('per-field messages: rules while empty, too short / too long / date limits when invalid', () => {
    const empty = focusFieldMessages({ title: '', whyItMatters: '', whatItLooksLike: '', startedOn: '2026-11-18' }, NOW);
    expect(empty.title).toEqual({ text: '3 to 60 characters.', invalid: false });
    expect(empty.whyItMatters).toEqual({ text: '3 to 160 characters.', invalid: false });
    expect(empty.startedOn.invalid).toBe(false);

    const m = focusFieldMessages({ title: 'ab', whyItMatters: 'y'.repeat(161), whatItLooksLike: ' a ', startedOn: '2026-11-20' }, NOW);
    expect(m.title).toEqual({ text: 'Too short: at least 3 characters.', invalid: true });
    expect(m.whyItMatters).toEqual({ text: 'Too long: 160 characters at most.', invalid: true });
    expect(m.whatItLooksLike).toEqual({ text: 'Too short: at least 3 characters.', invalid: true });
    expect(m.startedOn).toEqual({ text: "The start date can't be after tomorrow.", invalid: true });
    expect(focusFieldMessages(draft({ title: 'x'.repeat(61) }), NOW).title.text).toBe('Too long: 60 characters at most.');
    expect(focusFieldMessages(draft({ startedOn: '' }), NOW).startedOn).toEqual({ text: 'Pick a start date.', invalid: true });
    expect(focusFieldMessages(draft({ startedOn: '1999-12-31' }), NOW).startedOn).toEqual({ text: 'Pick a date from 2000 onwards.', invalid: true });
    expect(focusFieldMessages(draft({ startedOn: '2026-11-19' }), NOW).startedOn.invalid).toBe(false);
  });

  it('messages agree with the validator: an invalid field is always a problem, and every problem is either invalid or an empty field showing its rule', () => {
    const samples = ['', ' ', 'ab', ' ab ', 'abc', 'x'.repeat(60), 'x'.repeat(61), 'y'.repeat(160), 'y'.repeat(161)];
    const dates = ['', '2026-02-30', '1999-12-31', '2000-01-01', '2026-11-18', '2026-11-19', '2026-11-20'];
    for (const t of samples) for (const w of samples) for (const d of dates) {
      const dr = { title: t, whyItMatters: w, whatItLooksLike: 'Looks fine', startedOn: d };
      const problems = focusDraftProblems(dr, NOW);
      const msgs = focusFieldMessages(dr, NOW);
      for (const f of fields) {
        if (msgs[f].invalid) expect(problems, JSON.stringify(dr)).toContain(f);
        if (problems.includes(f) && !msgs[f].invalid) expect(f === 'startedOn' ? d : dr[f].trim(), JSON.stringify(dr)).toBe('');
      }
    }
  });

  it('the date picker max is tomorrow (local), never past the server\'s tomorrow', () => {
    expect(tomorrowLocalIso(new Date(2026, 10, 30, 12))).toBe('2026-12-01');
    expect(tomorrowLocalIso(new Date(2026, 11, 31, 23, 30))).toBe('2027-01-01');
    for (const now of [NOW, new Date(2026, 5, 30, 23, 59), new Date(2026, 0, 1, 0, 1)]) {
      expect(focusStartMax(now) <= isoDateUtc(now, 1)).toBe(true);
      expect(focusStartMax(now) <= tomorrowLocalIso(now)).toBe(true);
    }
  });

  it('renders the messages wired to each field (aria-describedby, aria-invalid) and the date max', () => {
    const html = renderToStaticMarkup(<FocusEditor playerId={MS_PLAYER_ID} firstName="Riley" hasActiveFocus={false} onSaved={noop} onCancel={noop} initialDraft={draft({ title: 'ab' })} />);
    const id = 'ms-focus-30000000';
    for (const k of fields) expect(html).toContain(`aria-describedby="${id}-${k}-msg"`);
    expect(html).toMatch(new RegExp(`id="${id}-title"[^>]*aria-invalid="true"`));
    expect(html).toMatch(new RegExp(`id="${id}-why"[^>]*aria-invalid="false"`));
    expect(html).toContain(`id="${id}-title-msg"`);
    expect(html).toContain('Too short: at least 3 characters.');
    expect(html).toContain(`max="${focusStartMax()}"`);
    expect(html).toContain('min="2000-01-01"');
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });

  it('Save: nothing while invalid or busy; asks first when replacing; saves otherwise (including from the confirm step)', () => {
    expect(focusSubmitAction({ valid: false, busy: false, hasActiveFocus: true, step: 'edit' })).toBe('none');
    expect(focusSubmitAction({ valid: true, busy: true, hasActiveFocus: false, step: 'edit' })).toBe('none');
    expect(focusSubmitAction({ valid: true, busy: false, hasActiveFocus: true, step: 'edit' })).toBe('confirm');
    expect(focusSubmitAction({ valid: true, busy: false, hasActiveFocus: true, step: 'confirm' })).toBe('save');
    expect(focusSubmitAction({ valid: true, busy: false, hasActiveFocus: false, step: 'edit' })).toBe('save');
  });

  it('the confirm step is a focusable prompt (focus moves there), not an alert', () => {
    const html = renderToStaticMarkup(<FocusEditor playerId={MS_PLAYER_ID} firstName="Riley" hasActiveFocus onSaved={noop} onCancel={noop} initialStep="confirm" initialDraft={draft()} />);
    expect(html).toMatch(/<p tabindex="-1" id="ms-focus-30000000-confirm"[^>]*>This replaces the current focus\./);
    expect(html).not.toMatch(/role="alert"[^>]*>This replaces/);
  });

  it('busy guard: a double submit sends once', async () => {
    let release!: (r: Response) => void;
    const { fn, calls } = fetchQueue(() => new Promise<Response>((r) => (release = r)));
    const ctl = createWriteController(() => REQ_A);
    const ui = { setBusy: vi.fn(), setError: vi.fn(), onDone: vi.fn() };
    const d = draft();
    const send = (rid: string) => saveMySeasonFocus(MS_PLAYER_ID, d, rid, fn);
    const first = submitWrite(ctl, focusContentKey(d), send, ui);
    const second = await submitWrite(ctl, focusContentKey(d), send, ui);
    expect(second).toBe('ignored');
    expect(ctl.busy).toBe(true);
    release(json(200, { ok: true }));
    expect(await first).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(ui.onDone).toHaveBeenCalledTimes(1);
    expect(ui.setBusy.mock.calls.map((c) => c[0])).toEqual([true, false]);
    expect(ctl.busy).toBe(false);
  });

  it('request id: reused on a retry of the same content, renewed after an edit, forgotten after success; refresh only after a successful write', async () => {
    let n = 0;
    const ctl = createWriteController(() => `req-${++n}`);
    const ui = { setBusy: vi.fn(), setError: vi.fn(), onDone: vi.fn() };
    const { fn, calls } = fetchQueue(json(500, {}), new Error('lost response'), json(500, {}), json(200, { ok: true }), json(200, { ok: true }));
    const go = (d: FocusDraft) => submitWrite(ctl, focusContentKey(d), (rid) => saveMySeasonFocus(MS_PLAYER_ID, d, rid, fn), ui);

    expect(await go(draft())).toBe('failed');
    expect(ui.setError).toHaveBeenLastCalledWith(GENERIC_SAVE_ERROR);
    expect(await go(draft({ title: '  Talk more on the pitch ' }))).toBe('failed'); // same content once trimmed
    expect(await go(draft({ title: 'Talk more in games' }))).toBe('failed'); // edited after a failure
    expect(await go(draft({ title: 'Talk more in games' }))).toBe('ok'); // retry of the edit
    expect(await go(draft({ title: 'Talk more in games' }))).toBe('ok'); // a new submission after success
    expect(calls.map((c) => c.body?.requestId)).toEqual(['req-1', 'req-1', 'req-2', 'req-2', 'req-3']);
    expect(ui.onDone).toHaveBeenCalledTimes(2);
  });

  it('dirty tracking for Escape', () => {
    expect(focusDraftDirty(draft(), draft())).toBe(false);
    expect(focusDraftDirty(draft(), draft({ whyItMatters: 'Changed' }))).toBe(true);
    expect(focusDraftDirty(draft(), draft({ startedOn: '2026-11-17' }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('note composer', () => {
  const view = (body: string) =>
    renderToStaticMarkup(<NoteComposerView playerId={MS_PLAYER_ID} firstName="Riley" category="kept_going" body={body} busy={false} error={null} onCategory={noop} onBody={noop} onSend={noop} onCancel={noop} />);

  it('the counter is not live; one polite region speaks only when the note crosses 160', () => {
    const under = view('a'.repeat(150));
    expect(under).toMatch(/<span id="ms-note-30000000-count"(?![^>]*aria-live)[^>]*>150 \/ 160<\/span>/);
    expect(under).toMatch(/<span role="status" aria-live="polite" data-testid="note-limit-live"[^>]*><\/span>/);
    const over = view('a'.repeat(170));
    expect(over).toMatch(/data-testid="note-limit-live"[^>]*>Too long: 160 characters at most\.<\/span>/);
    expect(over).toContain('170 / 160');
  });

  it('typing 150 to 170 characters changes the announcement exactly once (at the limit), and back once', () => {
    const seq = (lengths: number[]) => lengths.map((n) => noteLimitAnnouncement(checkObservationBody('a'.repeat(n))));
    const changes = (a: string[]) => a.filter((x, i) => i > 0 && x !== a[i - 1]).length;
    const up = seq(Array.from({ length: 21 }, (_, i) => 150 + i));
    expect(changes(up)).toBe(1);
    expect(up[10]).toBe('');
    expect(up[11]).toBe('Too long: 160 characters at most.');
    expect(changes(seq(Array.from({ length: 21 }, (_, i) => 170 - i)))).toBe(1);
  });

  it('hint: too long first, then sentences, then too short, else the default', () => {
    expect(noteHint(checkObservationBody('a'.repeat(161)))).toBe('Too long: 160 characters at most.');
    expect(noteHint(checkObservationBody('One thing here. Two things here. Three things.'))).toBe('Keep it to one or two sentences.');
    expect(noteHint(checkObservationBody('Short one'))).toBe('Add a little more detail (at least 20 characters).');
    expect(noteHint(checkObservationBody(''))).toBe('One or two sentences about what you saw.');
    expect(view('a'.repeat(161))).toMatch(/<span id="ms-note-30000000-hint" class="os-ms-error">Too long: 160 characters at most\.<\/span>/);
  });

  it('send: once per click burst, same id on retry, new id after editing the note or the category', async () => {
    let n = 0;
    const ctl = createWriteController(() => `note-${++n}`);
    const ui = { setBusy: vi.fn(), setError: vi.fn(), onDone: vi.fn() };
    const { fn, calls } = fetchQueue(json(500, {}), json(500, {}), json(500, {}), json(200, { ok: true }));
    const send = (cat: 'kept_going' | 'spoke_up', body: string) =>
      submitWrite(ctl, noteContentKey(cat, body), (rid) => addMySeasonObservation(MS_PLAYER_ID, cat, body, rid, fn), ui);
    const body = 'Kept going after the second goal went in.';
    const [a, b] = await Promise.all([send('kept_going', body), send('kept_going', body)]);
    expect([a, b]).toEqual(['failed', 'ignored']);
    expect(await send('kept_going', `${body} `)).toBe('failed');
    expect(await send('spoke_up', body)).toBe('failed');
    expect(await send('spoke_up', body)).toBe('ok');
    expect(calls.map((c) => c.body?.requestId)).toEqual(['note-1', 'note-1', 'note-2', 'note-2']);
    expect(ui.onDone).toHaveBeenCalledTimes(1);
    expect(noteDirty({ category: null, body: '' }, { category: null, body: '' })).toBe(false);
    expect(noteDirty({ category: null, body: '' }, { category: 'kept_going', body: '' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('overlay keyboard: Escape, Tab trap, focus return', () => {
  const key = (k: string, shiftKey = false) => ({ key: k, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  const items = () => ['back', 'change', 'retry'].map((name) => ({ name, focus: vi.fn() }));
  const container = (list: { focus: () => void }[]) => ({ querySelectorAll: vi.fn(() => list) });

  it('Escape closes the dialog', () => {
    const onClose = vi.fn();
    mySeasonDialogKeyDown(key('Escape'), container(items()), onClose, null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last; in between the browser moves', () => {
    const list = items();
    const c = container(list);
    const tab = key('Tab');
    mySeasonDialogKeyDown(tab, c, noop, list[2]);
    expect(list[0].focus).toHaveBeenCalled();
    expect(tab.preventDefault).toHaveBeenCalled();

    const back = key('Tab', true);
    mySeasonDialogKeyDown(back, c, noop, list[0]);
    expect(list[2].focus).toHaveBeenCalled();
    expect(back.preventDefault).toHaveBeenCalled();

    const mid = key('Tab');
    mySeasonDialogKeyDown(mid, c, noop, list[0]);
    expect(mid.preventDefault).not.toHaveBeenCalled();
    expect(list[1].focus).not.toHaveBeenCalled();
  });

  it('focus outside the dialog (e.g. the bottom nav) is pulled back in; an empty dialog keeps focus put', () => {
    const list = items();
    const outside = { name: 'nav' };
    const e = key('Tab');
    expect(trapTab(e, list, outside)).toBe(list[0]);
    expect(trapTab(key('Tab', true), list, outside)).toBe(list[2]);
    const empty = key('Tab');
    expect(trapTab(empty, [], outside)).toBeNull();
    expect(empty.preventDefault).toHaveBeenCalled();
    expect(trapTab(key('a'), list, list[2])).toBeNull();
  });

  it('closing returns focus to the opener (the card\'s Open button)', () => {
    const order: string[] = [];
    const opener = { current: { focus: vi.fn(() => order.push('focus')) } };
    closeAndReturnFocus(() => order.push('close'), opener);
    expect(order).toEqual(['close', 'focus']);
    expect(() => closeAndReturnFocus(noop, { current: null })).not.toThrow();
  });

  it('Escape with unsaved changes is held inside the editor and never reaches the dialog; without changes it closes', () => {
    const onClose = vi.fn();
    // React bubbling: the editor's handler first, then the dialog's unless stopped.
    const bubble = (dirty: boolean) => {
      let stopped = false;
      const e = { key: 'Escape', shiftKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn(() => (stopped = true)) };
      const held = holdEscapeIfDirty(e, dirty);
      if (!stopped) mySeasonDialogKeyDown(e, null, onClose, null);
      return held;
    };
    expect(bubble(true)).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(bubble(false)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(holdEscapeIfDirty(key('Enter'), true)).toBe(false);
    expect(MY_SEASON_FORM_COPY.unsavedEscape).toBe('You have unsaved changes. Save them, or press Cancel to discard them.');
  });

  it('a 401 on load shows the session copy and no Retry; other failures keep Retry', () => {
    const signedOut = renderToStaticMarkup(
      <MySeasonScreenView playerId={MS_PLAYER_ID} playerName="Riley Hart" load={{ status: 'error', view: null, signedOut: true }} editing={false} onClose={noop} onRetry={noop} onStartEdit={noop} onCancelEdit={noop} onSaved={noop} />
    );
    expect(signedOut).toContain('Your session has ended. Sign in again.');
    expect(signedOut).not.toContain('check your connection');
    expect(signedOut).not.toContain('>Retry<');
    const offline = renderToStaticMarkup(<MySeasonError onRetry={noop} />);
    expect(offline).toContain('Couldn&#x27;t load My Season. Check your connection and try again.');
    expect(offline).toContain('>Retry<');
  });

  it('the Change focus button carries the id focus returns to after the editor closes', () => {
    const html = renderToStaticMarkup(
      <MySeasonScreenView playerId={MS_PLAYER_ID} playerName="Riley Hart" load={{ status: 'ready', view: msContent() }} editing={false} onClose={noop} onRetry={noop} onStartEdit={noop} onCancelEdit={noop} onSaved={noop} />
    );
    expect(html).toMatch(new RegExp(`<button id="${MS_IDS.familyChangeFocus}"[^>]*>Change focus</button>`));
  });
});

// ---------------------------------------------------------------------------
describe('focus after a step unmounts (coach panel and family screen)', () => {
  it('goes to the first target that exists; waits for a reload when asked', () => {
    const has = (...ids: string[]) => (id: string) => ids.includes(id);
    expect(resolvePendingFocus({ ids: [MS_IDS.coachAddNote] }, false, has(MS_IDS.coachAddNote))).toEqual({ focusId: MS_IDS.coachAddNote, done: true });
    const afterWithdraw = { ids: [MS_IDS.withdrawn('o1'), MS_IDS.withdraw('o1')], waitWhileLoading: true };
    expect(resolvePendingFocus(afterWithdraw, true, has(MS_IDS.withdraw('o1')))).toEqual({ focusId: null, done: false });
    expect(resolvePendingFocus(afterWithdraw, false, has(MS_IDS.withdrawn('o1'), MS_IDS.withdraw('o1')))).toEqual({ focusId: MS_IDS.withdrawn('o1'), done: true });
    // Reload failed: the note is still there with its Withdraw button.
    expect(resolvePendingFocus(afterWithdraw, false, has(MS_IDS.withdraw('o1')))).toEqual({ focusId: MS_IDS.withdraw('o1'), done: true });
    expect(resolvePendingFocus({ ids: ['gone'] }, false, has())).toEqual({ focusId: null, done: true });
  });

  it('the coach panel renders every focus target with its id', () => {
    const coach = msContent({ access: 'coach', canAddNote: true, observations: [msNote({ id: 'o1', mine: true }), msNote({ id: 'o2', mine: true, withdrawn: true })] });
    const render = (ui = {}) =>
      renderToStaticMarkup(
        <CoachMySeasonPanel playerId={MS_PLAYER_ID} firstName="Riley" state={{ status: 'ready', view: coach }} ui={{ ...INITIAL_COACH_PANEL_UI, ...ui }} onRetry={noop} onStartEditFocus={noop} onCancelEditFocus={noop} onFocusSaved={noop} onOpenComposer={noop} onCancelComposer={noop} onNoteSent={noop} onAskWithdraw={noop} onCancelWithdraw={noop} onConfirmWithdraw={noop} />
      );
    const html = render();
    expect(html).toMatch(new RegExp(`<button id="${MS_IDS.coachChangeFocus}"[^>]*>Change focus</button>`));
    expect(html).toMatch(new RegExp(`<button id="${MS_IDS.coachAddNote}"[^>]*>Add a note</button>`));
    expect(html).toMatch(new RegExp(`<button id="${MS_IDS.withdraw('o1')}"[^>]*>Withdraw</button>`));
    expect(html).toMatch(new RegExp(`<p id="${MS_IDS.withdrawn('o2')}" tabindex="-1"`));
    expect(render({ confirmingWithdrawId: 'o1' })).toMatch(new RegExp(`<button id="${MS_IDS.withdrawConfirm('o1')}"[^>]*>Withdraw note</button>`));
  });

  it('the toast uses theme tokens (dark mode) and clears itself after 5 seconds; the timer is dropped on unmount', () => {
    const coach = msContent({ access: 'coach', canAddNote: true });
    const html = renderToStaticMarkup(
      <CoachMySeasonPanel playerId={MS_PLAYER_ID} firstName="Riley" state={{ status: 'ready', view: coach }} ui={{ ...INITIAL_COACH_PANEL_UI, toast: 'Sent.' }} onRetry={noop} onStartEditFocus={noop} onCancelEditFocus={noop} onFocusSaved={noop} onOpenComposer={noop} onCancelComposer={noop} onNoteSent={noop} onAskWithdraw={noop} onCancelWithdraw={noop} onConfirmWithdraw={noop} />
    );
    expect(html).toMatch(/background:var\(--os-ink\);color:var\(--os-screen\)[^"]*">Sent\./);
    expect(html).not.toMatch(/#15130F|#F4F1EC/i);

    vi.useFakeTimers();
    expect(COACH_TOAST_MS).toBe(5000);
    const clear = vi.fn();
    expect(scheduleToastClear(null, clear)).toBeUndefined();
    scheduleToastClear('Sent.', clear);
    vi.advanceTimersByTime(4999);
    expect(clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clear).toHaveBeenCalledTimes(1);
    const clear2 = vi.fn();
    const cleanup = scheduleToastClear('Sent.', clear2)!;
    cleanup();
    vi.advanceTimersByTime(10_000);
    expect(clear2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('long unbroken text wraps', () => {
  it('focus title, why, looks, earlier focus titles and the coach focus title use overflow-wrap:anywhere', () => {
    const long = 'x'.repeat(60);
    const f = msFocus({ title: long, whyItMatters: 'y'.repeat(160), whatItLooksLike: 'z'.repeat(160) });
    const summary = renderToStaticMarkup(<FocusSummary focus={f} />);
    expect(summary.match(/overflow-wrap:anywhere/g)).toHaveLength(3);
    expect(renderToStaticMarkup(<EarlierFocusList focuses={[f]} />)).toMatch(/<span style="overflow-wrap:anywhere;min-width:0">x{60}<\/span>/);
    const coach = renderToStaticMarkup(
      <CoachMySeasonPanel playerId={MS_PLAYER_ID} firstName="Riley" state={{ status: 'ready', view: msContent({ access: 'coach', activeFocus: f }) }} ui={INITIAL_COACH_PANEL_UI} onRetry={noop} onStartEditFocus={noop} onCancelEditFocus={noop} onFocusSaved={noop} onOpenComposer={noop} onCancelComposer={noop} onNoteSent={noop} onAskWithdraw={noop} onCancelWithdraw={noop} onConfirmWithdraw={noop} />
    );
    expect(coach).toMatch(/overflow-wrap:anywhere[^>]*>x{60}</);
  });
});
