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

const mockCreatePreviewToken = vi.fn();
vi.mock('@/lib/squad-invite-payment-preview-token', () => ({
  createSquadInvitePaymentPreviewToken: () => mockCreatePreviewToken(),
}));

const mockEnqueueStaffNotification = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockEnqueueStaffNotification(...args),
}));

type Participation = { id: string; order_id: string; orders: { order_ref: string; purchaser_email: string } | null };

type Fixture = {
  finalisePricingResult: { data: unknown; error: { message: string } | null };
  paymentModeEnabled: boolean;
  campaign: { club_team_name: string } | null;
  matchedRequest: { public_reference: string } | null;
  participations: Participation[];
  issuePaymentRequestResult?: { data: unknown; error: { message: string } | null };
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
      if (table === 'squad_invite_requests') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fixture.matchedRequest }) }) }) };
      }
      if (table === 'squad_invite_participations') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: fixture.participations }) }) }) };
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
  mockCreatePreviewToken.mockReset();
  mockEnqueueStaffNotification.mockReset();
  mockRpc.mockReset();

  mockIsMvpEnabled.mockReturnValue(true);
  mockRequirePermission.mockResolvedValue({ ok: true, userId: 'staff-1' });
  mockSendPaymentRequestEmail.mockResolvedValue({ ok: true });
  mockSendPricingConfirmedEmail.mockResolvedValue({ ok: true });
  mockBuildPaymentUrl.mockReturnValue('https://emblem-uk.example/pay/abc');
  mockCreatePreviewToken.mockReturnValue({ token: 'preview-token-abc', hash: 'a'.repeat(64) });

  fixture = {
    finalisePricingResult: {
      data: { created: true, commitmentCount: 3, printQuantity: 3, tier: 'multi', unitPricePence: 2199 },
      error: null,
    },
    paymentModeEnabled: false,
    campaign: { club_team_name: 'Ashton Juniors U10' },
    matchedRequest: { public_reference: 'SI-ABCD1234EF' },
    participations: [
      { id: 'p-1', order_id: 'order-1', orders: { order_ref: 'ref-1', purchaser_email: 'guardian1@example.test' } },
      { id: 'p-2', order_id: 'order-2', orders: { order_ref: 'ref-2', purchaser_email: 'guardian2@example.test' } },
      { id: 'p-3', order_id: 'order-3', orders: { order_ref: 'ref-3', purchaser_email: 'guardian3@example.test' } },
    ],
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
    });
    expect(mockSendPricingConfirmedEmail).toHaveBeenNthCalledWith(3, expect.objectContaining({
      toEmail: 'guardian3@example.test',
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

  it('a thrown error mid-loop (e.g. the email send itself throwing) is caught, counted, and does not stop the rest', async () => {
    mockSendPricingConfirmedEmail
      .mockResolvedValueOnce({ ok: true })
      .mockImplementationOnce(() => { throw new Error('resend unavailable'); })
      .mockResolvedValueOnce({ ok: true });
    const res = await finalisePricing();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pricingNotified).toBe(2);
    expect(body.pricingNotifyFailed).toBe(1);
    expect(mockSendPricingConfirmedEmail).toHaveBeenCalledTimes(3);
  });

  it('never calls the payment-request machinery while the wall is off', async () => {
    await finalisePricing();
    expect(mockBuildPaymentUrl).not.toHaveBeenCalled();
    expect(mockSendPaymentRequestEmail).not.toHaveBeenCalled();
  });

  it('never notifies staff when every pricing-confirmed email succeeds', async () => {
    await finalisePricing();
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('notifies staff once, with the failure count, when a pricing-confirmed email fails — even though the wall is off and no payment-request loop runs', async () => {
    fixture.participations[1] = { ...fixture.participations[1], orders: { order_ref: 'ref-2', purchaser_email: '' } };
    await finalisePricing();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { eventType: string; summary: Record<string, unknown>; linkPath: string };
    expect(call.eventType).toBe('finalise_pricing_issues');
    expect(call.summary).toEqual({ teamName: 'Ashton Juniors U10', pricingConfirmationFailures: 1, paymentRequestFailures: 0 });
    expect(call.linkPath).toBe('/staff/squad-invites/SI-ABCD1234EF');
  });
});

describe('POST /api/staff/squad-invites/[id]/finalise-pricing — payment mode ON (existing behaviour must be unchanged)', () => {
  beforeEach(() => {
    fixture.paymentModeEnabled = true;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it('still issues a payment request and sends the payment-request email to every eligible participation, now pointing at the payment-preview page instead of directly at Shopify', async () => {
    const res = await finalisePricing();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ paymentRequestsEnabled: true, issued: 3, failed: 0 });
    expect(mockSendPaymentRequestEmail).toHaveBeenCalledTimes(3);
    expect(mockSendPaymentRequestEmail).toHaveBeenNthCalledWith(1, {
      toEmail: 'guardian1@example.test',
      teamName: 'Ashton Juniors U10',
      paymentUrl: 'https://emblem-uk-lauda-collectives-projects.vercel.app/squad-invite/pay#token=preview-token-abc',
      unitPricePence: 2199,
      printQuantity: 1,
    });
  });

  it('rebuilds the checkout URL only as a pre-flight tier/variant check (printQuantity=1, discarded) — the payment-request email never carries the raw Shopify URL, only the preview-page link', async () => {
    await finalisePricing();
    expect(mockBuildPaymentUrl).toHaveBeenCalledWith('multi', 1, 'ref-1');
    const anyEmailedPaymentUrl = mockSendPaymentRequestEmail.mock.calls.map((c) => (c[0] as { paymentUrl: string }).paymentUrl);
    expect(anyEmailedPaymentUrl.every((url) => url.includes('/squad-invite/pay#token='))).toBe(true);
    expect(anyEmailedPaymentUrl.every((url) => !url.includes('shopify.com'))).toBe(true);
  });

  it('threads the preview token hash into issue_squad_invite_payment_request in the same atomic call, not a second RPC', async () => {
    await finalisePricing();
    expect(mockRpc).toHaveBeenCalledWith('issue_squad_invite_payment_request', {
      p_participation_id: 'p-1',
      p_preview_token_hash: 'a'.repeat(64),
    });
  });

  it('honours NEXT_PUBLIC_SITE_URL when set, instead of the hardcoded fallback', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://emblem-uk.example';
    await finalisePricing();
    const url = (mockSendPaymentRequestEmail.mock.calls[0][0] as { paymentUrl: string }).paymentUrl;
    expect(url).toBe('https://emblem-uk.example/squad-invite/pay#token=preview-token-abc');
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

  it('notifies staff once, with the payment-request failure count, when the wall is on and a payment request fails to issue', async () => {
    fixture.participations[0] = { ...fixture.participations[0], orders: { order_ref: '', purchaser_email: 'guardian1@example.test' } };
    await finalisePricing();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { eventType: string; summary: Record<string, unknown>; recipientScope: string };
    expect(call.eventType).toBe('finalise_pricing_issues');
    expect(call.recipientScope).toBe('squad_invite_approver');
    expect(call.summary).toEqual({ teamName: 'Ashton Juniors U10', pricingConfirmationFailures: 0, paymentRequestFailures: 1 });
  });

  it('never notifies staff when everything succeeds, wall on', async () => {
    await finalisePricing();
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('a failed issue_squad_invite_payment_request RPC call is counted as failed, unchanged', async () => {
    fixture.issuePaymentRequestResult = { data: null, error: { message: 'already issued' } };
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.issued).toBe(0);
    expect(body.failed).toBe(3);
  });

  it('a missing tier/variant config (buildSquadInvitePaymentUrl returns null) fails at the pre-flight check, before ever minting a token or opening the 72-hour window', async () => {
    mockBuildPaymentUrl.mockReturnValue(null);
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.issued).toBe(0);
    expect(body.failed).toBe(3);
    expect(mockCreatePreviewToken).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('issue_squad_invite_payment_request', expect.anything());
  });

  it('skips the payment-request loop entirely when pricing has no tier/unitPricePence (idempotent repeat with missing data)', async () => {
    fixture.finalisePricingResult = { data: { created: false, tier: undefined, unitPricePence: undefined }, error: null };
    const res = await finalisePricing();
    const body = await res.json();
    expect(body.paymentRequestsEnabled).toBe(false);
    expect(mockSendPaymentRequestEmail).not.toHaveBeenCalled();
  });
});
