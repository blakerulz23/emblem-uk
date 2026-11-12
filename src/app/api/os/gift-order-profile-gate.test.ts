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
// R4: make the post-redeem card lock write fail
let cardLockFails = false;
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
    // Awaited directly only by the one-card order count in recover self.
    then: (f: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 1, error: null }).then(f),
    maybeSingle: async () => ({ data: single, error: null }),
    insert: async (row: unknown) => { writes.push({ table: name, op: 'insert', row }); return { error: null }; },
    upsert: async (row: unknown) => { writes.push({ table: name, op: 'upsert', row }); return { error: null }; },
    update: (row: unknown) => { writes.push({ table: name, op: 'update', row }); const r = { error: null, eq: () => r, neq: async () => (name === 'cards' && cardLockFails ? { error: { message: 'boom', code: 'XX000' } } : { error: null }), in: async () => ({ error: null }), then: (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f) }; return r; },
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
// The relationship authorization checks (release/authorization-relationship-lockdown)
// run first and are pinned in their own route tests; here they allow, so this
// file isolates the gift gate. ensureProfileRole is the trusted role write.
const mockFirstGuardian = vi.fn();
const mockInviteRedemption = vi.fn();
vi.mock('@/lib/guardian-invite-eligibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/guardian-invite-eligibility')>();
  return {
    ...actual,
    redeemerMatchesInvitedEmail: () => true,
    checkFirstGuardianClaim: (...a: unknown[]) => mockFirstGuardian(...a),
    checkGuardianInviteRedemption: (...a: unknown[]) => mockInviteRedemption(...a),
  };
});
vi.mock('@/lib/relationship-writes', () => ({
  ensureProfileRole: async (_s: unknown, id: string, role: string) => { writes.push({ table: 'profiles', op: 'ensure_profile_role', row: { id, role } }); return { ok: true }; },
}));

import { POST as claimPOST } from './claim/route';
import { POST as recoverPOST } from './recover/route';
import { POST as redeemPOST } from './invites/redeem/route';
import { GIFT_PROFILE_REFUSED_MESSAGE } from '@/lib/gift-order-guardian';

const json = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const guardianLinks = () => writes.filter((w) => w.table === 'guardians');

beforeEach(() => {
  writes.length = 0;
  cardLockFails = false;
  mockGiftCheck.mockReset();
  mockFirstGuardian.mockReset().mockResolvedValue({ outcome: 'eligible' });
  mockInviteRedemption.mockReset().mockResolvedValue({ outcome: 'eligible', authority: 'order' });
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
    expect(mockGiftCheck.mock.calls[0].slice(0, 3)).toEqual([expect.anything(), 'player-1', USER]);
  });
});

describe('R4: the gift check on card claim codes survives a failed card lock', () => {
  it('the card claim route asks the gift check to apply even when the child already has a guardian', async () => {
    mockGiftCheck.mockResolvedValue({ outcome: 'refused' });
    await claimPOST(json('http://localhost/api/os/claim', { claimToken: 'ABCD-EFGH' }));
    expect(mockGiftCheck).toHaveBeenCalledWith(expect.anything(), 'player-1', USER, { evenIfGuardianExists: true });
  });

  it.each([
    ['recover self', () => recoverPOST(json('http://localhost/api/os/recover', { cardId: 'card-1', decision: 'self' }))],
    ['guardian invite redeem', () => redeemPOST(json('http://localhost/api/os/invites/redeem', { inviteCode: 'ABCD-EFGH' }))],
  ])('%s keeps the first-guardian-only gift check (no option passed)', async (_l, call) => {
    mockGiftCheck.mockResolvedValue({ outcome: 'refused' });
    await call();
    expect(mockGiftCheck.mock.calls[0]).toHaveLength(3);
  });

  it('invite redemption: a failed card lock is retried once and logged, not silently ignored', async () => {
    cardLockFails = true;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGiftCheck.mockResolvedValue({ outcome: 'allowed' });
    const res = await redeemPOST(json('http://localhost/api/os/invites/redeem', { inviteCode: 'ABCD-EFGH' }));
    expect(res.status).toBe(200);
    expect(guardianLinks()).toHaveLength(1);
    expect(writes.filter((w) => w.table === 'cards' && w.op === 'update')).toHaveLength(2);
    expect(errors.mock.calls.some((c) => String(c[0]).includes('card lock'))).toBe(true);
    errors.mockRestore();
  });

  it('invite redemption: a successful card lock is written once', async () => {
    mockGiftCheck.mockResolvedValue({ outcome: 'allowed' });
    await redeemPOST(json('http://localhost/api/os/invites/redeem', { inviteCode: 'ABCD-EFGH' }));
    expect(writes.filter((w) => w.table === 'cards' && w.op === 'update')).toHaveLength(1);
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

describe('authorization check runs before the gift check', () => {
  it.each(routes.filter(([label]) => label !== 'recover handoff'))('%s: an authorization refusal stops before the gift check, with no writes', async (_label, call) => {
    mockFirstGuardian.mockResolvedValue({ outcome: 'refused' });
    mockInviteRedemption.mockResolvedValue({ outcome: 'refused' });
    mockGiftCheck.mockResolvedValue({ outcome: 'allowed' });
    const res = await call();
    expect([400, 403]).toContain(res.status);
    expect((await res.json()).error).not.toBe(GIFT_PROFILE_REFUSED_MESSAGE);
    expect(mockGiftCheck).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
});
