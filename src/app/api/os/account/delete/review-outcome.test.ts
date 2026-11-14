import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { captureLogs } from '@/lib/route-failure.test-support';

/**
 * Migration 0097: when something blocks the deletion, delete_own_guardian_
 * account only records the request for staff review (0098 also pauses coach
 * access). Nothing is deleted. The route must say so, must not call the Auth
 * admin delete, and notifies staff once.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
const notify = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/dispatch-staff-notification', () => ({ enqueueAndDispatchStaffNotification: (...a: unknown[]) => notify(...a) }));

import { POST as deleteAccount } from './route';

const USER = 'aaaaaaaa-0000-4000-8000-0000000000r1';
let logs: ReturnType<typeof captureLogs>;
const deleteUser = vi.fn(async () => ({ error: null }));
const signOut = vi.fn(async () => ({ error: null }));

beforeEach(() => {
  logs = captureLogs();
  deleteUser.mockClear();
  signOut.mockClear();
  notify.mockClear();
  session = createFakeSupabase({
    user: { id: USER, email: 'parent-coach@example.test', last_sign_in_at: new Date().toISOString() } as never,
    rpc: (fn) =>
      fn === 'delete_own_guardian_account'
        ? { data: { canDeleteIdentity: false, coachAccessSuspended: 1, playersUnlinked: [], playersDeletionRequested: [] } }
        : {},
  });
  (session.client.auth as unknown as { signOut: typeof signOut }).signOut = signOut;
  service = createFakeSupabase({});
  (service.client as unknown as { auth: unknown }).auth = { admin: { deleteUser } };
});
afterEach(() => logs.restore());

describe('POST /api/os/account/delete — deletion sent to staff review', () => {
  it('reports that nothing has been deleted yet, keeps the identity and notifies staff', async () => {
    const res = await deleteAccount();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, partial: true, identityRetained: true, canDeleteIdentity: false, coachAccessSuspended: 1, playersUnlinked: [], playersDeletionRequested: [] });
    expect(body.message).toContain('nothing has been deleted');
    expect(body.message).toContain("your children's cards stay as they are");
    expect(body.message).not.toMatch(/have been removed/);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(notify.mock.calls[0][1])).toContain('Nothing has been removed yet');
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
