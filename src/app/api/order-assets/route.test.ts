import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { POST } from './route';

const mockUploadObject = vi.fn();
const mockGetSignedDownloadUrl = vi.fn();
const mockCopyObject = vi.fn();
const mockDeleteObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
  getSignedDownloadUrl: (...args: unknown[]) => mockGetSignedDownloadUrl(...args),
  copyObject: (...args: unknown[]) => mockCopyObject(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}));

const mockVerifyBuilderSubmissionCapability = vi.fn();
const mockReserveBuilder = vi.fn();
const mockReleaseBuilder = vi.fn();
const mockFinishBuilder = vi.fn();
vi.mock('@/lib/builder-submission-capability', () => ({
  BUILDER_SUBMISSION_COOKIE: 'emblem_builder_submission',
  verifyBuilderSubmissionCapability: (...args: unknown[]) => mockVerifyBuilderSubmissionCapability(...args),
  reserveBuilderSubmissionAssetSlot: (...args: unknown[]) => mockReserveBuilder(...args),
  releaseBuilderSubmissionAssetSlot: (...args: unknown[]) => mockReleaseBuilder(...args),
  finishBuilderSubmissionAssetReservation: (...args: unknown[]) => mockFinishBuilder(...args),
}));

const mockReserveSquad = vi.fn();
const mockReleaseSquad = vi.fn();
const mockFinishSquad = vi.fn();
vi.mock('@/lib/squad-invite-participation-assets', () => ({
  reserveSquadInviteParticipationAssetSlot: (...args: unknown[]) => mockReserveSquad(...args),
  releaseSquadInviteParticipationAssetSlot: (...args: unknown[]) => mockReleaseSquad(...args),
  finishSquadInviteParticipationAssetReservation: (...args: unknown[]) => mockFinishSquad(...args),
}));

const mockConsumeAnonymousRequestRateLimit = vi.fn();
vi.mock('@/lib/anonymous-request-rate-limit', () => ({
  consumeAnonymousRequestRateLimit: (...args: unknown[]) => mockConsumeAnonymousRequestRateLimit(...args),
}));

let cookieStore: Record<string, string> = {};
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore[name] !== undefined ? { value: cookieStore[name] } : undefined),
  }),
}));

const FAKE_SUBMISSION_ID = '11111111-1111-1111-1111-111111111111';
const FAKE_PARTICIPATION_ID = '22222222-2222-2222-2222-222222222222';
const FAKE_KEY = `order-assets/${FAKE_SUBMISSION_ID}/child:photo`;
const DEFAULT_RESERVATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Minimal genuine magic bytes — enough for sniffImageMimeType, not a fully
// valid decodable image (this route never decodes/renders the file).
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const NOT_AN_IMAGE_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

function makeFile(bytes: Uint8Array, name = 'photo.jpg', type = 'image/jpeg') {
  return new File([bytes.slice().buffer], name, { type });
}

/** Matches the route's own tempKey derivation exactly — `${finalKey}.pending-${reservationId}`. */
function tempKeyFor(finalKey: string, reservationId: string) {
  return `${finalKey}.pending-${reservationId}`;
}

const CSRF_TOKEN = randomBytes(32).toString('base64url');

/**
 * Builds a request with valid CSRF context by default (same-origin,
 * matching double-submit cookie/header) — hasValidBuilderCsrf is real,
 * unmocked logic here. Pass `csrf` overrides to prove each failure mode.
 */
function postForm(
  fields: Record<string, string | Blob>,
  csrf: { origin?: string | null; cookie?: string | null; header?: string | null } = {},
  extraHeaders: Record<string, string> = {},
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const origin = csrf.origin === undefined ? 'http://localhost' : csrf.origin;
  const cookieCsrf = csrf.cookie === undefined ? CSRF_TOKEN : csrf.cookie;
  const headerCsrf = csrf.header === undefined ? CSRF_TOKEN : csrf.header;
  return POST(new NextRequest('http://localhost/api/order-assets', {
    method: 'POST',
    headers: {
      ...(origin !== null ? { origin } : {}),
      ...(headerCsrf !== null ? { 'x-emblem-builder-csrf': headerCsrf } : {}),
      ...(cookieCsrf !== null ? { Cookie: `emblem_builder_csrf=${cookieCsrf}` } : {}),
      ...extraHeaders,
    },
    body: form,
  }));
}

function asBuilder() {
  cookieStore['emblem_builder_submission'] = 'some-token';
  mockVerifyBuilderSubmissionCapability.mockResolvedValue(FAKE_SUBMISSION_ID);
}

function asSquadInvite() {
  cookieStore['emblem_squad_builder'] = 'some-squad-token';
}

beforeEach(() => {
  cookieStore = {};
  mockUploadObject.mockReset().mockResolvedValue(FAKE_KEY);
  mockGetSignedDownloadUrl.mockReset().mockResolvedValue('https://example.invalid/signed');
  mockCopyObject.mockReset().mockResolvedValue(undefined);
  mockDeleteObject.mockReset().mockResolvedValue(undefined);
  mockVerifyBuilderSubmissionCapability.mockReset();
  mockReserveBuilder.mockReset().mockResolvedValue({ ok: true, previousBytes: null, reservationId: DEFAULT_RESERVATION_ID });
  mockReleaseBuilder.mockReset().mockResolvedValue(true);
  mockFinishBuilder.mockReset().mockResolvedValue(true);
  mockReserveSquad.mockReset().mockResolvedValue({ ok: true, previousBytes: null, reservationId: DEFAULT_RESERVATION_ID });
  mockReleaseSquad.mockReset().mockResolvedValue(true);
  mockFinishSquad.mockReset().mockResolvedValue(true);
  mockConsumeAnonymousRequestRateLimit.mockReset().mockResolvedValue(true);
});

describe('POST /api/order-assets — CSRF', () => {
  it('rejects a missing CSRF cookie, before form parsing or capability verification', async () => {
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' }, { cookie: null });
    expect(res.status).toBe(403);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects a mismatched CSRF header/cookie pair', async () => {
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' }, { header: randomBytes(32).toString('base64url') });
    expect(res.status).toBe(403);
  });

  it('rejects a malformed CSRF token', async () => {
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' }, { cookie: 'short', header: 'short' });
    expect(res.status).toBe(403);
  });

  it('rejects a cross-site-style request (mismatched Origin) even with a matching token pair', async () => {
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
  });

  it('valid CSRF plus a valid capability succeeds', async () => {
    asBuilder();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/order-assets — capability-verified uploads (ordinary builder)', () => {
  it('rejects an anonymous call with no capability cookie of any kind', async () => {
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(401);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects a well-formed but invalid/expired/revoked builder-submission capability', async () => {
    cookieStore['emblem_builder_submission'] = 'some-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(null);
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(401);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects a valid capability whose bound id does not match the claimed orderId (cross-submission use)', async () => {
    asBuilder();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: 'some-other-submission-id', playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(401);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('accepts a valid capability whose id matches: uploads to a reservation-specific temporary key, then promotes it onto the deterministic final slot key', async () => {
    asBuilder();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    const finalKey = `order-assets/${FAKE_SUBMISSION_ID}/child:photo`;
    const uploadedKey = mockUploadObject.mock.calls[0][0] as string;
    expect(uploadedKey).toBe(tempKeyFor(finalKey, DEFAULT_RESERVATION_ID));
    expect(mockCopyObject).toHaveBeenCalledWith(uploadedKey, finalKey);
    expect(mockDeleteObject).toHaveBeenCalledWith(uploadedKey);
    const body = await res.json();
    expect(body.key).toBe(finalKey);
  });

  it('reserves capacity BEFORE uploading, keyed to the stable player+kind slot', async () => {
    asBuilder();
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'p7', kind: 'badge' });
    expect(mockReserveBuilder).toHaveBeenCalledWith(FAKE_SUBMISSION_ID, 'p7:badge', JPEG_BYTES.length);
    const reserveOrder = mockReserveBuilder.mock.invocationCallOrder[0];
    const uploadOrder = mockUploadObject.mock.invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(uploadOrder);
  });

  it('rejects once the reservation itself is refused (aggregate ceiling reached), without ever uploading', async () => {
    asBuilder();
    mockReserveBuilder.mockResolvedValue({ ok: false, previousBytes: null, reservationId: null });
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(413);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    asBuilder();
    const res = await postForm({ orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(400);
  });

  it('rejects a disallowed declared MIME type before ever checking the capability', async () => {
    const res = await postForm({ file: makeFile(NOT_AN_IMAGE_BYTES, 'x.txt', 'text/plain'), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(400);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
  });

  it('rejects content whose magic bytes do not match its declared MIME type', async () => {
    asBuilder();
    const res = await postForm({ file: makeFile(PNG_BYTES, 'photo.jpg', 'image/jpeg'), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(400);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('accepts content whose magic bytes genuinely match its declared MIME type', async () => {
    asBuilder();
    const res = await postForm({ file: makeFile(PNG_BYTES, 'photo.png', 'image/png'), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
  });

  it('cannot be used to select an arbitrary S3 key via a crafted playerId/kind', async () => {
    asBuilder();
    const res = await postForm({
      file: makeFile(JPEG_BYTES),
      orderId: FAKE_SUBMISSION_ID,
      playerId: '../../../etc/passwd',
      kind: '../../evil',
    });
    expect(res.status).toBe(200);
    const key = mockUploadObject.mock.calls[0][0] as string;
    expect(key).not.toContain('..');
    expect(key.startsWith(`order-assets/${FAKE_SUBMISSION_ID}/`)).toBe(true);
    const finalKey = mockCopyObject.mock.calls[0][1] as string;
    expect(finalKey).not.toContain('..');
    expect(finalKey.startsWith(`order-assets/${FAKE_SUBMISSION_ID}/`)).toBe(true);
  });

  it('enforces the rate limiter, keyed to the verified namespace, before storage access', async () => {
    asBuilder();
    mockConsumeAnonymousRequestRateLimit.mockResolvedValue(false);
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(429);
    expect(mockUploadObject).not.toHaveBeenCalled();
    expect(mockConsumeAnonymousRequestRateLimit).toHaveBeenCalledWith(expect.anything(), 'order-asset-upload', FAKE_SUBMISSION_ID);
  });

  it('requests a short-lived signed URL for the FINAL key, not the previous 7-day default', async () => {
    asBuilder();
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith(`order-assets/${FAKE_SUBMISSION_ID}/child:photo`, 60 * 15);
  });
});

describe('POST /api/order-assets — Squad Invite isolation', () => {
  it('rejects when the reservation refuses (wrong builder-token hash, wrong participation, or not started)', async () => {
    asSquadInvite();
    mockReserveSquad.mockResolvedValue({ ok: false, previousBytes: null, reservationId: null });
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(413);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('accepts a genuine Squad Invite upload and reserves/finishes via the participation-scoped functions, never the builder ones', async () => {
    asSquadInvite();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    expect(mockReserveSquad).toHaveBeenCalledWith(FAKE_PARTICIPATION_ID, expect.any(String), 'child:photo', JPEG_BYTES.length);
    expect(mockFinishSquad).toHaveBeenCalledWith(FAKE_PARTICIPATION_ID, 'child:photo', DEFAULT_RESERVATION_ID);
    expect(mockReserveBuilder).not.toHaveBeenCalled();
    expect(mockFinishBuilder).not.toHaveBeenCalled();
  });

  it('Parent A cannot use Parent B\'s allowance — a different claimed participation id is passed through untouched to the ownership check, never silently substituted', async () => {
    asSquadInvite();
    const parentBId = '33333333-3333-3333-3333-333333333333';
    await postForm({ file: makeFile(JPEG_BYTES), orderId: parentBId, playerId: 'child', kind: 'photo' });
    expect(mockReserveSquad).toHaveBeenCalledWith(parentBId, expect.any(String), 'child:photo', JPEG_BYTES.length);
  });

  it('an invalid orderId (not a UUID) is never passed to the reservation at all — falls through to unauthenticated', async () => {
    asSquadInvite();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: 'not-a-uuid', playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(401);
    expect(mockReserveSquad).not.toHaveBeenCalled();
  });

  it('cannot escape its server-controlled namespace via a crafted playerId/kind', async () => {
    asSquadInvite();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: '../evil', kind: '../evil' });
    expect(res.status).toBe(200);
    const key = mockUploadObject.mock.calls[0][0] as string;
    expect(key).not.toContain('..');
    expect(key.startsWith(`order-assets/${FAKE_PARTICIPATION_ID}/`)).toBe(true);
  });

  it('a stale/mismatched builder-submission cookie left over from an earlier, unrelated ordinary-builder visit does not block a concurrent, genuinely valid Squad Invite upload in the same browser', async () => {
    // The real bug this reproduces: both cookies present, the builder one
    // invalid (expired/revoked) — the request must still succeed via the
    // squad-invite path rather than failing closed on the unrelated cookie.
    cookieStore['emblem_builder_submission'] = 'stale-token';
    mockVerifyBuilderSubmissionCapability.mockResolvedValue(null);
    asSquadInvite();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    expect(mockReserveSquad).toHaveBeenCalledWith(FAKE_PARTICIPATION_ID, expect.any(String), 'child:photo', JPEG_BYTES.length);
  });

  it('a builder-submission cookie bound to a DIFFERENT order than the one claimed here does not block a concurrent, genuinely valid Squad Invite upload in the same browser', async () => {
    asBuilder(); // verified, but bound to FAKE_SUBMISSION_ID, not this participation
    asSquadInvite();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    expect(mockReserveSquad).toHaveBeenCalledWith(FAKE_PARTICIPATION_ID, expect.any(String), 'child:photo', JPEG_BYTES.length);
    expect(mockReserveBuilder).not.toHaveBeenCalled();
  });
});

describe('POST /api/order-assets — per-file size and request-body limits', () => {
  it('rejects a file over the per-file size ceiling (MAX_ASSET_BYTES) before ever checking the capability', async () => {
    const big = new Uint8Array(18 * 1024 * 1024 + 1);
    big.set(JPEG_BYTES);
    const res = await postForm({ file: makeFile(big), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(413);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
  });

  it('accepts a legitimate high-resolution asset exactly at the per-file ceiling', async () => {
    asBuilder();
    const atCeiling = new Uint8Array(18 * 1024 * 1024);
    atCeiling.set(JPEG_BYTES);
    const res = await postForm({ file: makeFile(atCeiling), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
  });

  it('accepts a file one byte under the per-file ceiling', async () => {
    asBuilder();
    const underCeiling = new Uint8Array(18 * 1024 * 1024 - 1);
    underCeiling.set(JPEG_BYTES);
    const res = await postForm({ file: makeFile(underCeiling), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
  });

  it('rejects a file exactly one byte over the per-file ceiling', async () => {
    const overCeiling = new Uint8Array(18 * 1024 * 1024 + 1);
    overCeiling.set(JPEG_BYTES);
    const res = await postForm({ file: makeFile(overCeiling), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(413);
  });

  it('rejects an oversized request body via content-length before ever parsing the multipart form', async () => {
    const res = await postForm(
      { file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' },
      {},
      { 'content-length': String(25 * 1024 * 1024) },
    );
    expect(res.status).toBe(413);
    expect(mockVerifyBuilderSubmissionCapability).not.toHaveBeenCalled();
  });
});

describe('POST /api/order-assets — failure reconciliation', () => {
  it('releases the reservation (by reservationId, never a byte count) when the temp-key S3 write fails, so a failed write never permanently consumes capacity', async () => {
    asBuilder();
    mockReserveBuilder.mockResolvedValue({ ok: true, previousBytes: 555, reservationId: 'res-fail-1' });
    mockUploadObject.mockRejectedValue(new Error('S3 unavailable'));
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(500);
    expect(mockReleaseBuilder).toHaveBeenCalledWith(FAKE_SUBMISSION_ID, 'child:photo', 'res-fail-1', 555);
    expect(mockFinishBuilder).not.toHaveBeenCalled(); // never got far enough to check currency
    expect(mockCopyObject).not.toHaveBeenCalled();
  });

  it('does not release anything when the upload, finish and promotion all succeed', async () => {
    asBuilder();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    expect(mockReleaseBuilder).not.toHaveBeenCalled();
  });

  it('releases the Squad Invite reservation on S3 failure via the participation-scoped release function, by reservationId', async () => {
    asSquadInvite();
    mockReserveSquad.mockResolvedValue({ ok: true, previousBytes: null, reservationId: 'res-fail-squad' });
    mockUploadObject.mockRejectedValue(new Error('S3 unavailable'));
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(mockReleaseSquad).toHaveBeenCalledWith(FAKE_PARTICIPATION_ID, 'child:photo', 'res-fail-squad', null);
    expect(mockReleaseBuilder).not.toHaveBeenCalled();
  });

  it('retrying after a failed upload (fresh reservation) works safely', async () => {
    asBuilder();
    mockUploadObject.mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce(FAKE_KEY);
    const first = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(first.status).toBe(500);
    const second = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(second.status).toBe(200);
    expect(mockReserveBuilder).toHaveBeenCalledTimes(2);
  });

  it('logs only a fixed route label and a safe category when storage is not configured — never the raw message', async () => {
    asBuilder();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadObject.mockRejectedValue(new Error('AWS_S3_BUCKET is not set'));
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Production asset storage is not configured');
    expect(errorSpy.mock.calls[0].join(' ')).toBe('order-assets:upload storage_not_configured');
    errorSpy.mockRestore();
  });

  it('never leaks a raw provider exception message to the client on any other failure', async () => {
    asBuilder();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadObject.mockRejectedValue(new Error('S3 rejected object for zztest-guardian@example.invalid key=order-assets/secret'));
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not upload order asset');
    const logged = errorSpy.mock.calls[0].join(' ');
    expect(logged).toBe('order-assets:upload upload_failed');
    expect(logged).not.toContain('zztest-guardian@example.invalid');
    errorSpy.mockRestore();
  });

  it('no signed URL, token, reservationId, or file content ever appears in a log call', async () => {
    asBuilder();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadObject.mockRejectedValue(new Error('boom'));
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    for (const call of errorSpy.mock.calls) {
      const joined = call.join(' ');
      expect(joined).not.toContain('some-token');
      expect(joined).not.toContain('https://example.invalid/signed');
      expect(joined).not.toContain(DEFAULT_RESERVATION_ID);
    }
    errorSpy.mockRestore();
  });

  it('if the S3 promotion (copyObject) fails after a successful temp upload, the reservation is released and the request fails — the ledger must never claim success for an object that was never actually promoted', async () => {
    asBuilder();
    mockReserveBuilder.mockResolvedValue({ ok: true, previousBytes: null, reservationId: 'res-promote-fail' });
    mockCopyObject.mockRejectedValue(new Error('S3 copy failed'));
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(500);
    expect(mockReleaseBuilder).toHaveBeenCalledWith(FAKE_SUBMISSION_ID, 'child:photo', 'res-promote-fail', null);
  });
});

describe('POST /api/order-assets — replacement accounting (delegated to the reserve function, verified end-to-end)', () => {
  it('a same-slot replacement passes the new size through and the reservation function reports the previous size for accounting', async () => {
    asBuilder();
    mockReserveBuilder.mockResolvedValue({ ok: true, previousBytes: JPEG_BYTES.length, reservationId: DEFAULT_RESERVATION_ID });
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    expect(mockReserveBuilder).toHaveBeenCalledWith(FAKE_SUBMISSION_ID, 'child:photo', JPEG_BYTES.length);
  });

  it('a new filename cannot evade stable-slot accounting — the slot key is derived from playerId+kind, never the uploaded filename, and both attempts promote to the SAME final key', async () => {
    asBuilder();
    await postForm({ file: makeFile(JPEG_BYTES, 'first-name.jpg'), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    await postForm({ file: makeFile(JPEG_BYTES, 'completely-different-name.jpg'), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(mockReserveBuilder.mock.calls[0][1]).toBe('child:photo');
    expect(mockReserveBuilder.mock.calls[1][1]).toBe('child:photo');
    const firstFinalKey = mockCopyObject.mock.calls[0][1];
    const secondFinalKey = mockCopyObject.mock.calls[1][1];
    expect(firstFinalKey).toBe(secondFinalKey); // same promoted-to S3 object both times
  });

  it('replacement cannot cross submissions — a different verified namespace always produces a different slot key/S3 key prefix', async () => {
    asBuilder();
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    const firstKey = mockCopyObject.mock.calls[0][1] as string;

    mockVerifyBuilderSubmissionCapability.mockResolvedValue('99999999-9999-9999-9999-999999999999');
    await postForm({ file: makeFile(JPEG_BYTES), orderId: '99999999-9999-9999-9999-999999999999', playerId: 'child', kind: 'photo' });
    const secondKey = mockCopyObject.mock.calls[1][1] as string;

    expect(firstKey).not.toBe(secondKey);
  });

  it('replacing with a larger asset passes only the new (larger) size to reserve — the delta computation is the database\'s job, never doubled up client-side', async () => {
    asBuilder();
    const small = new Uint8Array(1000); small.set(JPEG_BYTES);
    const larger = new Uint8Array(2_000_000); larger.set(JPEG_BYTES);
    await postForm({ file: makeFile(small), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    mockReserveBuilder.mockResolvedValue({ ok: true, previousBytes: 1000, reservationId: DEFAULT_RESERVATION_ID });
    await postForm({ file: makeFile(larger), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(mockReserveBuilder.mock.calls[1]).toEqual([FAKE_SUBMISSION_ID, 'child:photo', 2_000_000]);
  });

  it('replacing with a smaller asset likewise passes only the new (smaller) size — reserve reconciles the reduction', async () => {
    asBuilder();
    const large = new Uint8Array(2_000_000); large.set(JPEG_BYTES);
    const smaller = new Uint8Array(500); smaller.set(JPEG_BYTES);
    await postForm({ file: makeFile(large), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    mockReserveBuilder.mockResolvedValue({ ok: true, previousBytes: 2_000_000, reservationId: DEFAULT_RESERVATION_ID });
    await postForm({ file: makeFile(smaller), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(mockReserveBuilder.mock.calls[1]).toEqual([FAKE_SUBMISSION_ID, 'child:photo', 500]);
  });

  it('repeated replacement of the same slot never accumulates more than one reservation call worth of new data per request — every attempt promotes to the SAME final S3 object', async () => {
    asBuilder();
    for (let i = 0; i < 5; i += 1) {
      await postForm({ file: makeFile(JPEG_BYTES, `attempt-${i}.jpg`), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    }
    expect(mockReserveBuilder).toHaveBeenCalledTimes(5);
    const distinctKeys = new Set(mockReserveBuilder.mock.calls.map((c) => c[1]));
    expect(distinctKeys.size).toBe(1); // every attempt reserved the SAME slot
    const distinctFinalKeys = new Set(mockCopyObject.mock.calls.map((c) => c[1]));
    expect(distinctFinalKeys.size).toBe(1); // every attempt promoted to the SAME final S3 object
  });
});

describe('POST /api/order-assets — reservation-versioning: same-slot concurrent replacement safety', () => {
  it('when a reservation is no longer current (finish reports false), the route does NOT promote, cleans up only the orphaned temp object, and returns a safe 409 — never touching release', async () => {
    asBuilder();
    mockReserveBuilder.mockResolvedValue({ ok: true, previousBytes: null, reservationId: 'res-A-stale' });
    mockFinishBuilder.mockResolvedValue(false); // a newer reservation (e.g. "B") already won
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(409);
    expect(mockCopyObject).not.toHaveBeenCalled(); // never promoted a stale/superseded upload
    expect(mockReleaseBuilder).not.toHaveBeenCalled(); // nothing to release — the row no longer belongs to this reservation
    const tempKey = mockUploadObject.mock.calls[0][0] as string;
    expect(mockDeleteObject).toHaveBeenCalledWith(tempKey); // orphaned temp object still cleaned up
  });

  it('a current reservation (finish reports true) is promoted: copyObject runs BEFORE the temp object is deleted', async () => {
    asBuilder();
    const callOrder: string[] = [];
    mockCopyObject.mockImplementation(async () => { callOrder.push('copy'); });
    mockDeleteObject.mockImplementation(async () => { callOrder.push('delete'); });
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    expect(callOrder).toEqual(['copy', 'delete']);
  });

  it('finish is called with the SAME reservationId that reserve returned, per slot', async () => {
    asBuilder();
    mockReserveBuilder.mockResolvedValue({ ok: true, previousBytes: null, reservationId: 'res-xyz-123' });
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(mockFinishBuilder).toHaveBeenCalledWith(FAKE_SUBMISSION_ID, 'child:photo', 'res-xyz-123');
  });

  it('two reservations for the same slot (A then B) each get independent, distinct temp keys — A never writes to B\'s temp object or vice versa', async () => {
    asBuilder();
    mockReserveBuilder.mockResolvedValueOnce({ ok: true, previousBytes: null, reservationId: 'res-A' });
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    mockReserveBuilder.mockResolvedValueOnce({ ok: true, previousBytes: JPEG_BYTES.length, reservationId: 'res-B' });
    await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    const tempKeyA = mockUploadObject.mock.calls[0][0] as string;
    const tempKeyB = mockUploadObject.mock.calls[1][0] as string;
    expect(tempKeyA).not.toBe(tempKeyB);
    expect(tempKeyA).toContain('res-A');
    expect(tempKeyB).toContain('res-B');
  });

  it('the exact specified attack sequence: A reserves, B reserves for the same slot, B is current and finishes/promotes, A later finishes and is told it is stale — A never promotes, never releases, and the route returns 409 for A without any 500', async () => {
    asBuilder();
    // Simulate A's request: its own finish() call reports stale because B has since become current.
    mockReserveBuilder.mockResolvedValueOnce({ ok: true, previousBytes: null, reservationId: 'res-A' });
    mockFinishBuilder.mockResolvedValueOnce(false); // A's finish check: no longer current
    const resA = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(resA.status).toBe(409);
    expect(mockCopyObject).not.toHaveBeenCalled();
    expect(mockReleaseBuilder).not.toHaveBeenCalled();

    // Simulate B's own, separate request: its finish() call reports current, and it promotes normally.
    mockReserveBuilder.mockResolvedValueOnce({ ok: true, previousBytes: null, reservationId: 'res-B' });
    mockFinishBuilder.mockResolvedValueOnce(true);
    const resB = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(resB.status).toBe(200);
    expect(mockCopyObject).toHaveBeenCalledTimes(1);
    expect(mockCopyObject.mock.calls[0][0]).toContain('res-B');
  });

  it('Squad Invite: a stale (superseded) reservation is handled identically — 409, no promotion, no release, temp object cleaned up', async () => {
    asSquadInvite();
    mockReserveSquad.mockResolvedValue({ ok: true, previousBytes: null, reservationId: 'res-squad-stale' });
    mockFinishSquad.mockResolvedValue(false);
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(409);
    expect(mockCopyObject).not.toHaveBeenCalled();
    expect(mockReleaseSquad).not.toHaveBeenCalled();
    const tempKey = mockUploadObject.mock.calls[0][0] as string;
    expect(mockDeleteObject).toHaveBeenCalledWith(tempKey);
  });
});

describe('POST /api/order-assets — concurrency (design-level: no in-memory state, one reservation call per request)', () => {
  it('two "concurrent" requests for the same slot each make their own independent, atomic reservation call — nothing is cached or batched in the route itself', async () => {
    asBuilder();
    const [a, b] = await Promise.all([
      postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' }),
      postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Each request independently called the atomic, database-backed
    // reservation function — the route holds no shared counter of its own
    // that two concurrent requests could race on (that guarantee lives in
    // migration 0068's SELECT ... FOR UPDATE locking, verified by the
    // migration-0068-contract test, not in this process's memory).
    expect(mockReserveBuilder).toHaveBeenCalledTimes(2);
  });

  it('when the second of two concurrent requests would exceed the ceiling, the reservation call (not client-side state) is what rejects it', async () => {
    asBuilder();
    mockReserveBuilder
      .mockResolvedValueOnce({ ok: true, previousBytes: null, reservationId: 'res-conc-1' })
      .mockResolvedValueOnce({ ok: false, previousBytes: null, reservationId: null });
    const [a, b] = await Promise.all([
      postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'p1', kind: 'photo' }),
      postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'p2', kind: 'photo' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 413]);
  });

  it('concurrent requests for DIFFERENT slots both succeed independently, each with its own reservationId and temp key', async () => {
    asBuilder();
    mockReserveBuilder
      .mockResolvedValueOnce({ ok: true, previousBytes: null, reservationId: 'res-p1' })
      .mockResolvedValueOnce({ ok: true, previousBytes: null, reservationId: 'res-p2' });
    const [a, b] = await Promise.all([
      postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'p1', kind: 'photo' }),
      postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'p2', kind: 'photo' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const finalKeys = mockCopyObject.mock.calls.map((c) => c[1]);
    expect(new Set(finalKeys).size).toBe(2);
  });
});

describe('POST /api/order-assets — legitimate journeys stay within the new limits', () => {
  it('a one-player order (photo + badge) succeeds', async () => {
    asBuilder();
    const photoRes = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'p1', kind: 'photo' });
    const badgeRes = await postForm({ file: makeFile(PNG_BYTES, 'badge.png', 'image/png'), orderId: FAKE_SUBMISSION_ID, playerId: 'p1', kind: 'badge' });
    expect(photoRes.status).toBe(200);
    expect(badgeRes.status).toBe(200);
  });

  it('a representative multi-player order (several players, each photo + badge, plus a coach photo) succeeds end to end', async () => {
    asBuilder();
    const results: number[] = [];
    for (let i = 1; i <= 5; i += 1) {
      results.push((await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: `p${i}`, kind: 'photo' })).status);
      results.push((await postForm({ file: makeFile(PNG_BYTES, 'badge.png', 'image/png'), orderId: FAKE_SUBMISSION_ID, playerId: `p${i}`, kind: 'badge' })).status);
    }
    results.push((await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_SUBMISSION_ID, playerId: 'coach-1', kind: 'photo' })).status);
    expect(results.every((s) => s === 200)).toBe(true);
    expect(mockReserveBuilder).toHaveBeenCalledTimes(11); // 5 x (photo + badge) + 1 coach photo
  });

  it('a normal Squad Invite parent upload (one child photo) succeeds', async () => {
    asSquadInvite();
    const res = await postForm({ file: makeFile(JPEG_BYTES), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
  });

  it('a high-resolution source photo exactly at the approved per-file ceiling succeeds for both flows', async () => {
    const atCeiling = new Uint8Array(18 * 1024 * 1024);
    atCeiling.set(JPEG_BYTES);

    asBuilder();
    const builderRes = await postForm({ file: makeFile(atCeiling), orderId: FAKE_SUBMISSION_ID, playerId: 'child', kind: 'photo' });
    expect(builderRes.status).toBe(200);

    cookieStore = {};
    asSquadInvite();
    const squadRes = await postForm({ file: makeFile(atCeiling), orderId: FAKE_PARTICIPATION_ID, playerId: 'child', kind: 'photo' });
    expect(squadRes.status).toBe(200);
  });
});
