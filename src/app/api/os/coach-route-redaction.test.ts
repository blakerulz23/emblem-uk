import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall, FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';
import { GET as loadTeamRequest, POST as submitTeamRequest } from './team-requests/route';
import { POST as cancelTeamRequest } from './team-requests/[id]/cancel/route';
import { POST as redeemTeamInvite } from './team-invites/redeem/route';

/**
 * Coach routes: team requests (submit, load, cancel) and team-invite
 * redemption. Database and trusted-function failures return fixed
 * messages; none of the database's text reaches the response or the logs.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/anonymous-request-rate-limit', () => ({ consumeAnonymousRequestRateLimit: vi.fn(async () => true) }));
vi.mock('@/lib/dispatch-staff-notification', () => ({ enqueueAndDispatchStaffNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';
const REQUEST_ID = 'dddddddd-0000-4000-8000-000000000004';
const FAILED = 'Could not save your request. Please try again.';
const body = { clubName: 'Fictional FC', teamName: 'U10', displayName: 'Fictional Coach' };
const req = (url: string, b: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(b) });

function sessionWith(respond?: (c: FakeCall) => FakeResult | undefined, rpc?: (fn: string) => FakeResult | undefined) {
  session = createFakeSupabase({ user: { id: USER }, respond, rpc });
}
function serviceWith(rpc: (fn: string) => FakeResult | undefined, write?: (c: FakeCall) => FakeResult | undefined) {
  service = createFakeSupabase({
    respond: (c) => write?.(c) ?? (c.table === 'team_invites' && c.op === 'select' ? { data: { id: 'ti-1', used_at: null, expires_at: '2999-01-01T00:00:00Z', team_id: TEAM } } : {}),
    rpc,
  });
}

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  logs = captureLogs();
  service = createFakeSupabase({});
});
afterEach(() => logs.restore());

describe('team requests never return or log database text', () => {
  it('a failing profile write is a fixed 500', async () => {
    sessionWith((c) => (c.table === 'profiles' && c.op === 'upsert' ? { error: sentinelError('23503') } : {}));
    await expectRedacted(await submitTeamRequest(req('/api/os/team-requests', body)), 500, FAILED, logs);
    expectCodeOnlyLogs(logs, 'team request: profile', '23503');
  });

  it('a failing display-name update is a fixed 500', async () => {
    sessionWith((c) => (c.table === 'profiles' && c.op === 'update' ? { error: sentinelError('42501') } : {}));
    await expectRedacted(await submitTeamRequest(req('/api/os/team-requests', body)), 500, FAILED, logs);
    expectCodeOnlyLogs(logs, 'team request: display name', '42501');
  });

  it('an RLS refusal of the request insert is a clean 403', async () => {
    sessionWith((c) => (c.table === 'coach_team_requests' && c.op === 'insert' ? { error: sentinelError('42501') } : {}));
    await expectRedacted(await submitTeamRequest(req('/api/os/team-requests', body)), 403, "You don't have permission to submit a team request.", logs);
  });

  it('any other insert failure is a fixed 500; the duplicate (409) and not-yet-migrated (503) answers are unchanged', async () => {
    sessionWith((c) => (c.table === 'coach_team_requests' && c.op === 'insert' ? { error: sentinelError('XX000') } : {}));
    await expectRedacted(await submitTeamRequest(req('/api/os/team-requests', body)), 500, FAILED, logs);
    expectCodeOnlyLogs(logs, 'team request: insert', 'XX000');

    sessionWith((c) => (c.table === 'coach_team_requests' && c.op === 'insert' ? { error: sentinelError('23505') } : {}));
    await expectRedacted(await submitTeamRequest(req('/api/os/team-requests', body)), 409, 'You already have a team request waiting for review', logs);

    sessionWith((c) => (c.table === 'coach_team_requests' && c.op === 'insert' ? { error: sentinelError('42P01') } : {}));
    await expectRedacted(await submitTeamRequest(req('/api/os/team-requests', body)), 503, 'Team requests are temporarily unavailable', logs);
  });

  it('a failing load is a fixed 500', async () => {
    sessionWith((c) => (c.table === 'coach_team_requests' ? { error: sentinelError('57014') } : {}));
    await expectRedacted(await loadTeamRequest(), 500, 'Could not load your team request. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'team request: load', '57014');
  });

  it('cancel: not found stays 404, an unexpected failure is a fixed 500', async () => {
    const cancel = () => cancelTeamRequest(new Request('http://localhost/x', { method: 'POST' }), { params: { id: REQUEST_ID } });
    sessionWith(undefined, (fn) => (fn === 'cancel_own_coach_team_request' ? { error: sentinelError('P0001', 'No pending team request of yours with that id') } : {}));
    await expectRedacted(await cancel(), 404, 'Team request not found', logs);

    sessionWith(undefined, (fn) => (fn === 'cancel_own_coach_team_request' ? { error: sentinelError('XX000') } : {}));
    await expectRedacted(await cancel(), 500, 'Could not cancel your team request. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'team request: cancel', 'XX000');
  });
});

describe('team-invite redemption never returns or logs database text', () => {
  beforeEach(() => sessionWith());

  // The route makes one atomic call (redeem_team_invite); the database rolls
  // the whole redemption back on any failure, so there is one failure path.
  for (const code of ['P0001', '23503', '08006', '40001']) {
    it(`a failing redeem_team_invite (${code}) is a fixed 500 with a code-only log`, async () => {
      serviceWith((fn) => (fn === 'redeem_team_invite' ? { error: sentinelError(code) } : {}));
      await expectRedacted(await redeemTeamInvite(req('/api/os/team-invites/redeem', { inviteCode: 'TEAM-1' })), 500, 'Could not accept this invite. Please try again.', logs);
      expectCodeOnlyLogs(logs, 'team invite redeem', code);
      expect(service.calls.some((c) => c.op !== 'select')).toBe(false);
    });
  }
});
