import { randomBytes } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Same deviation-from-DI reasoning as every other route.test.ts in this
 * repo. Unlike invitation-link/route.ts, this route has no separate
 * ownership pre-check of its own — close_squad_invite_campaign (migration
 * 0066) verifies organiser_profile_id itself, so the route only ever
 * relays the RPC's decision. The RPC itself is mocked here; its own
 * guards are covered by migration-0066-contract.test.ts's source-text
 * assertions against the SQL.
 */
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

const mockRateLimit = vi.fn();
vi.mock('@/lib/squad-invite-rate-limit', () => ({
  consumeSquadInviteRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('next/headers', () => ({
  headers: () => new Headers(),
}));

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const ORGANISER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const CAMPAIGN_ID = 'campaign-1';

function post(headersOverride: Record<string, string> = {}) {
  return POST(
    new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/close`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-emblem-csrf': CSRF_TOKEN,
        Cookie: `emblem_squad_csrf=${CSRF_TOKEN}`,
        ...headersOverride,
      },
      body: JSON.stringify({}),
    }),
    { params: { id: CAMPAIGN_ID } }
  );
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: ORGANISER_ID } } });
  mockRateLimit.mockResolvedValue(true);
  mockRpc.mockResolvedValue({ data: { ok: true, campaignStatus: 'closed' }, error: null });
});

describe('POST /api/squad-invites/[id]/close', () => {
  it('rejects a request with no CSRF evidence at all, before touching auth or the RPC', async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/close`, { method: 'POST', headers: { origin: 'http://localhost' } }),
      { params: { id: CAMPAIGN_ID } }
    );
    expect(res.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request even with a correctly matching CSRF token/cookie pair', async () => {
    const res = await post({ origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires sign-in — never calls the RPC for an unauthenticated request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post();
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('is rate limited on its own dedicated action, scoped to actor + IP', async () => {
    await post();
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'campaign-close', ORGANISER_ID);
  });

  it('returns 429 and never calls the RPC when the rate limit is exhausted', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls close_squad_invite_campaign with the authenticated user as the actor — never a client-supplied id', async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/close`, {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json', 'x-emblem-csrf': CSRF_TOKEN, Cookie: `emblem_squad_csrf=${CSRF_TOKEN}` },
        body: JSON.stringify({ actorProfileId: 'someone-elses-id' }),
      }),
      { params: { id: CAMPAIGN_ID } }
    );
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('close_squad_invite_campaign', { p_campaign_id: CAMPAIGN_ID, p_actor_profile_id: ORGANISER_ID });
  });

  it('succeeds and relays the campaign status on a genuine close', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, campaignStatus: 'closed' });
  });

  it('never leaks database error detail when the RPC rejects — e.g. not owned by this user, or not active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'campaign is not open to close' } });
    const res = await post();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'This campaign could not be closed' });
  });
});
