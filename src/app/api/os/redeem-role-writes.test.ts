import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { POST as claim } from './claim/route';
import { POST as redeemGuardianInvite } from './invites/redeem/route';
import { POST as redeemCoachInvite } from './coach-invites/redeem/route';

/**
 * Card claim, guardian-invite and coach-invite redemption: the role is set
 * only through ensure_profile_role (service role, only when empty, proven
 * in supabase/tests/authz/migration_0088_test.mjs), never as the signed-in
 * user; relationship rows carry their real origin; and coaches whose
 * assignment ended or expired aren't notified as the player's coach.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));
const storyUpdates: Array<{ recipients: Array<{ profileId: string }> }> = [];
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async (u) => void storyUpdates.push(u)) }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: vi.fn(async () => undefined) }));
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: vi.fn(async () => []) }));


const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const req = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) });

function setupService(existingRole: 'parent' | 'coach' | null) {
  service = createFakeSupabase({
    respond: (c) => {
      if (c.table === 'cards' && c.op === 'select') return { data: { id: 'card-1', status: 'assigned', player_id: PLAYER, access_status: null } };
      if (c.table === 'player_invites' && c.op === 'select') return { data: { id: 'inv-1', used_at: null, expires_at: '2999-01-01T00:00:00Z', player_id: PLAYER } };
      if (c.table === 'coach_invites' && c.op === 'select') return { data: { id: 'ci-1', used_at: null, used_by: null, expires_at: '2999-01-01T00:00:00Z', player_id: PLAYER, created_by: 'guardian-1' } };
      if (c.table === 'players') return { data: { name: 'Fictional Player', team_id: 'team-1' } };
      if (c.table === 'profiles') return { data: { display_name: 'Fictional Person' } };
      if (c.table === 'coach_team') {
        return {
          data: [
            { profile_id: 'coach-active', ended_at: null, expires_at: null },
            { profile_id: 'coach-ended', ended_at: '2026-01-01T00:00:00Z', expires_at: null },
            { profile_id: 'coach-expired', ended_at: null, expires_at: '2026-01-01T00:00:00Z' },
          ],
        };
      }
      if (c.table === 'guardians' && c.op === 'select') return { data: [] };
      return {};
    },
    rpc: (fn) => (fn === 'ensure_profile_role' ? { data: existingRole } : {}),
  });
}

beforeEach(() => {
  session = createFakeSupabase({ user: { id: USER, email: 'person@example.test' } });
  storyUpdates.length = 0;
});

describe('card claim (POST /api/os/claim)', () => {
  it('asks for the parent role through the trusted function and never writes profiles as the user', async () => {
    setupService('coach');
    const res = await claim(req('/api/os/claim', { claimToken: 'ABCD-1234', displayName: 'Fictional Person' }));
    expect(res.status).toBe(200);
    expect(service.rpcCalls).toContainEqual({ fn: 'ensure_profile_role', args: { p_profile_id: USER, p_role: 'parent', p_display_name: 'Fictional Person' } });
    expect(wroteTable(session.calls, 'profiles')).toBe(false);
  });

  it('records the guardian link as a card claim by this account', async () => {
    setupService(null);
    await claim(req('/api/os/claim', { claimToken: 'ABCD-1234' }));
    const insert = service.calls.find((c) => c.table === 'guardians' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ player_id: PLAYER, profile_id: USER, created_via: 'card_claim', created_by: USER });
  });

  it('notifies only coaches whose assignment is still active', async () => {
    setupService(null);
    await claim(req('/api/os/claim', { claimToken: 'ABCD-1234' }));
    expect(storyUpdates).toHaveLength(1);
    expect(storyUpdates[0].recipients.map((r) => r.profileId)).toEqual(['coach-active']);
  });
});

describe('guardian invite (POST /api/os/invites/redeem)', () => {
  it('asks for the parent role through the trusted function and records the link as a guardian invite', async () => {
    setupService('coach');
    const res = await redeemGuardianInvite(req('/api/os/invites/redeem', { inviteCode: 'INV-1234' }));
    expect(res.status).toBe(200);
    expect(service.rpcCalls).toContainEqual({ fn: 'ensure_profile_role', args: { p_profile_id: USER, p_role: 'parent', p_display_name: null } });
    expect(wroteTable(session.calls, 'profiles')).toBe(false);
    const insert = service.calls.find((c) => c.table === 'guardians' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ player_id: PLAYER, profile_id: USER, created_via: 'guardian_invite', created_by: USER });
  });
});

describe('coach invite (POST /api/os/coach-invites/redeem)', () => {
  it('asks for the coach role through the trusted function (a parent keeps parent) and never writes profiles as the user', async () => {
    setupService('parent');
    const res = await redeemCoachInvite(req('/api/os/coach-invites/redeem', { inviteCode: 'COACH-1234' }));
    expect(res.status).toBe(200);
    expect(service.rpcCalls).toContainEqual({ fn: 'ensure_profile_role', args: { p_profile_id: USER, p_role: 'coach', p_display_name: null } });
    expect(wroteTable(session.calls, 'profiles')).toBe(false);
    expect(service.calls.some((c) => c.table === 'coach_players' && c.op === 'insert')).toBe(true);
  });
});

describe('a failed role write stops the flow before any relationship is created', () => {
  it('claim answers 500 and links nothing', async () => {
    setupService(null);
    service = createFakeSupabase({
      respond: (c) => (c.table === 'cards' ? { data: { id: 'card-1', status: 'assigned', player_id: PLAYER, access_status: null } } : {}),
      rpc: () => ({ error: { message: 'boom' } }),
    });
    const res = await claim(req('/api/os/claim', { claimToken: 'ABCD-1234' }));
    expect(res.status).toBe(500);
    expect(wroteTable(service.calls, 'guardians')).toBe(false);
  });
});
