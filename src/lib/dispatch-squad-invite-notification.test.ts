import { describe, expect, it, vi, beforeEach } from 'vitest';
import { dispatchSquadInviteNotification } from './dispatch-squad-invite-notification';

const mockSendEmail = vi.fn();
vi.mock('@/lib/send-squad-invite-notification-email', () => ({
  sendSquadInviteNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockEnqueueStaffNotification = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: (...args: unknown[]) => mockEnqueueStaffNotification(...args),
}));

function fakeService(outboxRow: { id: string; status: string; attempt_count: number } | null) {
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: outboxRow }) }) }) }),
      update: () => ({ eq: updateEq }),
    })),
    updateEq,
  };
}

const PARAMS = {
  requestId: 'request-1',
  eventKey: 'request_received:v1',
  template: 'request_received' as const,
  teamName: 'Ashton Juniors U10',
  publicReference: 'SI-ABCD1234EF',
  toEmail: 'organiser@example.test',
};

describe('dispatchSquadInviteNotification', () => {
  beforeEach(() => {
    mockSendEmail.mockReset();
    mockEnqueueStaffNotification.mockReset();
  });

  it('does nothing when no outbox row is found, or it is not still disabled_test', async () => {
    const { from } = fakeService(null);
    await dispatchSquadInviteNotification({ from } as never, PARAMS);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('never notifies staff when the organiser email sends successfully', async () => {
    mockSendEmail.mockResolvedValue({ ok: true });
    const service = fakeService({ id: 'outbox-1', status: 'disabled_test', attempt_count: 0 });
    await dispatchSquadInviteNotification(service as never, PARAMS);
    expect(mockEnqueueStaffNotification).not.toHaveBeenCalled();
  });

  it('notifies squad_invite_approver staff, referencing the failed outbox row, when the organiser email fails to send', async () => {
    mockSendEmail.mockResolvedValue({ ok: false });
    const service = fakeService({ id: 'outbox-1', status: 'disabled_test', attempt_count: 0 });
    await dispatchSquadInviteNotification(service as never, PARAMS);
    expect(mockEnqueueStaffNotification).toHaveBeenCalledTimes(1);
    const call = mockEnqueueStaffNotification.mock.calls[0][1] as { eventType: string; eventKey: string; recipientScope: string; linkPath: string };
    expect(call.eventType).toBe('organiser_notification_failed');
    expect(call.eventKey).toBe('organiser_notification_failed:outbox-1');
    expect(call.recipientScope).toBe('squad_invite_approver');
    expect(call.linkPath).toBe('/staff/squad-invites/SI-ABCD1234EF');
  });
});
