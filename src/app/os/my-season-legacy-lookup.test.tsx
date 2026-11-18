import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MY_SEASON_ERRORS, parseMySeasonView, visibleFamilyObservations, type MySeasonView } from '@/lib/my-season';
import { loadMySeasonView, type LoadResult } from './mySeasonClient';
import { createHomeCardSync, homeCardSignature } from './mySeasonFlows';
import MySeasonHomeCard from './screens/MySeasonHomeCard';
import {
  CoachMySeasonPanel,
  INITIAL_COACH_PANEL_UI,
  LEGACY_FOCUS_COPY,
  LegacyFocusNotice,
  coachLookupStatus,
  coachStateForPlayer,
  createCoachSeasonLoader,
  legacyFocusGate,
  nextCoachState,
  withdrawFlow,
  type CoachLookupStatus,
  type CoachMySeasonState,
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
