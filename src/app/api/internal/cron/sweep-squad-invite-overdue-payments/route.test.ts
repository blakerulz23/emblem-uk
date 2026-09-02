import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockEnqueueStaffNotification = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockEnqueueStaffNotification(...args),
}));

type Fixture = {
  overdueParticipations: { campaign_id: string }[];
  campaigns: Record<string, { club_team_name: string }>;
  requests: Record<string, { public_reference: string } | null>;
};

let fixture: Fixture;

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'squad_invite_participations') {
        return { select: () => ({ eq: () => ({ lt: async () => ({ data: fixture.overdueParticipations }) }) }) };
      }
      if (table === 'squad_invites') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: fixture.campaigns[id] ?? null }) }) }) };
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
  return POST(new NextRequest('http://localhost/api/internal/cron/sweep-squad-invite-overdue-payments', {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-cron-secret' };
  mockEnqueueStaffNotification.mockReset().mockResolvedValue({ enqueued: true, sent: true });
  fixture = { overdueParticipations: [], campaigns: {}, requests: {} };
});

describe('POST /api/internal/cron/sweep-squad-invite-overdue-payments', () => {
  it('rejects a request without the correct CRON_SECRET', async () => {
    const res = await POST(new NextRequest('http://localhost/api/internal/cron/sweep-squad-invite-overdue-payments', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('does nothing when no participation is overdue', async () => {
    const res = await sweep();
    const body = await res.json();
    expect(body).toEqual({ ok: true, campaignsWithOverduePayments: 0, campaignsNotified: 0 });
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('groups multiple overdue participations in the same campaign into ONE notification, not one per participant', async () => {
    fixture.overdueParticipations = [{ campaign_id: 'camp-1' }, { campaign_id: 'camp-1' }, { campaign_id: 'camp-1' }];
    fixture.campaigns['camp-1'] = { club_team_name: 'Ashton Juniors U10' };
    fixture.requests['camp-1'] = { public_reference: 'SI-ABCD1234EF' };

    const res = await sweep();
    const body = await res.json();

    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { eventType: string; recipientScope: string; summary: Record<string, unknown>; linkPath: string };
    expect(call.eventType).toBe('squad_invite_payments_overdue');
    expect(call.recipientScope).toBe('squad_invite_approver');
    expect(call.summary).toEqual({ teamName: 'Ashton Juniors U10', overdueCount: 3, reference: 'SI-ABCD1234EF' });
    expect(call.linkPath).toBe('/staff/squad-invites/SI-ABCD1234EF');
    expect(body).toEqual({ ok: true, campaignsWithOverduePayments: 1, campaignsNotified: 1 });
  });

  it('notifies separately, once each, for two different campaigns with overdue payments', async () => {
    fixture.overdueParticipations = [{ campaign_id: 'camp-1' }, { campaign_id: 'camp-2' }];
    fixture.campaigns = {
      'camp-1': { club_team_name: 'Ashton Juniors U10' },
      'camp-2': { club_team_name: 'Wembey FC' },
    };
    fixture.requests = {
      'camp-1': { public_reference: 'SI-AAAA1111BB' },
      'camp-2': { public_reference: 'SI-CCCC2222DD' },
    };

    const res = await sweep();
    const body = await res.json();

    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(2);
    expect(body.campaignsWithOverduePayments).toBe(2);
  });

  it('the date-scoped idempotency key means a campaign already notified today is skipped without re-sending', async () => {
    fixture.overdueParticipations = [{ campaign_id: 'camp-1' }];
    fixture.campaigns['camp-1'] = { club_team_name: 'Ashton Juniors U10' };
    fixture.requests['camp-1'] = { public_reference: 'SI-ABCD1234EF' };
    mockEnqueueStaffNotification.mockResolvedValue({ enqueued: false, sent: false });

    const res = await sweep();
    const body = await res.json();

    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    expect(body.campaignsNotified).toBe(0);
  });

  it('skips a campaign with no matching request row (no public_reference to link to) rather than throwing', async () => {
    fixture.overdueParticipations = [{ campaign_id: 'camp-1' }];
    fixture.campaigns['camp-1'] = { club_team_name: 'Ashton Juniors U10' };
    fixture.requests['camp-1'] = null;

    const res = await sweep();
    expect(res.status).toBe(200);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });
});
