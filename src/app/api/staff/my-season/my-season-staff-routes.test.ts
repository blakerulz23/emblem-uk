import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { captureLogs, expectCodeOnlyLogs, sentinelError } from '@/lib/route-failure.test-support';

/**
 * The staff My Season routes against a mocked session client. The RPCs are the
 * real authority check; these prove the gate order, the user-scoped client,
 * fixed errors and that neither a reason nor a note is ever logged or echoed.
 */

const h = vi.hoisted(() => ({ rpc: vi.fn(), staff: vi.fn(), serviceRole: vi.fn(), createClient: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => {
    h.createClient();
    return { rpc: (...a: unknown[]) => h.rpc(...a) };
  },
  createServiceRoleClient: () => {
    h.serviceRole();
    throw new Error('the staff My Season routes must not use the service role directly');
  },
}));
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...a: unknown[]) => h.staff(...a) }));

import { GET } from './route';
import { POST } from './observations/[id]/remove/route';

const PLAYER = '30000000-0000-4000-8000-000000000001';
const OBS = '50000000-0000-4000-8000-000000000001';
const REASON = 'ZQREASON reported by the family';
const NOTE = 'ZQNOTE kept going after the second goal.';

function req(url: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.origin !== undefined) headers.origin = init.origin;
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  });
}
const list = (playerId: string | null = PLAYER, o: { origin?: string } = {}) => GET(req(`/api/staff/my-season${playerId === null ? '' : `?playerId=${playerId}`}`, o));
const remove = (body: unknown = { reason: `  ${REASON} ` }, id = OBS, o: { origin?: string } = {}) =>
  POST(req(`/api/staff/my-season/observations/${id}/remove`, { method: 'POST', body, ...o }), { params: { id } });

const active = { id: OBS, createdAt: '2026-11-15T10:00:00Z', state: 'active', coachName: 'Coach Danny', formerCoach: false, category: 'kept_going', body: NOTE };
const removed = { id: '50000000-0000-4000-8000-000000000002', createdAt: '2026-11-14T10:00:00Z', state: 'removed', coachName: null, formerCoach: true };

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ data: { status: 'removed' }, error: null });
  h.staff.mockReset().mockResolvedValue({ ok: true, userId: 'staff' });
  h.serviceRole.mockReset();
  h.createClient.mockReset();
  logs = captureLogs();
});
afterEach(() => {
  const text = logs.text();
  logs.restore();
  expect(text).not.toContain('ZQREASON');
  expect(text).not.toContain('ZQNOTE');
  expect(h.serviceRole).not.toHaveBeenCalled();
});

const expectFixed = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const text = await res.text();
  expect(JSON.parse(text).code).toBe(code);
  expect(text).not.toMatch(/SENTINEL|sentinel_secret|ZQREASON|ZQNOTE/);
};

describe('POST remove', () => {
  it('success: the session client calls the RPC with the trimmed reason; the reason is not returned', async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'removed' });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('my_season_staff_remove_observation', { p_observation_id: OBS, p_reason: REASON });
  });

  it('already_removed is a success with its own status', async () => {
    h.rpc.mockResolvedValue({ data: { status: 'already_removed' }, error: null });
    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'already_removed' });
  });

  it('401 and 403 from requireStaff stop before anything else', async () => {
    h.staff.mockResolvedValue({ ok: false, status: 401, error: 'Sign in required' });
    await expectFixed(await remove(), 401, 'sign_in_required');
    h.staff.mockResolvedValue({ ok: false, status: 403, error: 'Staff access required' });
    await expectFixed(await remove(), 403, 'staff_required');
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('cross-origin is refused before the staff check or any client', async () => {
    await expectFixed(await remove(undefined, OBS, { origin: 'https://evil.example' }), 403, 'staff_required');
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.staff).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('a bad id or a bad reason is a 400 that never repeats the reason, with no RPC', async () => {
    await expectFixed(await remove(undefined, 'nope'), 400, 'invalid_input');
    for (const body of [{}, { reason: 3 }, { reason: 'ZQ' }, { reason: '    ' }, { reason: `ZQREASON${'x'.repeat(500)}` }, { reason: 'ZQREASON\u0000 bad' }, { reason: 'ZQREASON \ud800 bad' }, [], 'not json', null]) {
      await expectFixed(await remove(body), 400, 'invalid_reason');
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('each SQLSTATE maps to fixed copy; database text is never echoed or logged', async () => {
    const cases: [string, number, string][] = [['EMS08', 404, 'not_found'], ['EMS09', 409, 'conflict'], ['EMS10', 403, 'staff_required'], ['EMS11', 400, 'invalid_reason']];
    for (const [sqlstate, status, code] of cases) {
      h.rpc.mockResolvedValue({ data: null, error: sentinelError(sqlstate, REASON) });
      await expectFixed(await remove(), status, code);
    }
    expect(logs.text()).toBe('[[],[],[],[]]');
  });

  it('an unexpected failure is a fixed 500 with a code-only log', async () => {
    h.rpc.mockResolvedValue({ data: null, error: sentinelError('XX000', REASON) });
    await expectFixed(await remove(), 500, 'failed');
    expectCodeOnlyLogs(logs, 'staff my season: remove', 'XX000');
    expect(logs.text()).not.toMatch(/SENTINEL/);
  });

  it('an unrecognised RPC answer is a failure, not a success', async () => {
    h.rpc.mockResolvedValue({ data: { status: 'done', reason: REASON }, error: null });
    await expectFixed(await remove(), 500, 'failed');
  });
});

describe('GET list', () => {
  it('success: parsed notes through the session client, no-store', async () => {
    h.rpc.mockResolvedValue({ data: { observations: [active, removed], extra: 'dropped' }, error: null });
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['observations']);
    expect(body.observations[0].body).toBe(NOTE);
    expect(body.observations[1]).toMatchObject({ state: 'removed', category: null, body: null });
    expect(h.rpc).toHaveBeenCalledWith('my_season_staff_list_observations', { p_player_id: PLAYER });
  });

  it('a closed note carrying text breaks the contract: nothing is returned', async () => {
    h.rpc.mockResolvedValue({ data: { observations: [{ ...removed, body: NOTE }] }, error: null });
    await expectFixed(await list(), 500, 'failed');
  });

  it('401, 403, cross-origin, 400, 404', async () => {
    h.staff.mockResolvedValueOnce({ ok: false, status: 401, error: 'x' });
    await expectFixed(await list(), 401, 'sign_in_required');
    h.staff.mockResolvedValueOnce({ ok: false, status: 403, error: 'x' });
    await expectFixed(await list(), 403, 'staff_required');
    await expectFixed(await list(PLAYER, { origin: 'https://evil.example' }), 403, 'staff_required');
    await expectFixed(await list('nope'), 400, 'invalid_input');
    await expectFixed(await list(null), 400, 'invalid_input');
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: null, error: sentinelError('EMS08') });
    await expectFixed(await list(), 404, 'not_found');
    h.rpc.mockResolvedValue({ data: null, error: sentinelError('EMS10') });
    await expectFixed(await list(), 403, 'staff_required');
  });

  it('a deploy kill switch does not stop staff (the routes never consult it)', async () => {
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    h.rpc.mockResolvedValue({ data: { observations: [] }, error: null });
    expect((await list()).status).toBe(200);
    vi.unstubAllEnvs();
  });
});

describe('source rules', () => {
  it('neither route logs a body or names the service role client', () => {
    for (const f of ['src/app/api/staff/my-season/route.ts', 'src/app/api/staff/my-season/observations/[id]/remove/route.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/console\./);
      expect(src).not.toContain('createServiceRoleClient');
      expect(src).not.toMatch(/logRouteFailure\([^)]*(reason|body|data)/);
    }
  });
});
