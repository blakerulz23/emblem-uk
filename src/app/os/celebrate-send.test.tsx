import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sendRecognitionFlow, type RecognitionSheetState } from './recognition-submit';
import CelebrateSheet from './overlays/CelebrateSheet';
import { initialOsState, type OsState } from './types';
import type { OsActions } from './OsApp';

const PLAYER_ID = '30000000-0000-4000-8000-000000000001';

/** A tiny stand-in for OsApp's patch(): applies partials/updaters to a local state object. */
function harness(initial: Partial<RecognitionSheetState> = {}, isDemo = false) {
  const store: { state: RecognitionSheetState } = {
    state: { celeb: PLAYER_ID, award: 'Man of the Match', coachMsg: 'Brilliant today', celebSending: false, celebError: false, sent: false, ...initial },
  };
  const patch = (p: Partial<RecognitionSheetState> | ((s: RecognitionSheetState) => Partial<RecognitionSheetState>)) => {
    store.state = { ...store.state, ...(typeof p === 'function' ? p(store.state) : p) };
  };
  const inFlight = { current: false };
  const onSent = vi.fn();
  const onSaved = vi.fn();
  return { store, patch, inFlight, onSent, onSaved, isDemo };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('Celebrate: sendRecognitionFlow', () => {
  it('shows "Recognition added" only after the server confirms the save', async () => {
    const h = harness();
    const pending = deferred<'saved' | 'failed'>();
    const submit = vi.fn(() => pending.promise);
    const run = sendRecognitionFlow(h.store.state, { ...h, submit });

    // While the request is in flight: sending, sheet still open, no success yet.
    expect(h.store.state).toMatchObject({ celebSending: true, sent: false, celeb: PLAYER_ID });
    expect(h.onSent).not.toHaveBeenCalled();

    pending.resolve('saved');
    expect(await run).toBe('saved');
    expect(submit).toHaveBeenCalledWith({ playerId: PLAYER_ID, award: 'Man of the Match', message: 'Brilliant today' });
    expect(h.store.state).toMatchObject({ celeb: null, award: null, coachMsg: '', celebSending: false, celebError: false, sent: true });
    expect(h.onSent).toHaveBeenCalledTimes(1);
    expect(h.onSaved).toHaveBeenCalledTimes(1);
  });

  it('on failure keeps the sheet open with the award and message, shows an error and no success', async () => {
    const h = harness();
    const result = await sendRecognitionFlow(h.store.state, { ...h, submit: vi.fn().mockResolvedValue('failed') });
    expect(result).toBe('failed');
    expect(h.store.state).toMatchObject({ celeb: PLAYER_ID, award: 'Man of the Match', coachMsg: 'Brilliant today', celebSending: false, celebError: true, sent: false });
    expect(h.onSent).not.toHaveBeenCalled();
    expect(h.onSaved).not.toHaveBeenCalled();
  });

  it('treats a thrown submit as a failure rather than an unhandled rejection', async () => {
    const h = harness();
    expect(await sendRecognitionFlow(h.store.state, { ...h, submit: vi.fn().mockRejectedValue(new Error('boom')) })).toBe('failed');
    expect(h.store.state).toMatchObject({ celebError: true, sent: false });
    expect(h.inFlight.current).toBe(false);
  });

  it('a retry after a failure resends the identical recognition (which the route dedupes) and then succeeds', async () => {
    const h = harness();
    const submit = vi.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('saved');
    await sendRecognitionFlow(h.store.state, { ...h, submit });
    expect(h.store.state.celebError).toBe(true);
    await sendRecognitionFlow(h.store.state, { ...h, submit });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
    expect(h.store.state).toMatchObject({ celeb: null, celebError: false, sent: true });
  });

  it('blocks a second send while one is in flight, even before React re-renders', async () => {
    const h = harness();
    const pending = deferred<'saved' | 'failed'>();
    const submit = vi.fn(() => pending.promise);
    const snapshot = { ...h.store.state }; // the stale render-time state both taps would see
    const first = sendRecognitionFlow(snapshot, { ...h, submit });
    expect(await sendRecognitionFlow(snapshot, { ...h, submit })).toBe('blocked');
    pending.resolve('saved');
    await first;
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a chosen award', async () => {
    const h = harness({ award: null });
    const submit = vi.fn();
    expect(await sendRecognitionFlow(h.store.state, { ...h, submit })).toBe('blocked');
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not close a different player’s sheet the coach opened while sending', async () => {
    const h = harness();
    const pending = deferred<'saved' | 'failed'>();
    const run = sendRecognitionFlow(h.store.state, { ...h, submit: () => pending.promise });
    h.patch({ celeb: 'other-player', award: null, coachMsg: '' });
    pending.resolve('failed');
    await run;
    expect(h.store.state).toMatchObject({ celeb: 'other-player', celebError: false, celebSending: false });
  });

  it('demo mode keeps the instant celebration and never calls the server', async () => {
    const h = harness({}, true);
    const submit = vi.fn();
    expect(await sendRecognitionFlow(h.store.state, { ...h, submit })).toBe('demo');
    expect(submit).not.toHaveBeenCalled();
    expect(h.store.state).toMatchObject({ celeb: null, sent: true });
    expect(h.onSent).toHaveBeenCalledTimes(1);
  });
});

describe('Celebrate sheet rendering', () => {
  const actions = { closeCeleb: () => {}, pickAward: () => {}, setCoachMsg: () => {}, sendRecognition: () => {} } as unknown as OsActions;
  const render = (s: Partial<OsState>) => renderToStaticMarkup(<CelebrateSheet state={{ ...initialOsState, celeb: 'x', award: 'Man of the Match', ...s }} actions={actions} />);

  it('shows "Sending…" and a disabled button while saving', () => {
    const html = render({ celebSending: true });
    expect(html).toContain('Sending…');
    expect(html).toContain('aria-disabled="true"');
  });

  it('shows an honest, retryable error after a failed save', () => {
    const html = render({ celebError: true });
    expect(html).toContain('role="alert"');
    expect(html).toContain('try again');
    expect(html).toContain('Send Recognition');
  });

  it('shows no error in the normal state', () => {
    expect(render({})).not.toContain('role="alert"');
  });
});
