import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { GET, POST } from './route';

/**
 * A coach invite is spent once used_at is set, whoever (if anyone) is still
 * recorded in used_by: after the redeeming account is deleted, used_by is
 * NULL (migration 0088) but the invite stays consumed. An expired, unused
 * invite is invalid too. Both must behave like any invalid code, write
 * nothing, and reveal nothing about why.
 *
 * Redemption itself is one database call (redeem_coach_invite, 0088); its
 * decisions are proven against real PostgreSQL in
 * supabase/tests/authz/coach_invite_redemption_test.mjs. Here the route's
 * side is checked: one call with the session's own coach id, no direct
 * writes, and the generic answer for 'invalid'.
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
const INVITER = 'eeeeeeee-0000-4000-8000-000000000005';

const CONSUMED_REDEEMER_DELETED = { used_at: '2026-10-01T09:30:00Z', used_by: null, expires_at: '2999-01-01T00:00:00Z' };
const EXPIRED_UNUSED = { used_at: null, used_by: null, expires_at: '2020-01-01T00:00:00Z' };

function setup(invite: { used_at: string | null; used_by: string | null; expires_at: string }, redeemStatus: string, redeemPlayer: string | null = null) {
  storyUpdates.length = 0;
  session = createFakeSupabase({ user: { id: COACH } });
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'coach_invites' && c.op === 'select') {
        return { data: { id: 'ci-1', player_id: PLAYER, created_by: INVITER, players: { name: 'Fictional Player', teams: null }, ...invite } };
      }
      if (c.table === 'guardians' && c.op === 'select') {
        return c.filters.some(([, col, v]) => col === 'profile_id' && v === INVITER) ? { data: { player_id: PLAYER } } : { data: [] };
      }
      if (c.table === 'players') return { data: { name: 'Fictional Player' } };
      if (c.table === 'profiles') return { data: { display_name: 'Fictional Coach' } };
      return {};
    },
    rpc: (fn) => (fn === 'redeem_coach_invite' ? { data: [{ status: redeemStatus, player_id: redeemPlayer }] } : {}),
  });
}

const lookup = () => GET(new NextRequest('http://localhost/api/os/coach-invites/redeem?code=COACH-1234'));
const redeem = (body: Record<string, unknown> = { inviteCode: 'coach-1234 ' }) =>
  POST(new NextRequest('http://localhost/api/os/coach-invites/redeem', { method: 'POST', body: JSON.stringify(body) }));

function expectNoDirectWrites() {
  for (const table of ['coach_players', 'coach_invites', 'profiles']) {
    expect(wroteTable(service.calls, table), `service wrote ${table}`).toBe(false);
    expect(wroteTable(session.calls, table), `session wrote ${table}`).toBe(false);
  }
  expect(session.rpcCalls).toEqual([]);
}

describe.each([
  ['a consumed invite whose redeemer was deleted (used_at set, used_by NULL)', CONSUMED_REDEEMER_DELETED],
  ['an expired, unused invite', EXPIRED_UNUSED],
])('%s', (_label, invite) => {
  it('lookup reports it exactly like any invalid code, and writes nothing', async () => {
    setup(invite, 'invalid');
    const res = await lookup();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false });
    expectNoDirectWrites();
    expect(service.rpcCalls).toEqual([]);
  });

  it('redemption is refused with the generic message: one atomic call, no direct writes, no notification', async () => {
    setup(invite, 'invalid');
    const res = await redeem();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "This invite isn't valid or has expired" });
    expectNoDirectWrites();
    expect(service.rpcCalls).toEqual([{ fn: 'redeem_coach_invite', args: { p_code: 'COACH-1234', p_coach_profile_id: COACH, p_display_name: null } }]);
    expect(storyUpdates).toHaveLength(0);
  });
});

describe('redemption through the atomic function', () => {
  it('a new redemption returns the player and notifies once; the route writes nothing itself', async () => {
    setup({ used_at: null, used_by: null, expires_at: '2999-01-01T00:00:00Z' }, 'redeemed', PLAYER);
    const res = await redeem({ inviteCode: 'COACH-1234', displayName: ' Fictional Coach ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, playerId: PLAYER });
    expect(service.rpcCalls).toEqual([{ fn: 'redeem_coach_invite', args: { p_code: 'COACH-1234', p_coach_profile_id: COACH, p_display_name: 'Fictional Coach' } }]);
    expectNoDirectWrites();
    expect(storyUpdates).toHaveLength(1);
  });

  it('the coach id always comes from the session, never the body', async () => {
    setup({ used_at: null, used_by: null, expires_at: '2999-01-01T00:00:00Z' }, 'redeemed', PLAYER);
    await redeem({ inviteCode: 'COACH-1234', coachProfileId: INVITER, p_coach_profile_id: INVITER, userId: INVITER });
    expect(service.rpcCalls[0].args.p_coach_profile_id).toBe(COACH);
  });

  it('a retry by the coach who redeemed it succeeds without a second notification', async () => {
    setup({ used_at: '2026-10-01T09:30:00Z', used_by: COACH, expires_at: '2999-01-01T00:00:00Z' }, 'already_redeemed_by_you', PLAYER);
    const res = await redeem();
    expect(await res.json()).toEqual({ ok: true, playerId: PLAYER, alreadyConnected: true });
    expect(storyUpdates).toHaveLength(0);
    expectNoDirectWrites();
  });

  it('an already directly connected coach gets 409 and no notification', async () => {
    setup({ used_at: null, used_by: null, expires_at: '2999-01-01T00:00:00Z' }, 'already_connected');
    expect((await redeem()).status).toBe(409);
    expect(storyUpdates).toHaveLength(0);
  });

  it('a database failure is reported generically, with no notification', async () => {
    setup({ used_at: null, used_by: null, expires_at: '2999-01-01T00:00:00Z' }, 'redeemed', PLAYER);
    service = createFakeSupabase({ rpc: () => ({ error: { message: 'synthetic failure' } }) });
    const res = await redeem();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('synthetic');
    expect(storyUpdates).toHaveLength(0);
  });

  it('requires sign-in and an invite code before any database call', async () => {
    setup(EXPIRED_UNUSED, 'invalid');
    session = createFakeSupabase({ user: null });
    expect((await redeem()).status).toBe(401);
    setup(EXPIRED_UNUSED, 'invalid');
    expect((await redeem({})).status).toBe(400);
    expect(service.rpcCalls).toEqual([]);
  });
});
