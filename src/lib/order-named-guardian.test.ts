import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { checkOrderNamesSeparateGuardian, namedGuardianOutcome, NAMED_GUARDIAN_RECOVERY_REFUSED_MESSAGE, ordersNamingSeparateGuardian } from './order-named-guardian';
import { GET, POST } from '@/app/api/os/recover/route';

describe('namedGuardianOutcome (purchaser recovery rule)', () => {
  it('allowed when no guardian was ever named, or the named address is the purchaser\'s own (case and spaces ignored)', () => {
    expect(namedGuardianOutcome({ purchaser_email: 'buyer@example.test', intended_guardian_email: null })).toBe('allowed');
    expect(namedGuardianOutcome({ purchaser_email: 'buyer@example.test' })).toBe('allowed');
    expect(namedGuardianOutcome({ purchaser_email: 'buyer@example.test', intended_guardian_email: ' Buyer@Example.test ' })).toBe('allowed');
  });
  it('refused when a separate guardian is named', () => {
    expect(namedGuardianOutcome({ purchaser_email: 'buyer@example.test', intended_guardian_email: 'parent@example.test' })).toBe('refused');
  });
  it('refused whenever the named guardian\'s account was erased, whatever the address was (it can no longer be compared)', () => {
    expect(namedGuardianOutcome({ purchaser_email: 'buyer@example.test', intended_guardian_email: null, intended_guardian_erased_at: '2026-11-14T00:00:00Z' })).toBe('refused');
    expect(namedGuardianOutcome({ purchaser_email: 'buyer@example.test', intended_guardian_email: 'buyer@example.test', intended_guardian_erased_at: '2026-11-14T00:00:00Z' })).toBe('refused');
  });
});

describe('checkOrderNamesSeparateGuardian / ordersNamingSeparateGuardian', () => {
  const client = (data: unknown, error: unknown = null) => {
    const chain = { select: () => chain, eq: () => chain, in: async () => ({ data, error }), maybeSingle: async () => ({ data, error }) };
    return { from: () => chain } as unknown as SupabaseClient;
  };
  it('reads the order with select(*) and applies the rule', async () => {
    expect(await checkOrderNamesSeparateGuardian(client({ id: 'o1', purchaser_email: 'b@example.test', intended_guardian_email: 'p@example.test' }), 'o1')).toEqual({ outcome: 'refused' });
    expect(await checkOrderNamesSeparateGuardian(client({ id: 'o1', purchaser_email: 'b@example.test', intended_guardian_email: null }), 'o1')).toEqual({ outcome: 'allowed' });
  });
  it('fails closed: a read error, a missing order or no order id is "failed"', async () => {
    expect(await checkOrderNamesSeparateGuardian(client(null, { message: 'boom' }), 'o1')).toEqual({ outcome: 'failed' });
    expect(await checkOrderNamesSeparateGuardian(client(null), 'o1')).toEqual({ outcome: 'failed' });
    expect(await checkOrderNamesSeparateGuardian(client({ id: 'other' }), 'o1')).toEqual({ outcome: 'failed' });
    expect(await checkOrderNamesSeparateGuardian(client({ id: 'o1' }), null)).toEqual({ outcome: 'failed' });
  });
  it('for a list: refuses named orders and orders that could not be read; a read error is not ok', async () => {
    const r = await ordersNamingSeparateGuardian(client([
      { id: 'a', purchaser_email: 'b@example.test', intended_guardian_email: null },
      { id: 'b', purchaser_email: 'b@example.test', intended_guardian_email: 'p@example.test' },
      { id: 'c', purchaser_email: 'b@example.test', intended_guardian_erased_at: '2026-11-14T00:00:00Z' },
    ]), ['a', 'b', 'c', 'missing']);
    expect(r).toEqual({ ok: true, refused: new Set(['b', 'c', 'missing']) });
    expect(await ordersNamingSeparateGuardian(client(null, { message: 'boom' }), ['a'])).toEqual({ ok: false });
  });
});

// The route itself, with the real rule: purchaser recovery is refused, for both decisions, before any write.
const PURCHASER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const CARD = 'eeeeeeee-0000-4000-8000-000000000005';
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
let orderRow: Record<string, unknown> | null;
let orderError: { message: string } | null;
vi.mock('@/lib/gift-order-guardian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gift-order-guardian')>();
  return { ...actual, checkGiftFirstGuardianClaim: vi.fn(async () => ({ outcome: 'not_gift' })) };
});
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
const createGuardianInvite = vi.fn();
vi.mock('@/lib/create-guardian-invite', () => ({ createGuardianInvite: (...args: unknown[]) => createGuardianInvite(...args) }));
const claimPlayerForCard = vi.fn();
vi.mock('@/lib/claim-player', () => ({ claimPlayerForCard: (...args: unknown[]) => claimPlayerForCard(...args) }));
vi.mock('@/lib/relationship-writes', () => ({ ensureProfileRole: vi.fn() }));
vi.mock('@/lib/guardian-invite-eligibility', () => ({ checkFirstGuardianClaim: vi.fn(async () => ({ outcome: 'allowed' })) }));


beforeEach(() => {
  orderRow = { id: 'order-1', purchaser_email: 'buyer@example.test', intended_guardian_email: 'parent@example.test' };
  orderError = null;
  session = createFakeSupabase({
    user: { id: PURCHASER, email: 'buyer@example.test' },
    respond: (c) => (c.table === 'orders' ? { data: [{ id: 'order-1', order_ref: 'EMB-1', source: 'standalone_order' }] } : {}),
  });
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'orders') return orderError ? { error: orderError } : { data: c.filters.some(([k]) => k === 'in') ? (orderRow ? [orderRow] : []) : orderRow };
      if (c.table === 'cards') {
        const card = { id: CARD, status: 'assigned', access_status: null, player_id: PLAYER, order_id: 'order-1', orders: { purchaser_email: 'buyer@example.test', payment_status: 'fulfilled' }, players: { name: 'Fictional' } };
        return c.filters.some(([k]) => k === 'in') ? { data: [card] } : { data: card, count: 1 };
      }
      return { data: [], count: 0 };
    },
  });
  // The route's card list uses .returns<T>() (a type-only helper): pass the query through unchanged.
  const from = service.client.from.bind(service.client);
  (service.client as { from: (t: string) => unknown }).from = (t: string) => Object.assign(from(t), { returns() { return this; } });
  createGuardianInvite.mockReset();
  claimPlayerForCard.mockReset().mockResolvedValue({ ok: true, playerId: PLAYER });
});

const recover = (decision: 'self' | 'handoff') =>
  POST(new NextRequest('http://localhost/api/os/recover', { method: 'POST', body: JSON.stringify({ cardId: CARD, decision, handoffEmail: 'someone@example.test' }) }));

describe('POST /api/os/recover — an order that names (or named) a separate guardian', () => {
  it('self: refused with 403 and the fixed message; no claim, no invite', async () => {
    const res = await recover('self');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(NAMED_GUARDIAN_RECOVERY_REFUSED_MESSAGE);
    expect(claimPlayerForCard).not.toHaveBeenCalled();
    expect(createGuardianInvite).not.toHaveBeenCalled();
  });
  it('handoff: refused too (the buyer can\'t pick a different recipient)', async () => {
    const res = await recover('handoff');
    expect(res.status).toBe(403);
    expect(createGuardianInvite).not.toHaveBeenCalled();
  });
  it('the named guardian\'s account was erased (address cleared): still refused', async () => {
    orderRow = { id: 'order-1', purchaser_email: 'buyer@example.test', intended_guardian_email: null, intended_guardian_erased_at: '2026-11-14T00:00:00Z' };
    expect((await recover('self')).status).toBe(403);
    expect((await recover('handoff')).status).toBe(403);
    expect(claimPlayerForCard).not.toHaveBeenCalled();
    expect(createGuardianInvite).not.toHaveBeenCalled();
  });
  it('fails closed (500, no write) when the order can\'t be read', async () => {
    orderError = { message: 'boom' };
    expect((await recover('self')).status).toBe(500);
    expect(claimPlayerForCard).not.toHaveBeenCalled();
  });
  it('no guardian named: recovery works as before; a repeated refused request stays refused', async () => {
    orderRow = { id: 'order-1', purchaser_email: 'buyer@example.test', intended_guardian_email: null };
    expect((await recover('self')).status).toBe(200);
    expect(claimPlayerForCard).toHaveBeenCalledTimes(1);
    orderRow = { id: 'order-1', purchaser_email: 'buyer@example.test', intended_guardian_email: 'parent@example.test' };
    expect((await recover('self')).status).toBe(403);
    expect((await recover('self')).status).toBe(403);
    expect(claimPlayerForCard).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/os/recover — such an order is listed as held for its guardian, with no recoverable card', () => {
  it('named guardian: no cards offered; the order ref is listed as held', async () => {
    const body = await (await GET()).json();
    expect(body.orders).toEqual([]);
    expect(body.heldForGuardian).toEqual(['EMB-1']);
  });
  it('the order read failing is a 500 (fails closed)', async () => {
    orderError = { message: 'boom' };
    expect((await GET()).status).toBe(500);
  });
});
