import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { DELETE as disconnect } from './players/[id]/coach-connections/[coachProfileId]/route';
import { GET as lookupCoachInvite, POST as redeemCoachInvite } from './coach-invites/redeem/route';

/**
 * Direct coach links (coach_players): removal only through the trusted
 * remove_direct_coach_link, and coach-invite redemption only while the
 * invite's creator is still a guardian of the player. Database behaviour is
 * proven in supabase/tests/authz/direct_coach_links_test.mjs.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));
const storyUpdates: unknown[] = [];
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async (u) => void storyUpdates.push(u)) }));
vi.mock('@/lib/rate-limit', () => ({
  getRequestIdentifier: () => 'test',
  isWithinRateLimit: async () => true,
  logClaimAttempt: async () => undefined,
}));

const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const COACH = 'aaaaaaaa-0000-4000-8000-000000000001';
const GUARDIAN = 'bbbbbbbb-0000-4000-8000-000000000002';
const STRANGER = 'dddddddd-0000-4000-8000-000000000004';
const INVITER = 'eeeeeeee-0000-4000-8000-000000000005';

beforeEach(() => {
  storyUpdates.length = 0;
});

describe('DELETE /api/os/players/[id]/coach-connections/[coachProfileId]', () => {
  function setup(user: string, { isGuardian = false, result = 'removed' as string | { error: string } } = {}) {
    session = createFakeSupabase({ user: { id: user } });
    service = createFakeSupabase({
      respond: (c) => {
        if (c.table === 'guardians' && c.op === 'select') {
          return c.filters.some(([, col, v]) => col === 'profile_id' && v === user) ? { data: isGuardian ? { player_id: PLAYER } : null } : { data: [] };
        }
        if (c.table === 'players') return { data: { name: 'Fictional Player' } };
        if (c.table === 'profiles') return { data: { display_name: 'Fictional Coach' } };
        return {};
      },
      rpc: () => (typeof result === 'string' ? { data: result } : { error: { message: result.error } }),
    });
  }
  const call = () => disconnect(new Request('http://localhost', { method: 'DELETE' }), { params: { id: PLAYER, coachProfileId: COACH } });

  it('a current guardian removes the link through the trusted function, as themselves, with a reason', async () => {
    setup(GUARDIAN, { isGuardian: true });
    expect((await call()).status).toBe(200);
    expect(service.rpcCalls).toEqual([
      { fn: 'remove_direct_coach_link', args: { p_player_id: PLAYER, p_coach_profile_id: COACH, p_actor_profile_id: GUARDIAN, p_reason: 'Removed by a guardian' } },
    ]);
    expect(wroteTable(service.calls, 'coach_players')).toBe(false);
    expect(storyUpdates).toHaveLength(1);
  });

  it('the connected coach removes their own link', async () => {
    setup(COACH);
    expect((await call()).status).toBe(200);
    expect(service.rpcCalls[0].args).toMatchObject({ p_actor_profile_id: COACH, p_reason: 'The coach ended their own connection' });
  });

  it('anyone else is refused before any removal', async () => {
    setup(STRANGER);
    expect((await call()).status).toBe(403);
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('an already-removed link is a safe 404 with no notification', async () => {
    setup(GUARDIAN, { isGuardian: true, result: 'not_found' });
    expect((await call()).status).toBe(404);
    expect(storyUpdates).toHaveLength(0);
  });

  it('a database refusal is reported without detail', async () => {
    setup(GUARDIAN, { isGuardian: true, result: { error: 'Not authorized to remove this connection' } });
    const res = await call();
    expect(res.status).toBe(403);
    expect(storyUpdates).toHaveLength(0);
  });

  it('requires sign-in', async () => {
    session = createFakeSupabase({ user: null });
    expect((await call()).status).toBe(401);
  });
});

describe('coach-invite redemption re-checks the invite creator', () => {
  function setup({ inviterIsGuardian, createdBy = INVITER }: { inviterIsGuardian: boolean; createdBy?: string | null }) {
    session = createFakeSupabase({ user: { id: COACH } });
    service = createFakeSupabase({
      respond: (c) => {
        if (c.table === 'coach_invites' && c.op === 'select') {
          return { data: { id: 'ci-1', used_at: null, used_by: null, expires_at: '2999-01-01T00:00:00Z', player_id: PLAYER, created_by: createdBy, players: { name: 'Fictional Player', teams: null } } };
        }
        if (c.table === 'guardians' && c.op === 'select') {
          const asksForInviter = c.filters.some(([, col, v]) => col === 'profile_id' && v === createdBy);
          return asksForInviter ? { data: inviterIsGuardian ? { player_id: PLAYER } : null } : { data: [] };
        }
        if (c.table === 'players') return { data: { name: 'Fictional Player' } };
        if (c.table === 'profiles') return { data: { display_name: 'Fictional Coach' } };
        return {};
      },
      // redeem_coach_invite re-checks the creator inside its atomic claim
      // (proven in supabase/tests/authz/coach_invite_redemption_test.mjs);
      // a creator who is no longer a guardian makes it return 'invalid'.
      rpc: (fn) =>
        fn === 'redeem_coach_invite' ? { data: [inviterIsGuardian ? { status: 'redeemed', player_id: PLAYER } : { status: 'invalid', player_id: null }] } : {},
    });
  }
  const redeem = () => redeemCoachInvite(new NextRequest('http://localhost/api/os/coach-invites/redeem', { method: 'POST', body: JSON.stringify({ inviteCode: 'COACH-1234' }) }));
  const lookup = () => lookupCoachInvite(new NextRequest('http://localhost/api/os/coach-invites/redeem?code=COACH-1234'));

  it.each([
    ['is no longer a guardian of the player', { inviterIsGuardian: false }],
    ['deleted their account', { inviterIsGuardian: false, createdBy: null }],
  ])('refuses when the creator %s: generic error, no direct writes', async (_label, opts) => {
    setup(opts);
    const res = await redeem();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This invite isn't valid or has expired");
    expect(service.rpcCalls.map((c) => c.fn)).toEqual(['redeem_coach_invite']);
    expect(wroteTable(service.calls, 'coach_players')).toBe(false);
    expect(wroteTable(service.calls, 'coach_invites')).toBe(false);
    expect(wroteTable(session.calls, 'profiles')).toBe(false);
  });

  it('the public lookup treats such an invite as not found', async () => {
    setup({ inviterIsGuardian: false });
    expect(await (await lookup()).json()).toEqual({ found: false });
  });

  it('a valid invite from a current guardian still redeems, in one atomic call', async () => {
    setup({ inviterIsGuardian: true });
    const res = await redeem();
    expect(res.status).toBe(200);
    expect(service.rpcCalls).toEqual([{ fn: 'redeem_coach_invite', args: { p_code: 'COACH-1234', p_coach_profile_id: COACH, p_display_name: null } }]);
    expect(wroteTable(service.calls, 'coach_players')).toBe(false);
    expect(wroteTable(service.calls, 'coach_invites')).toBe(false);
    expect((await (await lookup()).json()).found).toBe(true);
  });
});
