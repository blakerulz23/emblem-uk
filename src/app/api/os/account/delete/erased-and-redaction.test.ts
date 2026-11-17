import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { captureLogs, sentinelError } from '@/lib/route-failure.test-support';
import { ACCOUNT_ERASED_CODE, ACCOUNT_ERASED_MESSAGE } from '@/lib/account-deletion-copy';

/**
 * Migration 0097:
 *   - a still-valid session of an already-erased account asking to delete
 *     again is refused by the database (account_erased); the route answers
 *     401 ACCOUNT_ERASED, signs the session out, and touches nothing else;
 *   - when the erasure succeeds but the Auth user cannot be deleted, the
 *     retry record (pending_auth_deletions) carries no email, and the Auth
 *     error text is stored with any address removed.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
const notify = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/dispatch-staff-notification', () => ({ enqueueAndDispatchStaffNotification: (...a: unknown[]) => notify(...a) }));

import { POST as deleteAccount } from './route';

const USER = 'aaaaaaaa-0000-4000-8000-0000000000e1';
const EMAIL = 'p-erased@example.test';
let logs: ReturnType<typeof captureLogs>;
const signOut = vi.fn(async () => ({ error: null }));
let deleteUser: ReturnType<typeof vi.fn>;
let existingRow: { id: string; attempts: number } | null;

function setup(rpc: () => object) {
  session = createFakeSupabase({ user: { id: USER, email: EMAIL, last_sign_in_at: new Date().toISOString() } as never, rpc: (fn) => (fn === 'delete_own_guardian_account' ? rpc() : {}) });
  (session.client.auth as unknown as { signOut: typeof signOut }).signOut = signOut;
  service = createFakeSupabase({ respond: (c) => (c.table === 'pending_auth_deletions' && c.op === 'select' ? { data: existingRow } : {}) });
  (service.client as unknown as { auth: unknown }).auth = { admin: { deleteUser } };
}

beforeEach(() => {
  logs = captureLogs();
  signOut.mockClear();
  notify.mockClear();
  existingRow = null;
  deleteUser = vi.fn(async () => ({ error: { status: 500, message: `Database error deleting user ${EMAIL}` } }));
});
afterEach(() => logs.restore());

describe('POST /api/os/account/delete — erased account and email redaction', () => {
  it('an already-erased account is refused: 401 ACCOUNT_ERASED, signed out, no Auth call, no queue write, no notification', async () => {
    setup(() => ({ error: sentinelError('EMERA', 'account_erased') }));
    const res = await deleteAccount();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: ACCOUNT_ERASED_MESSAGE, code: ACCOUNT_ERASED_CODE });
    expect(signOut).toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(service.calls).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('Auth deletion fails after the erasure: the new retry record has no email and the error text is redacted', async () => {
    setup(() => ({ data: { canDeleteIdentity: true, playersUnlinked: [], playersDeletionRequested: [] } }));
    const res = await deleteAccount();
    expect(res.status).toBe(200);
    const insert = service.calls.find((c) => c.table === 'pending_auth_deletions' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ auth_user_id: USER, email: null, last_error: 'Database error deleting user [email removed]' });
    expect(JSON.stringify([service.calls, notify.mock.calls, logs.text(), await res.text()])).not.toContain(EMAIL);
  });

  it('…and an existing retry record is updated without the email (any older email is cleared)', async () => {
    existingRow = { id: 'pad-9', attempts: 3 };
    setup(() => ({ data: { canDeleteIdentity: true, playersUnlinked: [], playersDeletionRequested: [] } }));
    await deleteAccount();
    const update = service.calls.find((c) => c.table === 'pending_auth_deletions' && c.op === 'update');
    expect(update?.payload).toMatchObject({ attempts: 4, email: null, last_error: 'Database error deleting user [email removed]' });
    expect(JSON.stringify(service.calls)).not.toContain(EMAIL);
  });
});
