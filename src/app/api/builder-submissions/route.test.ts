import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const mockIssueBuilderSubmissionCapability = vi.fn();
vi.mock('@/lib/builder-submission-capability', () => ({
  BUILDER_SUBMISSION_COOKIE: 'emblem_builder_submission',
  issueBuilderSubmissionCapability: (...args: unknown[]) => mockIssueBuilderSubmissionCapability(...args),
}));

const mockConsumeAnonymousRequestRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockConsumeAnonymousRequestRateLimit(...args),
}));

import { POST } from './route';

const CSRF_TOKEN = randomBytes(32).toString('base64url');

/**
 * Builds a request with valid CSRF context by default — hasValidBuilderCsrf
 * is real, unmocked logic here. This endpoint issues the very cookie the
 * CSRF token is later checked against elsewhere, but the CSRF cookie itself
 * (src/middleware.ts's ensureBuilderCsrfCookie) is established even
 * earlier, on the entry page GET — so a legitimate call here always already
 * has it.
 */
function post(csrf: { origin?: string | null; cookie?: string | null; header?: string | null } = {}) {
  const origin = csrf.origin === undefined ? 'http://localhost' : csrf.origin;
  const cookieCsrf = csrf.cookie === undefined ? CSRF_TOKEN : csrf.cookie;
  const headerCsrf = csrf.header === undefined ? CSRF_TOKEN : csrf.header;
  return POST(new NextRequest('http://localhost/api/builder-submissions', {
    method: 'POST',
    headers: {
      ...(origin !== null ? { origin } : {}),
      ...(headerCsrf !== null ? { 'x-emblem-builder-csrf': headerCsrf } : {}),
      ...(cookieCsrf !== null ? { Cookie: `emblem_builder_csrf=${cookieCsrf}` } : {}),
    },
  }));
}

beforeEach(() => {
  mockIssueBuilderSubmissionCapability.mockReset();
  mockConsumeAnonymousRequestRateLimit.mockReset().mockResolvedValue(true);
});

describe('POST /api/builder-submissions — CSRF', () => {
  it('rejects a missing CSRF cookie before the rate limiter or issuance', async () => {
    const res = await post({ cookie: null });
    expect(res.status).toBe(403);
    expect(mockConsumeAnonymousRequestRateLimit).not.toHaveBeenCalled();
    expect(mockIssueBuilderSubmissionCapability).not.toHaveBeenCalled();
  });

  it('rejects a mismatched CSRF header/cookie pair', async () => {
    const res = await post({ header: randomBytes(32).toString('base64url') });
    expect(res.status).toBe(403);
  });

  it('rejects a malformed CSRF token', async () => {
    const res = await post({ cookie: 'short', header: 'short' });
    expect(res.status).toBe(403);
  });

  it('rejects a cross-site-style request (mismatched Origin)', async () => {
    const res = await post({ origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(mockIssueBuilderSubmissionCapability).not.toHaveBeenCalled();
  });
});

describe('POST /api/builder-submissions', () => {
  it('issues a capability and sets it as an httpOnly cookie, never in the JSON body', async () => {
    mockIssueBuilderSubmissionCapability.mockResolvedValue({
      submissionId: '11111111-1111-1111-1111-111111111111',
      token: 'raw-secret-token-value',
      expiresAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissionId).toBe('11111111-1111-1111-1111-111111111111');
    expect(JSON.stringify(body)).not.toContain('raw-secret-token-value');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('emblem_builder_submission=raw-secret-token-value');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=strict');
  });

  it('is rate-limited before issuing a capability, with a generic body and a Retry-After hint', async () => {
    mockConsumeAnonymousRequestRateLimit.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(429);
    expect(mockIssueBuilderSubmissionCapability).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ error: 'too many requests' });
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('fails closed with a generic error if issuance fails, never leaking the raw exception', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockIssueBuilderSubmissionCapability.mockRejectedValue(new Error('db connection string leaked-detail'));
    const res = await post();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).not.toContain('leaked-detail');
    errorSpy.mockRestore();
  });
});
