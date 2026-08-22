import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { POST } from './route';

/**
 * The one place this repo deviates from its usual "inject a fake function"
 * testing convention (see pricing-quote-controller.test.ts) — route.ts
 * wires createServiceRoleClient()/headObject() directly rather than
 * accepting them as parameters, since it's a Next.js route handler with a
 * fixed signature, not a plain function. Mocking the two modules it
 * imports is the only way to prove the *ordering* guarantee this test
 * exists for: asset verification must complete, and fail closed, before
 * the RPC is ever reached. src/lib/order-enquiry-validation.test.ts covers
 * every other branch of this route's logic without any mocking at all,
 * since that logic is pure and injectable.
 *
 * Vitest hoists vi.mock() factories above all imports and requires any
 * outer variable they close over to be named with a `mock` prefix — hence
 * mockRpc/mockHeadObject, not the more natural rpcMock/headObjectMock.
 *
 * mockRpc is a single dispatcher shared by every RPC this route now calls
 * (create_authoritative_order, begin/finish_builder_submission_finalising)
 * — it defaults the two finalising-state calls to a "normal, fresh
 * transition" shape so every pre-existing test (which only ever configured
 * the order-creation RPC) keeps working unchanged, and routes
 * create_authoritative_order itself to mockCreateAuthoritativeOrder, which
 * tests configure directly exactly as they configured mockRpc before.
 */
const mockCreateAuthoritativeOrder = vi.fn();
const mockBeginFinalising = vi.fn();
const mockFinishFinalising = vi.fn();
const mockRpc = vi.fn((fn: string, params: unknown) => {
  if (fn === 'create_authoritative_order') return mockCreateAuthoritativeOrder(params);
  if (fn === 'begin_builder_submission_finalising') return mockBeginFinalising(params);
  if (fn === 'finish_builder_submission_finalising') return mockFinishFinalising(params);
  throw new Error(`unexpected rpc call in test: ${fn}`);
});
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}));

const mockHeadObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  headObject: (key: string) => mockHeadObject(key),
}));

const SUBMISSION_KEY = '11111111-2222-4333-8444-555555555555';
const PREFIX = `order-assets/${SUBMISSION_KEY}/`;
const PRINT_PREFIX = `print-files/${SUBMISSION_KEY}/`;

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    contact: { name: 'Jamie Parent', email: 'jamie@example.test' },
    submissionKey: SUBMISSION_KEY,
    players: [
      {
        id: 'p1',
        name: 'Alex Player',
        position: 'ST',
        kitNo: '9',
        prints: 1,
        club: 'Sunday League FC',
        photo: { storageKey: `${PREFIX}p1.jpg` },
      },
    ],
    printFiles: [{ playerId: 'p1', playerName: 'Alex Player', key: `${PRINT_PREFIX}card/p1.pdf` }],
    ...overrides,
  };
}

const CSRF_TOKEN = randomBytes(32).toString('base64url');

/**
 * Valid CSRF context by default — hasValidBuilderCsrf is real, unmocked
 * logic here. Pass `csrf` overrides to prove each failure mode.
 */
function post(body: unknown, csrf: { origin?: string | null; cookie?: string | null; header?: string | null } = {}) {
  const origin = csrf.origin === undefined ? 'http://localhost' : csrf.origin;
  const cookieCsrf = csrf.cookie === undefined ? CSRF_TOKEN : csrf.cookie;
  const headerCsrf = csrf.header === undefined ? CSRF_TOKEN : csrf.header;
  return POST(
    new NextRequest('http://localhost/api/order-enquiry', {
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

function mockValidAssets() {
  mockHeadObject.mockImplementation(async (key: string) => key.startsWith('print-files/')
    ? { exists: true, contentType: 'application/pdf', contentLength: 1_500_000 }
    : { exists: true, contentType: 'image/jpeg', contentLength: 500_000 });
}

beforeEach(() => {
  mockRpc.mockClear();
  mockCreateAuthoritativeOrder.mockReset();
  mockBeginFinalising.mockReset().mockResolvedValue({ data: 'finalising', error: null });
  mockFinishFinalising.mockReset().mockResolvedValue({ data: null, error: null });
  mockHeadObject.mockReset();
  mockValidAssets();
});

describe('POST /api/order-enquiry — CSRF', () => {
  it('rejects a missing CSRF cookie before body validation, asset verification or order creation', async () => {
    const res = await post(validBody(), { cookie: null });
    expect(res.status).toBe(403);
    expect(mockHeadObject).not.toHaveBeenCalled();
    expect(mockCreateAuthoritativeOrder).not.toHaveBeenCalled();
  });

  it('rejects a mismatched CSRF header/cookie pair', async () => {
    const res = await post(validBody(), { header: randomBytes(32).toString('base64url') });
    expect(res.status).toBe(403);
  });

  it('rejects a malformed CSRF token', async () => {
    const res = await post(validBody(), { cookie: 'short', header: 'short' });
    expect(res.status).toBe(403);
  });

  it('rejects a cross-site-style request (mismatched Origin)', async () => {
    const res = await post(validBody(), { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(mockCreateAuthoritativeOrder).not.toHaveBeenCalled();
  });

  it('valid CSRF plus a valid request succeeds', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    const res = await post(validBody());
    expect(res.status).toBe(200);
  });
});

describe('POST /api/order-enquiry — asset verification precedes the RPC', () => {
  it('never calls the RPC when a referenced photo does not exist in S3', async () => {
    mockHeadObject.mockResolvedValue({ exists: false });
    const res = await post(validBody());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/could not be found/i);
    expect(mockCreateAuthoritativeOrder).not.toHaveBeenCalled();
  });

  it('never calls the RPC when the object exists but is an unsafe/unexpected content type', async () => {
    mockHeadObject.mockResolvedValue({ exists: true, contentType: 'application/x-msdownload' });
    const res = await post(validBody());
    expect(res.status).toBe(400);
    expect(mockCreateAuthoritativeOrder).not.toHaveBeenCalled();
  });

  it('never calls the RPC when the S3 check itself throws, and never leaks the raw error', async () => {
    mockHeadObject.mockRejectedValue(new Error('AccessDenied: arn:aws:iam::123456789012:role/secret-role'));
    const res = await post(validBody());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain('arn:aws');
    expect(body.error).not.toContain('AccessDenied');
    expect(mockCreateAuthoritativeOrder).not.toHaveBeenCalled();
  });

  it('calls the RPC only after every referenced photo is confirmed to exist and be a valid image', async () => {
    mockHeadObject.mockImplementation(async (key: string) => key.startsWith('print-files/')
      ? { exists: true, contentType: 'application/pdf', contentLength: 1_500_000 }
      : { exists: true, contentType: 'image/jpeg', contentLength: 500_000 });
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    const res = await post(validBody());
    expect(res.status).toBe(200);
    expect(mockCreateAuthoritativeOrder).toHaveBeenCalledTimes(1);
    expect(mockHeadObject).toHaveBeenCalledWith(`${PREFIX}p1.jpg`);
  });

  it('checks the coach photo key too when a coach card is present', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    const players = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      prints: 1,
      club: 'Sunday League FC',
      photo: { storageKey: `${PREFIX}p${i + 1}.jpg` },
    }));
    const printFiles = players.map((player) => ({ playerId: player.id, playerName: player.name, key: `${PRINT_PREFIX}card/${player.id}.pdf` }));
    await post(
      validBody({
        players,
        printFiles,
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: `${PREFIX}coach.jpg` },
      }),
    );
    expect(mockHeadObject).toHaveBeenCalledWith(`${PREFIX}coach.jpg`);
  });
});

describe('POST /api/order-enquiry — RPC result mapping', () => {
  it('passes verified badge and print keys unchanged while stripping the signed badge preview URL', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    const badgeStorageKey = `${PREFIX}p1-badge.png`;
    const body = validBody();
    const player = (body.players as Array<Record<string, unknown>>)[0];
    player.badgeStorageKey = badgeStorageKey;
    player.badgeUrl = 'https://signed.example/expires-in-seven-days';

    const res = await post(body);
    expect(res.status).toBe(200);
    const params = mockCreateAuthoritativeOrder.mock.calls[0][0];
    expect(params.p_players[0]).toMatchObject({ badgeStorageKey, badgeUrl: null, badgeSnapshotUrl: null });
    expect(params.p_print_files).toEqual(body.printFiles);
    expect(JSON.stringify(params)).not.toContain('signed.example');
    expect(mockHeadObject).toHaveBeenCalledWith(badgeStorageKey);
    expect(mockHeadObject).toHaveBeenCalledWith(`${PRINT_PREFIX}card/p1.pdf`);
  });

  it('maps a "reused with different content" RPC error to 409', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: null, error: { message: 'submission_key reused with different content' } });
    const res = await post(validBody());
    expect(res.status).toBe(409);
  });

  it('returns created:false and the existing orderId on an idempotent retry', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: false }, error: null });
    const res = await post(validBody());
    const body = await res.json();
    expect(body.created).toBe(false);
    expect(body.orderId).toBe('order-1');
  });

  it('never leaks a raw database error message', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: null, error: { message: 'relation "public.orders" violates constraint orders_pricing_snapshot_arithmetic' } });
    const res = await post(validBody());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain('orders_pricing_snapshot_arithmetic');
  });
});

describe('POST /api/order-enquiry — capability finalisation', () => {
  it('begins the finalising transition before create_authoritative_order is ever called', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    await post(validBody());
    expect(mockBeginFinalising).toHaveBeenCalledWith({ p_id: SUBMISSION_KEY });
    expect(mockBeginFinalising.mock.invocationCallOrder[0]).toBeLessThan(mockCreateAuthoritativeOrder.mock.invocationCallOrder[0]);
  });

  it('rejects before ever touching S3 or the database when the capability is revoked/expired/unknown', async () => {
    mockBeginFinalising.mockResolvedValue({ data: 'revoked', error: null });
    const res = await post(validBody());
    expect(res.status).toBe(409);
    expect(mockHeadObject).not.toHaveBeenCalled();
    expect(mockCreateAuthoritativeOrder).not.toHaveBeenCalled();
  });

  it('still proceeds to the RPC when the capability is already "submitted" (idempotent replay)', async () => {
    mockValidAssets();
    mockBeginFinalising.mockResolvedValue({ data: 'submitted', error: null });
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: false }, error: null });
    const res = await post(validBody());
    expect(res.status).toBe(200);
    expect(mockCreateAuthoritativeOrder).toHaveBeenCalledTimes(1);
  });

  it('finishes the transition to "submitted" once the order is genuinely created', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    const res = await post(validBody());
    expect(res.status).toBe(200);
    expect(mockFinishFinalising).toHaveBeenCalledWith({ p_id: SUBMISSION_KEY, p_success: true });
  });

  it('releases the capability back to "active" (not left permanently stuck) when order creation fails', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: null, error: { message: 'some transient failure' } });
    await post(validBody());
    expect(mockFinishFinalising).toHaveBeenCalledWith({ p_id: SUBMISSION_KEY, p_success: false });
  });

  it('does not call finish at all when the replay was already "submitted" (nothing to release or re-complete)', async () => {
    mockValidAssets();
    mockBeginFinalising.mockResolvedValue({ data: 'submitted', error: null });
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: false }, error: null });
    await post(validBody());
    expect(mockFinishFinalising).not.toHaveBeenCalled();
  });

  it('a finish-transition failure is logged but never blocks the customer-facing order confirmation', async () => {
    mockValidAssets();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateAuthoritativeOrder.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    mockFinishFinalising.mockResolvedValue({ data: null, error: { message: 'db blip' } });
    const res = await post(validBody());
    expect(res.status).toBe(200);
    errorSpy.mockRestore();
  });
});

describe('POST /api/order-enquiry — retry stability end to end', () => {
  it('an identical retry (same submissionKey, same stable asset keys) sends the RPC identical params both times', async () => {
    mockValidAssets();
    mockCreateAuthoritativeOrder.mockResolvedValueOnce({ data: null, error: { message: 'simulated transient failure' } });
    mockCreateAuthoritativeOrder.mockResolvedValueOnce({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });

    const body = validBody();
    await post(body); // first attempt — fails
    await post(body); // retry — identical body, as a real retry with stable cached asset keys would send

    expect(mockCreateAuthoritativeOrder).toHaveBeenCalledTimes(2);
    const firstParams = mockCreateAuthoritativeOrder.mock.calls[0][0];
    const secondParams = mockCreateAuthoritativeOrder.mock.calls[1][0];
    // p_order_ref is intentionally excluded — it's a fresh, timestamp-
    // derived client suggestion on every attempt (real or test), which the
    // RPC ignores on an idempotent retry in favour of the original order's
    // own stored order_ref. It is deliberately NOT part of the fingerprint
    // (see order-enquiry-validation.ts) for exactly this reason.
    const omitOrderRef = (params: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'p_order_ref'));
    expect(omitOrderRef(secondParams)).toEqual(omitOrderRef(firstParams));
    expect(secondParams.p_request_fingerprint).toBe(firstParams.p_request_fingerprint);
  });
});
