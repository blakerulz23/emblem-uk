import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const mockRevoke = vi.fn();
vi.mock('@/lib/builder-submission-capability', () => ({
  revokeBuilderSubmissionCapability: (...args: unknown[]) => mockRevoke(...args),
}));

const mockRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

let orderRows: Array<{ id: string }> | null = [];
let capability: { state: string } | null = null;
let dbError: { message: string } | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'orders') {
        return { select: () => ({ eq: () => ({ limit: async () => ({ data: orderRows, error: dbError }) }) }) };
      }
      if (table === 'builder_submission_capabilities') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: capability, error: dbError }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/builder-submission-status', async (orig) => {
  const actual = await orig<typeof import('@/lib/builder-submission-status')>();
  return { ...actual, LATE_REQUEST_GRACE_MS: 0 };
});

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
  mockRevoke.mockReset().mockResolvedValue(undefined);
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

  it('not_placed: an unused submission is revoked first, so a late request can no longer create an order', async () => {
    capability = { state: 'active' };
    const res = await post({ submissionKey: ID });
    expect(await res.json()).toEqual({ status: 'not_placed' });
    expect(mockRevoke).toHaveBeenCalledWith(ID);
  });

  it('in_progress: a submission that is finalising is never revoked', async () => {
    capability = { state: 'finalising' };
    expect(await (await post({ submissionKey: ID })).json()).toEqual({ status: 'in_progress' });
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('a database error answers 503 (the builder keeps sending paused)', async () => {
    dbError = { message: 'down' };
    expect((await post({ submissionKey: ID })).status).toBe(503);
  });
});
