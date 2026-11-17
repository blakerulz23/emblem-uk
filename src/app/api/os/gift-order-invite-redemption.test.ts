import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * F-1 (C6 review): an invite whose order_id is a single-card gift order is
 * redeemable only by the approving guardian's confirmed email, whether or
 * not the child already has a guardian.
 *
 * Unlike gift-order-profile-gate.test.ts (which mocks the gift check to pin
 * the wiring), this file runs POST /api/os/invites/redeem with the REAL
 * authorization (guardian-invite-eligibility) and gift (gift-order-guardian)
 * helpers over a small in-memory table store, so it exercises the actual
 * reads: a legacy buyer-held invite that the old code accepted as 'order'
 * authority once a guardian existed is now refused before any write.
 */

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failTables: string[];
const writes: Array<{ table: string; op: string; row?: unknown }> = [];

function from(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let limit = Infinity;
  let patch: Row | null = null;
  const run = () => {
    if (failTables.includes(table)) return { data: null, error: { message: 'boom' } };
    const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit);
    if (patch) {
      writes.push({ table, op: 'update', row: patch });
      rows.forEach((r) => Object.assign(r, patch));
      return { data: null, error: null };
    }
    return { data: rows, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
    not: (c: string, _op: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; },
    order: () => q,
    limit: (n: number) => { limit = n; return q; },
    maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    insert: async (row: Row) => {
      writes.push({ table, op: 'insert', row });
      if (table === 'guardians' && (tables.guardians ?? []).some((g) => g.player_id === row.player_id && g.profile_id === row.profile_id)) {
        return { error: { code: '23505' } };
      }
      (tables[table] ??= []).push(row);
      return { error: null };
    },
    update: (p: Row) => { patch = p; return q; },
  };
  return q;
}

let user: { id: string; email: string; email_confirmed_at: string | null };

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  createServiceRoleClient: () => ({ from }),
}));
vi.mock('@/lib/relationship-writes', () => ({
  ensureProfileRole: async (_s: unknown, id: string, role: string) => { writes.push({ table: 'profiles', op: 'ensure_profile_role', row: { id, role } }); return { ok: true }; },
}));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_MESSAGE: 'slow down', getRequestIdentifier: () => 'id', isWithinRateLimit: async () => true, logClaimAttempt: async () => {} }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: async () => {} }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: async () => {} }));
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: async () => [] }));

import { POST as redeemPOST } from './invites/redeem/route';
import { GIFT_PROFILE_REFUSED_MESSAGE } from '@/lib/gift-order-guardian';

const CONFIRMED = '2026-11-08T00:00:00Z';
const BUYER = { id: 'buyer-1', email: 'grandparent@example.test', email_confirmed_at: CONFIRMED };
const BUYER_SECOND = { id: 'buyer-2', email: 'grandparent.second@example.test', email_confirmed_at: CONFIRMED };
const GUARDIAN = { id: 'guardian-1', email: 'guardian@example.test', email_confirmed_at: CONFIRMED };
const OTHER_PARENT = { id: 'parent-2', email: 'other.parent@example.test', email_confirmed_at: CONFIRMED };

function world(opts: { authority: string | null; guardianLinked: boolean; cards?: number; approvedEmail?: string }) {
  const cards: Row[] = [{ id: 'card-1', player_id: 'player-1', order_id: 'order-1', status: opts.guardianLinked ? 'claimed' : 'assigned' }];
  if ((opts.cards ?? 1) > 1) cards.push({ id: 'card-2', player_id: 'player-2', order_id: 'order-1', status: 'assigned' });
  tables = {
    orders: [{ id: 'order-1', authority_status: opts.authority, purchaser_email: BUYER.email, payment_status: 'fulfilled' }],
    cards,
    players: [{ id: 'player-1', name: 'Riley Test', team_id: 'team-1' }],
    guardians: opts.guardianLinked ? [{ player_id: 'player-1', profile_id: GUARDIAN.id }] : [],
    builder_guardian_approval_requests:
      opts.authority === 'guardian_approved' ? [{ order_id: 'order-1', status: 'approved', guardian_email: opts.approvedEmail ?? GUARDIAN.email, responded_at: CONFIRMED }] : [],
    builder_order_authority_declarations: [{ order_id: 'order-1', adult_email: BUYER.email }],
    player_invites: [],
    coach_team: [],
    coach_players: [],
    relationship_audit_events: [],
    profiles: [],
  };
}

function addInvite(invite: Row) {
  tables.player_invites.push({ code: 'ABCD-EFGH', used_at: null, expires_at: '2999-01-01T00:00:00Z', player_id: 'player-1', created_by: null, order_id: null, ...invite });
}

const redeem = () =>
  redeemPOST(new NextRequest('http://localhost/api/os/invites/redeem', { method: 'POST', body: JSON.stringify({ inviteCode: 'ABCD-EFGH' }), headers: { 'Content-Type': 'application/json' } }));
const guardianInserts = () => writes.filter((w) => w.table === 'guardians' && w.op === 'insert');

beforeEach(() => {
  writes.length = 0;
  failTables = [];
});

describe('gift order invites after the approving guardian has linked (F-1)', () => {
  it('legacy order_approval invite addressed to the buyer: refused, nothing written', async () => {
    world({ authority: 'guardian_approved', guardianLinked: true });
    addInvite({ id: 'inv-legacy', invited_email: BUYER.email, order_id: 'order-1', origin: 'order_approval' });
    user = BUYER;
    const res = await redeem();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(GIFT_PROFILE_REFUSED_MESSAGE);
    expect(writes).toHaveLength(0);
  });

  it('buyer-created recovery handoff invite (second_guardian) to a second address the buyer holds: refused, nothing written', async () => {
    world({ authority: 'guardian_approved', guardianLinked: true });
    addInvite({ id: 'inv-handoff', invited_email: BUYER_SECOND.email, order_id: 'order-1', origin: 'second_guardian', created_by: BUYER.id });
    user = BUYER_SECOND;
    const res = await redeem();
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('a gift order still awaiting or declined approval refuses everyone, even after a guardian exists', async () => {
    for (const authority of ['guardian_approval_pending', 'guardian_declined']) {
      writes.length = 0;
      world({ authority, guardianLinked: true });
      addInvite({ id: 'inv-p', invited_email: GUARDIAN.email, order_id: 'order-1', origin: 'order_approval' });
      user = { ...GUARDIAN, id: 'guardian-other-account' };
      const res = await redeem();
      expect(res.status).toBe(403);
      expect(writes).toHaveLength(0);
    }
  });

  it('a failed approval lookup fails closed: 500, nothing written', async () => {
    world({ authority: 'guardian_approved', guardianLinked: true });
    addInvite({ id: 'inv-legacy', invited_email: BUYER.email, order_id: 'order-1', origin: 'order_approval' });
    failTables = ['builder_guardian_approval_requests'];
    user = BUYER;
    const res = await redeem();
    expect(res.status).toBe(500);
    expect(writes).toHaveLength(0);
  });

  it('a failed order lookup fails closed: 500, nothing written', async () => {
    world({ authority: 'guardian_approved', guardianLinked: true });
    addInvite({ id: 'inv-legacy', invited_email: BUYER.email, order_id: 'order-1', origin: 'order_approval' });
    user = BUYER;
    // orders is read first by the authorization check too, so this fails there or in the gift check; either way closed.
    failTables = ['orders'];
    const res = await redeem();
    expect(res.status).toBe(500);
    expect(writes).toHaveLength(0);
  });
});

describe('the approving guardian is unaffected', () => {
  it('redeems their order_approval invite as the first guardian', async () => {
    world({ authority: 'guardian_approved', guardianLinked: false });
    addInvite({ id: 'inv-g', invited_email: GUARDIAN.email, order_id: 'order-1', origin: 'order_approval' });
    user = GUARDIAN;
    const res = await redeem();
    expect(res.status).toBe(200);
    expect(guardianInserts()).toHaveLength(1);
  });

  it('redeems an order invite addressed to them after another guardian already exists', async () => {
    world({ authority: 'guardian_approved', guardianLinked: true });
    tables.guardians = [{ player_id: 'player-1', profile_id: OTHER_PARENT.id }];
    addInvite({ id: 'inv-g', invited_email: GUARDIAN.email, order_id: 'order-1', origin: 'order_approval' });
    user = GUARDIAN;
    const res = await redeem();
    expect(res.status).toBe(200);
    expect(guardianInserts()).toEqual([expect.objectContaining({ row: expect.objectContaining({ player_id: 'player-1', profile_id: GUARDIAN.id }) })]);
  });

  it('a genuine guardian inviting a second parent (no order_id) on a gift child still works', async () => {
    world({ authority: 'guardian_approved', guardianLinked: true });
    addInvite({ id: 'inv-2nd', invited_email: OTHER_PARENT.email, order_id: null, origin: 'second_guardian', created_by: GUARDIAN.id });
    user = OTHER_PARENT;
    const res = await redeem();
    expect(res.status).toBe(200);
    expect(guardianInserts()).toHaveLength(1);
  });
});

describe('non-gift orders keep their behaviour', () => {
  it.each([['confirmed'], [null]])('%s order: a purchaser handoff invite carrying order_id is still redeemable after a guardian exists', async (authority) => {
    world({ authority, guardianLinked: true });
    addInvite({ id: 'inv-h', invited_email: OTHER_PARENT.email, order_id: 'order-1', origin: 'second_guardian', created_by: BUYER.id });
    user = OTHER_PARENT;
    const res = await redeem();
    expect(res.status).toBe(200);
    expect(guardianInserts()).toHaveLength(1);
  });

  it('confirmed order: the purchaser can still redeem their own order_approval invite after a guardian exists (unchanged)', async () => {
    world({ authority: 'confirmed', guardianLinked: true });
    addInvite({ id: 'inv-p', invited_email: BUYER.email, order_id: 'order-1', origin: 'order_approval' });
    user = BUYER;
    const res = await redeem();
    expect(res.status).toBe(200);
  });
});
