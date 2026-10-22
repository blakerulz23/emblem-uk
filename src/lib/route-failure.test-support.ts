import { expect, vi } from 'vitest';

/**
 * A database error whose every field is unmistakable. If any of it reaches
 * a response body, a log line or a serialized object, a test fails.
 */
export const SENTINEL_TEXT = 'SENTINEL-DB-TEXT relation "sentinel_secret_table" violates policy "sentinel_secret_policy"';
export const SENTINEL_DETAILS = 'SENTINEL-DETAILS Key (sentinel_secret_column)=(sentinel-value) already exists.';
export const SENTINEL_HINT = 'SENTINEL-HINT check constraint sentinel_secret_constraint';
const LEAK = /SENTINEL|sentinel_secret|sentinel-value/;

export function sentinelError(code: string, message = SENTINEL_TEXT) {
  return { code, message: `${message} ${SENTINEL_TEXT}`, details: SENTINEL_DETAILS, hint: SENTINEL_HINT };
}

/** Captures console output for the duration of a test. */
export function captureLogs() {
  const spies = (['error', 'warn', 'log', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  return {
    text: () => JSON.stringify(spies.map((s) => s.mock.calls)),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}

/** The response is the expected status and fixed body, and nothing sentinel appears in it or in the logs. */
export async function expectRedacted(res: Response, status: number, error: string, logs: { text: () => string }) {
  const raw = await res.text();
  expect(res.status).toBe(status);
  expect(JSON.parse(raw)).toEqual({ error });
  expect(raw).not.toMatch(LEAK);
  expect(logs.text()).not.toMatch(LEAK);
}

/** Every log line written during the test is `<operation> failed` with a code only. */
export function expectCodeOnlyLogs(logs: { text: () => string }, operation: string, code: string) {
  expect(logs.text()).toContain(JSON.stringify([`${operation} failed`, { code }]));
}
