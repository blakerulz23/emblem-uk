import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));

import { POST } from './route';

const STAFF = 'eeeeeeee-0000-4000-8000-0000000000a1';
const OTHER = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const REQUEST = 'dddddddd-0000-4000-8000-0000000000c3';

function setup(opts: { user?: string | null; isStaff?: boolean; rpc?: (fn: string) => FakeResult | undefined }) {
  session = createFakeSupabase({ user: opts.user === null ? null : { id: opts.user ?? STAFF } });
  service = createFakeSupabase({
    respond: (c) => (c.table === 'staff_accounts' ? { data: opts.isStaff === false ? null : { profile_id: STAFF } } : {}),
    rpc: (fn) => opts.rpc?.(fn),
  });
}
const call = (body: unknown) => POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: { id: REQUEST } });
const ok = (fn: string): FakeResult => (fn === 'reject_pending_profile_deletion' ? { data: 'rejected' } : { data: { restored: 2, notRestorable: 0, nothingToRestore: false } });

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => (logs = captureLogs()));
afterEach(() => logs.restore());

describe('POST /api/staff/account-deletions/[id]/reject', () => {
  it('anonymous 401, non-staff 403, removed staff 403; nothing called', async () => {
    setup({ user: null, rpc: ok });
    expect((await call({ reason: 'r' })).status).toBe(401);
    setup({ user: OTHER, isStaff: false, rpc: ok });
    expect((await call({ reason: 'r' })).status).toBe(403);
    setup({ user: STAFF, isStaff: false, rpc: ok });
    expect((await call({ reason: 'r' })).status).toBe(403);
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('a blank reason is refused before anything runs', async () => {
    setup({ rpc: ok });
    expect((await call({ reason: '  ' })).status).toBe(400);
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('rejects then restores, as the verified staff member; actor ids in the body are ignored', async () => {
    setup({ rpc: ok });
    const res = await call({ reason: ' Parent asked to stay ', staffProfileId: OTHER, p_staff_profile_id: OTHER });
    expect(await res.json()).toEqual({ ok: true, state: 'rejected', coachingRestored: 2, coachingNotRestorable: 0 });
    const args = { p_pending_deletion_id: REQUEST, p_staff_profile_id: STAFF, p_reason: 'Parent asked to stay' };
    expect(service.rpcCalls).toEqual([
      { fn: 'reject_pending_profile_deletion', args },
      { fn: 'restore_coach_access_after_deletion_rejection', args },
    ]);
  });

  it('a repeat reports already_rejected and the idempotent restore', async () => {
    setup({ rpc: (fn) => (fn === 'reject_pending_profile_deletion' ? { data: 'already_rejected' } : { data: { restored: 0, notRestorable: 0, nothingToRestore: true } }) });
    expect(await (await call({ reason: 'again' })).json()).toEqual({ ok: true, state: 'already_rejected', coachingRestored: 0, coachingNotRestorable: 0 });
  });

  it('a completed request cannot be rejected (409, fixed, no restore)', async () => {
    setup({ rpc: (fn) => (fn === 'reject_pending_profile_deletion' ? { error: sentinelError('P0001', 'This profile deletion is already resolved') } : ok(fn)) });
    await expectRedacted(await call({ reason: 'r' }), 409, 'This request has already been completed and cannot be rejected.', logs);
    expect(service.rpcCalls.map((c) => c.fn)).toEqual(['reject_pending_profile_deletion']);
  });

  it('unknown request 404; unexpected failure a fixed 500', async () => {
    setup({ rpc: () => ({ error: sentinelError('P0001', 'Pending profile deletion not found') }) });
    await expectRedacted(await call({ reason: 'r' }), 404, 'Deletion request not found.', logs);
    setup({ rpc: () => ({ error: sentinelError('40P01') }) });
    await expectRedacted(await call({ reason: 'r' }), 500, 'Could not reject this request. Nothing was changed. Please try again.', logs);
  });

  it('restore failing after the rejection says so honestly (500, rejected: true)', async () => {
    setup({ rpc: (fn) => (fn === 'reject_pending_profile_deletion' ? { data: 'rejected' } : { error: sentinelError('40001') }) });
    const res = await call({ reason: 'r' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, rejected: true, error: 'The request was rejected, but coaching access could not be restored. Try again to restore it.' });
  });
});
