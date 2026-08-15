import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requireSquadInvitePermission } from './require-squad-invite-permission';

/**
 * requireStaff (called internally) and requireSquadInvitePermission both
 * go through createServiceRoleClient() with a fixed query-builder chain —
 * neither accepts an injected client for that half, so the module is
 * mocked at the boundary, same reasoning as route.test.ts files in this
 * repo. The `client` parameter requireSquadInvitePermission DOES accept is
 * a plain fake here, not mocked, since it's just `{auth:{getUser}}`.
 */
const mockMaybeSingle = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle, // staff_accounts: .eq().maybeSingle()
          in: () => ({ is: () => ({ maybeSingle: mockMaybeSingle }) }), // squad_invite_staff_permissions: .eq().in().is().maybeSingle()
        }),
      }),
    }),
  }),
}));

const USER_ID = '11111111-2222-4333-8444-555555555555';

function fakeClient(userId: string | null) {
  return { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } } as never;
}

// requireStaff's own staff_accounts lookup and requireSquadInvitePermission's
// permission lookup both resolve via the same mocked maybeSingle — tests
// queue the sequence of resolutions in call order.
function queueResolutions(...values: (Record<string, unknown> | null)[]) {
  for (const value of values) mockMaybeSingle.mockResolvedValueOnce({ data: value });
}

beforeEach(() => {
  mockMaybeSingle.mockReset();
});

describe('requireSquadInvitePermission', () => {
  it('rejects with 401 when no user is signed in', async () => {
    const result = await requireSquadInvitePermission(fakeClient(null), 'squad_invite_reviewer');
    expect(result).toEqual({ ok: false, status: 401, error: 'Sign in required' });
  });

  it('rejects with 403 when signed in but not staff at all', async () => {
    queueResolutions(null); // staff_accounts: no row
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_reviewer');
    expect(result).toEqual({ ok: false, status: 403, error: 'Staff access required' });
  });

  it('rejects with 403 when staff but holds neither reviewer nor approver (unassigned staff)', async () => {
    queueResolutions({ profile_id: USER_ID }, null); // is staff, no permission row
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), ['squad_invite_reviewer', 'squad_invite_approver']);
    expect(result).toEqual({ ok: false, status: 403, error: 'Squad Invite permission required' });
  });

  it('accepts a reviewer-only identity against a single reviewer check', async () => {
    queueResolutions({ profile_id: USER_ID }, { staff_profile_id: USER_ID });
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_reviewer');
    expect(result).toEqual({ ok: true, userId: USER_ID });
  });

  it('rejects a reviewer-only identity against a single approver check', async () => {
    queueResolutions({ profile_id: USER_ID }, null);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_approver');
    expect(result.ok).toBe(false);
  });

  it('accepts a reviewer-only identity against the OR read-access check (regression: the redirect-loop bug)', async () => {
    queueResolutions({ profile_id: USER_ID }, { staff_profile_id: USER_ID });
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), ['squad_invite_reviewer', 'squad_invite_approver']);
    expect(result).toEqual({ ok: true, userId: USER_ID });
  });

  it('accepts an approver-only identity against the OR read-access check (the exact case that used to loop)', async () => {
    queueResolutions({ profile_id: USER_ID }, { staff_profile_id: USER_ID });
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), ['squad_invite_reviewer', 'squad_invite_approver']);
    expect(result).toEqual({ ok: true, userId: USER_ID });
  });

  it('rejects an approver-only identity against a single reviewer check — approver never implies reviewer', async () => {
    queueResolutions({ profile_id: USER_ID }, null);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_reviewer');
    expect(result.ok).toBe(false);
  });

  it('rejects a reviewer-only identity against a single approver-required action — reviewer never implies approver', async () => {
    queueResolutions({ profile_id: USER_ID }, null);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_approver');
    expect(result.ok).toBe(false);
  });
});
