import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { AUTHORIZATION_RELATIONSHIPS_CONTRACT, AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS, deployedAppCommit } from '@/lib/release-readiness';
import { POST } from './route';

let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => service.client,
}));
const mockRequireStaff = vi.fn();
vi.mock('@/lib/require-staff', () => ({ requireStaff: (...a: unknown[]) => mockRequireStaff(...a) }));

const STAFF = 'eeeeeeee-0000-4000-8000-000000000005';
const DEPLOYED = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const allChecks = Object.fromEntries(AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS.map((c) => [c, true]));
const post = (body: unknown) => POST(new Request('http://localhost/api/staff/release-readiness', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  mockRequireStaff.mockResolvedValue({ ok: true, userId: STAFF });
  service = createFakeSupabase({ rpc: () => ({ data: '2026-10-21T15:00:00Z' }) });
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', DEPLOYED);
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/staff/release-readiness', () => {
  it('records readiness as the session’s staff member, for the deployed commit, with all six checks', async () => {
    const res = await post({ checks: allChecks });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, contract: 'authorization_relationships_v1', confirmedAt: '2026-10-21T15:00:00Z' });
    expect(service.rpcCalls).toEqual([
      {
        fn: 'confirm_release_readiness',
        args: {
          p_contract: 'authorization_relationships_v1',
          p_app_commit: DEPLOYED,
          p_confirmed_by: STAFF,
          p_card_claim: true,
          p_guardian_invite: true,
          p_team_invite: true,
          p_coach_invite: true,
          p_dual_view: true,
          p_team_request_flow: true,
        },
      },
    ]);
  });

  it('ignores any staff identity or commit supplied by the browser', async () => {
    await post({
      checks: allChecks,
      confirmedBy: 'ffffffff-0000-4000-8000-000000000009',
      p_confirmed_by: 'ffffffff-0000-4000-8000-000000000009',
      appCommit: 'ffffffffffffffffffffffffffffffffffffffff',
      p_app_commit: 'ffffffffffffffffffffffffffffffffffffffff',
      contract: 'something_else',
    });
    expect(service.rpcCalls[0].args).toMatchObject({ p_confirmed_by: STAFF, p_app_commit: DEPLOYED, p_contract: 'authorization_relationships_v1' });
  });

  it.each(AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS)('refuses when %s is missing, false or not literally true', async (name) => {
    for (const value of [undefined, false, 'true', 1]) {
      const res = await post({ checks: { ...allChecks, [name]: value } });
      expect(res.status).toBe(400);
      expect((await res.json()).missing).toEqual([name]);
    }
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('a non-staff or signed-out caller is refused before any database call', async () => {
    mockRequireStaff.mockResolvedValue({ ok: false, status: 403, error: 'Staff access required' });
    expect((await post({ checks: allChecks })).status).toBe(403);
    mockRequireStaff.mockResolvedValue({ ok: false, status: 401, error: 'Sign in required' });
    expect((await post({ checks: allChecks })).status).toBe(401);
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('without a deployed commit from the environment it refuses (no browser fallback)', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    const res = await post({ checks: allChecks, appCommit: DEPLOYED });
    expect(res.status).toBe(503);
    expect(service.rpcCalls).toHaveLength(0);
  });

  it('a second confirmation answers 409 and returns no database detail', async () => {
    service = createFakeSupabase({ rpc: () => ({ error: { message: 'Release readiness for authorization_relationships_v1 is already confirmed' } }) });
    const res = await post({ checks: allChecks });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Release readiness is already confirmed' });
  });
});

describe('release readiness contract', () => {
  it('the deployed commit must look like a git commit id', () => {
    expect(deployedAppCommit({ VERCEL_GIT_COMMIT_SHA: ` ${DEPLOYED.toUpperCase()} ` })).toBe(DEPLOYED);
    expect(deployedAppCommit({ VERCEL_GIT_COMMIT_SHA: 'main' })).toBeNull();
    expect(deployedAppCommit({})).toBeNull();
  });

  it('the app constant and its six checks match migration 0088', () => {
    const sql = readFileSync('supabase/migrations/0088_relationship_authorization_foundation.sql', 'utf8');
    expect(sql).toContain(`check (contract in ('${AUTHORIZATION_RELATIONSHIPS_CONTRACT}'))`);
    expect(sql).toContain(`if p_contract is distinct from '${AUTHORIZATION_RELATIONSHIPS_CONTRACT}' then`);
    const params = AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS.map((c) => 'p_' + c.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()));
    expect(params).toEqual(['p_card_claim', 'p_guardian_invite', 'p_team_invite', 'p_coach_invite', 'p_dual_view', 'p_team_request_flow']);
    for (const p of params) expect(sql).toContain(`${p} boolean`);
  });
});
