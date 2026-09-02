import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockEnqueueStaffNotification = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockEnqueueStaffNotification(...args),
}));

type Campaign = { id: string; club_team_name: string; campaign_status: string; grace_ends_at: string | null };

type Fixture = {
  campaigns: Campaign[];
  eligibleCountByCampaign: Record<string, number>;
  requests: Record<string, { public_reference: string } | null>;
};

let fixture: Fixture;

const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'squad_invites') {
        return { select: () => ({ is: async () => ({ data: fixture.campaigns }) }) };
      }
      if (table === 'squad_invite_participations') {
        return {
          select: () => ({
            eq: (_col: string, campaignId: string) => ({
              eq: async () => ({ count: fixture.eligibleCountByCampaign[campaignId] ?? 0 }),
            }),
          }),
        };
      }
      if (table === 'squad_invite_requests') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: fixture.requests[id] ?? null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const ORIGINAL_ENV = { ...process.env };

function sweep() {
  return POST(new NextRequest('http://localhost/api/internal/cron/sweep-squad-invite-ready-to-finalise', {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-cron-secret' };
  mockEnqueueStaffNotification.mockReset().mockResolvedValue({ enqueued: true, sent: true });
  fixture = { campaigns: [], eligibleCountByCampaign: {}, requests: {} };
});

describe('POST /api/internal/cron/sweep-squad-invite-ready-to-finalise', () => {
  it('rejects a request without the correct CRON_SECRET', async () => {
    const res = await POST(new NextRequest('http://localhost/api/internal/cron/sweep-squad-invite-ready-to-finalise', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('does nothing when there are no unfinalised campaigns', async () => {
    const res = await sweep();
    const body = await res.json();
    expect(body).toEqual({ ok: true, campaignsReady: 0, campaignsNotified: 0 });
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('notifies for a campaign whose grace period has ended with an eligible commitment', async () => {
    fixture.campaigns = [{ id: 'camp-1', club_team_name: 'Ashton Juniors U10', campaign_status: 'grace_period', grace_ends_at: PAST }];
    fixture.eligibleCountByCampaign['camp-1'] = 3;
    fixture.requests['camp-1'] = { public_reference: 'SI-ABCD1234EF' };

    const res = await sweep();
    const body = await res.json();

    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as {
      eventType: string; eventKey: string; recipientScope: string; summary: Record<string, unknown>; linkPath: string;
    };
    expect(call.eventType).toBe('squad_invite_ready_to_finalise');
    expect(call.eventKey).toBe('squad_invite_ready_to_finalise:camp-1');
    expect(call.recipientScope).toBe('squad_invite_approver');
    expect(call.summary).toEqual({ teamName: 'Ashton Juniors U10', eligibleCommitments: 3, reference: 'SI-ABCD1234EF' });
    expect(call.linkPath).toBe('/staff/squad-invites/SI-ABCD1234EF');
    expect(body).toEqual({ ok: true, campaignsReady: 1, campaignsNotified: 1 });
  });

  it('treats an early-closed campaign as ready regardless of grace_ends_at', async () => {
    fixture.campaigns = [{ id: 'camp-1', club_team_name: 'Ashton Juniors U10', campaign_status: 'closed', grace_ends_at: FUTURE }];
    fixture.eligibleCountByCampaign['camp-1'] = 1;
    fixture.requests['camp-1'] = { public_reference: 'SI-ABCD1234EF' };

    const res = await sweep();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.campaignsReady).toBe(1);
  });

  it('skips a campaign still inside its grace period', async () => {
    fixture.campaigns = [{ id: 'camp-1', club_team_name: 'Ashton Juniors U10', campaign_status: 'grace_period', grace_ends_at: FUTURE }];
    fixture.eligibleCountByCampaign['camp-1'] = 5;
    fixture.requests['camp-1'] = { public_reference: 'SI-ABCD1234EF' };

    await sweep();
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('skips cancelled and expired campaigns even past their grace period', async () => {
    fixture.campaigns = [
      { id: 'camp-1', club_team_name: 'Cancelled FC', campaign_status: 'cancelled', grace_ends_at: PAST },
      { id: 'camp-2', club_team_name: 'Expired FC', campaign_status: 'expired', grace_ends_at: PAST },
    ];
    fixture.eligibleCountByCampaign = { 'camp-1': 5, 'camp-2': 5 };
    fixture.requests = { 'camp-1': { public_reference: 'SI-AAAA1111BB' }, 'camp-2': { public_reference: 'SI-CCCC2222DD' } };

    await sweep();
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('skips a campaign past grace with zero eligible commitments', async () => {
    fixture.campaigns = [{ id: 'camp-1', club_team_name: 'Ashton Juniors U10', campaign_status: 'grace_period', grace_ends_at: PAST }];
    fixture.eligibleCountByCampaign['camp-1'] = 0;
    fixture.requests['camp-1'] = { public_reference: 'SI-ABCD1234EF' };

    await sweep();
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('skips a campaign with no matching request row rather than throwing', async () => {
    fixture.campaigns = [{ id: 'camp-1', club_team_name: 'Ashton Juniors U10', campaign_status: 'grace_period', grace_ends_at: PAST }];
    fixture.eligibleCountByCampaign['camp-1'] = 1;
    fixture.requests['camp-1'] = null;

    const res = await sweep();
    expect(res.status).toBe(200);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('the non-date-scoped idempotency key means an already-notified campaign is skipped on a later run without re-sending', async () => {
    fixture.campaigns = [{ id: 'camp-1', club_team_name: 'Ashton Juniors U10', campaign_status: 'grace_period', grace_ends_at: PAST }];
    fixture.eligibleCountByCampaign['camp-1'] = 1;
    fixture.requests['camp-1'] = { public_reference: 'SI-ABCD1234EF' };
    mockEnqueueStaffNotification.mockResolvedValue({ enqueued: false, sent: false });

    const res = await sweep();
    const body = await res.json();

    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    expect(body.campaignsNotified).toBe(0);
  });

  it('notifies separately for two different ready campaigns', async () => {
    fixture.campaigns = [
      { id: 'camp-1', club_team_name: 'Ashton Juniors U10', campaign_status: 'grace_period', grace_ends_at: PAST },
      { id: 'camp-2', club_team_name: 'Wembey FC', campaign_status: 'grace_period', grace_ends_at: PAST },
    ];
    fixture.eligibleCountByCampaign = { 'camp-1': 2, 'camp-2': 4 };
    fixture.requests = { 'camp-1': { public_reference: 'SI-AAAA1111BB' }, 'camp-2': { public_reference: 'SI-CCCC2222DD' } };

    const res = await sweep();
    const body = await res.json();
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(2);
    expect(body).toEqual({ ok: true, campaignsReady: 2, campaignsNotified: 2 });
  });
});
