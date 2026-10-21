import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { GET, POST } from './route';
import { POST as cancel } from './[id]/cancel/route';
import { POST as retiredTeamsPost } from '../teams/route';

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));
const mockRateLimit = vi.fn(async () => true);
vi.mock('@/lib/anonymous-request-rate-limit', () => ({ consumeAnonymousRequestRateLimit: (...a: unknown[]) => mockRateLimit(...(a as [])) }));
const notifications: Array<Record<string, unknown>> = [];
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: vi.fn(async (_s: unknown, p: Record<string, unknown>) => {
    notifications.push(p);
    return { enqueued: true, sent: false };
  }),
}));


const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const REQUEST_ID = 'dddddddd-0000-4000-8000-000000000004';
const created = { id: REQUEST_ID, status: 'pending', club_name: 'Fictional FC', team_name: 'U10', age_group: null, decision_note: null, created_at: '2026-10-21T10:00:00Z' };

function setup(insertResult: { data?: unknown; error?: { code?: string; message: string } } = { data: created }) {
  session = createFakeSupabase({
    user: { id: USER },
    respond: (c) => {
      if (c.table === 'coach_team_requests' && c.op === 'insert') return insertResult;
      if (c.table === 'coach_team_requests' && c.op === 'select') return { data: [created] };
      return {};
    },
  });
  service = createFakeSupabase({});
}
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/os/team-requests', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  setup();
  notifications.length = 0;
  mockRateLimit.mockResolvedValue(true);
});

describe('POST /api/os/team-requests', () => {
  it('saves the request through the signed-in session with only the four requester columns', async () => {
    const res = await post({ clubName: ' Fictional FC ', teamName: 'U10', status: 'approved', requester_profile_id: 'someone-else' });
    expect(res.status).toBe(201);
    const insert = session.calls.find((c) => c.table === 'coach_team_requests' && c.op === 'insert');
    expect(insert?.payload).toEqual({ club_name: 'Fictional FC', team_name: 'U10', age_group: null, note: null });
    expect(wroteTable(service.calls, 'coach_team_requests')).toBe(false);
  });

  it('creates a missing profile with no role, and never touches the role', async () => {
    await post({ clubName: 'Fictional FC', teamName: 'U10' });
    const profileWrite = session.calls.find((c) => c.table === 'profiles');
    expect(profileWrite?.payload).toEqual({ id: USER });
    expect(profileWrite?.options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });

  it('a given name is set by updating display_name only (never role, never a merge-upsert)', async () => {
    await post({ clubName: 'Fictional FC', teamName: 'U10', displayName: ' Fictional Coach ' });
    const profileCalls = session.calls.filter((c) => c.table === 'profiles');
    expect(profileCalls.map((c) => c.op)).toEqual(['upsert', 'update']);
    expect(profileCalls[0].payload).toEqual({ id: USER });
    expect(profileCalls[0].options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(profileCalls[1].payload).toEqual({ display_name: 'Fictional Coach' });
    expect(profileCalls[1].filters).toContainEqual(['eq', 'id', USER]);
  });

  it('notifies staff (best effort) without child data', async () => {
    await post({ clubName: 'Fictional FC', teamName: 'U10' });
    expect(notifications).toEqual([
      expect.objectContaining({
        eventType: 'new_coach_team_request',
        eventKey: `new_coach_team_request:${REQUEST_ID}`,
        recipientScope: 'all_staff',
        summary: { clubName: 'Fictional FC', teamName: 'U10', ageGroup: null },
        linkPath: '/staff/team-requests',
      }),
    ]);
  });

  it('a second pending request answers 409', async () => {
    setup({ error: { code: '23505', message: 'duplicate key' } });
    expect((await post({ clubName: 'Fictional FC', teamName: 'U10' })).status).toBe(409);
    expect(notifications).toHaveLength(0);
  });

  it('before 0088 exists it answers 503, not a crash', async () => {
    setup({ error: { code: 'PGRST205', message: 'not found in schema cache' } });
    expect((await post({ clubName: 'Fictional FC', teamName: 'U10' })).status).toBe(503);
  });

  it('validates input, requires sign-in, and is rate limited', async () => {
    expect((await post({ clubName: 'X', teamName: 'U10' })).status).toBe(400);
    mockRateLimit.mockResolvedValueOnce(false);
    expect((await post({ clubName: 'Fictional FC', teamName: 'U10' })).status).toBe(429);
    session = createFakeSupabase({ user: null });
    expect((await post({ clubName: 'Fictional FC', teamName: 'U10' })).status).toBe(401);
  });
});

describe('GET /api/os/team-requests', () => {
  it('returns the caller’s own latest request', async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ request: created, available: true });
    expect(session.calls[0].filters).toContainEqual(['eq', 'requester_profile_id', USER]);
  });
});

describe('POST /api/os/team-requests/[id]/cancel', () => {
  it('cancels through the requester-only database function', async () => {
    const res = await cancel(new Request('http://localhost'), { params: { id: REQUEST_ID } });
    expect(res.status).toBe(200);
    expect(session.rpcCalls).toEqual([{ fn: 'cancel_own_coach_team_request', args: { p_request_id: REQUEST_ID } }]);
  });

  it('someone else’s, or an already-decided, request is not found', async () => {
    session = createFakeSupabase({ user: { id: USER }, rpc: () => ({ error: { message: 'No pending team request of yours with that id' } }) });
    expect((await cancel(new Request('http://localhost'), { params: { id: REQUEST_ID } })).status).toBe(404);
    expect((await cancel(new Request('http://localhost'), { params: { id: 'not-a-uuid' } })).status).toBe(404);
  });
});

describe('retired self-service team creation', () => {
  it('POST /api/os/teams answers 410 and writes nothing', async () => {
    const res = await retiredTeamsPost();
    expect(res.status).toBe(410);
    expect(session.calls).toHaveLength(0);
  });
});
