import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable, type FakeCall } from '@/lib/fake-supabase.test-support';
import { NAMED_GUARDIAN_CARD_CLAIM_REFUSED_MESSAGE } from '@/lib/order-named-guardian';

/**
 * POST /api/os/claim with the real purchaser card-claim rule
 * (checkPurchaserCardClaim, the same named-guardian rule as purchaser
 * recovery) and the real gift check and claimPlayerForCard: an order that
 * names, or once named, a separate parent or guardian can't be claimed by
 * its buyer with the card's code, including after that guardian's account
 * was erased. Everyone else is unchanged. Fails closed.
 */

const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const CARD = 'eeeeeeee-0000-4000-8000-000000000005';
const REPLACEMENT_CARD = 'eeeeeeee-0000-4000-8000-000000000006';

type Account = { id: string; email: string | null; email_confirmed_at: string | null };
const BUYER: Account = { id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'buyer@example.test', email_confirmed_at: '2026-11-01T00:00:00Z' };
const GUARDIAN: Account = { id: 'bbbbbbbb-0000-4000-8000-000000000002', email: 'parent@example.test', email_confirmed_at: '2026-11-01T00:00:00Z' };
const STRANGER: Account = { id: 'dddddddd-0000-4000-8000-000000000004', email: 'someone@example.test', email_confirmed_at: '2026-11-01T00:00:00Z' };

let user: Account;
let service: ReturnType<typeof createFakeSupabase>;
let orderRow: Record<string, unknown> | null;
// Fails matching reads after `skip` of them have succeeded (the gift check runs the same card read first).
let failTable: { table: string; columns?: string; skip?: number } | null;
let childCards: Array<{ id: string; order_id: string | null }>;
let otherOrders: Array<Record<string, unknown>>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  createServiceRoleClient: () => service.client,
}));
vi.mock('@/lib/relationship-writes', () => ({ ensureProfileRole: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/guardian-invite-eligibility', () => ({ checkFirstGuardianClaim: vi.fn(async () => ({ outcome: 'allowed' })) }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: vi.fn(async () => undefined) }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));

import { POST } from './claim/route';

const fails = (c: FakeCall) => {
  if (!failTable || c.table !== failTable.table || (failTable.columns && c.columns !== failTable.columns)) return false;
  if ((failTable.skip ?? 0) > 0) {
    failTable.skip = (failTable.skip ?? 0) - 1;
    return false;
  }
  return true;
};

beforeEach(() => {
  user = BUYER;
  orderRow = { id: 'order-1', authority_status: 'confirmed', purchaser_email: 'buyer@example.test', intended_guardian_email: 'parent@example.test' };
  failTable = null;
  childCards = [{ id: CARD, order_id: 'order-1' }];
  otherOrders = [];
  service = createFakeSupabase({
    respond: (c) => {
      if (fails(c)) return { error: { message: 'internal database detail' } };
      if (c.table === 'cards' && c.op === 'select') {
        if (c.filters.some(([, col]) => col === 'claim_token')) return { data: { id: CARD, status: 'assigned', player_id: PLAYER, access_status: null } };
        if (c.filters.some(([, col]) => col === 'order_id')) return { data: [{ player_id: PLAYER }] };
        return { data: childCards };
      }
      if (c.table === 'orders') return { data: [...(orderRow ? [orderRow] : []), ...otherOrders] };
      return {};
    },
  });
});

const claim = () => POST(new NextRequest('http://localhost/api/os/claim', { method: 'POST', body: JSON.stringify({ claimToken: 'ABCD-EFGH' }) }));

async function expectRefused() {
  const res = await claim();
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe(NAMED_GUARDIAN_CARD_CLAIM_REFUSED_MESSAGE);
}

describe('POST /api/os/claim — an order that names, or named, a separate guardian', () => {
  it('the buyer is refused (403, fixed message) and nothing is written', async () => {
    await expectRefused();
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
    expect(wroteTable(service.calls, 'cards')).toBe(false);
  });

  it('the buyer stays refused after the named guardian\'s account was erased (address cleared)', async () => {
    orderRow = { ...orderRow, intended_guardian_email: null, intended_guardian_erased_at: '2026-11-14T00:00:00Z' };
    await expectRefused();
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
  });

  it('the buyer is recognised whatever the case or surrounding spaces of either address', async () => {
    user = { ...BUYER, email: '  Buyer@Example.TEST ' };
    await expectRefused();
    orderRow = { ...orderRow, purchaser_email: ' BUYER@example.test ' };
    user = BUYER;
    await expectRefused();
  });

  it('repeated attempts by the buyer stay refused and never write', async () => {
    await expectRefused();
    await expectRefused();
    await expectRefused();
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
    expect(wroteTable(service.calls, 'cards')).toBe(false);
  });

  it('the genuine named guardian (confirmed email is the named address) claims as before', async () => {
    user = GUARDIAN;
    const res = await claim();
    expect(res.status).toBe(200);
    const link = service.calls.find((c) => c.table === 'guardians' && c.op === 'insert');
    expect(link?.payload).toMatchObject({ player_id: PLAYER, profile_id: GUARDIAN.id, created_via: 'card_claim' });
  });

  it('the named address with an unconfirmed email is refused (identity uncertain)', async () => {
    user = { ...GUARDIAN, email_confirmed_at: null };
    await expectRefused();
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
  });

  it('an unrelated adult (not the buyer) holding the code is unchanged, before and after the erasure', async () => {
    user = STRANGER;
    expect((await claim()).status).toBe(200);
    orderRow = { ...orderRow, intended_guardian_email: null, intended_guardian_erased_at: '2026-11-14T00:00:00Z' };
    expect((await claim()).status).toBe(200);
  });

  it('an unrelated adult is refused when the buyer\'s address is no longer recorded (can\'t be told apart from the buyer)', async () => {
    orderRow = { ...orderRow, purchaser_email: null, intended_guardian_email: null, intended_guardian_erased_at: '2026-11-14T00:00:00Z' };
    user = STRANGER;
    await expectRefused();
  });

  it('the rule follows every card of the child: a replacement card with no order_id of its own is still refused to the buyer', async () => {
    childCards = [{ id: REPLACEMENT_CARD, order_id: null }, { id: CARD, order_id: 'order-1' }, { id: 'eeeeeeee-0000-4000-8000-000000000007', order_id: null }];
    await expectRefused();
  });

  it('with the buyer\'s address no longer recorded, the named guardian (address still recorded) can still claim; once that guardian was erased nobody is trusted by the old address', async () => {
    orderRow = { ...orderRow, purchaser_email: null };
    user = GUARDIAN;
    expect((await claim()).status).toBe(200);
    orderRow = { ...orderRow, intended_guardian_erased_at: '2026-11-14T00:00:00Z' };
    await expectRefused();
  });

  it('an order that never named a separate guardian (or named the buyer) is unchanged for the buyer', async () => {
    orderRow = { ...orderRow, intended_guardian_email: null };
    expect((await claim()).status).toBe(200);
    orderRow = { ...orderRow, intended_guardian_email: 'Buyer@example.test' };
    expect((await claim()).status).toBe(200);
  });

  it('a child with cards from two orders: refused if the claimant is the buyer of either restricted order, even when they are the named guardian on the other', async () => {
    childCards = [{ id: CARD, order_id: 'order-1' }, { id: REPLACEMENT_CARD, order_id: 'order-2' }];
    // order-2: bought by the named guardian of order-1, naming yet another adult.
    otherOrders = [{ id: 'order-2', authority_status: 'confirmed', purchaser_email: 'parent@example.test', intended_guardian_email: 'other-parent@example.test' }];
    user = GUARDIAN;
    await expectRefused();
    user = BUYER;
    await expectRefused();
    user = STRANGER;
    expect((await claim()).status).toBe(200);
    // order-2 naming nobody: the named guardian of order-1 may claim; the buyer of order-1 still may not.
    otherOrders = [{ id: 'order-2', authority_status: 'confirmed', purchaser_email: 'parent@example.test', intended_guardian_email: null }];
    user = GUARDIAN;
    expect((await claim()).status).toBe(200);
    user = BUYER;
    await expectRefused();
  });

  it('a card with no order at all is unchanged', async () => {
    childCards = [{ id: CARD, order_id: null }];
    expect((await claim()).status).toBe(200);
  });
});

describe('POST /api/os/claim — fails closed when the guardian history can\'t be read', () => {
  it('the child\'s card list failing to load: generic 500, no database text, nothing written', async () => {
    failTable = { table: 'cards', columns: 'order_id', skip: 1 };
    const res = await claim();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('internal database detail');
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
  });

  it('the orders read failing: 500, nothing written, for the buyer and for the named guardian alike', async () => {
    failTable = { table: 'orders', columns: '*' };
    expect((await claim()).status).toBe(500);
    user = GUARDIAN;
    expect((await claim()).status).toBe(500);
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
  });

  it('an order the child\'s card points to is missing: 500, nothing written', async () => {
    orderRow = null;
    expect((await claim()).status).toBe(500);
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
  });
});
