import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { ADD_ACH } from '@/app/os/data';

// Chainable stand-in for the Supabase query builder: records every builder
// call per table and resolves the next queued result when awaited or on
// maybeSingle/single.
type Call = [string, ...unknown[]];
const calls: Record<string, Call[]> = {};
const results: Record<string, unknown[]> = {};
function chain(table: string): unknown {
  const take = () => Promise.resolve((results[table] ?? []).shift() ?? { data: null, error: null });
  const proxy: unknown = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => take().then(res, rej);
      if (prop === 'maybeSingle' || prop === 'single') return () => take();
      return (...args: unknown[]) => { (calls[table] ??= []).push([String(prop), ...args]); return proxy; };
    },
  });
  return proxy;
}

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: () => mockGetUser() }, from: (table: string) => chain(table) }),
}));
const mockEligible = vi.fn();
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: (...a: unknown[]) => mockEligible(...a) }));
const mockGenerateStoryUpdate = vi.fn();
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: (...a: unknown[]) => mockGenerateStoryUpdate(...a) }));
vi.mock('@/lib/s3-client', () => ({ getSignedDownloadUrl: vi.fn(), AUTHENTICATED_OS_MEDIA_EXPIRY_SEC: 60 }));

const PLAYER_ID = '30000000-0000-4000-8000-000000000001';
const GUARDIAN_ID = '00000000-0000-4000-8000-0000000000a1';

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/os/moments', { method: 'POST', body: JSON.stringify(body) }));
}
const insertCalls = () => (calls.moments ?? []).filter((c) => c[0] === 'insert');

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(results)) delete results[k];
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: GUARDIAN_ID } } });
  mockEligible.mockReset().mockResolvedValue([]);
  mockGenerateStoryUpdate.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/os/moments — retired Add-a-moment labels', () => {
  it.each(['Player of the Match', 'player of the match', 'PLAYER OF THE MATCH', '  Player of the Match  ', 'Player  of the\tMatch'])(
    'refuses a new moment titled %j with 400, before any database call or notification',
    async (title) => {
      const res = await post({ playerId: PLAYER_ID, title, note: 'Great game' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'This moment type is no longer available' });
      expect(Object.keys(calls)).toEqual([]);
      expect(mockEligible).not.toHaveBeenCalled();
      expect(mockGenerateStoryUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(ADD_ACH.map((a) => a.label))('still saves the Add-a-moment item %s', async (title) => {
    results.players = [{ data: { name: 'Synthetic Player', team_id: null }, error: null }];
    results.moments = [{ data: { id: 'moment-1' }, error: null }];
    const res = await post({ playerId: PLAYER_ID, title });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, momentId: 'moment-1', status: 'family_memory' });
    expect(insertCalls()).toHaveLength(1);
    expect(insertCalls()[0][1]).toMatchObject({ player_id: PLAYER_ID, title, trust: 'parent', uploaded_by: GUARDIAN_ID });
  });

  it.each(['Player of the Match nominee', 'Players of the Match', 'Man of the Match'])(
    'only the exact retired label is refused; %j is not',
    async (title) => {
      results.moments = [{ data: { id: 'moment-2' }, error: null }];
      const res = await post({ playerId: PLAYER_ID, title });
      expect(res.status).toBe(200);
      expect(insertCalls()).toHaveLength(1);
    },
  );
});
