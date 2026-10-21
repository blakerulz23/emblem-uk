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
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));
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

function setup(invite: { used_at: string | null; used_by: string | null; expires_at: string }) {
  session = createFakeSupabase({ user: { id: COACH } });
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'coach_invites' && c.op === 'select') {
        return { data: { id: 'ci-1', player_id: PLAYER, created_by: INVITER, players: { name: 'Fictional Player', teams: null }, ...invite } };
      }
      // The inviter is a current guardian, so only used_at / expiry decide.
      // (The post-redemption notification reads guardians as a list.)
      if (c.table === 'guardians' && c.op === 'select') {
        return c.filters.some(([, col, v]) => col === 'profile_id' && v === INVITER) ? { data: { player_id: PLAYER } } : { data: [] };
      }
      if (c.table === 'players') return { data: { name: 'Fictional Player' } };
      if (c.table === 'profiles') return { data: { display_name: 'Fictional Coach' } };
      if (c.table === 'coach_players' && c.op === 'select') return { data: null };
      return {};
    },
    rpc: () => ({ data: 'coach' }),
  });
}

const lookup = () => GET(new NextRequest('http://localhost/api/os/coach-invites/redeem?code=COACH-1234'));
const redeem = () =>
  POST(new NextRequest('http://localhost/api/os/coach-invites/redeem', { method: 'POST', body: JSON.stringify({ inviteCode: 'COACH-1234' }) }));

function expectNothingWritten() {
  for (const table of ['coach_players', 'coach_invites', 'profiles']) {
    expect(wroteTable(service.calls, table), `service wrote ${table}`).toBe(false);
    expect(wroteTable(session.calls, table), `session wrote ${table}`).toBe(false);
  }
  expect(service.rpcCalls).toEqual([]);
  expect(session.rpcCalls).toEqual([]);
}

describe.each([
  ['a consumed invite whose redeemer was deleted (used_at set, used_by NULL)', CONSUMED_REDEEMER_DELETED],
  ['an expired, unused invite', EXPIRED_UNUSED],
])('%s', (_label, invite) => {
  it('lookup reports it exactly like any invalid code, and writes nothing', async () => {
    setup(invite);
    const res = await lookup();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false });
    expectNothingWritten();
  });

  it('redemption is refused with the generic message: no link, no role, the invite untouched', async () => {
    setup(invite);
    const res = await redeem();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "This invite isn't valid or has expired" });
    expectNothingWritten();
  });
});

describe('control: an unused, unexpired invite from a current guardian still redeems', () => {
  it('creates the link, consumes the invite once, and asks for the coach role through the trusted function', async () => {
    setup({ used_at: null, used_by: null, expires_at: '2999-01-01T00:00:00Z' });
    expect((await lookup()).status).toBe(200);
    const res = await redeem();
    expect(res.status).toBe(200);
    expect(service.calls.filter((c) => c.table === 'coach_players' && c.op === 'insert')).toHaveLength(1);
    expect(service.calls.filter((c) => c.table === 'coach_invites' && c.op === 'update')).toHaveLength(1);
    expect(service.rpcCalls.map((c) => c.fn)).toEqual(['ensure_profile_role']);
  });
});
