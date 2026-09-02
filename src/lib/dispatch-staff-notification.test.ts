import { describe, expect, it, vi, beforeEach } from 'vitest';
import { enqueueAndDispatchStaffNotification } from './dispatch-staff-notification';

const mockResolveRecipients = vi.fn();
vi.mock('@/lib/staff-notification-recipients', () => ({
  resolveStaffNotificationRecipients: (...args: unknown[]) => mockResolveRecipients(...args),
}));

const mockSendEmail = vi.fn();
vi.mock('@/lib/send-staff-notification-email', () => ({
  sendStaffNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

function fakeService(rpcResult: { data: unknown; error: { message: string } | null }) {
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  return {
    service: {
      rpc: vi.fn().mockResolvedValue(rpcResult),
      from: vi.fn(() => ({ update })),
    },
    update,
    updateEq,
  };
}

describe('enqueueAndDispatchStaffNotification', () => {
  beforeEach(() => {
    mockResolveRecipients.mockReset().mockResolvedValue(['staff@example.test']);
    mockSendEmail.mockReset().mockResolvedValue({ ok: true });
  });

  const CALL_PARAMS = {
    eventType: 'organiser_concern_flagged',
    eventKey: 'organiser_concern_flagged:request-1',
    subjectId: 'request-1',
    recipientScope: 'squad_invite_approver' as const,
    summary: { teamName: 'Ashton Juniors U10' },
    linkPath: '/staff/squad-invites/SI-ABCD1234EF',
  };

  it('calls the enqueue RPC, resolves recipients, sends, and marks the row sent on success', async () => {
    const { service, update, updateEq } = fakeService({ data: 'outbox-1', error: null });
    const result = await enqueueAndDispatchStaffNotification(service as never, CALL_PARAMS);
    expect(service.rpc).toHaveBeenCalledWith('enqueue_staff_notification', {
      p_event_type: 'organiser_concern_flagged',
      p_event_key: 'organiser_concern_flagged:request-1',
      p_subject_id: 'request-1',
      p_recipient_scope: 'squad_invite_approver',
      p_summary: { teamName: 'Ashton Juniors U10' },
      p_link_path: '/staff/squad-invites/SI-ABCD1234EF',
    });
    expect(mockResolveRecipients).toHaveBeenCalledWith(service, 'squad_invite_approver');
    expect(mockSendEmail).toHaveBeenCalledWith({
      toEmails: ['staff@example.test'],
      eventType: 'organiser_concern_flagged',
      summary: { teamName: 'Ashton Juniors U10' },
      linkPath: '/staff/squad-invites/SI-ABCD1234EF',
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
    expect(updateEq).toHaveBeenCalledWith('id', 'outbox-1');
    expect(result).toEqual({ enqueued: true, sent: true });
  });

  it('is a safe no-op when the RPC returns null (idempotent conflict) — never resolves recipients or sends', async () => {
    const { service } = fakeService({ data: null, error: null });
    const result = await enqueueAndDispatchStaffNotification(service as never, CALL_PARAMS);
    expect(mockResolveRecipients).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: false, sent: false });
  });

  it('never throws when the RPC itself errors', async () => {
    const { service } = fakeService({ data: null, error: { message: 'db unavailable' } });
    const result = await enqueueAndDispatchStaffNotification(service as never, CALL_PARAMS);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: false, sent: false });
  });

  it('marks the row failed, without throwing, when the email send fails', async () => {
    mockSendEmail.mockResolvedValue({ ok: false });
    const { service, update } = fakeService({ data: 'outbox-1', error: null });
    const result = await enqueueAndDispatchStaffNotification(service as never, CALL_PARAMS);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(result).toEqual({ enqueued: true, sent: false });
  });

  it('never throws even if resolveStaffNotificationRecipients itself throws', async () => {
    mockResolveRecipients.mockRejectedValue(new Error('boom'));
    const { service } = fakeService({ data: 'outbox-1', error: null });
    const result = await enqueueAndDispatchStaffNotification(service as never, CALL_PARAMS);
    expect(result).toEqual({ enqueued: false, sent: false });
  });
});
