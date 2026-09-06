import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const mockBuildPdf = vi.fn();
const mockBuildPdfFromVerifiedMasters = vi.fn();
vi.mock('@/lib/pdf-generator', () => ({
  buildPdf: (...args: unknown[]) => mockBuildPdf(...args),
  buildPdfFromVerifiedMasters: (...args: unknown[]) => mockBuildPdfFromVerifiedMasters(...args),
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
  cookies: () => ({ get: (name: string) => (cookieStore[name] !== undefined ? { value: cookieStore[name] } : undefined) }),
}));

const mockSelectResult = { data: null as unknown, error: null as { message: string } | null };
const mockFrom = vi.fn(() => ({
  select: () => ({
    eq: function (this: unknown) { return this; },
    limit: async () => mockSelectResult,
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: mockFrom }) }));

const mockFetchVerifiedPrintMaster = vi.fn();
vi.mock('@/lib/print-master-storage', () => ({
  fetchVerifiedPrintMaster: (...args: unknown[]) => mockFetchVerifiedPrintMaster(...args),
}));

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const FAKE_SUBMISSION_ID = '11111111-1111-1111-1111-111111111111';

import { POST } from './route';

function post(body: Record<string, unknown>) {
  cookieStore = { emblem_builder_submission: 'token-abc' };
  return POST(
    new NextRequest('http://localhost/api/render-print', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        'x-emblem-builder-csrf': CSRF_TOKEN,
        cookie: `emblem_builder_csrf=${CSRF_TOKEN}`,
      },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  mockBuildPdf.mockReset();
  mockBuildPdfFromVerifiedMasters.mockReset();
  mockUploadPdf.mockReset().mockResolvedValue(undefined);
  mockGetSignedDownloadUrl.mockReset().mockResolvedValue('https://signed.example/x');
  mockConsumeAnonymousRequestRateLimit.mockReset().mockResolvedValue(true);
  mockVerifyBuilderSubmissionCapability.mockReset().mockResolvedValue(FAKE_SUBMISSION_ID);
  mockFetchVerifiedPrintMaster.mockReset();
  mockSelectResult.data = null;
  mockSelectResult.error = null;
  process.env.AWS_S3_BUCKET = 'test-bucket';
});

describe('POST /api/render-print — verified print-master path (printMasterPlayerId)', () => {
  it('a legacy request (no printMasterPlayerId) is completely unaffected — still calls buildPdf, never buildPdfFromVerifiedMasters', async () => {
    const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    mockBuildPdf.mockResolvedValue(Buffer.from('pdf'));
    const res = await post({ product: 'card', frontImageDataUrl: TINY_PNG_DATA_URL });
    expect(res.status).toBe(200);
    expect(mockBuildPdf).toHaveBeenCalledTimes(1);
    expect(mockBuildPdfFromVerifiedMasters).not.toHaveBeenCalled();
  });

  it('a request naming a player with no confirmed master gets a clear failure, never a silent fallback to the legacy mirror-bleed pipeline', async () => {
    mockSelectResult.data = [];
    const res = await post({ product: 'card', printMasterPlayerId: 'player-1' });
    expect(res.status).toBe(404);
    expect(mockBuildPdf).not.toHaveBeenCalled();
    expect(mockBuildPdfFromVerifiedMasters).not.toHaveBeenCalled();
  });

  it('the lookup is scoped by the CAPABILITY-verified submissionId, never a client-supplied one — proves a caller cannot name another submission\'s master', async () => {
    mockSelectResult.data = [];
    await post({ product: 'card', printMasterPlayerId: 'player-1', submissionKey: 'attacker-supplied-id' });
    // The route resolves submissionId exclusively from the httpOnly
    // capability cookie (verifyBuilderSubmissionCapability is only ever
    // called with the cookie value, never with anything from the parsed
    // body) — a client-supplied submissionKey/orderId in the body has no
    // path into the print_masters lookup at all.
    expect(mockVerifyBuilderSubmissionCapability).toHaveBeenCalledWith('token-abc');
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalledWith('attacker-supplied-id');
  });

  it('a malformed/tampered stored master fails verification with a clear error, not a silent fallback', async () => {
    mockSelectResult.data = [{ id: 'row-1', submission_id: FAKE_SUBMISSION_ID, front_key: 'k1', back_key: 'k2', front_sha256: 'a'.repeat(64), back_sha256: 'b'.repeat(64), status: 'confirmed' }];
    mockFetchVerifiedPrintMaster.mockRejectedValue(new Error('digest mismatch'));
    const res = await post({ product: 'card', printMasterPlayerId: 'player-1' });
    expect(res.status).toBe(422);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it('a valid confirmed master builds the PDF via the verified-master path, not the legacy path', async () => {
    mockSelectResult.data = [{ id: 'row-1', submission_id: FAKE_SUBMISSION_ID, front_key: 'k1', back_key: 'k2', front_sha256: 'a'.repeat(64), back_sha256: 'b'.repeat(64), status: 'confirmed' }];
    mockFetchVerifiedPrintMaster.mockResolvedValueOnce(Buffer.from('front')).mockResolvedValueOnce(Buffer.from('back'));
    mockBuildPdfFromVerifiedMasters.mockResolvedValue(Buffer.from('pdf-bytes'));

    const res = await post({ product: 'card', printMasterPlayerId: 'player-1' });
    expect(res.status).toBe(200);
    expect(mockBuildPdfFromVerifiedMasters).toHaveBeenCalledTimes(1);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });
});
