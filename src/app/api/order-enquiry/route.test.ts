import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
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
 */
const mockRpc = vi.fn();
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

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/order-enquiry', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockValidAssets() {
  mockHeadObject.mockImplementation(async (key: string) => key.startsWith('print-files/')
    ? { exists: true, contentType: 'application/pdf', contentLength: 1_500_000 }
    : { exists: true, contentType: 'image/jpeg', contentLength: 500_000 });
}

beforeEach(() => {
  mockRpc.mockReset();
  mockHeadObject.mockReset();
  mockValidAssets();
});

describe('POST /api/order-enquiry — asset verification precedes the RPC', () => {
  it('never calls the RPC when a referenced photo does not exist in S3', async () => {
    mockHeadObject.mockResolvedValue({ exists: false });
    const res = await post(validBody());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/could not be found/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never calls the RPC when the object exists but is an unsafe/unexpected content type', async () => {
    mockHeadObject.mockResolvedValue({ exists: true, contentType: 'application/x-msdownload' });
    const res = await post(validBody());
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never calls the RPC when the S3 check itself throws, and never leaks the raw error', async () => {
    mockHeadObject.mockRejectedValue(new Error('AccessDenied: arn:aws:iam::123456789012:role/secret-role'));
    const res = await post(validBody());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain('arn:aws');
    expect(body.error).not.toContain('AccessDenied');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls the RPC only after every referenced photo is confirmed to exist and be a valid image', async () => {
    mockHeadObject.mockImplementation(async (key: string) => key.startsWith('print-files/')
      ? { exists: true, contentType: 'application/pdf', contentLength: 1_500_000 }
      : { exists: true, contentType: 'image/jpeg', contentLength: 500_000 });
    mockRpc.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    const res = await post(validBody());
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockHeadObject).toHaveBeenCalledWith(`${PREFIX}p1.jpg`);
  });

  it('checks the coach photo key too when a coach card is present', async () => {
    mockValidAssets();
    mockRpc.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
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
    mockRpc.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });
    const badgeStorageKey = `${PREFIX}p1-badge.png`;
    const body = validBody();
    const player = (body.players as Array<Record<string, unknown>>)[0];
    player.badgeStorageKey = badgeStorageKey;
    player.badgeUrl = 'https://signed.example/expires-in-seven-days';

    const res = await post(body);
    expect(res.status).toBe(200);
    const params = mockRpc.mock.calls[0][1];
    expect(params.p_players[0]).toMatchObject({ badgeStorageKey, badgeUrl: null, badgeSnapshotUrl: null });
    expect(params.p_print_files).toEqual(body.printFiles);
    expect(JSON.stringify(params)).not.toContain('signed.example');
    expect(mockHeadObject).toHaveBeenCalledWith(badgeStorageKey);
    expect(mockHeadObject).toHaveBeenCalledWith(`${PRINT_PREFIX}card/p1.pdf`);
  });

  it('maps a "reused with different content" RPC error to 409', async () => {
    mockValidAssets();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'submission_key reused with different content' } });
    const res = await post(validBody());
    expect(res.status).toBe(409);
  });

  it('returns created:false and the existing orderId on an idempotent retry', async () => {
    mockValidAssets();
    mockRpc.mockResolvedValue({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: false }, error: null });
    const res = await post(validBody());
    const body = await res.json();
    expect(body.created).toBe(false);
    expect(body.orderId).toBe('order-1');
  });

  it('never leaks a raw database error message', async () => {
    mockValidAssets();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation "public.orders" violates constraint orders_pricing_snapshot_arithmetic' } });
    const res = await post(validBody());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain('orders_pricing_snapshot_arithmetic');
  });
});

describe('POST /api/order-enquiry — retry stability end to end', () => {
  it('an identical retry (same submissionKey, same stable asset keys) sends the RPC identical params both times', async () => {
    mockValidAssets();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'simulated transient failure' } });
    mockRpc.mockResolvedValueOnce({ data: { orderId: 'order-1', orderRef: 'emblem-abc', created: true }, error: null });

    const body = validBody();
    await post(body); // first attempt — fails
    await post(body); // retry — identical body, as a real retry with stable cached asset keys would send

    expect(mockRpc).toHaveBeenCalledTimes(2);
    const firstParams = mockRpc.mock.calls[0][1];
    const secondParams = mockRpc.mock.calls[1][1];
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
