import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRpc = vi.fn();
let requestRow: { order_id: string } | null = { order_id: 'order-1' };
let declaration: { adult_email: string } | null = { adult_email: 'coach@example.test' };
let order: { purchaser_email: string } | null = { purchaser_email: 'purchaser@example.test' };
const tablesRead: string[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: mockRpc,
    from: (table: string) => {
      tablesRead.push(table);
      const data =
        table === 'builder_guardian_approval_requests' ? requestRow : table === 'builder_order_authority_declarations' ? declaration : table === 'orders' ? order : null;
      const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => ({ data, error: null }) };
      return chain;
    },
  }),
}));

const mockConsume = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({ consumeAnonymousRequestRateLimit: (...a: unknown[]) => mockConsume(...a) }));

const mockSendDecision = vi.fn();
vi.mock('@/lib/send-builder-guardian-decision-email', () => ({ sendBuilderGuardianDecisionEmail: (...a: unknown[]) => mockSendDecision(...a) }));
vi.mock('@/lib/marketing/site', () => ({ appBaseUrl: () => 'https://emblem.example' }));

import { POST } from './route';

const TOKEN = 'a'.repeat(32);

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/builder-authority/guardian-respond', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: { ok: true, decision: 'approved' }, error: null });
  mockConsume.mockReset().mockResolvedValue(true);
  mockSendDecision.mockReset().mockResolvedValue({ ok: true });
  requestRow = { order_id: 'order-1' };
  declaration = { adult_email: 'coach@example.test' };
  order = { purchaser_email: 'purchaser@example.test' };
  tablesRead.length = 0;
});

describe('POST /api/builder-authority/guardian-respond — buyer notification (R2)', () => {
  it('tokens are validated as before (sanity: this test token format is accepted)', async () => {
    const res = await post({ token: TOKEN, decision: 'approved' });
    expect(res.status).toBe(200);
  });

  it('approved: emails the buyer’s verified declaration address with the /builder?pay=1 link', async () => {
    const res = await post({ token: TOKEN, decision: 'approved' });
    expect(res.status).toBe(200);
    expect(mockSendDecision).toHaveBeenCalledTimes(1);
    expect(mockSendDecision).toHaveBeenCalledWith({ toEmail: 'coach@example.test', decision: 'approved', payUrl: 'https://emblem.example/builder?pay=1' });
  });

  it('declined: emails the buyer the decline notice', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, decision: 'declined' }, error: null });
    await post({ token: TOKEN, decision: 'declined' });
    expect(mockSendDecision.mock.calls[0][0]).toMatchObject({ toEmail: 'coach@example.test', decision: 'declined' });
  });

  it('falls back to the purchaser email only when no declaration is linked', async () => {
    declaration = null;
    await post({ token: TOKEN, decision: 'approved' });
    expect(mockSendDecision.mock.calls[0][0].toEmail).toBe('purchaser@example.test');
  });

  it('an invalid, expired or reused link never notifies anyone', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false }, error: null });
    const res = await post({ token: TOKEN, decision: 'approved' });
    expect(res.status).toBe(400);
    expect(mockSendDecision).not.toHaveBeenCalled();
    expect(tablesRead).toHaveLength(0);
  });

  it('a failed or throwing notification never changes the guardian’s successful response', async () => {
    mockSendDecision.mockResolvedValue({ ok: false });
    expect((await post({ token: TOKEN, decision: 'approved' })).status).toBe(200);
    mockSendDecision.mockRejectedValue(new Error('boom'));
    const res = await post({ token: TOKEN, decision: 'approved' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, decision: 'approved' });
  });

  it('the response to the guardian never includes the buyer’s address or the order', async () => {
    const res = await post({ token: TOKEN, decision: 'approved' });
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('coach@example.test');
    expect(text).not.toContain('order-1');
  });
});
