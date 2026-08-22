import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const mockBuildPdf = vi.fn();
vi.mock('@/lib/pdf-generator', () => ({
  buildPdf: (...args: unknown[]) => mockBuildPdf(...args),
}));

const mockUploadPdf = vi.fn();
const mockGetSignedDownloadUrl = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  uploadPdf: (...args: unknown[]) => mockUploadPdf(...args),
  getSignedDownloadUrl: (...args: unknown[]) => mockGetSignedDownloadUrl(...args),
}));

const mockConsumeAnonymousRequestRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockConsumeAnonymousRequestRateLimit(...args),
}));

const mockVerifyBuilderSubmissionCapability = vi.fn();
vi.mock('@/lib/builder-submission-capability', () => ({
  BUILDER_SUBMISSION_COOKIE: 'emblem_builder_submission',
  verifyBuilderSubmissionCapability: (...args: unknown[]) => mockVerifyBuilderSubmissionCapability(...args),
}));

let cookieStore: Record<string, string> = {};
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore[name] !== undefined ? { value: cookieStore[name] } : undefined),
  }),
}));

import { POST } from './route';

const FAKE_SUBMISSION_ID = '11111111-1111-1111-1111-111111111111';
const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const CSRF_TOKEN = randomBytes(32).toString('base64url');

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    product: 'card',
    frontImageDataUrl: TINY_PNG_DATA_URL,
    ...overrides,
  };
}

/**
 * Builds a request with valid CSRF context by default (same-origin,
 * matching double-submit cookie/header) — hasValidBuilderCsrf is real,
 * unmocked logic here, exercised genuinely rather than stubbed out.
 * Individual CSRF tests below override origin/csrfCookie/csrfHeader to
 * prove each failure mode.
 */
function post(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  csrf: { origin?: string | null; cookie?: string | null; header?: string | null } = {},
) {
  const origin = csrf.origin === undefined ? 'http://localhost' : csrf.origin;
  const cookieCsrf = csrf.cookie === undefined ? CSRF_TOKEN : csrf.cookie;
  const headerCsrf = csrf.header === undefined ? CSRF_TOKEN : csrf.header;
  const cookieHeader = [
    cookieCsrf !== null ? `emblem_builder_csrf=${cookieCsrf}` : null,
  ].filter(Boolean).join('; ');
  return new NextRequest('http://localhost/api/render-print', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin !== null ? { origin } : {}),
      ...(headerCsrf !== null ? { 'x-emblem-builder-csrf': headerCsrf } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  cookieStore = {};
  mockBuildPdf.mockReset().mockResolvedValue(Buffer.from('fake-pdf-bytes'));
  mockUploadPdf.mockReset().mockResolvedValue(undefined);
  mockGetSignedDownloadUrl.mockReset().mockResolvedValue('https://example.invalid/signed');
  mockConsumeAnonymousRequestRateLimit.mockReset().mockResolvedValue(true);
  mockVerifyBuilderSubmissionCapability.mockReset();
  process.env = { ...ORIGINAL_ENV, AWS_S3_BUCKET: 'zztest-bucket' };
});

describe('POST /api/render-print — CSRF', () => {
  it('rejects a missing CSRF cookie, before capability verification', async () => {
    const res = await POST(post(validBody(), {}, { cookie: null }));
    expect(res.status).toBe(403);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('rejects a mismatched CSRF header/cookie pair', async () => {
    const res = await POST(post(validBody(), {}, { header: randomBytes(32).toString('base64url') }));
    expect(res.status).toBe(403);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
  });

  it('rejects a malformed (wrong-length) CSRF token', async () => {
    const res = await POST(post(validBody(), {}, { cookie: 'short', header: 'short' }));
    expect(res.status).toBe(403);
  });

  it('rejects a cross-site-style request (mismatched Origin) even with a matching token pair', async () => {
    const res = await POST(post(validBody(), {}, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
  });

  it('returns a uniform generic error for every CSRF failure mode', async () => {
    const missing = await POST(post(validBody(), {}, { cookie: null }));
    const mismatched = await POST(post(validBody(), {}, { header: randomBytes(32).toString('base64url') }));
    const crossSite = await POST(post(validBody(), {}, { origin: 'https://evil.example' }));
    const [a, b, c] = await Promise.all([missing.json(), mismatched.json(), crossSite.json()]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(missing.status).toBe(mismatched.status);
    expect(mismatched.status).toBe(crossSite.status);
  });

  it('valid CSRF plus a valid capability succeeds', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    const res = await POST(post(validBody()));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/render-print — capability-verified generation', () => {
  it('rejects a call with no capability cookie at all', async () => {
    const res = await POST(post(validBody()));
    expect(res.status).toBe(401);
    expect(mockBuildPdf).not.toHaveBeenCalled();
    expect(mockVerifyBuilderSubmissionCapability).toHaveBeenCalledWith(undefined);
  });

  it('rejects a browser-invented cookie value that does not verify (no matching hash)', async () => {
    cookieStore['emblem_builder_submission'] = 'a-value-the-browser-just-made-up';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(null);
    const res = await POST(post(validBody()));
    expect(res.status).toBe(401);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('rejects an expired or revoked capability identically to a missing one (uniform failure)', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(null);
    const res = await POST(post(validBody()));
    expect(res.status).toBe(401);
    const noCookieRes = await POST(post(validBody()));
    expect(noCookieRes.status).toBe(res.status);
    const [bodyA, bodyB] = await Promise.all([res.json(), noCookieRes.json()]);
    expect(bodyA).toEqual(bodyB);
  });

  it('a client-supplied submissionKey in the body is ignored — the S3 key is derived only from the verified capability', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    const res = await POST(post(validBody({ submissionKey: 'attacker-chosen-namespace' })));
    expect(res.status).toBe(200);
    const key = mockUploadPdf.mock.calls[0][0] as string;
    expect(key).toContain(`print-files/${FAKE_SUBMISSION_ID}/`);
    expect(key).not.toContain('attacker-chosen-namespace');
  });

  it('succeeds end-to-end with a valid, server-verified capability', async () => {
    cookieStore['emblem_builder_submission'] = 'a-real-server-issued-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    const res = await POST(post(validBody({ meta: { playerName: 'Caden Isaacs', orderRef: 'ORDER-1' } })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.key).toMatch(new RegExp(`^print-files/${FAKE_SUBMISSION_ID}/card/[0-9a-f-]+\\.pdf$`));
    expect(mockVerifyBuilderSubmissionCapability).toHaveBeenCalledWith('a-real-server-issued-token');
  });

  it('rejects an unrecognised product', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    const res = await POST(post(validBody({ product: 'nonexistent' })));
    expect(res.status).toBe(400);
    expect(mockBuildPdf).not.toHaveBeenCalled();
    // Schema validation happens before capability verification is even reached.
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
  });

  it('rejects a frontImageDataUrl that is not a well-formed image data URL', async () => {
    const res = await POST(post(validBody({ frontImageDataUrl: 'not-a-data-url' })));
    expect(res.status).toBe(400);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('rejects an oversized frontImageDataUrl before ever calling buildPdf', async () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(25_000_000);
    const res = await POST(post(validBody({ frontImageDataUrl: huge })));
    expect(res.status).toBe(400);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('rejects a request whose declared content-length exceeds the payload ceiling', async () => {
    const res = await POST(post(validBody(), { 'content-length': String(60_000_000) }));
    expect(res.status).toBe(413);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('rejects an unrecognised meta field', async () => {
    const res = await POST(post(validBody({ meta: { playerName: 'X', evil: 'payload' } })));
    expect(res.status).toBe(400);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('enforces the rate limiter, keyed to the verified capability, before PDF generation', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    mockConsumeAnonymousRequestRateLimit.mockResolvedValue(false);
    const res = await POST(post(validBody()));
    expect(res.status).toBe(429);
    expect(mockBuildPdf).not.toHaveBeenCalled();
    expect(mockConsumeAnonymousRequestRateLimit).toHaveBeenCalledWith(expect.anything(), 'render-print', FAKE_SUBMISSION_ID);
  });

  it('a new arbitrary cookie value cannot bypass the rate limit — verification, not the raw value, gates every attempt', async () => {
    cookieStore['emblem_builder_submission'] = 'token-one';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    mockConsumeAnonymousRequestRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const first = await POST(post(validBody()));
    expect(first.status).toBe(200);
    cookieStore['emblem_builder_submission'] = 'token-two-invented-by-attacker';
    // Even a DIFFERENT raw cookie value resolves to the SAME verified
    // submissionId here (simulating the same underlying capability), so
    // the rate limiter's subject bucket still applies.
    const second = await POST(post(validBody()));
    expect(second.status).toBe(429);
  });

  it('requests a short-lived signed URL, not the 7-day default', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    const res = await POST(post(validBody()));
    expect(res.status).toBe(200);
    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith(expect.any(String), 60 * 15);
  });

  it('fails closed with a generic 503 when S3 is not configured, without calling buildPdf', async () => {
    delete process.env.AWS_S3_BUCKET;
    const res = await POST(post(validBody()));
    expect(res.status).toBe(503);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('returns a generic error and never leaks the raw exception message on failure', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockBuildPdf.mockRejectedValue(new Error('leaky internal detail: /etc/secret-path'));
    const res = await POST(post(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('render failed');
    expect(body.error).not.toContain('leaky internal detail');
    errorSpy.mockRestore();
  });
});
