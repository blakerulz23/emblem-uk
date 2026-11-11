import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// A chainable stand-in for the Supabase query builder: every builder method
// records its call and returns the chain; awaiting it, or calling
// maybeSingle/single, resolves the next queued result for that table.
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
const mockGenerateStoryUpdate = vi.fn();
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: (...args: unknown[]) => mockGenerateStoryUpdate(...args) }));

const PLAYER_ID = '30000000-0000-4000-8000-000000000001';
const COACH_ID = '00000000-0000-4000-8000-0000000000c1';

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/os/celebrate', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
}
const insertCalls = () => (calls.moments ?? []).filter((c) => c[0] === 'insert');

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(results)) delete results[k];
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: COACH_ID } } });
  mockGenerateStoryUpdate.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/os/celebrate', () => {
  it('requires a signed-in user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ playerId: PLAYER_ID, award: 'Great Teammate' });
    expect(res.status).toBe(401);
    expect(calls.moments).toBeUndefined();
  });

  it('rejects a player id that is not a UUID (e.g. a demo display name) before touching the database', async () => {
    const res = await post({ playerId: 'ollie', award: 'Great Teammate' });
    expect(res.status).toBe(400);
    expect(calls.moments).toBeUndefined();
  });

  it('rejects an unreadable body with 400 rather than throwing', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
  });

  it('saves a new recognition, then notifies the family once', async () => {
    results.moments = [{ data: null, error: null }, { data: { id: 'moment-1' }, error: null }];
    const res = await post({ playerId: PLAYER_ID, award: 'Great Teammate', message: '  Brilliant today  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, momentId: 'moment-1' });
    expect(insertCalls()).toHaveLength(1);
    expect(insertCalls()[0][1]).toMatchObject({ player_id: PLAYER_ID, title: 'Great Teammate', trust: 'coach', note: 'Brilliant today', uploaded_by: COACH_ID });
    expect(calls.moments).toContainEqual(['eq', 'note', 'Brilliant today']);
    expect(mockGenerateStoryUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns the existing recognition for an identical retry instead of inserting a duplicate', async () => {
    results.moments = [{ data: { id: 'moment-1' }, error: null }];
    const res = await post({ playerId: PLAYER_ID, award: 'Great Teammate', message: 'Brilliant today' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, momentId: 'moment-1', duplicate: true });
    expect(insertCalls()).toHaveLength(0);
    expect(mockGenerateStoryUpdate).not.toHaveBeenCalled();
    // Scoped to this coach, player and award, within a recent window.
    expect(calls.moments).toEqual(expect.arrayContaining([
      ['eq', 'player_id', PLAYER_ID], ['eq', 'uploaded_by', COACH_ID], ['eq', 'trust', 'coach'], ['eq', 'title', 'Great Teammate'],
    ]));
    expect(calls.moments?.some((c) => c[0] === 'gte' && c[1] === 'created_at')).toBe(true);
  });

  it('treats an empty message as no message, for both the duplicate check and the insert', async () => {
    results.moments = [{ data: null, error: null }, { data: { id: 'moment-2' }, error: null }];
    await post({ playerId: PLAYER_ID, award: 'Great Teammate', message: '   ' });
    expect(calls.moments).toContainEqual(['is', 'note', null]);
    expect(insertCalls()[0][1]).toMatchObject({ note: null });
  });

  it('reports a failed insert without leaking the database message, and notifies nobody', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    results.moments = [{ data: null, error: null }, { data: null, error: { message: 'new row violates row-level security policy "x"' } }];
    const res = await post({ playerId: PLAYER_ID, award: 'Great Teammate' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not send recognition' });
    expect(mockGenerateStoryUpdate).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('POST /api/os/celebrate — only the active Celebrate categories', () => {
  it.each(['Player of the Match', 'First Goal', 'Hardest Worker', 'Most Improved', "Coach's Award"])(
    'rejects the retired category %s with 400, before any database call or family notification',
    async (award) => {
      const res = await post({ playerId: PLAYER_ID, award });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown recognition category' });
      expect(calls.moments).toBeUndefined();
      expect(Object.keys(calls)).toEqual([]);
      expect(mockGenerateStoryUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(['Man of the Match', 'Star of the week', 'great teammate', 'HAT TRICK', 'Hat-Trick', 'Leadership!'])(
    'rejects free text or a near miss (%s) with 400 and no database call',
    async (award) => {
      const res = await post({ playerId: PLAYER_ID, award });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown recognition category' });
      expect(calls.moments).toBeUndefined();
    },
  );

  it.each(['Hat Trick', 'Clean Sheet', 'Great Teammate', 'Leadership'])('saves the active category %s with its exact label as the title', async (award) => {
    results.moments = [{ data: null, error: null }, { data: { id: 'moment-ok' }, error: null }];
    const res = await post({ playerId: PLAYER_ID, award });
    expect(res.status).toBe(200);
    expect(insertCalls()[0][1]).toMatchObject({ title: award, trust: 'coach', verification_status: 'coach_verified' });
    expect(mockGenerateStoryUpdate).toHaveBeenCalledTimes(1);
  });

  it('trims surrounding spaces before matching, and stores the exact label', async () => {
    results.moments = [{ data: null, error: null }, { data: { id: 'moment-trim' }, error: null }];
    const res = await post({ playerId: PLAYER_ID, award: '  Clean Sheet  ' });
    expect(res.status).toBe(200);
    expect(insertCalls()[0][1]).toMatchObject({ title: 'Clean Sheet' });
  });

  it('keeps the earlier missing-field message for an empty or non-string award', async () => {
    for (const award of ['', '   ', 7, null]) {
      const res = await post({ playerId: PLAYER_ID, award });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'playerId and award are required' });
    }
    expect(calls.moments).toBeUndefined();
  });
});
