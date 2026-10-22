import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';
import { POST as approve } from './team-requests/[id]/approve/route';
import { POST as reject } from './team-requests/[id]/reject/route';
import { POST as endAssignment } from './coach-assignments/end/route';

/**
 * Staff routes: approve or reject a team request and end a coach
 * assignment. Each trusted function's known refusals map to fixed
 * messages and statuses; anything else is a fixed 500. The function's text
 * never reaches the response or the logs.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/require-staff', () => ({ requireStaff: vi.fn(async () => ({ ok: true, userId: 'eeeeeeee-0000-4000-8000-000000000005' })) }));
vi.mock('@/lib/season', () => ({ currentUkFootballSeason: () => '2026/27' }));

const REQUEST_ID = 'dddddddd-0000-4000-8000-000000000004';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';
const COACH = 'aaaaaaaa-0000-4000-8000-000000000001';

function rpcFails(error: FakeResult['error']) {
  service = createFakeSupabase({
    respond: (c) => (c.table === 'teams' ? { data: { id: TEAM } } : c.table === 'seasons' ? { data: { id: 'season-1', label: '2026/27' } } : {}),
    rpc: () => ({ error }),
  });
}
const post = (b: unknown) => new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(b) });
const approveExisting = () => approve(post({ mode: 'existing', teamId: TEAM }), { params: { id: REQUEST_ID } });
const rejectIt = () => reject(post({ reason: 'Fictional reason' }), { params: { id: REQUEST_ID } });
const endIt = () => endAssignment(post({ teamId: TEAM, profileId: COACH, reason: 'Fictional reason' }));

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  session = createFakeSupabase({ user: { id: 'staff' } });
  logs = captureLogs();
});
afterEach(() => logs.restore());

describe('staff approve never returns or logs database text', () => {
  const cases: Array<[string, number, string]> = [
    ['Not authorized: staff only', 403, 'Staff access required'],
    ['Team request not found', 404, 'Team request not found'],
    ['Team not found', 404, 'Team not found'],
    ['This team request is already approved', 409, 'This team request has already been decided'],
    ['Expiry must be in the future', 400, 'The access end date must be in the future'],
    ['A season is required to create a new team', 400, 'Choose a season for the new team'],
  ];
  for (const [raisedText, status, fixed] of cases) {
    it(`"${raisedText}" → ${status} with a fixed message`, async () => {
      rpcFails(sentinelError('P0001', raisedText));
      await expectRedacted(await approveExisting(), status, fixed, logs);
    });
  }
  it('an unexpected failure is a fixed 500 with a code-only log', async () => {
    rpcFails(sentinelError('23503'));
    await expectRedacted(await approveExisting(), 500, 'Could not approve this team request. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'staff team request: approve', '23503');
  });
  it('a failing season creation (new team) is a fixed 500', async () => {
    service = createFakeSupabase({
      respond: (c) => (c.table === 'seasons' && c.op === 'insert' ? { error: sentinelError('42501') } : {}),
    });
    await expectRedacted(await approve(post({ mode: 'new' }), { params: { id: REQUEST_ID } }), 500, 'Could not set up the season. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'season: create', '42501');
  });
});

describe('staff reject never returns or logs database text', () => {
  const cases: Array<[string, number, string]> = [
    ['Not authorized: staff only', 403, 'Staff access required'],
    ['Team request not found', 404, 'Team request not found'],
    ['This team request is already rejected', 409, 'This team request has already been decided'],
    ['A reason is required', 400, 'A reason (up to 1000 characters) is required'],
  ];
  for (const [raisedText, status, fixed] of cases) {
    it(`"${raisedText}" → ${status} with a fixed message`, async () => {
      rpcFails(sentinelError('P0001', raisedText));
      await expectRedacted(await rejectIt(), status, fixed, logs);
    });
  }
  it('an unexpected failure is a fixed 500 with a code-only log', async () => {
    rpcFails(sentinelError('XX000'));
    await expectRedacted(await rejectIt(), 500, 'Could not reject this team request. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'staff team request: reject', 'XX000');
  });
});

describe('staff end-assignment never returns or logs database text', () => {
  const cases: Array<[string, number, string]> = [
    ['Not authorized: staff only', 403, 'Staff access required'],
    ['Coach assignment not found', 404, 'Coach assignment not found'],
    ['Coach assignment already ended', 409, 'This coach assignment has already ended'],
    ['A reason is required', 400, 'A reason (up to 500 characters) is required'],
  ];
  for (const [raisedText, status, fixed] of cases) {
    it(`"${raisedText}" → ${status} with a fixed message`, async () => {
      rpcFails(sentinelError('P0001', raisedText));
      await expectRedacted(await endIt(), status, fixed, logs);
    });
  }
  it('an unexpected failure is a fixed 500 with a code-only log', async () => {
    rpcFails(sentinelError('40P01'));
    await expectRedacted(await endIt(), 500, 'Could not end this coach assignment. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'staff coach assignment: end', '40P01');
  });
  it('successful calls are unchanged', async () => {
    service = createFakeSupabase({ rpc: () => ({ data: null }) });
    const res = await endIt();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
