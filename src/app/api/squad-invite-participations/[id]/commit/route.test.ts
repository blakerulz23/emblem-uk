import { readFileSync } from 'fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { hashBuilderToken } from '@/lib/squad-invite';
import { POST } from './route';

/**
 * The route now delegates persistence entirely to the
 * commit_squad_invite_participation_order RPC (migration 0055) — so this
 * test focuses on what the ROUTE itself is responsible for: authenticating
 * the guardian, computing the builder-token hash server-side from the
 * httpOnly cookie (never trusting one from the request body), validating
 * declarations/body shape, verifying the photo exists in S3, and forwarding
 * exactly the right params to the RPC. The RPC's own ownership/idempotency/
 * eligibility logic is covered by migration-0055-contract.test.ts's
 * source-text assertions against the SQL itself (no real Postgres is
 * available in this test environment — same limitation as every other RPC
 * in this repo).
 */
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const mockCookieGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: mockCookieGet }),
}));

const mockHeadObject = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  headObject: (...args: unknown[]) => mockHeadObject(...args),
}));

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const BUILDER_TOKEN = randomBytes(32).toString('base64url');
const GUARDIAN_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PARTICIPATION_ID = 'p-1';

const VALID_ACCEPTED = {
  child_information_authority: true,
  photograph_manufacture: true,
  consolidated_delivery: true,
  payment_neutral_commitment: true,
};

const VALID_BODY = {
  templateId: 'hollinwood-classic',
  displayFirstName: 'Test',
  displaySurnameInitial: 'p',
  squadNumber: 9,
  position: 'ST',
  printQuantity: 1,
  photo: { storageKey: 'order-assets/p-1/child/123-photo.jpg', storageUrl: 'https://example.test/photo.jpg', contentType: 'image/jpeg', crop: { x: 0, y: 0, scale: 1 }, bgRemoved: true },
  stats: { apps: '', goals: '', assists: '' },
  accepted: VALID_ACCEPTED,
};

function commit(body: Record<string, unknown>) {
  return POST(
    new NextRequest(`http://localhost/api/squad-invite-participations/${PARTICIPATION_ID}/commit`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-emblem-csrf': CSRF_TOKEN,
        Cookie: `emblem_squad_csrf=${CSRF_TOKEN}`,
      },
      body: JSON.stringify(body),
    }),
    { params: { id: PARTICIPATION_ID } }
  );
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockCookieGet.mockReset();
  mockHeadObject.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN_ID, email: 'guardian@example.test' } } });
  mockCookieGet.mockReturnValue({ value: BUILDER_TOKEN });
  mockHeadObject.mockResolvedValue({ exists: true });
  mockRpc.mockResolvedValue({ data: { created: true, orderId: 'order-1', cardId: 'card-1', participationId: PARTICIPATION_ID }, error: null });
});

describe('POST /api/squad-invite-participations/[id]/commit — RPC boundary', () => {
  it('computes the builder-token hash server-side from the httpOnly cookie and never accepts one from the request body', async () => {
    await commit({ ...VALID_BODY, builderTokenHash: 'attacker-supplied-hash-should-be-ignored' });
    expect(mockRpc).toHaveBeenCalledWith('commit_squad_invite_participation_order', expect.objectContaining({
      p_builder_token_hash: hashBuilderToken(BUILDER_TOKEN),
    }));
    const call = mockRpc.mock.calls[0][1] as Record<string, unknown>;
    expect(call.p_builder_token_hash).not.toBe('attacker-supplied-hash-should-be-ignored');
  });

  it('never logs or returns the raw builder token or its hash', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await commit(VALID_BODY);
    const body = await res.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(BUILDER_TOKEN);
    expect(raw).not.toContain(hashBuilderToken(BUILDER_TOKEN));
    expect(errorSpy.mock.calls.join(' ')).not.toContain(BUILDER_TOKEN);
    errorSpy.mockRestore();
  });

  it('passes the authenticated guardian id — never a client-supplied one — as p_guardian_profile_id', async () => {
    await commit({ ...VALID_BODY, guardianProfileId: 'someone-elses-id' });
    expect(mockRpc).toHaveBeenCalledWith('commit_squad_invite_participation_order', expect.objectContaining({ p_guardian_profile_id: GUARDIAN_ID }));
  });

  it('requires sign-in and never calls the RPC when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await commit(VALID_BODY);
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires every declaration accepted separately, rejecting before the RPC is ever called', async () => {
    const res = await commit({ ...VALID_BODY, accepted: { ...VALID_ACCEPTED, payment_neutral_commitment: false } });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires a photo storage key and verifies it exists in S3 before calling the RPC', async () => {
    const res = await commit({ ...VALID_BODY, photo: undefined });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects when the referenced photo does not actually exist in S3 — a forged/stale key never reaches the RPC', async () => {
    mockHeadObject.mockResolvedValue({ exists: false });
    const res = await commit(VALID_BODY);
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('records one synthetic card commitment and returns the created order', async () => {
    const res = await commit(VALID_BODY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: 'commitment_completed', paymentTaken: false, created: true, orderId: 'order-1' });
  });

  it('passes through an idempotent retry (created:false) from the RPC unchanged', async () => {
    mockRpc.mockResolvedValue({ data: { created: false, orderId: 'order-1', cardId: 'card-1', participationId: PARTICIPATION_ID }, error: null });
    const res = await commit(VALID_BODY);
    const body = await res.json();
    expect(body.created).toBe(false);
    expect(body.orderId).toBe('order-1');
  });

  it('never claims payment was taken, regardless of RPC result', async () => {
    const res = await commit(VALID_BODY);
    const body = await res.json();
    expect(body.paymentTaken).toBe(false);
  });

  it('surfaces an RPC-level rejection (e.g. guardian isolation or campaign ineligibility) as a generic 409, without leaking database detail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: 'participation unavailable' } });
    const res = await commit(VALID_BODY);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'Commitment unavailable' });
    errorSpy.mockRestore();
  });
});

describe('POST /api/squad-invite-participations/[id]/commit — early preview email ownership', () => {
  // The email used to send from this route at commit time — before staff
  // had reviewed anything, which produced a claim link that couldn't
  // actually be opened (resolveCardCode requires the order's
  // payment_status to already be 'fulfilled', which only staff approval
  // sets). It now sends from the approve route instead
  // (src/app/api/orders/[id]/approve/route.ts's approveSquadInviteOrder).
  // A dynamic mock here would only prove this test's fixtures don't
  // happen to trigger a send — it wouldn't catch someone re-adding the
  // import. Reading the route's own source text does.
  it('no longer imports or references the early preview email module', () => {
    const source = readFileSync('src/app/api/squad-invite-participations/[id]/commit/route.ts', 'utf8');
    expect(source).not.toContain('send-squad-invite-early-preview-email');
    expect(source).not.toContain('sendSquadInviteEarlyPreviewEmail');
  });
});
