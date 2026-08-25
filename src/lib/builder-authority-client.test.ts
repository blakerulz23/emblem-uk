import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GENERIC_FAILURE, TIMEOUT_FAILURE, confirmButtonLabel, isNonGuardianRelationship, postJson } from './builder-authority-client';
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
