import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

/**
 * Same deviation-from-DI reasoning as every other route.test.ts in this
 * repo — the route's Supabase clients are mocked at the module boundary.
 * The mock `from()` dispatcher below is deliberately generic (branches on
 * table name and, for `orders`, on the requested select column string)
 * since this single route now serves two genuinely different persistence
 * shapes (normal multi-table approval vs. the Squad Invite branch) behind
 * one POST handler.
 */
const mockRequireStaff = vi.fn();
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...args: unknown[]) => mockRequireStaff(...args) }));

const mockCreateGuardianInvite = vi.fn();
const mockCreateTeamInvite = vi.fn();
vi.mock('@/lib/create-guardian-invite', () => ({ createGuardianInvite: (...args: unknown[]) => mockCreateGuardianInvite(...args) }));
vi.mock('@/lib/create-team-invite', () => ({ createTeamInvite: (...args: unknown[]) => mockCreateTeamInvite(...args) }));
vi.mock('@/lib/season', () => ({ currentUkFootballSeason: () => '2026/27' }));
vi.mock('@/lib/resolve-season', () => ({ resolveOrCreateSeason: vi.fn(async () => ({ ok: true, id: 'season-1' })) }));

const mockSendEarlyPreviewEmail = vi.fn();
vi.mock('@/lib/send-squad-invite-early-preview-email', () => ({
  sendSquadInviteEarlyPreviewEmail: (...args: unknown[]) => mockSendEarlyPreviewEmail(...args),
}));

// Gate 3 — controlled independently of the real NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT
// env var, which this test file must never depend on.
const mockGate3PaymentGateEnabled = vi.fn();
vi.mock('@/lib/shopify', () => ({ gate3PaymentGateEnabled: () => mockGate3PaymentGateEnabled() }));

type Fixture = {
  orderSource: string;
  // migration 0071 — the ordinary-builder safeguarding gate. Defaulted to
  // 'confirmed' in beforeEach below so every pre-existing test in this file
  // (written before this gate existed) keeps exercising the behaviour it
  // was actually written to test, rather than being blocked by it.
  orderAuthorityStatus?: string | null;
  // Gate 3 — defaulted in beforeEach so every pre-existing test (written
  // before this gate existed) keeps exercising unaffected behaviour.
  orderPricingTier?: string | null;
  orderPaymentStatus?: string | null;
  cards?: { player_id: string | null }[];
  orderRow?: { id: string; purchaser_email: string; intended_guardian_email: string | null; payment_status?: string; team_name?: string };
  participations?: Array<{ id: string; campaign_id: string; squad_invites: { campaign_status: string } }> | null;
  participationsError?: boolean;
  paymentModeEnabled?: boolean;
  // migration 0063 — a rejected card_definitions row for this order
  rejectedPhoto?: boolean;
  // the Squad Invite card the approve route looks up to send the early
  // preview email — distinct from `cards`, which is only the normal-order
  // branch's player_id list
  squadInviteCard?: { claim_token: string } | null;
};

let fixture: Fixture;
const mockRpc = vi.fn();
const auditInserts: unknown[] = [];
const builderAuthorityAuditInserts: unknown[] = [];
const orderUpdates: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === 'cards') {
        return {
          select: () => ({
            eq: () => ({
              not: async () => ({ data: fixture.cards ?? [] }),
              maybeSingle: async () => ({ data: fixture.squadInviteCard ?? null }),
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: (cols: string) => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: cols.startsWith('source')
                  ? {
                      source: fixture.orderSource,
                      authority_status: fixture.orderAuthorityStatus,
                      pricing_tier: fixture.orderPricingTier ?? null,
                      payment_status: fixture.orderPaymentStatus ?? null,
                    }
                  : fixture.orderRow,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            orderUpdates.push(patch);
            return {
              eq: () => ({
                select: () => ({
                  single: async () => (fixture.orderRow ? { data: fixture.orderRow, error: null } : { data: null, error: { message: 'not found' } }),
                  maybeSingle: async () => (fixture.orderRow ? { data: { id: fixture.orderRow.id }, error: null } : { data: null, error: null }),
                }),
              }),
            };
          },
        };
      }
      if (table === 'squad_invite_participations') {
        return {
          select: () => ({
            eq: async () => (fixture.participationsError ? { data: null, error: { message: 'boom' } } : { data: fixture.participations ?? [], error: null }),
          }),
        };
      }
      if (table === 'squad_invite_audit_events') {
        return { insert: async (row: unknown) => { auditInserts.push(row); return { error: null }; } };
      }
      if (table === 'builder_authority_audit_events') {
        return { insert: async (row: unknown) => { builderAuthorityAuditInserts.push(row); return { error: null }; } };
      }
      if (table === 'card_definitions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: fixture.rejectedPhoto ? { id: 'card-definition-1' } : null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'players') {
        return { update: () => ({ in: async () => ({ error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const STAFF_ID = 'staff-1';
const ORDER_ID = 'order-1';

function approve() {
  return POST(new Request(`http://localhost/api/orders/${ORDER_ID}/approve`, { method: 'POST' }), { params: { id: ORDER_ID } });
}

beforeEach(() => {
  mockRequireStaff.mockReset();
  mockCreateGuardianInvite.mockReset();
  mockCreateTeamInvite.mockReset();
  mockRpc.mockReset();
  mockSendEarlyPreviewEmail.mockReset();
  auditInserts.length = 0;
  orderUpdates.length = 0;
  mockRequireStaff.mockResolvedValue({ ok: true, userId: STAFF_ID });
  mockRpc.mockResolvedValue({ data: false, error: null });
  mockSendEarlyPreviewEmail.mockResolvedValue({ ok: true });
  mockGate3PaymentGateEnabled.mockReset();
  // Off by default — every pre-existing test in this file was written
  // before Gate 3 existed and must keep exercising exactly the behaviour
  // it always has, unaffected by a gate that hasn't been "turned on".
  mockGate3PaymentGateEnabled.mockReturnValue(false);
  builderAuthorityAuditInserts.length = 0;
  fixture = { orderSource: 'team_order', orderAuthorityStatus: 'confirmed' };
});

describe('POST /api/orders/[id]/approve — normal orders (unchanged)', () => {
  it('enforces staff authorization exactly as before', async () => {
    mockRequireStaff.mockResolvedValue({ ok: false, status: 403, error: 'Staff access required' });
    const res = await approve();
    expect(res.status).toBe(403);
    expect(orderUpdates).toHaveLength(0);
  });

  it('a normal single-card order still sends its existing guardian invitation', async () => {
    fixture = {
      orderSource: 'team_order',
      orderAuthorityStatus: 'confirmed',
      cards: [{ player_id: 'player-1' }],
      orderRow: { id: ORDER_ID, purchaser_email: 'parent@example.test', intended_guardian_email: null },
    };
    const res = await approve();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inviteTriggered).toBe(true);
    expect(mockCreateGuardianInvite).toHaveBeenCalledTimes(1);
    expect(mockCreateTeamInvite).not.toHaveBeenCalled();
    expect(orderUpdates[0]).toMatchObject({ payment_status: 'fulfilled', approved_by: STAFF_ID });
    // Never routed through the Squad Invite branch's own audit trail.
    expect(auditInserts).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSendEarlyPreviewEmail).not.toHaveBeenCalled();
  });

  it('a standalone-source order is treated identically to a team_order (normal path, not squad_invite)', async () => {
    fixture = {
      orderSource: 'standalone_order',
      orderAuthorityStatus: 'confirmed',
      cards: [{ player_id: 'player-1' }],
      orderRow: { id: ORDER_ID, purchaser_email: 'parent@example.test', intended_guardian_email: null },
    };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(mockCreateGuardianInvite).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/orders/[id]/approve — ordinary-builder safeguarding gate (migration 0071)', () => {
  const baseFixture = () => ({
    orderSource: 'team_order',
    cards: [{ player_id: 'player-1' }],
    orderRow: { id: ORDER_ID, purchaser_email: 'parent@example.test', intended_guardian_email: null },
  });

  it('blocks approval when authority_status is null (no declaration on record)', async () => {
    fixture = { ...baseFixture(), orderAuthorityStatus: null };
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
    expect(builderAuthorityAuditInserts).toHaveLength(1);
    expect(builderAuthorityAuditInserts[0]).toMatchObject({ order_id: ORDER_ID, event_type: 'staff_approval_blocked' });
  });

  it('blocks approval while a guardian request is still pending', async () => {
    fixture = { ...baseFixture(), orderAuthorityStatus: 'guardian_approval_pending' };
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
  });

  it('permanently blocks approval once a guardian has declined — staff cannot override', async () => {
    fixture = { ...baseFixture(), orderAuthorityStatus: 'guardian_declined' };
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
  });

  it('allows approval once the adult declaration is confirmed directly', async () => {
    fixture = { ...baseFixture(), orderAuthorityStatus: 'confirmed' };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(orderUpdates).toHaveLength(1);
  });

  it('allows approval once a guardian has approved', async () => {
    fixture = { ...baseFixture(), orderAuthorityStatus: 'guardian_approved' };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(orderUpdates).toHaveLength(1);
  });

  it('never applies this gate to a squad_invite order', async () => {
    fixture = {
      orderSource: 'squad_invite',
      orderAuthorityStatus: null,
      orderRow: { id: ORDER_ID, purchaser_email: 'guardian@example.test', intended_guardian_email: null, payment_status: 'order_intent', team_name: 'Ashton Juniors U10' },
      participations: [{ id: 'participation-1', campaign_id: 'campaign-1', squad_invites: { campaign_status: 'active' } }],
      squadInviteCard: { claim_token: 'CLAIM123' },
    };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(builderAuthorityAuditInserts).toHaveLength(0);
  });
});

describe('POST /api/orders/[id]/approve — Gate 3 payment gate (single-child tier, ordinary builder)', () => {
  const baseFixture = () => ({
    orderSource: 'team_order',
    orderAuthorityStatus: 'confirmed' as string | null,
    orderPricingTier: 'single' as string | null,
    cards: [{ player_id: 'player-1' }],
    orderRow: { id: ORDER_ID, purchaser_email: 'parent@example.test', intended_guardian_email: null },
  });

  it('when Gate 3 is disabled (env var unset), approval works exactly as before — no payment required', async () => {
    mockGate3PaymentGateEnabled.mockReturnValue(false);
    fixture = { ...baseFixture(), orderPaymentStatus: 'order_intent' };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(orderUpdates).toHaveLength(1);
  });

  it('when Gate 3 is enabled, blocks approval of an unpaid single-tier order', async () => {
    mockGate3PaymentGateEnabled.mockReturnValue(true);
    fixture = { ...baseFixture(), orderPaymentStatus: 'order_intent' };
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
    const body = await res.json();
    expect(body.error).toMatch(/payment is required/i);
  });

  it('when Gate 3 is enabled, blocks approval of a single-tier order still only pending_payment (checkout started, not confirmed)', async () => {
    mockGate3PaymentGateEnabled.mockReturnValue(true);
    fixture = { ...baseFixture(), orderPaymentStatus: 'pending_payment' };
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
  });

  it('when Gate 3 is enabled, allows approval of a paid single-tier order', async () => {
    mockGate3PaymentGateEnabled.mockReturnValue(true);
    fixture = { ...baseFixture(), orderPaymentStatus: 'paid' };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(orderUpdates).toHaveLength(1);
  });

  it('when Gate 3 is enabled, an unpaid multi/squad-tier order is unaffected (no verified variant mapping yet — pre-Gate-3 behaviour preserved)', async () => {
    mockGate3PaymentGateEnabled.mockReturnValue(true);
    fixture = { ...baseFixture(), orderPricingTier: 'multi', orderPaymentStatus: 'order_intent' };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(orderUpdates).toHaveLength(1);
  });

  it('the payment gate is checked before the multi-card club/team-choice requirement, so an unpaid squad order is rejected for payment, not a missing body', async () => {
    mockGate3PaymentGateEnabled.mockReturnValue(true);
    fixture = {
      ...baseFixture(),
      orderPricingTier: 'single',
      orderPaymentStatus: 'order_intent',
      cards: [{ player_id: 'player-1' }, { player_id: 'player-2' }],
    };
    const res = await approve();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/payment is required/i);
  });

  it('never applies to a squad_invite order — that source has its own separate payment gate', async () => {
    mockGate3PaymentGateEnabled.mockReturnValue(true);
    fixture = {
      orderSource: 'squad_invite',
      orderAuthorityStatus: null,
      orderPricingTier: 'single',
      orderPaymentStatus: 'order_intent',
      orderRow: { id: ORDER_ID, purchaser_email: 'guardian@example.test', intended_guardian_email: null, payment_status: 'order_intent', team_name: 'Ashton Juniors U10' },
      participations: [{ id: 'participation-1', campaign_id: 'campaign-1', squad_invites: { campaign_status: 'active' } }],
      squadInviteCard: { claim_token: 'CLAIM123' },
    };
    // mockRpc controls squad_invite_payment_mode_enabled for the squad_invite
    // branch specifically — left at its default (false) here, since this
    // test is only proving Gate 3's OWN check never fires for this source.
    mockRpc.mockResolvedValue({ data: false, error: null });
    const res = await approve();
    expect(res.status).toBe(200);
  });
});

describe('POST /api/orders/[id]/approve — Squad Invite orders (source-aware branch)', () => {
  const PARTICIPATION = { id: 'participation-1', campaign_id: 'campaign-1', squad_invites: { campaign_status: 'active' } };

  beforeEach(() => {
    fixture = {
      orderSource: 'squad_invite',
      orderRow: { id: ORDER_ID, purchaser_email: 'guardian@example.test', intended_guardian_email: null, payment_status: 'order_intent', team_name: 'Ashton Juniors U10' },
      participations: [PARTICIPATION],
      squadInviteCard: { claim_token: 'CLAIM123' },
    };
  });

  it('still enforces staff authorization', async () => {
    mockRequireStaff.mockResolvedValue({ ok: false, status: 401, error: 'Sign in required' });
    const res = await approve();
    expect(res.status).toBe(401);
    expect(orderUpdates).toHaveLength(0);
  });

  it('never sends a guardian or team claim invitation email', async () => {
    const res = await approve();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inviteTriggered).toBe(false);
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
    expect(mockCreateTeamInvite).not.toHaveBeenCalled();
  });

  it('records a Squad-Invite-specific audit event instead of an invite', async () => {
    await approve();
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]).toMatchObject({
      campaign_id: 'campaign-1', participation_id: 'participation-1',
      actor_profile_id: STAFF_ID, actor_role: 'staff', event_type: 'fulfilment_started',
    });
  });

  it('transitions the order into the existing production-enabling state (fulfilled) — the only lever the current queue understands', async () => {
    const res = await approve();
    expect(res.status).toBe(200);
    expect(orderUpdates[0]).toMatchObject({ payment_status: 'fulfilled', approved_by: STAFF_ID });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, source: 'squad_invite', productionQueued: true });
  });

  it('rejects when the order is not linked to exactly one participation (zero)', async () => {
    fixture.participations = [];
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
    expect(mockCreateGuardianInvite).not.toHaveBeenCalled();
  });

  it('rejects when the order is linked to more than one participation (data inconsistency, not a normal state)', async () => {
    fixture.participations = [PARTICIPATION, { ...PARTICIPATION, id: 'participation-2' }];
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
  });

  it('rejects a cancelled campaign as ineligible for approval', async () => {
    fixture.participations = [{ ...PARTICIPATION, squad_invites: { campaign_status: 'cancelled' } }];
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
  });

  it('rejects an exception-state campaign as ineligible for approval', async () => {
    fixture.participations = [{ ...PARTICIPATION, squad_invites: { campaign_status: 'exception' } }];
    const res = await approve();
    expect(res.status).toBe(409);
  });

  it('the response never claims or implies payment was received', async () => {
    const res = await approve();
    const body = await res.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/paid|payment.?received/i);
  });

  it('payment-mode boundary (currently disabled): allows direct order_intent -> fulfilled with no payment', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const res = await approve();
    expect(res.status).toBe(200);
    expect(orderUpdates[0].payment_status).toBe('fulfilled');
  });

  it('payment-mode boundary (future-enabled): requires payment_status=paid before allowing the transition', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    fixture.orderRow = { ...fixture.orderRow!, payment_status: 'order_intent' };
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
  });

  it('payment-mode boundary (future-enabled): permits the transition once payment_status is already paid', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    fixture.orderRow = { ...fixture.orderRow!, payment_status: 'paid' };
    const res = await approve();
    expect(res.status).toBe(200);
  });

  it('never calls Shopify or any payment provider', async () => {
    // No fetch/network mock is installed for this route at all — a call to
    // an external payment provider would throw (no global fetch stub
    // exists in this test file), so a 200 response here is itself proof
    // no such call occurred.
    const res = await approve();
    expect(res.status).toBe(200);
  });

  it('migration 0063: refuses to approve when the order photo has been rejected, before the payment-mode gate', async () => {
    fixture.rejectedPhoto = true;
    const res = await approve();
    expect(res.status).toBe(409);
    expect(orderUpdates).toHaveLength(0);
    const body = await res.json();
    expect(body.error).toMatch(/photo was rejected/i);
    expect(mockRpc).not.toHaveBeenCalledWith('squad_invite_payment_mode_enabled');
  });

  it('migration 0063: approves normally when no photo has been rejected', async () => {
    fixture.rejectedPhoto = false;
    const res = await approve();
    expect(res.status).toBe(200);
  });

  it('sends the early preview email to the purchaser with the order team name and the approved card claim URL', async () => {
    const res = await approve();
    expect(res.status).toBe(200);
    expect(mockSendEarlyPreviewEmail).toHaveBeenCalledWith({
      toEmail: 'guardian@example.test',
      teamName: 'Ashton Juniors U10',
      claimUrl: expect.stringContaining('CLAIM123'),
    });
  });

  it('never sends the early preview email when approval itself is rejected (not linked to exactly one participation)', async () => {
    fixture.participations = [];
    await approve();
    expect(mockSendEarlyPreviewEmail).not.toHaveBeenCalled();
  });

  it('never sends the early preview email when the photo was rejected (migration 0063 guard)', async () => {
    fixture.rejectedPhoto = true;
    await approve();
    expect(mockSendEarlyPreviewEmail).not.toHaveBeenCalled();
  });

  it('never sends the early preview email when the payment-mode gate blocks approval', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    fixture.orderRow = { ...fixture.orderRow!, payment_status: 'order_intent' };
    await approve();
    expect(mockSendEarlyPreviewEmail).not.toHaveBeenCalled();
  });

  it('a failed early preview email never changes the response — approval itself already succeeded', async () => {
    mockSendEarlyPreviewEmail.mockRejectedValue(new Error('resend down'));
    const res = await approve();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, source: 'squad_invite', productionQueued: true });
  });

  it('never lets a missing card row throw — just skips the email', async () => {
    fixture.squadInviteCard = null;
    const res = await approve();
    expect(res.status).toBe(200);
    expect(mockSendEarlyPreviewEmail).not.toHaveBeenCalled();
  });

  it('never sends the early preview email when the order has no purchaser email on file', async () => {
    fixture.orderRow = { ...fixture.orderRow!, purchaser_email: '' };
    await approve();
    expect(mockSendEarlyPreviewEmail).not.toHaveBeenCalled();
  });
});
