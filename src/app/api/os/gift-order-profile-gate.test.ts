import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Gift (non-guardian) orders: every path that can create a child's first
 * guardian link — card claim code, purchaser recovery (self and handoff),
 * guardian invite redemption — asks checkGiftFirstGuardianClaim before any
 * write, and a refusal (or failed read) writes nothing. The decision logic
 * itself is covered in src/lib/gift-order-guardian.test.ts; this file pins
 * the wiring in each route. Supabase is mocked at the module boundary, same
 * convention as the other route tests.
 */
const mockGiftCheck = vi.fn();
vi.mock('@/lib/gift-order-guardian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gift-order-guardian')>();
  return { ...actual, checkGiftFirstGuardianClaim: (...a: unknown[]) => mockGiftCheck(...a) };
});

const writes: Array<{ table: string; op: string; row?: unknown }> = [];
const USER = { id: 'user-1', email: 'grandparent@example.test', email_confirmed_at: '2026-11-08T00:00:00Z' };
const CARD = { id: 'card-1', status: 'assigned', player_id: 'player-1', access_status: null, order_id: 'order-1', orders: { purchaser_email: USER.email, payment_status: 'fulfilled' } };
const INVITE = { id: 'invite-1', used_at: null, expires_at: '2999-01-01T00:00:00Z', player_id: 'player-1' };

function table(name: string) {
  const single = name === 'cards' ? CARD : name === 'player_invites' ? INVITE : null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    neq: async () => ({ error: null }),
    is: () => chain,
    gt: async () => ({ count: 0 }),
    in: () => chain,
    not: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: single, error: null }),
    insert: async (row: unknown) => { writes.push({ table: name, op: 'insert', row }); return { error: null }; },
    upsert: async (row: unknown) => { writes.push({ table: name, op: 'upsert', row }); return { error: null }; },
    update: (row: unknown) => { writes.push({ table: name, op: 'update', row }); const r = { error: null, eq: () => r, neq: async () => ({ error: null }), in: async () => ({ error: null }), then: (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f) }; return r; },
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: USER } }) }, from: table }),
  createServiceRoleClient: () => ({ from: table }),
}));

const mockCreateGuardianInvite = vi.fn();
vi.mock('@/lib/create-guardian-invite', () => ({ createGuardianInvite: (...a: unknown[]) => mockCreateGuardianInvite(...a) }));
vi.mock('@/lib/rate-limit', () => ({ getRequestIdentifier: () => 'id', isWithinRateLimit: async () => true, logClaimAttempt: async () => {} }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: async () => {} }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: async () => {} }));
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: async () => [] }));
vi.mock('@/lib/card-lookup', () => ({ resolveCardCode: async () => ({ status: 'not_found' }) }));

import { POST as claimPOST } from './claim/route';
import { POST as recoverPOST } from './recover/route';
import { POST as redeemPOST } from './invites/redeem/route';
import { GIFT_PROFILE_REFUSED_MESSAGE } from '@/lib/gift-order-guardian';

const json = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const guardianLinks = () => writes.filter((w) => w.table === 'guardians');

beforeEach(() => {
  writes.length = 0;
  mockGiftCheck.mockReset();
  mockCreateGuardianInvite.mockReset().mockResolvedValue({ ok: true, code: 'X', reused: false });
});

const routes: Array<[string, () => Promise<Response>]> = [
  ['card claim code', () => claimPOST(json('http://localhost/api/os/claim', { claimToken: 'ABCD-EFGH' }))],
  ['recover self', () => recoverPOST(json('http://localhost/api/os/recover', { cardId: 'card-1', decision: 'self' }))],
  ['recover handoff', () => recoverPOST(json('http://localhost/api/os/recover', { cardId: 'card-1', decision: 'handoff', handoffEmail: 'other@example.test' }))],
  ['guardian invite redeem', () => redeemPOST(json('http://localhost/api/os/invites/redeem', { inviteCode: 'ABCD-EFGH' }))],
];

describe.each(routes)('%s — gift order gate', (_label, call) => {
  it('refused: 403 with the one fixed message, and no guardian link, profile, invite or card write', async () => {
    mockGiftCheck.mockResolvedValue({ outcome: 'refused' });
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(GIFT_PROFILE_REFUSED_MESSAGE);
    expect(writes).toHaveLength(0);
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
  });

  it('a failed check fails closed: 500 and no writes', async () => {
    mockGiftCheck.mockResolvedValue({ outcome: 'failed' });
    const res = await call();
    expect(res.status).toBe(500);
    expect(writes).toHaveLength(0);
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
  });

  it('is asked about the right child and the signed-in account', async () => {
    mockGiftCheck.mockResolvedValue({ outcome: 'refused' });
    await call();
    expect(mockGiftCheck).toHaveBeenCalledWith(expect.anything(), 'player-1', USER);
  });
});

describe('non-gift and allowed outcomes carry on exactly as before', () => {
  it.each([['not_gift'], ['allowed']])('%s: card claim links the guardian', async (outcome) => {
    mockGiftCheck.mockResolvedValue({ outcome });
    const res = await claimPOST(json('http://localhost/api/os/claim', { claimToken: 'ABCD-EFGH' }));
    expect(res.status).toBe(200);
    expect(guardianLinks()).toHaveLength(1);
  });

  it.each([['not_gift'], ['allowed']])('%s: invite redemption links the guardian', async (outcome) => {
    mockGiftCheck.mockResolvedValue({ outcome });
    const res = await redeemPOST(json('http://localhost/api/os/invites/redeem', { inviteCode: 'ABCD-EFGH' }));
    expect(res.status).toBe(200);
    expect(guardianLinks()).toHaveLength(1);
  });

  it('not_gift: recover self links the purchaser as before', async () => {
    mockGiftCheck.mockResolvedValue({ outcome: 'not_gift' });
    const res = await recoverPOST(json('http://localhost/api/os/recover', { cardId: 'card-1', decision: 'self' }));
    expect(res.status).toBe(200);
    expect(guardianLinks()).toHaveLength(1);
  });

  it('not_gift: recover handoff still sends the invite as before', async () => {
    mockGiftCheck.mockResolvedValue({ outcome: 'not_gift' });
    const res = await recoverPOST(json('http://localhost/api/os/recover', { cardId: 'card-1', decision: 'handoff', handoffEmail: 'other@example.test' }));
    expect(res.status).toBe(200);
    expect(mockCreateGuardianInvite).toHaveBeenCalledTimes(1);
  });
});
