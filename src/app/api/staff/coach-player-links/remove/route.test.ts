import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { POST } from './route';

let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}), createServiceRoleClient: () => service.client }));
const mockRequireStaff = vi.fn();
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...a: unknown[]) => mockRequireStaff(...a) }));

const STAFF = 'eeeeeeee-0000-4000-8000-000000000005';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const COACH = 'aaaaaaaa-0000-4000-8000-000000000001';
const post = (body: unknown) => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  mockRequireStaff.mockResolvedValue({ ok: true, userId: STAFF });
  service = createFakeSupabase({ rpc: () => ({ data: 'removed' }) });
});

describe('POST /api/staff/coach-player-links/remove', () => {
  it('removes through the trusted function as the session’s staff member, with the reason', async () => {
    expect((await post({ playerId: PLAYER, coachProfileId: COACH, reason: ' Family asked ', actorProfileId: COACH })).status).toBe(200);
    expect(service.rpcCalls).toEqual([
      { fn: 'remove_direct_coach_link', args: { p_player_id: PLAYER, p_coach_profile_id: COACH, p_actor_profile_id: STAFF, p_reason: 'Family asked' } },
    ]);
    expect(wroteTable(service.calls, 'coach_players')).toBe(false);
    expect(service.calls).toHaveLength(0);
  });

  it('non-staff and signed-out callers are refused before anything is read or changed', async () => {
    for (const r of [{ ok: false, status: 403, error: 'Staff access required' }, { ok: false, status: 401, error: 'Sign in required' }]) {
      mockRequireStaff.mockResolvedValue(r);
      expect((await post({ playerId: PLAYER, coachProfileId: COACH, reason: 'x' })).status).toBe(r.status);
    }
    expect(service.rpcCalls).toHaveLength(0);
    expect(service.calls).toHaveLength(0);
  });

  it('requires valid ids and a reason', async () => {
    expect((await post({ playerId: 'nope', coachProfileId: COACH, reason: 'x' })).status).toBe(400);
    expect((await post({ playerId: PLAYER, coachProfileId: COACH, reason: '  ' })).status).toBe(400);
    expect((await post({ playerId: PLAYER, coachProfileId: COACH, reason: 'r'.repeat(501) })).status).toBe(400);
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('an already-removed connection answers 404', async () => {
    service = createFakeSupabase({ rpc: () => ({ data: 'not_found' }) });
    expect((await post({ playerId: PLAYER, coachProfileId: COACH, reason: 'again' })).status).toBe(404);
  });
});
