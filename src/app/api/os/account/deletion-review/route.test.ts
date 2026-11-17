import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, sentinelError } from '@/lib/route-failure.test-support';

let session: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client }));

import { GET } from './route';

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => (logs = captureLogs()));
afterEach(() => logs.restore());
const setup = (user: string | null, result: FakeResult) => (session = createFakeSupabase({ user: user ? { id: user } : null, rpc: () => result }));

describe('GET /api/os/account/deletion-review', () => {
  it('anonymous: 401, no database call', async () => {
    setup(null, { data: { underReview: true } });
    expect((await GET()).status).toBe(401);
    expect(session.rpcCalls).toHaveLength(0);
  });
  it('returns the caller’s own status from my_account_deletion_review (no arguments: the database uses the session)', async () => {
    setup('u1', { data: { underReview: true, coachAccessPaused: true } });
    expect(await (await GET()).json()).toEqual({ underReview: true, coachAccessPaused: true });
    expect(session.rpcCalls).toEqual([{ fn: 'my_account_deletion_review', args: undefined }]);
  });
  it('a database failure reads as "not under review", with a code-only log and no database text', async () => {
    setup('u1', { error: sentinelError('42883') });
    const raw = await (await GET()).text();
    expect(JSON.parse(raw)).toEqual({ underReview: false, coachAccessPaused: false });
    expect(raw + logs.text()).not.toMatch(/SENTINEL/);
  });
});
