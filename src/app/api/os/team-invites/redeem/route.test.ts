import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { POST } from './route';

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));


const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';

function setup({ changed, existingRole = null }: { changed: boolean; existingRole?: 'parent' | 'coach' | null }) {
  session = createFakeSupabase({ user: { id: USER } });
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'team_invites' && c.op === 'select') {
        return { data: { id: 'invite-1', used_at: null, expires_at: '2999-01-01T00:00:00Z', team_id: TEAM } };
      }
      if (c.table === 'players') return { data: [] };
      if (c.table === 'profiles') return { data: { display_name: 'Fictional Coach' } };
      return {};
    },
    rpc: (fn) => {
      if (fn === 'ensure_profile_role') return { data: existingRole ?? 'coach' };
      if (fn === 'activate_coach_assignment') return { data: changed };
      return {};
    },
  });
}

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/os/team-invites/redeem', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/os/team-invites/redeem', () => {
  beforeEach(() => setup({ changed: true }));

  it('sets the coach role through the trusted function, only-if-empty, never as the signed-in user', async () => {
    const res = await post({ inviteCode: 'TEAM-CODE', displayName: 'Fictional Coach' });
    expect(res.status).toBe(200);
    expect(service.rpcCalls).toContainEqual({
      fn: 'ensure_profile_role',
      args: { p_profile_id: USER, p_role: 'coach', p_display_name: 'Fictional Coach' },
    });
    expect(wroteTable(session.calls, 'profiles')).toBe(false);
  });

  it('a parent accepting a team invite keeps the parent role (the function never overwrites) and still gains the team', async () => {
    setup({ changed: true, existingRole: 'parent' });
    const res = await post({ inviteCode: 'TEAM-CODE' });
    expect(res.status).toBe(200);
    expect(service.rpcCalls.map((c) => c.fn)).toEqual(['ensure_profile_role', 'activate_coach_assignment']);
  });

  it('creates or reactivates the assignment, attributed to the redeeming account, and consumes the invite', async () => {
    await post({ inviteCode: 'TEAM-CODE' });
    expect(service.rpcCalls).toContainEqual({
      fn: 'activate_coach_assignment',
      args: { p_team_id: TEAM, p_profile_id: USER, p_created_via: 'team_invite', p_actor_profile_id: USER },
    });
    expect(service.calls.some((c) => c.table === 'team_invites' && c.op === 'update')).toBe(true);
    // No direct coach_team write from either client.
    expect(wroteTable(service.calls, 'coach_team')).toBe(false);
    expect(wroteTable(session.calls, 'coach_team')).toBe(false);
  });

  it('an already-active assignment answers 409 and leaves the invite unused', async () => {
    setup({ changed: false });
    const res = await post({ inviteCode: 'TEAM-CODE' });
    expect(res.status).toBe(409);
    expect(service.calls.some((c) => c.table === 'team_invites' && c.op === 'update')).toBe(false);
  });

  it('requires sign-in', async () => {
    session = createFakeSupabase({ user: null });
    expect((await post({ inviteCode: 'TEAM-CODE' })).status).toBe(401);
  });
});
