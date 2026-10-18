import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as archive } from './archive/route';
import { POST as restore } from './restore/route';
import { POST as hideOrder } from './hide-order/route';

const mockRequirePermission = vi.fn();
vi.mock('@/lib/require-squad-invite-permission', () => ({
  requireSquadInvitePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => ({ rpc: (name: string, args: unknown) => mockRpc(name, args) }),
}));

const CARD_A = '11111111-1111-4111-8111-111111111111';
const CARD_B = '22222222-2222-4222-8222-222222222222';
const ORDER = '33333333-3333-4333-8333-333333333333';
const STAFF = '44444444-4444-4444-8444-444444444444';

const req = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  mockRequirePermission.mockReset().mockResolvedValue({ ok: true, userId: STAFF });
  mockRpc.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('every test-archive route requires the test_data_admin permission', () => {
  for (const [name, handler, body] of [
    ['archive', archive, { cardIds: [CARD_A], reason: 'Internal test', confirmation: 'ARCHIVE 1 TEST CARD' }],
    ['restore', restore, { cardIds: [CARD_A], confirmation: 'RESTORE 1 TEST CARD' }],
    ['hide-order', hideOrder, { orderId: ORDER, typedOrderRef: 'abc12345', reason: 'Refunded test' }],
  ] as const) {
    it(`${name}: refused without the permission, and the database is never called`, async () => {
      mockRequirePermission.mockResolvedValue({ ok: false, status: 403, error: 'Squad Invite permission required' });
      const res = await handler(req(body));
      expect(res.status).toBe(403);
      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'test_data_admin');
      expect(mockRpc).not.toHaveBeenCalled();
    });
  }
});

describe('POST /api/staff/test-archive/archive', () => {
  it('archives through archive_test_cards with the staff id and reason, returning per-card results', async () => {
    mockRpc.mockResolvedValue({ data: [{ cardId: CARD_A, result: 'archived' }, { cardId: CARD_B, result: 'refused', reason: 'order_has_payment_evidence' }], error: null });
    const res = await archive(req({ cardIds: [CARD_A, CARD_B], reason: '  Internal test  ', confirmation: 'ARCHIVE 2 TEST CARDS' }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('archive_test_cards', { p_card_ids: [CARD_A, CARD_B], p_actor: STAFF, p_reason: 'Internal test' });
    expect((await res.json()).results).toHaveLength(2);
  });

  it('requires the exact typed confirmation for the number of cards', async () => {
    const res = await archive(req({ cardIds: [CARD_A, CARD_B], reason: 'Internal test', confirmation: 'ARCHIVE 1 TEST CARD' }));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects malformed ids, empty lists, more than 100 cards and a missing reason', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    for (const body of [
      { cardIds: ['not-a-uuid'], reason: 'x test', confirmation: 'ARCHIVE 1 TEST CARD' },
      { cardIds: [], reason: 'x test', confirmation: 'ARCHIVE 0 TEST CARDS' },
      { cardIds: many, reason: 'x test', confirmation: 'ARCHIVE 101 TEST CARDS' },
      { cardIds: [CARD_A], reason: ' ', confirmation: 'ARCHIVE 1 TEST CARD' },
    ]) {
      expect((await archive(req(body))).status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('de-duplicates ids before counting the confirmation', async () => {
    const res = await archive(req({ cardIds: [CARD_A, CARD_A], reason: 'Internal test', confirmation: 'ARCHIVE 1 TEST CARD' }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('archive_test_cards', expect.objectContaining({ p_card_ids: [CARD_A] }));
  });

  it('reports a database refusal of the whole request as 409', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'test_data_admin permission required' } });
    const res = await archive(req({ cardIds: [CARD_A], reason: 'Internal test', confirmation: 'ARCHIVE 1 TEST CARD' }));
    expect(res.status).toBe(409);
  });
});

describe('POST /api/staff/test-archive/restore', () => {
  it('restores through restore_test_cards after the typed confirmation', async () => {
    mockRpc.mockResolvedValue({ data: [{ cardId: CARD_A, result: 'restored' }], error: null });
    const res = await restore(req({ cardIds: [CARD_A], confirmation: 'RESTORE 1 TEST CARD' }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('restore_test_cards', { p_card_ids: [CARD_A], p_actor: STAFF });
  });

  it('refuses without the matching confirmation', async () => {
    expect((await restore(req({ cardIds: [CARD_A], confirmation: 'restore' }))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/staff/test-archive/hide-order', () => {
  it('passes the typed order reference to hide_financial_test_order, which makes the decision', async () => {
    mockRpc.mockResolvedValue({ data: { orderId: ORDER, cardsHidden: 1, paymentStatus: 'refunded' }, error: null });
    const res = await hideOrder(req({ orderId: ORDER, typedOrderRef: ' 6ae4 ', reason: 'Refunded test order' }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('hide_financial_test_order', { p_order_id: ORDER, p_typed_order_ref: '6ae4', p_actor: STAFF, p_reason: 'Refunded test order' });
  });

  it('returns the database refusal (e.g. a paid order) as 409 with its message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'only refunded or cancelled orders can be hidden' } });
    const res = await hideOrder(req({ orderId: ORDER, typedOrderRef: '6ae4', reason: 'Refunded test order' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/refunded or cancelled/);
  });

  it('rejects a missing order id, reference or reason before calling the database', async () => {
    for (const body of [
      { orderId: 'x', typedOrderRef: '6ae4', reason: 'Refunded test' },
      { orderId: ORDER, typedOrderRef: ' ', reason: 'Refunded test' },
      { orderId: ORDER, typedOrderRef: '6ae4', reason: '' },
    ]) {
      expect((await hideOrder(req(body))).status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
