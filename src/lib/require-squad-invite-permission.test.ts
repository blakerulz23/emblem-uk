import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requireSquadInvitePermission } from './require-squad-invite-permission';

/**
 * requireStaff (called internally) and requireSquadInvitePermission both
 * go through createServiceRoleClient() with a fixed query-builder chain —
 * neither accepts an injected client for that half, so the module is
 * mocked at the boundary, same reasoning as route.test.ts files in this
 * repo. The `client` parameter requireSquadInvitePermission DOES accept is
 * a plain fake here, not mocked, since it's just `{auth:{getUser}}`.
 *
 * staff_accounts (.eq().maybeSingle()) and squad_invite_staff_permissions
 * (.eq().in().is().limit()) are mocked separately since their real query
 * shapes differ — the permissions lookup resolves an array (0-2 rows),
 * never a single object, precisely because of the bug covered below.
 */
const mockStaffMaybeSingle = vi.fn();
const mockPermissionsLimit = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockStaffMaybeSingle,
          in: () => ({ is: () => ({ limit: mockPermissionsLimit }) }),
        }),
      }),
    }),
  }),
}));

const USER_ID = '11111111-2222-4333-8444-555555555555';

function fakeClient(userId: string | null) {
  return { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } } as never;
}

function queueStaff(value: Record<string, unknown> | null) {
  mockStaffMaybeSingle.mockResolvedValueOnce({ data: value });
}

function queuePermissions(rows: Record<string, unknown>[]) {
  mockPermissionsLimit.mockResolvedValueOnce({ data: rows });
}

beforeEach(() => {
  mockStaffMaybeSingle.mockReset();
  mockPermissionsLimit.mockReset();
});

describe('requireSquadInvitePermission', () => {
  it('rejects with 401 when no user is signed in', async () => {
    const result = await requireSquadInvitePermission(fakeClient(null), 'squad_invite_reviewer');
    expect(result).toEqual({ ok: false, status: 401, error: 'Sign in required' });
  });

  it('rejects with 403 when signed in but not staff at all', async () => {
    queueStaff(null); // staff_accounts: no row
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_reviewer');
    expect(result).toEqual({ ok: false, status: 403, error: 'Staff access required' });
  });

  it('rejects with 403 when staff but holds neither reviewer nor approver (unassigned staff)', async () => {
    queueStaff({ profile_id: USER_ID });
    queuePermissions([]); // no permission rows
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), ['squad_invite_reviewer', 'squad_invite_approver']);
    expect(result).toEqual({ ok: false, status: 403, error: 'Squad Invite permission required' });
  });

  it('accepts a reviewer-only identity against a single reviewer check', async () => {
    queueStaff({ profile_id: USER_ID });
    queuePermissions([{ staff_profile_id: USER_ID }]);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_reviewer');
    expect(result).toEqual({ ok: true, userId: USER_ID });
  });

  it('rejects a reviewer-only identity against a single approver check', async () => {
    queueStaff({ profile_id: USER_ID });
    queuePermissions([]);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_approver');
    expect(result.ok).toBe(false);
  });

  it('accepts a reviewer-only identity against the OR read-access check (regression: the redirect-loop bug)', async () => {
    queueStaff({ profile_id: USER_ID });
    queuePermissions([{ staff_profile_id: USER_ID }]);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), ['squad_invite_reviewer', 'squad_invite_approver']);
    expect(result).toEqual({ ok: true, userId: USER_ID });
  });

  it('accepts an approver-only identity against the OR read-access check (the exact case that used to loop)', async () => {
    queueStaff({ profile_id: USER_ID });
    queuePermissions([{ staff_profile_id: USER_ID }]);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), ['squad_invite_reviewer', 'squad_invite_approver']);
    expect(result).toEqual({ ok: true, userId: USER_ID });
  });

  it('accepts an identity holding BOTH reviewer and approver against the OR read-access check (regression: maybeSingle() erroring on two matched rows)', async () => {
    // The exact bug found live: a staff member holding both permissions
    // makes .in(['reviewer','approver']).is(revoked_at, null) match TWO
    // rows. maybeSingle() treats more than one row as an error and
    // resolves with no data, wrongly producing a 403 for the identity
    // that should have the widest possible access. limit(1) must not
    // reproduce that failure regardless of how many rows actually matched.
    queueStaff({ profile_id: USER_ID });
    queuePermissions([{ staff_profile_id: USER_ID }, { staff_profile_id: USER_ID }]);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), ['squad_invite_reviewer', 'squad_invite_approver']);
    expect(result).toEqual({ ok: true, userId: USER_ID });
  });

  it('rejects an approver-only identity against a single reviewer check — approver never implies reviewer', async () => {
    queueStaff({ profile_id: USER_ID });
    queuePermissions([]);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_approver');
    expect(result.ok).toBe(false);
  });

  it('rejects a reviewer-only identity against a single approver-required action — reviewer never implies approver', async () => {
    queueStaff({ profile_id: USER_ID });
    queuePermissions([]);
    const result = await requireSquadInvitePermission(fakeClient(USER_ID), 'squad_invite_approver');
    expect(result.ok).toBe(false);
  });
});
