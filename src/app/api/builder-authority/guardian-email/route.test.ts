import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}));

const mockConsumeAnonymousRequestRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockConsumeAnonymousRequestRateLimit(...args),
}));

const mockSendBuilderGuardianApprovalEmail = vi.fn();
vi.mock('@/lib/send-builder-guardian-approval-email', () => ({
  sendBuilderGuardianApprovalEmail: (...args: unknown[]) => mockSendBuilderGuardianApprovalEmail(...args),
}));

import { POST } from './route';

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const ORDER_ID = '11111111-2222-4333-8444-555555555555';

/** Real hasValidBuilderCsrf logic, exercised genuinely — same pattern as render-print/route.test.ts. */
function post(body: unknown, csrf: { origin?: string | null; cookie?: string | null; header?: string | null } = {}) {
  const origin = csrf.origin === undefined ? 'http://localhost' : csrf.origin;
  const cookieCsrf = csrf.cookie === undefined ? CSRF_TOKEN : csrf.cookie;
  const headerCsrf = csrf.header === undefined ? CSRF_TOKEN : csrf.header;
  return POST(
    new NextRequest('http://localhost/api/builder-authority/guardian-email', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(origin !== null ? { origin } : {}),
        ...(headerCsrf !== null ? { 'x-emblem-builder-csrf': headerCsrf } : {}),
        ...(cookieCsrf !== null ? { Cookie: `emblem_builder_csrf=${cookieCsrf}` } : {}),
      },
    }),
  );
}

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: { ok: true, requestId: 'req-1' }, error: null });
  mockConsumeAnonymousRequestRateLimit.mockReset().mockResolvedValue(true);
  mockSendBuilderGuardianApprovalEmail.mockReset().mockResolvedValue({ ok: true });
});

describe('POST /api/builder-authority/guardian-email', () => {
  it('rejects a missing/mismatched CSRF token before doing anything else', async () => {
    const res = await post({ orderId: ORDER_ID, guardianEmail: 'guardian@example.test' }, { cookie: null });
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSendBuilderGuardianApprovalEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed orderId', async () => {
    const res = await post({ orderId: 'not-a-uuid', guardianEmail: 'guardian@example.test' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid guardian email', async () => {
    const res = await post({ orderId: ORDER_ID, guardianEmail: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('is rate limited before the RPC or email send', async () => {
    mockConsumeAnonymousRequestRateLimit.mockResolvedValue(false);
    const res = await post({ orderId: ORDER_ID, guardianEmail: 'guardian@example.test' });
    expect(res.status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never sends the raw token to the RPC — only its 64-char hex hash', async () => {
    await post({ orderId: ORDER_ID, guardianEmail: 'guardian@example.test' });
    expect(mockRpc).toHaveBeenCalledWith(
      'create_builder_guardian_approval_request',
      expect.objectContaining({
        p_order_id: ORDER_ID,
        p_guardian_email: 'guardian@example.test',
        p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('sends the approval email with a URL built from the raw (unhashed) token', async () => {
    await post({ orderId: ORDER_ID, guardianEmail: 'guardian@example.test' });
    expect(mockSendBuilderGuardianApprovalEmail).toHaveBeenCalledTimes(1);
    const call = mockSendBuilderGuardianApprovalEmail.mock.calls[0][0];
    expect(call.toEmail).toBe('guardian@example.test');
    expect(call.approveUrl).toMatch(/\/builder-approval\/[A-Za-z0-9_-]{32}$/);
    // The hash sent to the RPC must not be a substring of the raw token used in the email URL.
    const hashSent = mockRpc.mock.calls[0][1].p_token_hash as string;
    expect(call.approveUrl).not.toContain(hashSent);
  });

  it('returns 400 and never calls the email sender when the RPC itself errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'order is not awaiting guardian approval' } });
    const res = await post({ orderId: ORDER_ID, guardianEmail: 'guardian@example.test' });
    expect(res.status).toBe(400);
    expect(mockSendBuilderGuardianApprovalEmail).not.toHaveBeenCalled();
  });

  it('reports failure (not ok:true) when the DB row is created but the email fails to send', async () => {
    // The Postgres write and the email send are not atomic — a failed send
    // must never be reported to the client as success, even though the
    // approval-request row itself is already committed and valid.
    mockSendBuilderGuardianApprovalEmail.mockResolvedValue({ ok: false });
    const res = await post({ orderId: ORDER_ID, guardianEmail: 'guardian@example.test' });
    const body = await res.json();
    expect(res.status).not.toBe(200);
    expect(body.ok).not.toBe(true);
  });

  it('on success, reports ok:true', async () => {
    const res = await post({ orderId: ORDER_ID, guardianEmail: 'guardian@example.test' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
