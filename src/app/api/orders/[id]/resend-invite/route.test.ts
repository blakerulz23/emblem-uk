import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRequireStaff = vi.fn();
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...a: unknown[]) => mockRequireStaff(...a) }));
const mockCreateGuardianInvite = vi.fn();
vi.mock('@/lib/create-guardian-invite', () => ({ createGuardianInvite: (...a: unknown[]) => mockCreateGuardianInvite(...a) }));

let order: Record<string, unknown>;
let approvedGuardianEmail: string | null;
let invites: Array<{ id: string; invited_email: string }>;
const expired: unknown[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'orders') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: order, error: null }) }) }) };
      }
      if (table === 'cards') {
        return { select: () => ({ eq: () => ({ not: async () => ({ data: [{ player_id: 'player-1' }] }) }) }) };
      }
      if (table === 'builder_guardian_approval_requests') {
        const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: async () => ({ data: approvedGuardianEmail ? [{ guardian_email: approvedGuardianEmail }] : [], error: null }) };
        return chain;
      }
      if (table === 'player_invites') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: async () => ({ data: invites, error: null }),
          update: () => ({ in: async (_c: string, ids: unknown[]) => { expired.push(...ids); return { error: null }; } }),
        };
        return chain;
      }
      if (table === 'builder_order_authority_declarations') {
        // The buyer's verified declaration address (an approval from it is not a guardian's).
        return { select: () => ({ eq: async () => ({ data: [{ adult_email: 'declared-buyer@example.test' }], error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { POST } from './route';

const resend = () => POST(new Request('http://localhost/api/orders/order-1/resend-invite', { method: 'POST' }), { params: { id: 'order-1' } });

beforeEach(() => {
  mockRequireStaff.mockReset().mockResolvedValue({ ok: true, userId: 'staff-1' });
  mockCreateGuardianInvite.mockReset().mockResolvedValue({ ok: true });
  order = { id: 'order-1', payment_status: 'fulfilled', purchaser_email: 'grandparent@example.test', intended_guardian_email: null, authority_status: 'guardian_approved' };
  approvedGuardianEmail = 'guardian@example.test';
  invites = [];
  expired.length = 0;
});

describe('POST /api/orders/[id]/resend-invite', () => {
  it('gift order: resends to the approving guardian, never the buyer', async () => {
    const res = await resend();
    expect(res.status).toBe(200);
    expect(mockCreateGuardianInvite).toHaveBeenCalledWith(expect.anything(), 'player-1', null, 'guardian@example.test', 'order_approval', 'order-1');
  });

  it('gift order: retires a live invite an earlier version sent to the buyer, keeping the guardian’s', async () => {
    invites = [
      { id: 'buyer-invite', invited_email: 'grandparent@example.test' },
      { id: 'guardian-invite', invited_email: 'guardian@example.test' },
    ];
    await resend();
    expect(expired).toEqual(['buyer-invite']);
  });

  it.each([['the purchaser', 'grandparent@example.test'], ['the declared buyer', 'Declared-Buyer@example.test']])('gift order approved from %s address: treated as unapproved — 409, nothing sent', async (_who, email) => {
    approvedGuardianEmail = email;
    const res = await resend();
    expect(res.status).toBe(409);
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
  });

  it('gift order with no approving guardian on record: 409, nothing sent', async () => {
    approvedGuardianEmail = null;
    const res = await resend();
    expect(res.status).toBe(409);
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
  });

  it('declined or pending gift order: 409, nothing sent', async () => {
    for (const status of ['guardian_declined', 'guardian_approval_pending']) {
      order = { ...order, authority_status: status };
      const res = await resend();
      expect(res.status).toBe(409);
    }
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
  });

  it('confirmed (parent placed it) order: unchanged — purchaser, and no invites retired', async () => {
    order = { ...order, authority_status: 'confirmed', purchaser_email: 'parent@example.test' };
    invites = [{ id: 'x', invited_email: 'someone@example.test' }];
    await resend();
    expect(mockCreateGuardianInvite.mock.calls[0][3]).toBe('parent@example.test');
    expect(expired).toEqual([]);
  });
});
