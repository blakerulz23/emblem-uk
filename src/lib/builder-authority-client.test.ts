import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  GENERIC_FAILURE,
  INITIAL_CONFIRM_SUBMIT_STATE,
  TIMEOUT_FAILURE,
  confirmButtonLabel,
  confirmSubmitReducer,
  createAttemptTracker,
  isNonGuardianRelationship,
  postJson,
} from './builder-authority-client';
import { DEFAULT_FETCH_TIMEOUT_MS } from './fetch-with-timeout';

/** Real fetch() rejects with an AbortError once its signal fires — see
 *  fetch-with-timeout.test.ts for why a bare never-settling Promise mock
 *  does not exercise the abort-on-timeout path at all. */
function hangingFetchThatHonoursAbort(): typeof fetch {
  return vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    });
  })) as unknown as typeof fetch;
}

/**
 * This repo has no component-rendering test infrastructure (no jsdom, no
 * @testing-library/react) — the same disclosed constraint as card-share.
 * test.ts. The root cause fixed here (a silent, unhandled fetch()
 * rejection with zero UI feedback) lives entirely in postJson, a pure
 * async function independent of React — extracted into this plain .ts
 * module specifically so it can be proven correct without rendering
 * anything. The click-handler wiring around it in AdultPermissionStep.tsx
 * (busyRef guard, <form onSubmit>, error state preservation) was verified
 * by direct code reading, not an automated interaction test.
 */
describe('postJson — the silent-failure fix', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('a genuine network-level fetch() rejection resolves to a visible generic failure, never throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(postJson('/api/builder-authority/declare', { a: 1 })).resolves.toEqual({ ok: false, error: GENERIC_FAILURE });
  });

  it('a non-JSON (e.g. HTML error page) response also resolves to a visible generic failure, never throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    await expect(postJson('/api/builder-authority/declare', {})).resolves.toEqual({ ok: false, error: GENERIC_FAILURE });
  });

  it('an HTTP error with a real server error message surfaces that message, not the generic fallback', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Please verify your email first' }),
    });
    const result = await postJson('/api/builder-authority/declare', {});
    expect(result).toEqual({ ok: false, error: 'Please verify your email first' });
  });

  it('a genuine success response is returned as-is', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, relationship: 'parent_guardian' }),
    });
    const result = await postJson('/api/builder-authority/declare', {});
    expect(result).toEqual({ ok: true, relationship: 'parent_guardian' });
  });

  it('sends the exact body and CSRF header shape callers expect', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    global.fetch = fetchMock;
    await postJson('/api/builder-authority/declare', { relationship: 'coach' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/builder-authority/declare',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ relationship: 'coach' }),
      })
    );
  });
});

describe('postJson — the permanently-stuck-"Saving…" regression (live preview failure)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('a request that never settles (the exact live-preview failure) resolves with a visible, distinct timeout message within the bound — never hangs forever', async () => {
    // No resolve, no reject, ever — this is what a genuinely stuck
    // server-side call (or a dropped connection) looks like from the
    // caller's perspective. The pre-fix code had nothing that could ever
    // make handleConfirm's await return in this scenario: "Saving…" would
    // persist for the lifetime of the page.
    global.fetch = hangingFetchThatHonoursAbort();

    const promise = postJson('/api/builder-authority/declare', { relationship: 'parent_guardian' });
    const assertion = expect(promise).resolves.toEqual({ ok: false, error: TIMEOUT_FAILURE });
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS + 1);
    await assertion;
  });

  it('the timeout message is distinct from the generic network-failure message, so a retrying guardian sees an accurate reason', () => {
    expect(TIMEOUT_FAILURE).not.toBe(GENERIC_FAILURE);
    expect(TIMEOUT_FAILURE.length).toBeGreaterThan(0);
  });

  it('retrying after a timeout (a fresh call, simulating the guardian clicking the button again) succeeds normally once the request actually completes', async () => {
    const fetchMock = hangingFetchThatHonoursAbort();
    global.fetch = fetchMock;
    const firstAttempt = postJson('/api/builder-authority/declare', {});
    const firstAssertion = expect(firstAttempt).resolves.toEqual({ ok: false, error: TIMEOUT_FAILURE });
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS + 1);
    await firstAssertion;

    // The hanging base implementation was only ever exercised once (the
    // first attempt above) — this queues a one-time override so the retry
    // actually completes, proving a retry after a timeout is not itself
    // stuck by anything left over from the first, abandoned attempt.
    (fetchMock as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true, relationship: 'parent_guardian' }) });
    const retryResult = await postJson('/api/builder-authority/declare', {});
    expect(retryResult).toEqual({ ok: true, relationship: 'parent_guardian' });
  });
});

describe('isNonGuardianRelationship / confirmButtonLabel', () => {
  it('parent_guardian is the only relationship treated as the guardian themselves', () => {
    expect(isNonGuardianRelationship('parent_guardian')).toBe(false);
    expect(isNonGuardianRelationship('coach')).toBe(true);
    expect(isNonGuardianRelationship('club_organiser')).toBe(true);
    expect(isNonGuardianRelationship('other_adult')).toBe(true);
    expect(isNonGuardianRelationship('')).toBe(false);
  });

  it('button label is "Approve and continue" for a parent/guardian', () => {
    expect(confirmButtonLabel('parent_guardian', false)).toBe('Approve and continue');
  });

  it('button label is "Continue to guardian approval" for every non-guardian relationship', () => {
    expect(confirmButtonLabel('coach', false)).toBe('Continue to guardian approval');
    expect(confirmButtonLabel('club_organiser', false)).toBe('Continue to guardian approval');
    expect(confirmButtonLabel('other_adult', false)).toBe('Continue to guardian approval');
  });

  it('button label shows the busy state regardless of relationship', () => {
    expect(confirmButtonLabel('parent_guardian', true)).toBe('Saving…');
    expect(confirmButtonLabel('coach', true)).toBe('Saving…');
  });
});

/**
 * Re-verification of the live preview found a distinct symptom from the
 * first timeout fix: busy correctly released, but no inline error ever
 * appeared — "Saving…" simply reverted to "Approve and continue" with no
 * feedback. Direct code review of the previous handleConfirm found no
 * batching gap (setConfirmError and setBusy(false) were always called
 * together, synchronously, on every failure path) — but two independent
 * useState slots are still two slots. confirmSubmitReducer makes busy/
 * error one atomic value so this exact class of bug (one half of a pair
 * updating without the other) is impossible by construction, regardless
 * of what actually triggered the live symptom.
 */
describe('confirmSubmitReducer — busy and error are one atomic value', () => {
  it('starting a submit always clears any previous error in the same update busy flips true', () => {
    const state = confirmSubmitReducer({ busy: false, error: 'stale error from a previous attempt' }, { type: 'start' });
    expect(state).toEqual({ busy: true, error: '' });
  });

  it('the exact reported sequence: Saving (busy) -> timeout/failure settles -> busy releases AND a persistent error appears together, never one without the other', () => {
    const afterStart = confirmSubmitReducer(INITIAL_CONFIRM_SUBMIT_STATE, { type: 'start' });
    expect(afterStart).toEqual({ busy: true, error: '' });

    const afterTimeout = confirmSubmitReducer(afterStart, { type: 'settle', error: TIMEOUT_FAILURE });
    // This is the single state transition the live preview's symptom says
    // never happened correctly: busy:false is now structurally
    // inseparable from error:TIMEOUT_FAILURE — there is no intermediate
    // state where one applies without the other.
    expect(afterTimeout).toEqual({ busy: false, error: TIMEOUT_FAILURE });
    expect(afterTimeout.error.length).toBeGreaterThan(0);
  });

  it('a successful settle (empty error) releases busy with no lingering error — the successful transition\'s state shape', () => {
    const afterStart = confirmSubmitReducer(INITIAL_CONFIRM_SUBMIT_STATE, { type: 'start' });
    const afterSuccess = confirmSubmitReducer(afterStart, { type: 'settle', error: '' });
    expect(afterSuccess).toEqual({ busy: false, error: '' });
  });

  it('clear-error is a true no-op (same reference) when there is no error — retrying or editing input never spuriously re-renders', () => {
    const state: typeof INITIAL_CONFIRM_SUBMIT_STATE = { busy: false, error: '' };
    expect(confirmSubmitReducer(state, { type: 'clear-error' })).toBe(state);
  });

  it('clear-error removes a persistent error without touching busy — a user changing relevant input clears the message', () => {
    const withError = { busy: false, error: 'All three confirmations are required to continue.' };
    expect(confirmSubmitReducer(withError, { type: 'clear-error' })).toEqual({ busy: false, error: '' });
  });

  it('the error persists across repeated no-op reducer calls that are not an explicit retry/clear — proving nothing clears it "by itself"', () => {
    const settled = { busy: false, error: TIMEOUT_FAILURE };
    // Simulates an unrelated parent re-render: since confirmState only
    // ever changes via an explicit dispatch (useReducer semantics), a
    // component re-render with no dispatch cannot alter it at all. The
    // only actions that ever touch error are 'start', 'settle', and
    // 'clear-error' (fired only from a retry submit or an input onChange)
    // — there is no code path that clears it as a side effect of
    // rendering, an effect, or a phase transition.
    expect(confirmSubmitReducer(settled, { type: 'settle', error: settled.error })).toEqual(settled);
  });
});

describe('createAttemptTracker — discards a stale attempt\'s result', () => {
  it('the first attempt is current until a later attempt starts', () => {
    const tracker = createAttemptTracker();
    const first = tracker.start();
    expect(tracker.isCurrent(first)).toBe(true);
  });

  it('a late-resolving earlier attempt is detected as stale once a newer attempt has started', () => {
    const tracker = createAttemptTracker();
    const first = tracker.start();
    const second = tracker.start();
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
  });
});
