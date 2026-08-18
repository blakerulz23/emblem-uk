import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listSquadInviteStaffPermissions } from './squad-invite-staff-identity';

/**
 * Same service-role mocking boundary as require-squad-invite-permission.test.ts
 * — createServiceRoleClient() has a fixed query-builder chain with no
 * injectable client, so the module is mocked here too.
 */
const mockIs = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: mockIs, // squad_invite_staff_permissions: .eq().is()
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  mockIs.mockReset();
});

describe('listSquadInviteStaffPermissions', () => {
  it('returns an empty array for a staff member with no active permission row (neither reviewer nor approver)', async () => {
    mockIs.mockResolvedValueOnce({ data: [] });
    expect(await listSquadInviteStaffPermissions('user-1')).toEqual([]);
  });

  it('returns exactly the reviewer permission for a reviewer-only identity', async () => {
    mockIs.mockResolvedValueOnce({ data: [{ permission: 'squad_invite_reviewer' }] });
    expect(await listSquadInviteStaffPermissions('user-1')).toEqual(['squad_invite_reviewer']);
  });

  it('returns exactly the approver permission for an approver-only identity', async () => {
    mockIs.mockResolvedValueOnce({ data: [{ permission: 'squad_invite_approver' }] });
    expect(await listSquadInviteStaffPermissions('user-1')).toEqual(['squad_invite_approver']);
  });

  it('returns both permissions for an identity holding both — one row each, no inheritance collapses them', async () => {
    mockIs.mockResolvedValueOnce({ data: [{ permission: 'squad_invite_reviewer' }, { permission: 'squad_invite_approver' }] });
    expect(await listSquadInviteStaffPermissions('user-1')).toEqual(['squad_invite_reviewer', 'squad_invite_approver']);
  });

  it('treats a null data response as no permissions rather than throwing', async () => {
    mockIs.mockResolvedValueOnce({ data: null });
    expect(await listSquadInviteStaffPermissions('user-1')).toEqual([]);
  });
});
