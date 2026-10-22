import fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';
import { POST } from './route';

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));
const storyUpdates: unknown[] = [];
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async (u) => void storyUpdates.push(u)) }));

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';
const UNUSABLE = "This invite isn't valid or has expired";

function setup(rpcResult: { data?: unknown; error?: { code?: string; message: string } }) {
  session = createFakeSupabase({ user: { id: USER } });
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'players') return { data: [{ id: 'player-1', name: 'Fictional Player' }] };
      if (c.table === 'profiles') return { data: { display_name: 'Fictional Coach' } };
      if (c.table === 'guardians') return { data: [{ profile_id: 'guardian-1' }] };
      return {};
    },
    rpc: (fn) => (fn === 'redeem_team_invite' ? rpcResult : {}),
  });
}
const row = (status: string, teamId: string | null = null) => ({ data: [{ status, team_id: teamId }] });
const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/os/team-invites/redeem', { method: 'POST', body: JSON.stringify(body) }));

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  storyUpdates.length = 0;
  logs = captureLogs();
});
afterEach(() => logs.restore());

describe('POST /api/os/team-invites/redeem — one atomic call, fixed responses', () => {
  it('delegates the whole write to redeem_team_invite with the session’s own id and the normalised code', async () => {
    setup(row('redeemed', TEAM));
    const res = await post({ inviteCode: ' team-code ', displayName: ' Fictional Coach ', profileId: 'forged-id' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, teamId: TEAM });
    expect(service.rpcCalls).toEqual([
      { fn: 'redeem_team_invite', args: { p_code: 'TEAM-CODE', p_coach_profile_id: USER, p_display_name: 'Fictional Coach' } },
    ]);
  });

  it('writes nothing itself: no role, assignment or invite write from either client', async () => {
    setup(row('redeemed', TEAM));
    await post({ inviteCode: 'TEAM-CODE' });
    for (const client of [session, service]) {
      for (const table of ['profiles', 'coach_team', 'team_invites', 'guardians']) expect(wroteTable(client.calls, table)).toBe(false);
    }
    expect(service.rpcCalls.map((c) => c.fn)).toEqual(['redeem_team_invite']);
    expect(session.rpcCalls).toEqual([]);
  });

  it('notifies the team’s families only on a new redemption', async () => {
    setup(row('redeemed', TEAM));
    await post({ inviteCode: 'TEAM-CODE' });
    expect(storyUpdates).toHaveLength(1);
  });

  it('a retry by the coach who redeemed it is the same success, with no new notification', async () => {
    setup(row('already_redeemed_by_you', TEAM));
    const res = await post({ inviteCode: 'TEAM-CODE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, teamId: TEAM });
    expect(storyUpdates).toHaveLength(0);
  });

  it('an already-active coach gets the existing 409', async () => {
    setup(row('already_active'));
    const res = await post({ inviteCode: 'TEAM-CODE' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You're already managing this team" });
  });

  it('invalid, stale-after-end and stale-after-expiry all read the same: nothing about earlier access is revealed', async () => {
    const bodies: string[] = [];
    for (const status of ['invalid', 'stale_after_end', 'stale_after_expiry', 'something_unexpected']) {
      setup(row(status));
      const res = await post({ inviteCode: 'TEAM-CODE' });
      expect(res.status).toBe(400);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({ error: UNUSABLE });
    expect(bodies[0]).not.toMatch(/end|expir(ed|y) (access|assignment)|stale|coach|team/i);
    expect(storyUpdates).toHaveLength(0);
  });

  it('a database failure is a fixed 500 with a code-only log and no database text', async () => {
    setup({ error: sentinelError('40P01') });
    await expectRedacted(await post({ inviteCode: 'TEAM-CODE' }), 500, 'Could not accept this invite. Please try again.', logs);
    expect(logs.text()).toContain(JSON.stringify(['team invite redeem failed', { code: '40P01' }]));
  });

  it('requires sign-in and a code', async () => {
    setup(row('redeemed', TEAM));
    session = createFakeSupabase({ user: null });
    expect((await post({ inviteCode: 'TEAM-CODE' })).status).toBe(401);
    setup(row('redeemed', TEAM));
    expect((await post({})).status).toBe(400);
    expect(service.rpcCalls).toEqual([]);
  });
});

describe('team-invite redemption route: structure', () => {
  const src = fs.readFileSync('src/app/api/os/team-invites/redeem/route.ts', 'utf8');
  const post = src.slice(src.indexOf('export async function POST'));
  it('calls only redeem_team_invite and never writes relationships, roles or invites itself', () => {
    expect(post).toContain(".rpc('redeem_team_invite'");
    expect(post).not.toMatch(/ensure_profile_role|ensureProfileRole|activate_coach_assignment|activateCoachAssignment/);
    expect(post).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    // It never touches the invite or the assignment directly (it does read
    // the coach's display name from profiles, for the families' notice).
    expect(post).not.toMatch(/from\('(coach_team|team_invites)'\)/);
  });
  it('takes the coach identity from the session, never the body', () => {
    expect(post).toMatch(/p_coach_profile_id: user\.id/);
  });
});
