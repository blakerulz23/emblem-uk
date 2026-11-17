import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { captureLogs } from '@/lib/route-failure.test-support';

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));

import { POST } from './route';

const STAFF = 'eeeeeeee-0000-4000-8000-0000000000a1';
const ACCOUNT = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const REQUEST = 'dddddddd-0000-4000-8000-0000000000c3';

let admin: { getUserById: ReturnType<typeof vi.fn>; updateUserById: ReturnType<typeof vi.fn>; deleteUser: ReturnType<typeof vi.fn> };
function setup(opts: { user?: string | null; isStaff?: boolean; status?: string | null; erased?: boolean; del?: { status?: number; message: string } | null }) {
  session = createFakeSupabase({ user: opts.user === null ? null : { id: opts.user ?? STAFF } });
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'staff_accounts') return { data: opts.isStaff === false ? null : { profile_id: STAFF } };
      if (c.table === 'pending_profile_deletions') return { data: opts.status === null ? null : { auth_user_id: ACCOUNT, status: opts.status ?? 'resolved' } };
      if (c.table === 'erased_accounts') return { data: opts.erased === false ? null : { profile_id: ACCOUNT } };
      if (c.table === 'pending_auth_deletions' && c.op === 'select') return { data: { id: 'pad-1', attempts: 1, status: 'pending' } };
      return {};
    },
  });
  admin = {
    getUserById: vi.fn(async () => ({ data: { user: { id: ACCOUNT } }, error: null })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    deleteUser: vi.fn(async () => ({ data: {}, error: opts.del ?? null })),
  };
  (service.client.auth as unknown as { admin: unknown }).admin = admin;
}
const call = (body: unknown, headers: Record<string, string> = { origin: 'http://localhost', 'content-type': 'application/json' }) =>
  POST(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body), headers }), { params: { id: REQUEST } });

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => (logs = captureLogs()));
afterEach(() => logs.restore());

describe('POST /api/staff/account-deletions/[id]/retry-sign-in', () => {
  it('cross-site, anonymous, non-staff and removed-staff callers are refused; nothing runs', async () => {
    setup({});
    expect((await call({ reason: 'r' }, { 'content-type': 'application/json' })).status).toBe(403);
    setup({ user: null });
    expect((await call({ reason: 'r' })).status).toBe(401);
    setup({ user: ACCOUNT, isStaff: false });
    expect((await call({ reason: 'r' })).status).toBe(403);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('a blank reason is refused', async () => {
    setup({});
    expect((await call({ reason: ' ' })).status).toBe(400);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('never runs for a request that is not completed and erased (a pending request reopened under the same id, a hand-closed one, an unknown id)', async () => {
    for (const s of [{ status: 'pending' }, { status: 'rejected' }, { status: 'resolved', erased: false }, { status: null }]) {
      setup(s);
      const res = await call({ reason: 'retry' });
      expect(res.status).toBe(409);
      expect(admin.getUserById).not.toHaveBeenCalled();
      expect(admin.deleteUser).not.toHaveBeenCalled();
      expect(session.rpcCalls).toHaveLength(0);
    }
  });

  it('removes the sign-in and audits the attempt as the staff member; never calls the completion', async () => {
    setup({});
    const res = await call({ reason: 'Retrying after an Auth outage', staffProfileId: ACCOUNT });
    expect(await res.json()).toEqual({ ok: true, state: 'already_completed', signIn: 'removed', signInBlocked: true, partial: false });
    expect(admin.deleteUser).toHaveBeenCalledWith(ACCOUNT);
    expect(session.rpcCalls).toEqual([{ fn: 'record_account_sign_in_removal', args: { p_pending_deletion_id: REQUEST, p_reason: 'Retrying after an Auth outage', p_outcome: 'removed' } }]);
  });

  it('a failed retry is honest and audited as still pending', async () => {
    setup({ del: { status: 500, message: 'down' } });
    expect(await (await call({ reason: 'again' })).json()).toMatchObject({ ok: true, signIn: 'removal_pending', partial: true });
    expect(session.rpcCalls[0].args).toMatchObject({ p_outcome: 'removal_pending' });
  });
});
