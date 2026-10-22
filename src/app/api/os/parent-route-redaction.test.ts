import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall, FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';
import { POST as claim } from './claim/route';
import { POST as redeemGuardianInvite } from './invites/redeem/route';
import { GET as listRecoverable } from './recover/route';

/**
 * Parent routes: card claim, guardian-invite redemption and recovery. A
 * failing database write or trusted function returns a fixed message, and
 * none of the database's text reaches the response or the logs.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: vi.fn(async () => undefined) }));
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: vi.fn(async () => []) }));

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const post = (handler: (r: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) }));

function setup({ rpcError, write }: { rpcError?: FakeResult['error']; write?: (c: FakeCall) => FakeResult | undefined } = {}) {
  service = createFakeSupabase({
    respond: (c) => {
      const w = write?.(c);
      if (w) return w;
      if (c.table === 'cards' && c.op === 'select') return { data: { id: 'card-1', status: 'assigned', player_id: PLAYER, access_status: null } };
      if (c.table === 'player_invites' && c.op === 'select') return { data: { id: 'inv-1', used_at: null, expires_at: '2999-01-01T00:00:00Z', player_id: PLAYER } };
      return {};
    },
    rpc: (fn) => (fn === 'ensure_profile_role' ? (rpcError ? { error: rpcError } : { data: 'parent' }) : {}),
  });
}

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  session = createFakeSupabase({ user: { id: USER, email: 'person@example.test' } });
  logs = captureLogs();
});
afterEach(() => logs.restore());

describe('parent routes never return or log database text', () => {
  it('claim: a failing ensure_profile_role is a fixed 500', async () => {
    setup({ rpcError: sentinelError('P0001') });
    await expectRedacted(await post(claim, '/api/os/claim', { claimToken: 'ABCD-1234' }), 500, 'Could not set up your account. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'ensure_profile_role', 'P0001');
  });

  it('claim: a failing guardian link is a fixed 500 (a duplicate is still the existing 409)', async () => {
    setup({ write: (c) => (c.table === 'guardians' && c.op === 'insert' ? { error: sentinelError('23503') } : undefined) });
    await expectRedacted(await post(claim, '/api/os/claim', { claimToken: 'ABCD-1234' }), 500, 'Could not claim this player. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'claim: guardian link', '23503');

    setup({ write: (c) => (c.table === 'guardians' && c.op === 'insert' ? { error: sentinelError('23505') } : undefined) });
    await expectRedacted(await post(claim, '/api/os/claim', { claimToken: 'ABCD-1234' }), 409, "You've already claimed this player", logs);
  });

  it('claim: a failing card lock is a fixed 500', async () => {
    setup({ write: (c) => (c.table === 'cards' && c.op === 'update' ? { error: sentinelError('40001') } : undefined) });
    await expectRedacted(await post(claim, '/api/os/claim', { claimToken: 'ABCD-1234' }), 500, 'Could not claim this player. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'claim: card lock', '40001');
  });

  it('guardian invite: failing role, guardian link and mark-used steps are each a fixed 500', async () => {
    setup({ rpcError: sentinelError('P0001') });
    await expectRedacted(await post(redeemGuardianInvite, '/api/os/invites/redeem', { inviteCode: 'INV-1' }), 500, 'Could not set up your account. Please try again.', logs);

    setup({ write: (c) => (c.table === 'guardians' && c.op === 'insert' ? { error: sentinelError('42501') } : undefined) });
    await expectRedacted(await post(redeemGuardianInvite, '/api/os/invites/redeem', { inviteCode: 'INV-1' }), 500, 'Could not accept this invite. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'guardian invite redeem: guardian link', '42501');

    setup({ write: (c) => (c.table === 'player_invites' && c.op === 'update' ? { error: sentinelError('08006') } : undefined) });
    await expectRedacted(await post(redeemGuardianInvite, '/api/os/invites/redeem', { inviteCode: 'INV-1' }), 500, 'Could not accept this invite. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'guardian invite redeem: mark used', '08006');
  });

  it('recovery: a failing order lookup is a fixed 500', async () => {
    session = createFakeSupabase({
      user: { id: USER, email: 'person@example.test' },
      respond: (c) => (c.table === 'orders' ? { error: sentinelError('42P01') } : {}),
    });
    setup();
    await expectRedacted(await listRecoverable(), 500, 'Could not load your orders. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'recover: list orders', '42P01');
  });

  it('a malformed or missing code is logged as "unknown", never echoed', async () => {
    setup({ rpcError: { code: 'SENTINEL; drop table x', message: 'SENTINEL-DB-TEXT' } });
    await expectRedacted(await post(claim, '/api/os/claim', { claimToken: 'ABCD-1234' }), 500, 'Could not set up your account. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'ensure_profile_role', 'unknown');
    expect(logs.text()).not.toContain('drop table');
  });
});
