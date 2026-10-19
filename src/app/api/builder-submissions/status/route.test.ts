import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const mockRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

let orderRows: Array<{ id: string }> | null = [];
let capability: { state: string } | null = null;
let dbError: { message: string } | null = null;
// Records the guarded update the route sends: .update(values).eq(col, v)...select()
let updates: Array<{ values: unknown; filters: Array<[string, unknown]> }> = [];
let revokeTakes = false;
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'orders') {
        return { select: () => ({ eq: () => ({ limit: async () => ({ data: orderRows, error: dbError }) }) }) };
      }
      if (table === 'builder_submission_capabilities') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: capability, error: dbError }) }) }),
          update: (values: unknown) => {
            const call = { values, filters: [] as Array<[string, unknown]> };
            updates.push(call);
            const chain = {
              eq: (col: string, v: unknown) => { call.filters.push([col, v]); return chain; },
              select: async () => {
                if (dbError) return { data: null, error: dbError };
                if (revokeTakes && capability?.state === 'active') { capability = { state: 'revoked' }; return { data: [{ id: ID }], error: null }; }
                return { data: [], error: null };
              },
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { POST } from './route';

const CSRF = randomBytes(32).toString('base64url');
const ID = '11111111-2222-4333-8444-555555555555';

function post(body: unknown, csrf = true) {
  return POST(new NextRequest('http://localhost/api/builder-submissions/status', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      ...(csrf ? { 'x-emblem-builder-csrf': CSRF, Cookie: `emblem_builder_csrf=${CSRF}` } : {}),
    },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  updates = [];
  revokeTakes = false;
  mockRateLimit.mockReset().mockResolvedValue(true);
  orderRows = [];
  capability = null;
  dbError = null;
});

describe('POST /api/builder-submissions/status', () => {
  it('rejects requests without builder CSRF, before any lookup', async () => {
    const res = await post({ submissionKey: ID }, false);
    expect(res.status).toBe(403);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it('rejects a malformed submission id', async () => {
    expect((await post({ submissionKey: 'nope' })).status).toBe(400);
  });

  it('is rate limited per caller and per submission', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post({ submissionKey: ID });
    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'builder-submission-status', ID);
  });

  it('placed: an order exists for the submission — and no order id or detail is returned', async () => {
    orderRows = [{ id: 'order-uuid-secret' }];
    const res = await post({ submissionKey: ID });
    const body = await res.json();
    expect(body).toEqual({ status: 'placed' });
    expect(JSON.stringify(body)).not.toContain('order-uuid-secret');
  });

  it('not_placed: an unused submission is revoked with a guarded active-only update, so a late request can no longer create an order', async () => {
    capability = { state: 'active' };
    revokeTakes = true;
    const res = await post({ submissionKey: ID });
    expect(await res.json()).toEqual({ status: 'not_placed' });
    expect(updates[0].values).toMatchObject({ state: 'revoked' });
    expect(updates[0].filters).toEqual([['id', ID], ['state', 'active']]);
  });

  it('in_progress: a submission that is finalising is never revoked (the guarded update matches nothing)', async () => {
    capability = { state: 'finalising' };
    expect(await (await post({ submissionKey: ID })).json()).toEqual({ status: 'in_progress' });
    expect(capability).toEqual({ state: 'finalising' });
    expect(updates.every((u) => u.filters.some(([c, v]) => c === 'state' && v === 'active'))).toBe(true);
  });

  it('a database error answers 503 (the builder keeps sending paused)', async () => {
    dbError = { message: 'down' };
    expect((await post({ submissionKey: ID })).status).toBe(503);
  });
});
