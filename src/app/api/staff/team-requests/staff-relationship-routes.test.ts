import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { POST as approve } from './[id]/approve/route';
import { POST as reject } from './[id]/reject/route';
import { POST as endAssignment } from '../coach-assignments/end/route';

let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => service.client,
}));
const mockRequireStaff = vi.fn();
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...a: unknown[]) => mockRequireStaff(...a) }));
vi.mock('@/lib/season', () => ({ currentUkFootballSeason: () => '2026/27' }));
const mockResolveSeason = vi.fn();
vi.mock('@/lib/resolve-season', () => ({ resolveOrCreateSeason: (...a: unknown[]) => mockResolveSeason(...a) }));


const STAFF = 'eeeeeeee-0000-4000-8000-000000000005';
const REQUEST_ID = 'dddddddd-0000-4000-8000-000000000004';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';
const COACH = 'aaaaaaaa-0000-4000-8000-000000000001';

const json = (body: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const params = { params: { id: REQUEST_ID } };

function setupService(rpcResult: { data?: unknown; error?: { message: string } } = { data: TEAM }, teamExists = true) {
  service = createFakeSupabase({
    respond: (c) => (c.table === 'teams' ? { data: teamExists ? { id: TEAM } : null } : {}),
    rpc: () => rpcResult,
  });
}

beforeEach(() => {
  mockRequireStaff.mockResolvedValue({ ok: true, userId: STAFF });
  mockResolveSeason.mockReset();
  mockResolveSeason.mockResolvedValue({ ok: true, id: 'season-resolved', label: '2026/27' });
  setupService();
});

describe('staff routes are staff-only, checked before any service-role call', () => {
  it.each([
    ['approve', () => approve(json({ mode: 'existing', teamId: TEAM }), params)],
    ['reject', () => reject(json({ reason: 'No' }), params)],
    ['end assignment', () => endAssignment(json({ teamId: TEAM, profileId: COACH, reason: 'Left' }))],
  ])('%s: a signed-in non-staff account gets 403 and no function runs', async (_name, call) => {
    mockRequireStaff.mockResolvedValue({ ok: false, status: 403, error: 'Staff access required' });
    expect((await call()).status).toBe(403);
    expect(service.rpcCalls).toHaveLength(0);
    expect(service.calls).toHaveLength(0);
  });

  it('signed out gets 401', async () => {
    mockRequireStaff.mockResolvedValue({ ok: false, status: 401, error: 'Sign in required' });
    expect((await approve(json({ mode: 'new' }), params)).status).toBe(401);
    expect(service.rpcCalls).toHaveLength(0);
  });
});

describe('POST /api/staff/team-requests/[id]/approve', () => {
  it('approves into an existing team as the signed-in staff member', async () => {
    const res = await approve(json({ mode: 'existing', teamId: TEAM }), params);
    expect(res.status).toBe(200);
    expect(service.rpcCalls).toEqual([
      { fn: 'approve_coach_team_request', args: { p_request_id: REQUEST_ID, p_staff_profile_id: STAFF, p_team_id: TEAM, p_expires_at: null, p_season_id: null } },
    ]);
  });

  it('a new team resolves the season server-side from a label (default: the current season)', async () => {
    await approve(json({ mode: 'new', season: '2027/28' }), params);
    expect(mockResolveSeason).toHaveBeenLastCalledWith(service.client, '2027/28');
    await approve(json({ mode: 'new' }), params);
    expect(mockResolveSeason).toHaveBeenLastCalledWith(service.client, '2026/27');
    expect(service.rpcCalls.at(-1)?.args).toMatchObject({ p_team_id: null, p_season_id: 'season-resolved' });
  });

  it('never accepts a season id from the browser', async () => {
    for (const key of ['seasonId', 'season_id', 'p_season_id']) {
      const res = await approve(json({ mode: 'new', [key]: 'ffffffff-0000-4000-8000-000000000006' }), params);
      expect(res.status).toBe(400);
    }
    expect(service.rpcCalls).toHaveLength(0);
    expect(mockResolveSeason).not.toHaveBeenCalled();
  });

  it('an invalid season label is refused by the resolver, and nothing is approved', async () => {
    mockResolveSeason.mockResolvedValue({ ok: false, status: 400, error: 'Season name must be between 3 and 40 characters' });
    expect((await approve(json({ mode: 'new', season: 'x' }), params)).status).toBe(400);
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('validates the team and the optional access end date', async () => {
    expect((await approve(json({ mode: 'existing', teamId: 'nope' }), params)).status).toBe(400);
    setupService({ data: TEAM }, false);
    expect((await approve(json({ mode: 'existing', teamId: TEAM }), params)).status).toBe(404);
    setupService();
    expect((await approve(json({ mode: 'existing', teamId: TEAM, expiresOn: '2020-01-01' }), params)).status).toBe(400);
    expect((await approve(json({ mode: 'existing', teamId: TEAM, expiresOn: 'soon' }), params)).status).toBe(400);
    expect((await approve(json({ mode: 'sideways' }), params)).status).toBe(400);
    expect(service.rpcCalls).toHaveLength(0);
    await approve(json({ mode: 'existing', teamId: TEAM, expiresOn: '2999-06-30' }), params);
    expect(service.rpcCalls[0].args.p_expires_at).toBe('2999-06-30T23:59:59.999Z');
  });

  it('a decided request answers 409', async () => {
    setupService({ error: { message: 'This team request is already approved' } });
    expect((await approve(json({ mode: 'existing', teamId: TEAM }), params)).status).toBe(409);
  });
});

describe('POST /api/staff/team-requests/[id]/reject', () => {
  it('rejects with a required reason as the signed-in staff member', async () => {
    expect((await reject(json({ reason: '  ' }), params)).status).toBe(400);
    expect((await reject(json({ reason: 'Please use your club’s team invite' }), params)).status).toBe(200);
    expect(service.rpcCalls).toEqual([
      { fn: 'reject_coach_team_request', args: { p_request_id: REQUEST_ID, p_staff_profile_id: STAFF, p_reason: 'Please use your club’s team invite' } },
    ]);
  });
});

describe('POST /api/staff/coach-assignments/end', () => {
  it('ends an assignment with a reason as the signed-in staff member', async () => {
    expect((await endAssignment(json({ teamId: TEAM, profileId: COACH, reason: 'Left the club' }))).status).toBe(200);
    expect(service.rpcCalls).toEqual([
      { fn: 'end_coach_assignment', args: { p_team_id: TEAM, p_profile_id: COACH, p_staff_profile_id: STAFF, p_reason: 'Left the club' } },
    ]);
  });

  it('validates ids and reason; an already-ended assignment answers 409', async () => {
    expect((await endAssignment(json({ teamId: 'x', profileId: COACH, reason: 'r' }))).status).toBe(400);
    expect((await endAssignment(json({ teamId: TEAM, profileId: COACH, reason: '' }))).status).toBe(400);
    setupService({ error: { message: 'Coach assignment already ended' } });
    expect((await endAssignment(json({ teamId: TEAM, profileId: COACH, reason: 'again' }))).status).toBe(409);
  });
});
