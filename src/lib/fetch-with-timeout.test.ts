import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_FETCH_TIMEOUT_MS, RequestTimeoutError, fetchWithTimeout } from './fetch-with-timeout';

/** Real fetch() rejects with an AbortError once its signal fires — a bare
 *  `new Promise(() => {})` mock does not, since it never looks at the
 *  signal at all. This mimics real fetch()'s abort behaviour so the tests
 *  below genuinely exercise fetchWithTimeout's abort-on-timeout path,
 *  rather than a stub that hangs forever regardless of what fires. */
function hangingFetchThatHonoursAbort(): typeof fetch {
  return vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    });
  })) as unknown as typeof fetch;
}

/**
 * Regression coverage for the live-preview failure: "Approve and continue"
 * changed to "Saving…" and stayed there forever, with no error and no
 * success screen. The earlier fix (a plain try/catch around fetch()) only
 * helps once a promise settles — it does nothing for a request that never
 * settles at all. These tests simulate exactly that: a fetch() that never
 * resolves or rejects on its own, proving fetchWithTimeout forces it to
 * settle within a bounded time regardless.
 */
describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('a fetch() that never settles is forced to reject with RequestTimeoutError once the bound elapses — the exact permanently-stuck-"Saving…" scenario', async () => {
    // A request that never resolves or rejects on its own — simulates a
    // genuinely hung request (a stuck server-side RPC, a dropped
    // connection with no OS-level timeout) — until fetchWithTimeout's own
    // AbortController fires.
    global.fetch = hangingFetchThatHonoursAbort();

    const promise = fetchWithTimeout('/api/builder-authority/declare', {});
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS + 1);
    await assertion;
  });

  it('does not time out a request that resolves well within the bound', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(response);
    const result = await fetchWithTimeout('/api/builder-authority/declare', {});
    expect(result).toBe(response);
  });

  it('a genuine (non-timeout) fetch rejection is rethrown as-is, not misreported as a timeout', async () => {
    const realError = new TypeError('Failed to fetch');
    global.fetch = vi.fn().mockRejectedValue(realError);
    await expect(fetchWithTimeout('/api/builder-authority/declare', {})).rejects.toBe(realError);
  });

  it('passes an AbortSignal to fetch so the underlying request is genuinely cancelled, not just abandoned client-side', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;
    await fetchWithTimeout('/api/builder-authority/declare', { method: 'POST' });
    const callInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(callInit.signal).toBeInstanceOf(AbortSignal);
    expect(callInit.method).toBe('POST');
  });

  it('respects a custom timeout shorter than the default', async () => {
    global.fetch = hangingFetchThatHonoursAbort();
    const promise = fetchWithTimeout('/api/builder-authority/declare', {}, 5000);
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });
});
