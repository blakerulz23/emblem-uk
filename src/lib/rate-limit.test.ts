import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal stand-in for the service-role client's claim_attempts table:
// rows are { identifier, success, created_at }, and the query builder
// applies the same filters the real one would.
type Row = { identifier: string; code_attempted: string; success: boolean; created_at: string };
const rows: Row[] = [];
const filtersSeen: string[] = [];

function selectBuilder() {
  const preds: Array<(r: Row) => boolean> = [];
  const builder = {
    eq(col: keyof Row, value: unknown) {
      filtersSeen.push(`eq:${String(col)}=${String(value)}`);
      preds.push((r) => r[col] === value);
      return builder;
    },
    gte(col: keyof Row, value: string) {
      filtersSeen.push(`gte:${String(col)}`);
      preds.push((r) => String(r[col]) >= value);
      return builder;
    },
    then(resolve: (v: { count: number }) => void) {
      resolve({ count: rows.filter((r) => preds.every((p) => p(r))).length });
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      expect(table).toBe('claim_attempts');
      return {
        select: () => selectBuilder(),
        insert: async (row: Omit<Row, 'created_at'>) => {
          rows.push({ ...row, created_at: new Date().toISOString() });
          return { error: null };
        },
      };
    },
  }),
}));

import { RATE_LIMIT_MESSAGE, RATE_LIMIT_WINDOW_MINUTES, isWithinRateLimit, logClaimAttempt } from './rate-limit';

const IP = '203.0.113.7';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

beforeEach(() => {
  rows.length = 0;
  filtersSeen.length = 0;
});

describe('isWithinRateLimit (F1: only failures count)', () => {
  it('allows a caller with no attempts', async () => {
    expect(await isWithinRateLimit(IP)).toBe(true);
  });

  it('never blocks a legitimate multi-step flow made of successes', async () => {
    for (let i = 0; i < 25; i++) await logClaimAttempt(IP, `OK${i}`, true);
    expect(await isWithinRateLimit(IP)).toBe(true);
  });

  it('still blocks after 10 failures in the window (brute force)', async () => {
    for (let i = 0; i < 9; i++) await logClaimAttempt(IP, `BAD${i}`, false);
    expect(await isWithinRateLimit(IP)).toBe(true);
    await logClaimAttempt(IP, 'BAD9', false);
    expect(await isWithinRateLimit(IP)).toBe(false);
  });

  it('successes mixed in do not hide failures', async () => {
    for (let i = 0; i < 10; i++) {
      await logClaimAttempt(IP, `OK${i}`, true);
      await logClaimAttempt(IP, `BAD${i}`, false);
    }
    expect(await isWithinRateLimit(IP)).toBe(false);
  });

  it('failures older than the window no longer count', async () => {
    for (let i = 0; i < 10; i++) {
      rows.push({ identifier: IP, code_attempted: `OLD${i}`, success: false, created_at: minutesAgo(RATE_LIMIT_WINDOW_MINUTES + 1) });
    }
    expect(await isWithinRateLimit(IP)).toBe(true);
  });

  it('counts per caller: another caller is unaffected', async () => {
    for (let i = 0; i < 10; i++) await logClaimAttempt('198.51.100.1', `BAD${i}`, false);
    expect(await isWithinRateLimit(IP)).toBe(true);
    expect(await isWithinRateLimit('198.51.100.1')).toBe(false);
  });

  it('filters on identifier, success = false and the window', async () => {
    await isWithinRateLimit(IP);
    expect(filtersSeen).toEqual([`eq:identifier=${IP}`, 'eq:success=false', 'gte:created_at']);
  });

  it('tells the person how long to wait', () => {
    expect(RATE_LIMIT_MESSAGE).toBe('Too many attempts. Please wait 15 minutes, then try again.');
  });
});
