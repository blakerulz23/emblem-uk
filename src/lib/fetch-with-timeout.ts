'use client';

/**
 * Root cause of the live preview's permanently-stuck "Saving…": neither
 * postJson's fetch() nor ensureSubmissionKey's fetch() (ProductionBuilder.
 * tsx) had any bound on how long they could take. A try/catch only fires
 * once a promise settles — a genuinely hung request (a slow/stuck RPC on
 * the far end, a dropped connection with no OS-level timeout ever firing)
 * never settles at all, so the earlier exception-handling fix could not
 * have caught it: there was nothing to catch. This wraps any fetch() with
 * an AbortController-based ceiling so every network call in this flow is
 * guaranteed to settle within a bounded time, one way or the other.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 20000;

export class RequestTimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'RequestTimeoutError';
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new RequestTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
