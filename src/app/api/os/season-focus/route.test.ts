import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The legacy Season Focus POST and My Season: refused only when the server
 * definitely says the feature is on for the player. Every doubt continues
 * exactly as before, so flag-off teams and production before 0108 are unaffected.
 */

const h = vi.hoisted(() => ({
  user: { id: '00000000-0000-4000-8000-0000000000c1' } as { id: string } | null,
  mySeason: vi.fn(),
  create: vi.fn(),
  story: vi.fn(),
  order: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: h.user } }) },
    rpc: (name: string, args: unknown) => {
      h.order.push(name);
      return name === 'my_season_for_player' ? h.mySeason(args) : h.create(args);
    },
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }) };
      return q;
    },
  }),
  createServiceRoleClient: () => {
    throw new Error('never the service role');
  },
}));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: h.story }));
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: async () => [] }));

import { POST } from './route';
import { LEGACY_FOCUS_REPLACED_MESSAGE } from '@/lib/my-season';

const PLAYER = '30000000-0000-4000-8000-000000000001';
const post = (body: unknown = { playerId: PLAYER, label: 'First touch' }) =>
  POST(new NextRequest('http://localhost/api/os/season-focus', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  h.user = { id: '00000000-0000-4000-8000-0000000000c1' };
  h.order = [];
  h.mySeason.mockReset();
  h.create.mockReset().mockResolvedValue({ data: 'f1', error: null });
  h.story.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

async function expectCreated() {
  const res = await post();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, focusId: 'f1' });
  expect(h.create).toHaveBeenCalledWith({ p_player_id: PLAYER, p_label: 'First touch' });
}

describe('POST /api/os/season-focus', () => {
  for (const [name, view] of [
    ['full content', { enabled: true, access: 'guardian', canEditFocus: true, canAddNote: false }],
    ['no access (a direct-link coach)', { enabled: true, access: 'none', reason: 'private_coach' }],
    ['enabled but malformed', { enabled: true }],
  ] as const) {
    it(`enabled:true (${name}): 409 with fixed copy, and nothing written`, async () => {
      h.mySeason.mockResolvedValue({ data: view, error: null });
      const res = await post();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: LEGACY_FOCUS_REPLACED_MESSAGE, code: 'my_season_enabled' });
      expect(h.mySeason).toHaveBeenCalledWith({ p_player_id: PLAYER });
      expect(h.create).not.toHaveBeenCalled();
      expect(h.story).not.toHaveBeenCalled();
    });
  }

  it('enabled:false continues, asking My Season before the write', async () => {
    h.mySeason.mockResolvedValue({ data: { enabled: false }, error: null });
    await expectCreated();
    expect(h.order).toEqual(['my_season_for_player', 'create_season_focus']);
  });

  for (const [name, answer] of [
    ['function missing (PostgREST)', { data: null, error: { code: 'PGRST202', message: 'x' } }],
    ['function missing (Postgres)', { data: null, error: { code: '42883', message: 'x' } }],
    ['any other RPC error', { data: null, error: { code: '57014', message: 'timeout' } }],
    ['an error alongside data claiming enabled', { data: { enabled: true }, error: { code: 'XX000', message: 'x' } }],
    ['an unreadable answer', { data: 'nonsense', error: null }],
    ['no data', { data: null, error: null }],
    ['enabled that is not exactly true', { data: { enabled: 'true' }, error: null }],
  ] as const) {
    it(`${name}: continues exactly as today`, async () => {
      h.mySeason.mockResolvedValue(answer);
      await expectCreated();
    });
  }

  it('a thrown RPC continues exactly as today', async () => {
    h.mySeason.mockRejectedValue(new Error('network'));
    await expectCreated();
  });

  it('deploy kill switch on: My Season is never asked', async () => {
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    h.mySeason.mockResolvedValue({ data: { enabled: true }, error: null });
    await expectCreated();
    expect(h.mySeason).not.toHaveBeenCalled();
  });

  it('signed out and a missing player are answered before any lookup', async () => {
    h.user = null;
    expect((await post()).status).toBe(401);
    h.user = { id: 'u' };
    expect((await post({ label: 'x' })).status).toBe(400);
    expect(h.order).toEqual([]);
  });

  it("the legacy RPC's own errors are unchanged", async () => {
    h.mySeason.mockResolvedValue({ data: { enabled: false }, error: null });
    h.create.mockResolvedValue({ data: null, error: { message: 'Not authorized' } });
    expect((await post()).status).toBe(403);
    h.create.mockResolvedValue({ data: null, error: { message: 'Already 3 active' } });
    expect((await post()).status).toBe(400);
  });
});
