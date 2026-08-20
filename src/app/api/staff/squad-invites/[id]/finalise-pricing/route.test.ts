import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * The campaign/eligible-participations fetch was hoisted out of the
 * payment-wall branch so the new pricing-confirmed email can use it
 * unconditionally (see route.ts's own comment). The "payment mode ON"
 * describe block below exists specifically to prove that hoist didn't
 * change the payment-request loop's own behaviour — same fixture data,
 * same assertions a pre-hoist version of this route would have needed.
 */
const mockIsMvpEnabled = vi.fn();
vi.mock('@/lib/squad-invite-mvp', () => ({ isSquadInviteMvpEnabled: () => mockIsMvpEnabled() }));

const mockRequirePermission = vi.fn();
vi.mock('@/lib/require-squad-invite-permission', () => ({
  requireSquadInvitePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockBuildPaymentUrl = vi.fn();
vi.mock('@/lib/squad-invite-payment-link', () => ({
  buildSquadInvitePaymentUrl: (...args: unknown[]) => mockBuildPaymentUrl(...args),
}));

const mockSendPaymentRequestEmail = vi.fn();
vi.mock('@/lib/send-squad-invite-payment-request-email', () => ({
  sendSquadInvitePaymentRequestEmail: (...args: unknown[]) => mockSendPaymentRequestEmail(...args),
}));

const mockSendPricingConfirmedEmail = vi.fn();
vi.mock('@/lib/send-squad-invite-pricing-confirmed-email', () => ({
  sendSquadInvitePricingConfirmedEmail: (...args: unknown[]) => mockSendPricingConfirmedEmail(...args),
}));

type Participation = { id: string; order_id: string; orders: { order_ref: string; purchaser_email: string } | null };

type Fixture = {
  finalisePricingResult: { data: unknown; error: { message: string } | null };
  paymentModeEnabled: boolean;
  campaign: { club_team_name: string } | null;
  participations: Participation[];
  cardsByOrderId: Record<string, { claim_token: string } | null>;
  issuePaymentRequestResult?: { data: unknown; error: { message: string } | null };
  cardLookupThrowsFor?: string;
};

let fixture: Fixture;
const mockRpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      if (table === 'squad_invites') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fixture.campaign }) }) }) };
      }
      if (table === 'squad_invite_participations') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: fixture.participations }) }) }) };
      }
      if (table === 'cards') {
        return {
          select: () => ({
            eq: (_col: string, orderId: string) => ({
              maybeSingle: async () => {
                if (fixture.cardLookupThrowsFor === orderId) throw new Error('db unavailable');
                return { data: fixture.cardsByOrderId[orderId] ?? null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const CAMPAIGN_ID = 'campaign-1';

function finalisePricing() {
  return POST(new NextRequest(`http://localhost/api/staff/squad-invites/${CAMPAIGN_ID}/finalise-pricing`, { method: 'POST' }), { params: { id: CAMPAIGN_ID } });
}

beforeEach(() => {
  mockIsMvpEnabled.mockReset();
  mockRequirePermission.mockReset();
  mockBuildPaymentUrl.mockReset();
  mockSendPaymentRequestEmail.mockReset();
  mockSendPricingConfirmedEmail.mockReset();
  mockRpc.mockReset();

  mockIsMvpEnabled.mockReturnValue(true);
  mockRequirePermission.mockResolvedValue({ ok: true, userId: 'staff-1' });
  mockSendPaymentRequestEmail.mockResolvedValue({ ok: true });
  mockSendPricingConfirmedEmail.mockResolvedValue({ ok: true });
  mockBuildPaymentUrl.mockReturnValue('https://emblem-uk.example/pay/abc');

  fixture = {
    finalisePricingResult: {
      data: { created: true, commitmentCount: 3, printQuantity: 3, tier: 'multi', unitPricePence: 2199 },
      error: null,
    },
    paymentModeEnabled: false,
    campaign: { club_team_name: 'Ashton Juniors U10' },
    participations: [
      { id: 'p-1', order_id: 'order-1', orders: { order_ref: 'ref-1', purchaser_email: 'guardian1@example.test' } },
      { id: 'p-2', order_id: 'order-2', orders: { order_ref: 'ref-2', purchaser_email: 'guardian2@example.test' } },
      { id: 'p-3', order_id: 'order-3', orders: { order_ref: 'ref-3', purchaser_email: 'guardian3@example.test' } },
    ],
    cardsByOrderId: {
      'order-1': { claim_token: 'TOKEN1' },
      'order-2': { claim_token: 'TOKEN2' },
      'order-3': { claim_token: 'TOKEN3' },
    },
  };

  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'finalise_squad_invite_pricing') return fixture.finalisePricingResult;
    if (name === 'squad_invite_payment_mode_enabled') return { data: fixture.paymentModeEnabled, error: null };
    if (name === 'issue_squad_invite_payment_request') return fixture.issuePaymentRequestResult ?? { data: { printQuantity: 1 }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
});

describe('POST /api/staff/squad-invites/[id]/finalise-pricing — access gates (unchanged)', () => {
  it('returns 404 when the MVP flag is off', async () => {
    mockIsMvpEnabled.mockReturnValue(false);
    const res = await finalisePricing();
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires Approver permission', async () => {
    mockRequirePermission.mockResolvedValue({ ok: false, status: 403, error: 'Squad Invite permission required' });
    const res = await finalisePricing();
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces an RPC failure as a 409', async () => {
    fixture.finalisePricingResult = { data: null, error: { message: 'campaign not found' } };
    const res = await finalisePricing();
    expect(res.status).toBe(409);
    expect(mockSendPricingConfirmedEmail).not.toHaveBeenCalled();
  });

  it('calls finalise_squad_invite_pricing with only the campaign id — never sends campaign status or grace timing, so eligibility (including the closed-campaign grace bypass from 0066) is decided entirely inside the RPC, not duplicated here', async () => {
    await finalisePricing();
    expect(mockRpc).toHaveBeenCalledWith('finalise_squad_invite_pricing', { p_campaign_id: CAMPAIGN_ID });
  });

  it('succeeds on a campaign the RPC finalises despite grace not having ended by the clock — proving the route has no independent grace gate of its own that could shadow a closed-campaign early finalisation', async () => {
    // The route never reads campaign_status or grace_ends_at itself, so
    // there is nothing here to distinguish "closed, grace not over" from
    // any other successful finalisation — this fixture stands in for it,
    // and the real bypass is proven against the SQL text in
    // migration-0066-contract.test.ts.
    fixture.finalisePricingResult = {
      data: { created: true, commitmentCount: 9, printQuantity: 9, tier: 'multi', unitPricePence: 2199 },
      error: null,
    };
    const res = await finalisePricing();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pricing).toEqual(fixture.finalisePricingResult.data);
  });
});

describe('POST /api/staff/squad-invites/[id]/finalise-pricing — pricing-confirmed email (payment mode off)', () => {
  it('sends every committed parent their confirmed price on a genuine first finalisation', async () => {
    const res = await finalisePricing();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ paymentRequestsEnabled: false, pricingNotified: 3, pricingNotifyFailed: 0 });
    expect(mockSendPricingConfirmedEmail).toHaveBeenCalledTimes(3);
    expect(mockSendPricingConfirmedEmail).toHaveBeenNthCalledWith(1, {
      toEmail: 'guardian1@example.test',
      teamName: 'Ashton Juniors U10',
      committedCount: 3,
      unitPricePence: 2199,
      tier: 'multi',
      claimUrl: expect.stringContaining('TOKEN1'),
    });
    expect(mockSendPricingConfirmedEmail).toHaveBeenNthCalledWith(3, expect.objectContaining({
      toEmail: 'guardian3@example.test',
      claimUrl: expect.stringContaining('TOKEN3'),
    }));
  });

  it('never sends on an idempotent repeat call (created:false) — the campaign was already finalised', async () => {
    fixture.finalisePricingResult = {
      data: { created: false, tier: 'multi', unitPricePence: 2199 },
      error: null,
    };
    const res = await finalisePricing();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pricingNotified).toBe(0);
    expect(body.pricingNotifyFailed).toBe(0);
    expect(mockSendPricingConfirmedEmail).not.toHaveBeenCalled();
  });

  it('a participation with no purchaser email is skipped and counted, without stopping the rest', async () => {
    fixture.participations[1] = { ...fixture.participations[1], orders: { order_ref: 'ref-2', purchaser_email: '' } };
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.pricingNotified).toBe(2);
    expect(body.pricingNotifyFailed).toBe(1);
    expect(mockSendPricingConfirmedEmail).toHaveBeenCalledTimes(2);
  });

  it('a participation with no card on file is skipped and counted, without stopping the rest', async () => {
    fixture.cardsByOrderId['order-2'] = null;
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.pricingNotified).toBe(2);
    expect(body.pricingNotifyFailed).toBe(1);
  });

  it('a failed send (ok:false) is counted, without stopping the rest', async () => {
    mockSendPricingConfirmedEmail
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.pricingNotified).toBe(2);
    expect(body.pricingNotifyFailed).toBe(1);
  });

  it('a thrown error mid-loop (e.g. the card lookup itself failing) is caught, counted, and does not stop the rest', async () => {
    fixture.cardLookupThrowsFor = 'order-2';
    const res = await finalisePricing();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pricingNotified).toBe(2);
    expect(body.pricingNotifyFailed).toBe(1);
    expect(mockSendPricingConfirmedEmail).toHaveBeenCalledTimes(2);
  });

  it('never calls the payment-request machinery while the wall is off', async () => {
    await finalisePricing();
    expect(mockBuildPaymentUrl).not.toHaveBeenCalled();
    expect(mockSendPaymentRequestEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/staff/squad-invites/[id]/finalise-pricing — payment mode ON (existing behaviour must be unchanged)', () => {
  beforeEach(() => {
    fixture.paymentModeEnabled = true;
  });

  it('still issues a payment request and sends the payment-request email to every eligible participation, identically to before the hoist', async () => {
    const res = await finalisePricing();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ paymentRequestsEnabled: true, issued: 3, failed: 0 });
    expect(mockSendPaymentRequestEmail).toHaveBeenCalledTimes(3);
    expect(mockSendPaymentRequestEmail).toHaveBeenNthCalledWith(1, {
      toEmail: 'guardian1@example.test',
      teamName: 'Ashton Juniors U10',
      paymentUrl: 'https://emblem-uk.example/pay/abc',
      unitPricePence: 2199,
      printQuantity: 1,
    });
    expect(mockBuildPaymentUrl).toHaveBeenCalledWith('multi', 1, 'ref-1');
  });

  it('also still sends the pricing-confirmed email to everyone, in addition to the payment request', async () => {
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.pricingNotified).toBe(3);
    expect(mockSendPricingConfirmedEmail).toHaveBeenCalledTimes(3);
  });

  it('a participation missing an order_ref still fails only the payment-request loop, unchanged', async () => {
    fixture.participations[0] = { ...fixture.participations[0], orders: { order_ref: '', purchaser_email: 'guardian1@example.test' } };
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.issued).toBe(2);
    expect(body.failed).toBe(1);
    // The pricing-confirmed loop only needs an email, not an order_ref —
    // this same participation still gets its price confirmed.
    expect(body.pricingNotified).toBe(3);
  });

  it('a failed issue_squad_invite_payment_request RPC call is counted as failed, unchanged', async () => {
    fixture.issuePaymentRequestResult = { data: null, error: { message: 'already issued' } };
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.issued).toBe(0);
    expect(body.failed).toBe(3);
  });

  it('a missing payment URL (buildSquadInvitePaymentUrl returns null) is counted as failed, unchanged', async () => {
    mockBuildPaymentUrl.mockReturnValue(null);
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.issued).toBe(0);
    expect(body.failed).toBe(3);
  });

  it('skips the payment-request loop entirely when pricing has no tier/unitPricePence (idempotent repeat with missing data)', async () => {
    fixture.finalisePricingResult = { data: { created: false, tier: undefined, unitPricePence: undefined }, error: null };
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.paymentRequestsEnabled).toBe(false);
    expect(mockSendPaymentRequestEmail).not.toHaveBeenCalled();
  });
});
