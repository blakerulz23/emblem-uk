import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The four /api/os/my-season routes against a mocked user-scoped Supabase
 * client. The RPC is the authorization boundary, so each relationship is
 * modelled by what my_season_for_player / the write RPCs return or raise
 * (design section 2): guardian, current coach, former coach, private
 * coach, unrelated user, account under review, deleted coach's notes.
 */

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rpc: vi.fn(),
  createClient: vi.fn(),
  serviceRole: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => {
    h.createClient();
    return { auth: { getUser: () => Promise.resolve({ data: { user: h.user } }) }, rpc: (...a: unknown[]) => h.rpc(...a) };
  },
  createServiceRoleClient: () => {
    h.serviceRole();
    throw new Error('My Season routes must never use the service role');
  },
}));

import { GET } from './route';
import { POST as postFocus } from './focus/route';
import { POST as postObservation } from './observations/route';
import { POST as postWithdraw } from './observations/[id]/withdraw/route';

const PLAYER = '30000000-0000-4000-8000-000000000001';
const OBS = '50000000-0000-4000-8000-000000000001';
const REQ = '40000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-0000000000c1';
const LEAKY = { code: 'P0001', message: 'Riley Hart is not yours (guardian@example.com)' };

const focus = { id: 'f1', title: 'Talk more on the pitch', whyItMatters: 'So my teammates know where I am.', whatItLooksLike: 'Calling for the ball.', startedOn: '2026-09-06', endedAt: null, authorRole: 'coach', authorName: 'Coach Danny' };
const note = { id: OBS, category: 'spoke_up', body: 'Called for the ball twice in the second half.', createdAt: '2026-11-15T10:00:00Z', coachName: 'Coach Danny', formerCoach: false, mine: false, withdrawn: false };
const content = (o: Record<string, unknown> = {}) => ({ enabled: true, access: 'guardian', canEditFocus: true, canAddNote: false, activeFocus: focus, earlierFocuses: [], observations: [note], ...o });

function req(url: string, init: { method?: string; body?: unknown; origin?: string; host?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.origin !== undefined) headers.origin = init.origin;
  if (init.host) headers.host = init.host;
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  });
}
const get = (playerId: string | null = PLAYER, o: { origin?: string } = {}) => GET(req(`/api/os/my-season${playerId === null ? '' : `?playerId=${playerId}`}`, o));
const focusBody = (o: Record<string, unknown> = {}) => ({ playerId: PLAYER, title: '  Talk more on the pitch ', whyItMatters: 'So my teammates know where I am.', whatItLooksLike: 'Calling for the ball.', startedOn: '2026-09-06', requestId: REQ, ...o });
const obsBody = (o: Record<string, unknown> = {}) => ({ playerId: PLAYER, category: 'kept_going', body: ' Chased every ball in the last minute. ', requestId: REQ, ...o });
const withdraw = (id: string, o: { origin?: string } = {}) => postWithdraw(req(`/api/os/my-season/observations/${id}/withdraw`, { method: 'POST', ...o }), { params: { id } });

beforeEach(() => {
  h.user = { id: USER };
  h.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  h.createClient.mockReset();
  h.serviceRole.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  expect(h.serviceRole).not.toHaveBeenCalled();
});

describe('GET /api/os/my-season', () => {
  it('guardian: returns the parsed view from my_season_for_player, no-store', async () => {
    h.rpc.mockResolvedValue({ data: { ...content(), extra: 'dropped' }, error: null });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(content());
    expect(h.rpc).toHaveBeenCalledWith('my_season_for_player', { p_player_id: PLAYER });
  });

  it('current team coach: canAddNote and own notes come straight through', async () => {
    const v = content({ access: 'coach', canAddNote: true, observations: [{ ...note, mine: true }, { ...note, id: 'o2', mine: true, withdrawn: true }] });
    h.rpc.mockResolvedValue({ data: v, error: null });
    expect(await (await get()).json()).toEqual(v);
  });

  it('former coach and private coach: access none with a reason and no content', async () => {
    for (const reason of ['former_coach', 'private_coach']) {
      h.rpc.mockResolvedValue({ data: { enabled: true, access: 'none', reason }, error: null });
      expect(await (await get()).json()).toEqual({ enabled: true, access: 'none', reason });
    }
  });

  it('account under deletion review: access none, account_review', async () => {
    h.rpc.mockResolvedValue({ data: { enabled: true, access: 'none', reason: 'account_review' }, error: null });
    expect(await (await get()).json()).toEqual({ enabled: true, access: 'none', reason: 'account_review' });
  });

  it('unrelated user or feature off: enabled false, nothing else', async () => {
    h.rpc.mockResolvedValue({ data: { enabled: false }, error: null });
    expect(await (await get()).json()).toEqual({ enabled: false });
  });

  it('before 0108 is applied (function missing: PGRST202 / 42883): 200 enabled false, not a 5xx', async () => {
    for (const code of ['PGRST202', '42883']) {
      h.rpc.mockResolvedValue({ data: null, error: { code, message: 'Could not find the function' } });
      const res = await get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ enabled: false });
    }
  });

  it("a deleted coach's note keeps a null name", async () => {
    const v = content({ observations: [{ ...note, coachName: null, formerCoach: true }] });
    h.rpc.mockResolvedValue({ data: v, error: null });
    expect((await (await get()).json()).observations[0].coachName).toBeNull();
  });

  it('signed out: 401, no RPC', async () => {
    h.user = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('deploy kill switch on: 404 before any Supabase client is created', async () => {
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    const res = await get();
    expect(res.status).toBe(404);
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('bad or missing playerId: 400, no RPC', async () => {
    for (const id of [null, 'riley', `${PLAYER}x`, "' or 1=1"]) {
      const res = await get(id === null ? null : encodeURIComponent(id));
      expect(res.status).toBe(400);
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('cross-origin: 403 when Origin is present and its host differs; same-origin Origin is fine', async () => {
    for (const origin of ['https://evil.example', 'null', 'http://localhost.evil.example']) {
      const res = await get(PLAYER, { origin });
      expect(res.status).toBe(403);
    }
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: { enabled: false }, error: null });
    expect((await get(PLAYER, { origin: 'http://localhost' })).status).toBe(200);
  });

  it('an RPC error maps to a fixed message and never leaks database text', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { ...LEAKY, code: 'EMS01' } });
    let res = await get();
    expect(res.status).toBe(401);
    h.rpc.mockResolvedValue({ data: null, error: LEAKY });
    res = await get();
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/Riley|example\.com/);
  });

  it('a response outside the contract is refused, not forwarded', async () => {
    h.rpc.mockResolvedValue({ data: { enabled: true, access: 'staff', secret: 'Riley' }, error: null });
    const res = await get();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('Riley');
  });
});

describe('POST /api/os/my-season/focus', () => {
  const post = (body: unknown, o: { origin?: string } = {}) => postFocus(req('/api/os/my-season/focus', { method: 'POST', body, ...o }));

  it('guardian or current coach: calls my_season_set_focus with trimmed values', async () => {
    h.rpc.mockResolvedValue({ data: 'focus-1', error: null });
    const res = await post(focusBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, focusId: 'focus-1' });
    expect(h.rpc).toHaveBeenCalledWith('my_season_set_focus', {
      p_player_id: PLAYER, p_title: 'Talk more on the pitch', p_why: 'So my teammates know where I am.', p_looks_like: 'Calling for the ball.',
      p_started_on: '2026-09-06', p_request_id: REQ,
    });
  });

  it('bad input: 400 with no RPC', async () => {
    for (const body of ['{nope', focusBody({ title: 'ab' }), focusBody({ requestId: 'x' }), focusBody({ playerId: 'riley' }), focusBody({ startedOn: '2099-01-01' }), focusBody({ whyItMatters: undefined })]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('former/private coach or unrelated user (EMS03): 403; feature off (EMS02): 404; review (EMS04): 403; reused request (EMS06): 409', async () => {
    const cases: [string, number, string][] = [['EMS03', 403, 'not_allowed'], ['EMS02', 404, 'not_available'], ['EMS04', 403, 'account_review'], ['EMS06', 409, 'request_conflict'], ['EMS05', 400, 'invalid_input']];
    for (const [code, status, appCode] of cases) {
      h.rpc.mockResolvedValue({ data: null, error: { ...LEAKY, code } });
      const res = await post(focusBody());
      expect(res.status).toBe(status);
      const json = await res.json();
      expect(json.code).toBe(appCode);
      expect(JSON.stringify(json)).not.toMatch(/Riley|example\.com/);
    }
  });

  it('signed out 401, kill switch 404, cross-origin 403: none reach the RPC', async () => {
    h.user = null;
    expect((await post(focusBody())).status).toBe(401);
    h.user = { id: USER };
    expect((await post(focusBody(), { origin: 'https://evil.example' })).status).toBe(403);
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    expect((await post(focusBody())).status).toBe(404);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/os/my-season/observations', () => {
  const post = (body: unknown, o: { origin?: string } = {}) => postObservation(req('/api/os/my-season/observations', { method: 'POST', body, ...o }));

  it('current team coach: calls my_season_add_observation with the trimmed body', async () => {
    h.rpc.mockResolvedValue({ data: 'obs-1', error: null });
    const res = await post(obsBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, observationId: 'obs-1' });
    expect(h.rpc).toHaveBeenCalledWith('my_season_add_observation', { p_player_id: PLAYER, p_category: 'kept_going', p_body: 'Chased every ball in the last minute.', p_request_id: REQ });
  });

  it('bad input (category, length, three sentences, ids): 400 with no RPC', async () => {
    for (const body of [obsBody({ category: 'top_player' }), obsBody({ body: 'Too short.' }), obsBody({ body: 'a'.repeat(161) }), obsBody({ body: 'One thing here. Two things here. Three things.' }), obsBody({ playerId: 'x' }), obsBody({ requestId: null }), 'nope']) {
      expect((await post(body)).status).toBe(400);
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('own child (EMS07), former/private coach (EMS03), review (EMS04)', async () => {
    const cases: [string, number, string][] = [['EMS07', 403, 'own_child'], ['EMS03', 403, 'not_allowed'], ['EMS04', 403, 'account_review'], ['EMS02', 404, 'not_available'], ['EMS01', 401, 'sign_in_required']];
    for (const [code, status, appCode] of cases) {
      h.rpc.mockResolvedValue({ data: null, error: { ...LEAKY, code } });
      const res = await post(obsBody());
      expect(res.status).toBe(status);
      expect((await res.json()).code).toBe(appCode);
    }
  });

  it('cross-origin and kill switch never reach the RPC', async () => {
    expect((await post(obsBody(), { origin: 'https://evil.example' })).status).toBe(403);
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    expect((await post(obsBody())).status).toBe(404);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/os/my-season/observations/[id]/withdraw', () => {
  it('the author: calls my_season_withdraw_observation', async () => {
    const res = await withdraw(OBS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith('my_season_withdraw_observation', { p_observation_id: OBS });
  });

  it('not the author, unknown id or no longer on the team (EMS03) 403; feature off (EMS02) 404; review (EMS04) 403', async () => {
    for (const [code, status] of [['EMS03', 403], ['EMS02', 404], ['EMS04', 403]] as const) {
      h.rpc.mockResolvedValue({ data: null, error: { ...LEAKY, code } });
      const res = await withdraw(OBS);
      expect(res.status).toBe(status);
      expect(JSON.stringify(await res.json())).not.toMatch(/Riley|example\.com/);
    }
  });

  it('bad id 400, signed out 401, cross-origin 403, kill switch 404', async () => {
    expect((await withdraw('not-a-uuid')).status).toBe(400);
    h.user = null;
    expect((await withdraw(OBS)).status).toBe(401);
    h.user = { id: USER };
    expect((await withdraw(OBS, { origin: 'https://evil.example' })).status).toBe(403);
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    expect((await withdraw(OBS)).status).toBe(404);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('route sources', () => {
  it('use the user-scoped client only (never the service role) and pass no DB text into responses', async () => {
    const { readFileSync } = await import('node:fs');
    const files = [
      'src/app/api/os/my-season/route.ts',
      'src/app/api/os/my-season/focus/route.ts',
      'src/app/api/os/my-season/observations/route.ts',
      'src/app/api/os/my-season/observations/[id]/withdraw/route.ts',
      'src/lib/my-season-api.ts',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('createServiceRoleClient');
      expect(src).not.toMatch(/error\??\.message/);
    }
  });
});
