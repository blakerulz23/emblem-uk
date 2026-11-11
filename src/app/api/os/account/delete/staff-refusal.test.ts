import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';

/**
 * Migration 0098: delete_own_guardian_account refuses a staff account,
 * changing nothing. The route answers with a fixed 403 (no database text)
 * and never calls the Auth admin delete.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/dispatch-staff-notification', () => ({ enqueueAndDispatchStaffNotification: vi.fn() }));

import { POST as deleteAccount } from './route';

const USER = 'aaaaaaaa-0000-4000-8000-0000000000s1';
let logs: ReturnType<typeof captureLogs>;
const deleteUser = vi.fn(async () => ({ error: null }));
const signOut = vi.fn(async () => ({ error: null }));

beforeEach(() => {
  logs = captureLogs();
  deleteUser.mockClear();
  signOut.mockClear();
  session = createFakeSupabase({
    user: { id: USER, email: 'staff@example.test', last_sign_in_at: new Date().toISOString() } as never,
    rpc: (fn) => (fn === 'delete_own_guardian_account' ? { error: sentinelError('P0001', 'Staff accounts cannot be deleted from the app') } : {}),
  });
  (session.client.auth as unknown as { signOut: typeof signOut }).signOut = signOut;
  service = createFakeSupabase({});
  (service.client as unknown as { auth: unknown }).auth = { admin: { deleteUser } };
});
afterEach(() => logs.restore());

describe('POST /api/os/account/delete — staff account', () => {
  it('is a fixed 403 with no database text; the Auth identity is not deleted and the session is not signed out', async () => {
    await expectRedacted(await deleteAccount(), 403, "Staff accounts can't be deleted here. Ask another member of staff to remove it.", logs);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
