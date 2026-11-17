import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { captureLogs } from '@/lib/route-failure.test-support';

/**
 * Migration 0097: when something blocks the deletion, delete_own_guardian_
 * account only records the request for staff review (0098 also pauses coach
 * access). Nothing is erased. The route must say so, must not call the Auth
 * admin delete, and notifies staff once per review round.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
const notify = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/dispatch-staff-notification', () => ({ enqueueAndDispatchStaffNotification: (...a: unknown[]) => notify(...a) }));

import { POST as deleteAccount } from './route';

const USER = 'aaaaaaaa-0000-4000-8000-0000000000r1';
const OPENED = '2026-11-14T09:00:00.000+00:00';
let logs: ReturnType<typeof captureLogs>;
const deleteUser = vi.fn(async () => ({ error: null }));
const signOut = vi.fn(async () => ({ error: null }));

function setup(result: Record<string, unknown>) {
  session = createFakeSupabase({
    user: { id: USER, email: 'parent-coach@example.test', last_sign_in_at: new Date().toISOString() } as never,
    rpc: (fn) => (fn === 'delete_own_guardian_account' ? { data: result } : {}),
  });
  (session.client.auth as unknown as { signOut: typeof signOut }).signOut = signOut;
  service = createFakeSupabase({});
  (service.client as unknown as { auth: unknown }).auth = { admin: { deleteUser } };
}

beforeEach(() => {
  logs = captureLogs();
  deleteUser.mockClear();
  signOut.mockClear();
  notify.mockClear();
});
afterEach(() => logs.restore());

describe('POST /api/os/account/delete — deletion sent to staff review', () => {
  it('says nothing has been permanently deleted and that coaching is paused, keeps the identity and notifies staff for this review round', async () => {
    setup({ canDeleteIdentity: false, coachAccessSuspended: 1, playersUnlinked: [], playersDeletionRequested: [], reviewOpenedAt: OPENED });
    const res = await deleteAccount();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, partial: true, identityRetained: true, canDeleteIdentity: false, coachAccessSuspended: 1, playersUnlinked: [], playersDeletionRequested: [] });
    expect(body.message).toBe(
      'Your account deletion request is being reviewed by Emblem staff. Nothing has been permanently deleted yet. Your coaching access is paused while the request is reviewed.'
    );
    expect(deleteUser).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1].eventKey).toBe(`auth_deletion_stuck:profile:${USER}:${OPENED}`);
    expect(notify.mock.calls[0][1].linkPath).toBe('/staff/account-deletions');
    expect(JSON.stringify(notify.mock.calls[0][1])).toContain('Nothing has been removed yet');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('does not mention coaching for an account that had none', async () => {
    setup({ canDeleteIdentity: false, coachAccessSuspended: 0, playersUnlinked: [], playersDeletionRequested: [], reviewOpenedAt: OPENED });
    const body = await (await deleteAccount()).json();
    expect(body.message).toBe('Your account deletion request is being reviewed by Emblem staff. Nothing has been permanently deleted yet.');
  });

  it('a result without reviewOpenedAt (database before 0097) keeps the original notification key', async () => {
    setup({ canDeleteIdentity: false, playersUnlinked: [], playersDeletionRequested: [] });
    await deleteAccount();
    expect(notify.mock.calls[0][1].eventKey).toBe(`auth_deletion_stuck:profile:${USER}`);
  });
});
