import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveStaffNotificationRecipients } from './staff-notification-recipients';

describe('resolveStaffNotificationRecipients', () => {
  const getUserById = vi.fn();
  let service: {
    from: (table: string) => unknown;
    auth: { admin: { getUserById: typeof getUserById } };
  };

  beforeEach(() => {
    getUserById.mockReset();
  });

  function fakeService(staffRows: { profile_id: string }[], permissionRows: { staff_profile_id: string }[]) {
    service = {
      from: (table: string) => {
        if (table === 'staff_accounts') {
          return { select: () => Promise.resolve({ data: staffRows }) };
        }
        if (table === 'squad_invite_staff_permissions') {
          return { select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: permissionRows }) }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
      auth: { admin: { getUserById } },
    };
    return service as unknown as Parameters<typeof resolveStaffNotificationRecipients>[0];
  }

  it("'all_staff' resolves every staff_accounts row's email via auth.admin.getUserById", async () => {
    const svc = fakeService([{ profile_id: 'p-1' }, { profile_id: 'p-2' }], []);
    getUserById.mockImplementation((id: string) => Promise.resolve({ data: { user: { email: `${id}@example.test` } } }));
    const emails = await resolveStaffNotificationRecipients(svc, 'all_staff');
    expect(emails).toEqual(['p-1@example.test', 'p-2@example.test']);
  });

  it("a squad-invite scope resolves only staff holding that specific, non-revoked permission", async () => {
    const svc = fakeService([], [{ staff_profile_id: 'p-approver' }]);
    getUserById.mockResolvedValue({ data: { user: { email: 'approver@example.test' } } });
    const emails = await resolveStaffNotificationRecipients(svc, 'squad_invite_approver');
    expect(emails).toEqual(['approver@example.test']);
  });

  it('drops a profile whose email cannot be resolved, rather than throwing', async () => {
    const svc = fakeService([{ profile_id: 'p-1' }, { profile_id: 'p-2' }], []);
    getUserById
      .mockResolvedValueOnce({ data: { user: { email: 'ok@example.test' } } })
      .mockResolvedValueOnce({ data: { user: null } });
    const emails = await resolveStaffNotificationRecipients(svc, 'all_staff');
    expect(emails).toEqual(['ok@example.test']);
  });

  it('returns an empty array when there are no staff rows at all', async () => {
    const svc = fakeService([], []);
    const emails = await resolveStaffNotificationRecipients(svc, 'all_staff');
    expect(emails).toEqual([]);
    expect(getUserById).not.toHaveBeenCalled();
  });
});
