import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MY_SEASON_ERRORS, parseMySeasonView, visibleFamilyObservations, type MySeasonView } from '@/lib/my-season';
import { loadMySeasonView, type LoadResult } from './mySeasonClient';
import { MS_IDS, NOTE_ALREADY_REMOVED, NOTE_ALREADY_WITHDRAWN, WITHDRAW_FOCUS, createHomeCardSync, decideNoteOutcome, homeCardSignature, type PendingFocus } from './mySeasonFlows';
import MySeasonHomeCard from './screens/MySeasonHomeCard';
import {
  CoachMySeasonPanel,
  INITIAL_COACH_PANEL_UI,
  LEGACY_FOCUS_COPY,
  LegacyFocusNotice,
  coachLookupStatus,
  createCoachPanelActions,
  coachStateForPlayer,
  createCoachSeasonLoader,
  legacyFocusGate,
  nextCoachState,
  withdrawFlow,
  type CoachLookupStatus,
  type CoachMySeasonState,
  type CoachPanelUi,
} from './screens/CoachMySeasonSection';
import { MS_PLAYER_ID, buttonByText, expand, msContent, msNote, msWithdrawnNote } from './my-season-test-support';

/**
 * Change 1: the legacy Season Focus while My Season eligibility is unknown,
 * and the family and coach sides of a staff removal.
 */

const OTHER_PLAYER = '30000000-0000-4000-8000-000000000002';
const noop = () => {};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const OFF: LoadResult = { ok: true, view: { enabled: false } };
const ON: LoadResult = { ok: true, view: msContent({ access: 'coach', canAddNote: true }) };
const FAILED: LoadResult = { ok: false, signedOut: false };
const SIGNED_OUT: LoadResult = { ok: false, signedOut: true };
const INVALID: LoadResult = { ok: false, signedOut: false, enabledInvalid: true };

function loaderHarness() {
  const pending: ReturnType<typeof deferred<LoadResult>>[] = [];
  let state: CoachMySeasonState = { status: 'idle', view: null };
  let current = MS_PLAYER_ID;
  const loader = createCoachSeasonLoader({
    load: () => {
      const d = deferred<LoadResult>();
      pending.push(d);
      return d.promise;
    },
    setState: (u) => {
      state = u(state);
    },
    isCurrentPlayer: (id) => id === current,
  });
  const lookup = () => coachLookupStatus(true, coachStateForPlayer(state, current, true));
  return { loader, pending, lookup, switchTo: (id: string) => (current = id), raw: () => state };
}

describe('the lookup state machine', () => {
  const after = (r: LoadResult) => coachLookupStatus(true, nextCoachState({ status: 'loading', view: null, playerId: MS_PLAYER_ID }, r, false));

  it('every state', () => {
    expect(coachLookupStatus(false, { status: 'idle', view: null })).toBe('not-needed');
    expect(coachLookupStatus(true, { status: 'idle', view: null })).toBe('loading');
    expect(coachLookupStatus(true, { status: 'loading', view: null })).toBe('loading');
    expect(after(OFF)).toBe('confirmed-off');
    expect(after(ON)).toBe('enabled');
    expect(after(FAILED)).toBe('failed');
    expect(after(INVALID)).toBe('failed');
    expect(after(SIGNED_OUT)).toBe('session-ended');
  });

  it('a held enabled view stays enabled through a failed refresh', () => {
    expect(coachLookupStatus(true, nextCoachState({ status: 'loading', view: (ON as { view: MySeasonView }).view, knownEnabled: true }, FAILED, true))).toBe('enabled');
  });

  it('Retry: failed goes back to loading, then to the new answer', async () => {
    const t = loaderHarness();
    const first = t.loader.run(MS_PLAYER_ID, false);
    t.pending[0].resolve(FAILED);
    await first;
    expect(t.lookup()).toBe('failed');
    const retry = t.loader.run(MS_PLAYER_ID, true);
    expect(t.lookup()).toBe('loading');
    t.pending[1].resolve(OFF);
    await retry;
    expect(t.lookup()).toBe('confirmed-off');
  });

  it("a previous player's answer never unlocks the current player", async () => {
    const t = loaderHarness();
    const a = t.loader.run(MS_PLAYER_ID, false);
    t.pending[0].resolve(OFF);
    await a;
    expect(t.lookup()).toBe('confirmed-off');
    // The screen re-renders with the new player before its effect runs.
    t.switchTo(OTHER_PLAYER);
    expect(t.lookup()).toBe('loading');
    expect(legacyFocusGate(t.lookup()).canAdd).toBe(false);
  });

  it('a late response for the previous player is dropped', async () => {
    const t = loaderHarness();
    const a = t.loader.run(MS_PLAYER_ID, false);
    t.switchTo(OTHER_PLAYER);
    const b = t.loader.run(OTHER_PLAYER, false);
    t.pending[0].resolve(OFF);
    await a;
    expect(t.lookup()).toBe('loading');
    t.pending[1].resolve(ON);
    await b;
    expect(t.lookup()).toBe('enabled');
  });

  it('a kept view from another player is not carried into a load', () => {
    const t = { status: 'ready', view: (ON as { view: MySeasonView }).view, knownEnabled: true, playerId: OTHER_PLAYER } as CoachMySeasonState;
    let state = t;
    createCoachSeasonLoader({ load: () => new Promise(noop), setState: (u) => { state = u(state); }, isCurrentPlayer: () => true }).run(MS_PLAYER_ID, true);
    expect(state).toEqual({ status: 'loading', view: null, knownEnabled: false, playerId: MS_PLAYER_ID });
  });
});

describe('the deploy kill switch 404 is told apart from other failures', () => {
  it('its own code is a confirmed off; every other failure is not', async () => {
    expect(MY_SEASON_ERRORS.deploy_off).toMatchObject({ status: 404, code: 'deploy_off' });
    expect(await loadMySeasonView(MS_PLAYER_ID, async () => json(404, { code: 'deploy_off', error: 'x' }))).toEqual(OFF);
    for (const res of [json(404, {}), json(404, { code: 'not_available' }), json(500, { code: 'deploy_off' }), json(403, { code: 'not_allowed' }), new Response('<html>', { status: 404 })]) {
      expect(await loadMySeasonView(MS_PLAYER_ID, async () => res)).toEqual(FAILED);
    }
    expect(await loadMySeasonView(MS_PLAYER_ID, async () => json(401, {}))).toEqual(SIGNED_OUT);
  });
});

describe('legacy control gating', () => {
  const expected: [CoachLookupStatus, boolean, string | null][] = [
    ['not-needed', true, null],
    ['confirmed-off', true, null],
    ['loading', false, 'checking'],
    ['failed', false, 'failed'],
    ['session-ended', false, 'session-ended'],
    ['enabled', false, 'failed'],
  ];
  for (const [status, canAdd, notice] of expected) {
    it(`${status}: Add ${canAdd ? 'works' : 'is off'}`, () => {
      expect(legacyFocusGate(status)).toEqual({ canAdd, notice });
    });
  }

  it('notices: an accessible status, an alert with Retry, the session message without Retry, and nothing when settled', () => {
    const notice = (s: CoachLookupStatus, onRetry = noop) => <LegacyFocusNotice gate={legacyFocusGate(s)} onRetry={onRetry} />;
    const checking = renderToStaticMarkup(notice('loading'));
    expect(checking).toContain('role="status"');
    expect(checking).toContain('Checking this player&#x27;s season...');
    expect(checking).toContain('position:absolute');
    const onRetry = vi.fn();
    const failedTree = expand(LegacyFocusNotice({ gate: legacyFocusGate('failed'), onRetry }));
    (buttonByText(failedTree, 'Retry')!.props.onClick as () => void)();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(notice('failed'))).toContain(LEGACY_FOCUS_COPY.failed.replaceAll("'", '&#x27;'));
    const ended = renderToStaticMarkup(notice('session-ended'));
    expect(ended).toContain('Your session has ended');
    expect(ended).not.toContain('Retry');
    expect(renderToStaticMarkup(notice('not-needed'))).toBe('');
    expect(renderToStaticMarkup(notice('confirmed-off'))).toBe('');
  });
});

describe('the failed-lookup text', () => {
  it('uses the theme class that meets AA in dark mode, not a fixed colour', () => {
    for (const s of ['failed', 'session-ended'] as const) {
      const html = renderToStaticMarkup(<LegacyFocusNotice gate={legacyFocusGate(s)} onRetry={noop} />);
      expect(html).toContain('class="os-ms-error"');
      expect(html).not.toContain('#C0392B');
    }
  });
});

describe('a note staff removed, from the author\'s side', () => {
  const removed = { ...msWithdrawnNote(), removedByStaff: true as const };
  const render = (view: MySeasonView, ui: Partial<CoachPanelUi>) =>
    renderToStaticMarkup(
      <CoachMySeasonPanel
        playerId={MS_PLAYER_ID} firstName="Riley" state={{ status: 'ready', view }} ui={{ ...INITIAL_COACH_PANEL_UI, ...ui }}
        onRetry={noop} reloadNotes={async () => null} onStartEditFocus={noop} onCancelEditFocus={noop} onFocusSaved={noop}
        onOpenComposer={noop} onCancelComposer={noop} onNoteSent={noop} onAskWithdraw={noop} onCancelWithdraw={noop} onConfirmWithdraw={noop}
      />
    );
  const coachView = (observations: MySeasonContentNotes) => msContent({ access: 'coach', canAddNote: true, observations });
  type MySeasonContentNotes = NonNullable<Parameters<typeof msContent>[0]>['observations'];

  it('a refused withdrawal reloads, then sends focus to the notice', async () => {
    const order: string[] = [];
    const focus: PendingFocus[] = [];
    const reload = deferred<void>();
    const done = withdrawFlow('o1', {
      setUi: noop,
      erase: noop,
      withdraw: async () => ({ ok: false, error: 'No.', code: 'not_allowed', status: 403 }),
      reload: () => {
        order.push('reload');
        return reload.promise;
      },
      focusNext: (p) => {
        order.push('focus');
        focus.push(p);
      },
    });
    expect(await done).toBe(false);
    expect(focus).toEqual([WITHDRAW_FOCUS.failed('o1')]);
    reload.resolve();
    await vi.waitFor(() => expect(focus).toHaveLength(2));
    expect(focus[1]).toEqual({ ids: [MS_IDS.withdrawNotice] });
    expect(order).toEqual(['focus', 'reload', 'focus']);
  });

  it('a reload that fails still settles the focus', async () => {
    const focusNext = vi.fn();
    await withdrawFlow('o1', { setUi: noop, erase: noop, withdraw: async () => ({ ok: false, error: 'No.', code: 'not_allowed' }), reload: () => Promise.reject(new Error('offline')), focusNext });
    await vi.waitFor(() => expect(focusNext).toHaveBeenCalledTimes(2));
  });

  it('after that reload the message stays visible and focusable, next to the removed row', () => {
    const html = render(coachView([removed]), { confirmingWithdrawId: 'o1', withdrawError: 'You can&apos;t.' });
    expect(html).toMatch(new RegExp(`<p id="${MS_IDS.withdrawNotice}" role="alert" tabindex="-1"`));
    expect(html).toContain('Removed by Emblem staff.');
    expect(html).not.toContain('data-testid="withdraw-confirm"');
  });

  it('so does a note that has left the list altogether', () => {
    expect(render(coachView([]), { confirmingWithdrawId: 'o1', withdrawError: 'No.' })).toContain(`id="${MS_IDS.withdrawNotice}"`);
  });

  it('while the note can still be confirmed the message stays in the confirm step, once', () => {
    const html = render(coachView([msNote({ mine: true })]), { confirmingWithdrawId: 'o1', withdrawError: 'Refused here.' });
    expect(html).not.toContain(MS_IDS.withdrawNotice);
    expect(html.match(/Refused here\./g)).toHaveLength(1);
    expect(html).toContain('data-testid="withdraw-confirm"');
  });

  it('no message without a refusal', () => {
    expect(render(coachView([removed]), { confirmingWithdrawId: 'o1' })).not.toContain(MS_IDS.withdrawNotice);
  });

  it('a retried send of a removed note says it was removed, not withdrawn', () => {
    const NOTE = '50000000-0000-4000-8000-000000000009';
    const decide = (note: typeof removed) => decideNoteOutcome({ result: { ok: true, observationId: NOTE }, view: coachView([{ ...note, id: NOTE }]), category: 'spoke_up', body: 'x', knownIds: [] });
    expect(decide(removed)).toBe('already_removed');
    expect(decide(msWithdrawnNote() as typeof removed)).toBe('already_withdrawn');

    let ui: CoachPanelUi = INITIAL_COACH_PANEL_UI;
    const actions = createCoachPanelActions({
      getUi: () => ui, firstName: () => 'Riley', setUi: (p) => { ui = { ...ui, ...p }; }, withdraw: async () => ({ ok: true }),
      erase: noop, reload: noop, focusNext: noop, renewComposer: noop,
    });
    actions.noteSent('already_removed');
    expect(ui.toast).toBe(NOTE_ALREADY_REMOVED);
    expect(NOTE_ALREADY_REMOVED).toBe("This note was removed by Emblem staff, so it wasn't sent again.");
    actions.noteSent('already_withdrawn');
    expect(ui.toast).toBe(NOTE_ALREADY_WITHDRAWN);
  });
});

describe('staff removal: what the family and the author see', () => {
  const wire = { ...msNote(), withdrawn: true, category: null, body: null, mine: true, removedByStaff: true };
  const viewOf = (observations: unknown[]) => parseMySeasonView({ ...msContent(), observations });

  it('the parser accepts a metadata-only removed row and refuses one with content', () => {
    const v = viewOf([wire]);
    expect(v && 'observations' in v && v.observations[0]).toMatchObject({ withdrawn: true, removedByStaff: true, body: null });
    expect(viewOf([{ ...wire, body: 'still here' }])).toBeNull();
    expect(viewOf([{ ...msNote(), removedByStaff: true }])).toBeNull();
    expect(viewOf([{ ...msNote(), removedByStaff: 'yes' }])).toBeNull();
    const plain = viewOf([{ ...msNote(), removedByStaff: false }]);
    expect(plain && 'observations' in plain && plain.observations[0]).toEqual(msNote());
  });

  it('a fresh family load without the note: Home shows nothing of it', () => {
    const fresh = msContent({ observations: [] });
    expect(visibleFamilyObservations(fresh)).toEqual([]);
    const home = renderToStaticMarkup(<MySeasonHomeCard view={fresh} onOpen={noop} />);
    expect(home).not.toContain(msNote().body);
    expect(home).toContain('No coach notes yet.');
  });

  it('an open overlay whose fresh load lacks the note refreshes a Home still quoting it, once', () => {
    const stale = msContent({ observations: [msNote()] });
    const fresh = msContent({ observations: [] });
    expect(homeCardSignature(stale)).not.toBe(homeCardSignature(fresh));
    const refresh = vi.fn(async () => true);
    const sync = createHomeCardSync();
    sync(stale, fresh, refresh);
    sync(stale, fresh, refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('the author sees the fixed line, no text and no Withdraw control', () => {
    const removed = { ...msWithdrawnNote(), removedByStaff: true as const };
    const html = renderToStaticMarkup(
      <CoachMySeasonPanel
        playerId={MS_PLAYER_ID} firstName="Riley" state={{ status: 'ready', view: msContent({ access: 'coach', canAddNote: true, observations: [removed] }) }}
        ui={INITIAL_COACH_PANEL_UI} onRetry={noop} reloadNotes={async () => null} onStartEditFocus={noop} onCancelEditFocus={noop} onFocusSaved={noop}
        onOpenComposer={noop} onCancelComposer={noop} onNoteSent={noop} onAskWithdraw={noop} onCancelWithdraw={noop} onConfirmWithdraw={noop}
      />
    );
    expect(html).toContain('Removed by Emblem staff. The family no longer sees this.');
    expect(html).not.toContain('>Withdraw<');
  });

  it('a withdrawal refused because staff got there first reloads, so the text goes; other failures do not', async () => {
    const reload = vi.fn();
    const deps = { setUi: noop, erase: noop, reload, focusNext: noop };
    await withdrawFlow('o1', { ...deps, withdraw: async () => ({ ok: false, error: 'No.', code: 'not_allowed', status: 403 }) });
    expect(reload).toHaveBeenCalledTimes(1);
    await withdrawFlow('o1', { ...deps, withdraw: async () => ({ ok: false, error: 'No.', unknown: true }) });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
