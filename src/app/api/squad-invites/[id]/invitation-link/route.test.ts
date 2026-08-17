import { randomBytes } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Same deviation-from-DI reasoning as every other route.test.ts in this
 * repo. effectiveCampaignStatus/mayCompleteExistingBuilder are real, pure
 * functions (no I/O) and are NOT mocked — the eligibility scenarios below
 * are constructed via deadline_at/campaign_status combinations so the real
 * eligibility logic actually runs, the same logic the parent-completion
 * path already relies on.
 */
const mockGetUser = vi.fn();
const mockCampaignSelect = vi.fn();
const mockStaffSelect = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'squad_invites') return { select: () => ({ eq: () => ({ maybeSingle: mockCampaignSelect }) }) };
      if (table === 'staff_accounts') return { select: () => ({ eq: () => ({ maybeSingle: mockStaffSelect }) }) };
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
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
const OTHER_USER_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const CAMPAIGN_ID = 'campaign-1';

function post(headersOverride: Record<string, string> = {}) {
  return POST(
    new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/invitation-link`, {
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

function activeCampaign(overrides: Partial<{ campaign_status: string; deadline_at: string; organiser_profile_id: string }> = {}) {
  return {
    id: CAMPAIGN_ID,
    organiser_profile_id: ORGANISER_ID,
    campaign_status: 'active',
    deadline_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    grace_ends_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 8).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockCampaignSelect.mockReset();
  mockStaffSelect.mockReset();
  mockRpc.mockReset();
  mockRateLimit.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: ORGANISER_ID } } });
  mockCampaignSelect.mockResolvedValue({ data: activeCampaign() });
  mockStaffSelect.mockResolvedValue({ data: null });
  mockRateLimit.mockResolvedValue(true);
  mockRpc.mockResolvedValue({ data: 'new-link-id', error: null });
});

describe('POST /api/squad-invites/[id]/invitation-link — hardened contract', () => {
  it('rejects a request with no CSRF evidence at all, before touching auth or the RPC', async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/invitation-link`, { method: 'POST', headers: { origin: 'http://localhost' } }),
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

  it('rejects a mismatched CSRF header/cookie pair', async () => {
    const res = await post({ 'x-emblem-csrf': randomBytes(32).toString('base64url') });
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires sign-in — never calls the RPC for an unauthenticated request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post();
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('denies a non-owning, non-staff user with a generic 404 — never a distinguishing error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: OTHER_USER_ID } } });
    mockCampaignSelect.mockResolvedValue({ data: activeCampaign() }); // organiser_profile_id stays ORGANISER_ID
    const res = await post();
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('allows staff (not just the owning organiser) — the same authorisedCampaign() path the rest of the route already used', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: OTHER_USER_ID } } });
    mockStaffSelect.mockResolvedValue({ data: { profile_id: OTHER_USER_ID } });
    const res = await post();
    expect(res.status).toBe(200);
  });

  it('is rate limited on a dedicated action distinct from every other Squad Invite action, scoped to actor + IP', async () => {
    await post();
    expect(mockRateLimit).toHaveBeenCalledWith(expect.anything(), 'link-replace', ORGANISER_ID);
  });

  it('returns 429 and never calls the RPC when the rate limit is exhausted', async () => {
    mockRateLimit.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('succeeds for an eligible owner on an active campaign', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitationPath).toMatch(/^\/squad-invite\/access#token=/);
    expect(mockRpc).toHaveBeenCalledWith('replace_squad_invite_link', expect.objectContaining({ p_campaign_id: CAMPAIGN_ID, p_actor_profile_id: ORGANISER_ID }));
  });

  it('succeeds during the 24h grace period after the deadline has passed', async () => {
    mockCampaignSelect.mockResolvedValue({ data: activeCampaign({
      campaign_status: 'active',
      deadline_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2h past deadline, inside 24h grace
    }) });
    const res = await post();
    expect(res.status).toBe(200);
  });

  it.each(['cancelled', 'expired', 'exception', 'pricing_finalised', 'draft', 'awaiting_staff_approval'])(
    'rejects an ineligible campaign_status=%s with 409, never calling the RPC',
    async (status) => {
      mockCampaignSelect.mockResolvedValue({ data: activeCampaign({ campaign_status: status }) });
      const res = await post();
      expect(res.status).toBe(409);
      expect(mockRpc).not.toHaveBeenCalled();
    }
  );

  it('rejects once the campaign is long past its deadline and grace window (deadline_reached)', async () => {
    mockCampaignSelect.mockResolvedValue({ data: activeCampaign({
      campaign_status: 'active',
      deadline_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 48h past deadline, past the 24h grace
    }) });
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('derives eligibility from the freshly-read campaign row only — the client sends no campaign state', async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/invitation-link`, {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json', 'x-emblem-csrf': CSRF_TOKEN, Cookie: `emblem_squad_csrf=${CSRF_TOKEN}` },
        body: JSON.stringify({ campaignStatus: 'active', eligible: true }), // attacker-supplied, must be ignored
      }),
      { params: { id: CAMPAIGN_ID } }
    );
    expect(res.status).toBe(200); // succeeds only because the mocked DB row is genuinely active, not because of the body
  });

  it('passes only a SHA-256 hash to the RPC — never a raw token — and never logs or returns a raw token substring', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await post();
    const body = await res.json();
    const rawToken = body.invitationPath.split('#token=')[1];
    const rpcCall = mockRpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcCall.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rpcCall.p_token_hash).not.toBe(rawToken);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(rawToken);
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(rawToken);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('never leaks database error detail when the RPC itself rejects', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'campaign unavailable' } });
    const res = await post();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invitation link could not be replaced' });
  });
});
