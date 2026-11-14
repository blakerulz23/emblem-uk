import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';
import { COMPLETE_CONFIRMATION } from '@/lib/staff-account-deletion';
import { PERMANENT_BAN_DURATION } from '@/lib/remove-account-sign-in';

/**
 * POST /api/staff/account-deletions/[id]/complete. The real requireStaff
 * runs against fake clients: the session decides who is signed in, the
 * service role decides whether that person is in staff_accounts. The
 * database function's own behaviour (clean-up once, audit once, erased
 * record, idempotent repeats) is proven in supabase/tests/authz.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));

import { POST, RESULT_UNKNOWN } from './route';

const STAFF = 'eeeeeeee-0000-4000-8000-0000000000a1';
const ACCOUNT = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const REQUEST = 'dddddddd-0000-4000-8000-0000000000c3';

type AdminErr = { status?: number; code?: string; message: string } | null;
let admin: { getUserById: ReturnType<typeof vi.fn>; updateUserById: ReturnType<typeof vi.fn>; deleteUser: ReturnType<typeof vi.fn> };
let pendingAuthRow: { id: string; attempts: number; status: string } | null;

function setup(opts: { user?: string | null; isStaff?: boolean; rpc?: (fn: string, args: Record<string, unknown>) => FakeResult | undefined; lookup?: AdminErr | 'gone'; ban?: AdminErr; del?: AdminErr }) {
  const rpc = opts.rpc ?? (() => undefined);
  session = createFakeSupabase({ user: opts.user === null ? null : { id: opts.user ?? STAFF }, rpc: (fn, args) => (fn === 'record_account_sign_in_removal' ? {} : rpc(fn, args)) });
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'staff_accounts') return { data: opts.isStaff === false ? null : { profile_id: STAFF } };
      if (c.table === 'pending_auth_deletions' && c.op === 'select') return { data: pendingAuthRow };
      return {};
    },
  });
  admin = {
    getUserById: vi.fn(async () =>
      opts.lookup === 'gone'
        ? { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } }
        : opts.lookup
          ? { data: { user: null }, error: opts.lookup }
          : { data: { user: { id: ACCOUNT } }, error: null }
    ),
    updateUserById: vi.fn(async () => ({ data: {}, error: opts.ban ?? null })),
    deleteUser: vi.fn(async () => ({ data: {}, error: opts.del ?? null })),
  };
  (service.client.auth as unknown as { admin: unknown }).admin = admin;
}

const completed = (status = 'completed'): FakeResult => ({ data: { status, profileId: ACCOUNT, playersUnlinked: ['p1'], playersDeletionRequested: ['p2'] } });
const call = (body: unknown, headers: Record<string, string> = { origin: 'http://localhost', 'content-type': 'application/json' }) =>
  POST(new NextRequest('http://localhost/api/staff/account-deletions/x/complete', { method: 'POST', body: JSON.stringify(body), headers }), { params: { id: REQUEST } });
const valid = (extra: Record<string, unknown> = {}) => call({ reason: 'Blocking records reassigned', confirm: COMPLETE_CONFIRMATION, ...extra });
const authWrites = () => service.calls.filter((c) => c.table === 'pending_auth_deletions' && c.op !== 'select');
const fnCalls = () => session.rpcCalls.map((c) => c.fn);

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  logs = captureLogs();
  pendingAuthRow = { id: 'pad-1', attempts: 1, status: 'pending' };
});
afterEach(() => logs.restore());

describe('request checks and authorization', () => {
  it('a cross-site or non-JSON post is refused (403) before anything runs', async () => {
    setup({ rpc: () => completed() });
    const body = { reason: 'r', confirm: COMPLETE_CONFIRMATION };
    expect((await call(body, { 'content-type': 'application/json' })).status).toBe(403);
    expect((await call(body, { origin: 'https://evil.example', 'content-type': 'application/json' })).status).toBe(403);
    expect((await call(body, { origin: 'http://localhost', 'content-type': 'text/plain' })).status).toBe(403);
    expect(session.rpcCalls).toHaveLength(0);
  });

  it('an anonymous caller gets 401 and nothing is called', async () => {
    setup({ user: null, rpc: () => completed() });
    expect((await valid()).status).toBe(401);
    expect(session.rpcCalls).toHaveLength(0);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('a signed-in non-staff account gets 403 and nothing is called', async () => {
    setup({ user: ACCOUNT, isStaff: false, rpc: () => completed() });
    expect((await valid()).status).toBe(403);
    expect(session.rpcCalls).toHaveLength(0);
  });

  it('a removed staff account (no staff_accounts row) gets 403 and nothing is called', async () => {
    setup({ user: STAFF, isStaff: false, rpc: () => completed() });
    expect((await valid()).status).toBe(403);
    expect(session.rpcCalls).toHaveLength(0);
  });

  it('staff access removed between the check and the call: the database refusal is a fixed 403', async () => {
    setup({ rpc: () => ({ error: sentinelError('P0001', 'Not authorized: staff only') }) });
    await expectRedacted(await valid(), 403, 'Staff access required', logs);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('runs the function in the staff member’s own session with only the request id and reason; actor ids in the body are ignored', async () => {
    setup({ rpc: () => completed() });
    await valid({ staffProfileId: ACCOUNT, p_staff_profile_id: ACCOUNT, actor: ACCOUNT });
    expect(session.rpcCalls[0]).toEqual({ fn: 'complete_pending_profile_deletion', args: { p_pending_deletion_id: REQUEST, p_reason: 'Blocking records reassigned' } });
    expect(service.rpcCalls).toHaveLength(0);
  });
});

describe('input', () => {
  it('a blank or over-long reason is refused before anything runs', async () => {
    setup({ rpc: () => completed() });
    expect((await call({ reason: '   ', confirm: COMPLETE_CONFIRMATION })).status).toBe(400);
    expect((await call({ reason: 'x'.repeat(501), confirm: COMPLETE_CONFIRMATION })).status).toBe(400);
    expect(session.rpcCalls).toHaveLength(0);
  });
  it('without the second confirmation nothing runs', async () => {
    setup({ rpc: () => completed() });
    for (const confirm of [undefined, true, 'yes', 'DELETE']) expect((await call({ reason: 'ok', confirm })).status).toBe(400);
    expect(session.rpcCalls).toHaveLength(0);
  });
});

describe('outcomes', () => {
  it('success: erased, then the sign-in is banned and deleted, the queue row resolved, and the removal audited with the reason', async () => {
    setup({ rpc: () => completed() });
    const res = await valid();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: 'completed', signIn: 'removed', signInBlocked: true, partial: false, childrenUnlinked: 1, childDeletionRequests: 1 });
    expect(admin.updateUserById).toHaveBeenCalledWith(ACCOUNT, { ban_duration: PERMANENT_BAN_DURATION });
    expect(admin.deleteUser).toHaveBeenCalledWith(ACCOUNT);
    expect(admin.updateUserById.mock.invocationCallOrder[0]).toBeLessThan(admin.deleteUser.mock.invocationCallOrder[0]);
    const w = authWrites();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ op: 'update', payload: { status: 'resolved', resolved_by: STAFF } });
    expect(w[0].filters).toEqual([['eq', 'auth_user_id', ACCOUNT], ['eq', 'status', 'pending']]);
    expect(session.rpcCalls[1]).toEqual({ fn: 'record_account_sign_in_removal', args: { p_pending_deletion_id: REQUEST, p_reason: 'Blocking records reassigned', p_outcome: 'removed' } });
  });

  const refusals: Array<[string, number, string]> = [
    ['Only a pending profile deletion can be completed (it is rejected)', 409, 'This request is no longer pending (it may have been rejected). Refresh the page.'],
    ['Pending profile deletion not found', 404, 'Deletion request not found.'],
    ['The account still has records that block deletion (coach_authored_player_records); resolve them first', 409, 'Records that must be kept still block this deletion. Resolve them first; nothing was changed.'],
    ['Staff accounts are removed by the manual staff procedure, not here', 409, 'This is a staff account. Staff access must be removed through the two-person manual procedure first.'],
    ['This profile deletion is marked resolved but a profile with this id exists', 409, 'This request was closed without deleting the account. Nothing was changed.'],
  ];
  for (const [raisedText, status, fixed] of refusals) {
    it(`"${raisedText.slice(0, 48)}…" → ${status}, fixed message, no sign-in change, no audit`, async () => {
      setup({ rpc: () => ({ error: sentinelError('P0001', raisedText) }) });
      await expectRedacted(await valid(), status, fixed, logs);
      expect(admin.updateUserById).not.toHaveBeenCalled();
      expect(admin.deleteUser).not.toHaveBeenCalled();
      expect(authWrites()).toHaveLength(0);
      expect(fnCalls()).toEqual(['complete_pending_profile_deletion']);
    });
  }

  it('an unexpected failure (possibly after the database committed) never claims nothing changed', async () => {
    setup({ rpc: () => ({ error: sentinelError('08006') }) });
    await expectRedacted(await valid(), 500, RESULT_UNKNOWN, logs);
    expectCodeOnlyLogs(logs, 'staff account deletion: complete', '08006');
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('a repeated or concurrent second completion is already_completed and touches nothing: no Auth call, no queue write, no audit', async () => {
    setup({ rpc: () => completed('already_completed') });
    pendingAuthRow = null;
    expect(await (await valid()).json()).toEqual({ ok: true, state: 'already_completed', signIn: 'removed', partial: false });
    expect(admin.getUserById).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(authWrites()).toHaveLength(0);
    expect(fnCalls()).toEqual(['complete_pending_profile_deletion']);
  });

  it('…and reports a sign-in removal still queued, pointing to the retry', async () => {
    setup({ rpc: () => completed('already_completed') });
    expect(await (await valid()).json()).toEqual({ ok: true, state: 'already_completed', signIn: 'removal_pending', partial: true });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('Auth deletion failure: an honest partial result; banned; the queue row records the attempt; the outcome is audited', async () => {
    setup({ rpc: () => completed(), del: { status: 500, message: 'Auth service unavailable' } });
    const res = await valid();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, state: 'completed', signIn: 'removal_pending', signInBlocked: true, partial: true });
    expect(JSON.stringify(body)).not.toContain('Auth service unavailable');
    expect(admin.deleteUser).toHaveBeenCalledTimes(1);
    const w = authWrites();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ op: 'update', payload: { attempts: 2, last_error: 'Auth service unavailable' } });
    expect(w[0].filters).toEqual([['eq', 'id', 'pad-1'], ['eq', 'status', 'pending']]);
    expect(session.rpcCalls[1].args).toMatchObject({ p_outcome: 'removal_pending' });
  });

  it('a failure never reopens a queue row a concurrent call already resolved', async () => {
    setup({ rpc: () => completed(), del: { status: 500, message: 'x' } });
    pendingAuthRow = { id: 'pad-1', attempts: 2, status: 'resolved' };
    await valid();
    expect(authWrites()).toHaveLength(0);
  });

  it('a ban failure alone does not stop the deletion; a deletion that reports "not found" counts as removed', async () => {
    setup({ rpc: () => completed(), ban: { status: 500, message: 'x' }, del: { status: 404, code: 'user_not_found', message: 'User not found' } });
    expect(await (await valid()).json()).toMatchObject({ signIn: 'removed', partial: false });
  });

  it('an account that was already deleted another way: closed, and a remaining sign-in removed', async () => {
    setup({ rpc: () => completed('account_already_deleted') });
    expect(await (await valid()).json()).toMatchObject({ ok: true, state: 'account_already_deleted', signIn: 'removed' });
    expect(admin.deleteUser).toHaveBeenCalledWith(ACCOUNT);
  });

  it('a malformed function result is reported as unknown without touching the sign-in', async () => {
    setup({ rpc: () => ({ data: { status: 'completed' } }) });
    const res = await valid();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(RESULT_UNKNOWN);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
});
