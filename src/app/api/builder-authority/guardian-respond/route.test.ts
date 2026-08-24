import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}));

const mockConsumeAnonymousRequestRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockConsumeAnonymousRequestRateLimit(...args),
}));

import { POST } from './route';

const VALID_TOKEN_SHAPE = 'a'.repeat(32); // matches isValidGuardianApprovalToken's ^[A-Za-z0-9_-]{32}$

function post(token: string, decision = 'approved') {
  return POST(
    new NextRequest('http://localhost/api/builder-authority/guardian-respond', {
      method: 'POST',
      body: JSON.stringify({ token, decision }),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  mockRpc.mockReset();
  mockConsumeAnonymousRequestRateLimit.mockReset().mockResolvedValue(true);
});

/**
 * Migration 0071 correction: every "this token can't be used" reason must
 * produce a byte-identical HTTP response — status, JSON body, and
 * content-type — so an untrusted caller can never learn from the response
 * shape alone whether a token is unknown, expired, revoked, replaced by a
 * resend, already used, or belongs to a different request entirely. This
 * suite proves that byte-identity across all six named scenarios, plus the
 * malformed-token-shape case rejected before the RPC is ever called.
 */
describe('POST /api/builder-authority/guardian-respond — uniform unavailable-token responses', () => {
  it('every unavailable scenario returns the exact same {status, body, content-type}', async () => {
    const scenarios: Record<string, () => void> = {
      'random unknown token': () => mockRpc.mockResolvedValueOnce({ data: { ok: false }, error: null }),
      'expired token': () => mockRpc.mockResolvedValueOnce({ data: { ok: false }, error: null }),
      'revoked token (replaced by resend)': () => mockRpc.mockResolvedValueOnce({ data: { ok: false }, error: null }),
      'previously used token': () => mockRpc.mockResolvedValueOnce({ data: { ok: false }, error: null }),
      "token belonging to another request": () => mockRpc.mockResolvedValueOnce({ data: { ok: false }, error: null }),
      'RPC-level error (defence in depth — never a distinct shape either)': () =>
        mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } }),
    };

    const responses: { name: string; status: number; body: unknown; contentType: string | null }[] = [];
    for (const [name, setup] of Object.entries(scenarios)) {
      setup();
      const res = await post(VALID_TOKEN_SHAPE);
      const body = await res.json();
      responses.push({ name, status: res.status, body, contentType: res.headers.get('content-type') });
    }

    const [first, ...rest] = responses;
    for (const r of rest) {
      expect(r.status).toBe(first.status);
      expect(r.body).toEqual(first.body);
      expect(r.contentType).toBe(first.contentType);
    }
    // Pin the actual shared shape so a future change is a deliberate, visible diff.
    expect(first.status).toBe(400);
    expect(first.body).toEqual({ error: 'This link is no longer valid' });
  });

  it('a malformed token (rejected before the RPC is ever called) produces the identical response too', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false }, error: null }); // would only be used if the route wrongly called the RPC
    const validShapeRes = await post(VALID_TOKEN_SHAPE);
    mockRpc.mockClear();

    const malformedRes = await post('not-a-valid-token-shape');
    expect(mockRpc).not.toHaveBeenCalled();

    const [validBody, malformedBody] = await Promise.all([validShapeRes.json(), malformedRes.json()]);
    expect(malformedRes.status).toBe(validShapeRes.status);
    expect(malformedBody).toEqual(validBody);
    expect(malformedRes.headers.get('content-type')).toBe(validShapeRes.headers.get('content-type'));
  });

  it('preserves successful approve/decline behaviour unchanged', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, decision: 'approved' }, error: null });
    const res = await post(VALID_TOKEN_SHAPE, 'approved');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, decision: 'approved' });
  });

  it('rate limiting still applies before the RPC is reached', async () => {
    mockConsumeAnonymousRequestRateLimit.mockResolvedValue(false);
    const res = await post(VALID_TOKEN_SHAPE);
    expect(res.status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
