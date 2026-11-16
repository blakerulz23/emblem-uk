import { randomBytes } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * Same deviation-from-DI reasoning as every other route.test.ts in this
 * repo. This route additionally reads the invitation-link cookie via the
 * global next/headers cookies() (not request.cookies), so that module is
 * mocked too — request.cookies (via the Cookie header below) still drives
 * the real hasValidSquadInviteCsrf check unmocked.
 */
const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    // Photo Day state lookups (0106). Each table returns its configured row;
    // filters are recorded so the guardian scoping can be asserted.
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is']) c[m] = (...args: unknown[]) => { fromFilters.push([table, m, ...args]); return c; };
      c.maybeSingle = async () => ({ data: tableRows[table] ?? null });
      return c;
    },
  }),
}));
const mockRpc = vi.fn();
let tableRows: Record<string, unknown> = {};
const fromFilters: unknown[][] = [];

const mockCookieGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: mockCookieGet }),
  headers: () => new Headers(),
}));

const mockRateLimit = vi.fn();
vi.mock('@/lib/squad-invite-rate-limit', () => ({
  consumeSquadInviteRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const CSRF_TOKEN = randomBytes(32).toString('base64url');
const LINK_TOKEN = randomBytes(32).toString('base64url');
const GUARDIAN_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const GUARDIAN_B = 'bbbbbbbb-2222-4222-8222-222222222222';

function post() {
  return POST(
    new NextRequest('http://localhost/api/squad-invite-links/participation', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'x-emblem-csrf': CSRF_TOKEN,
        Cookie: `emblem_squad_csrf=${CSRF_TOKEN}`,
      },
    })
  );
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockCookieGet.mockReset();
  mockRateLimit.mockReset();
  mockRateLimit.mockResolvedValue(true);
  mockCookieGet.mockReturnValue({ value: LINK_TOKEN });
  tableRows = {};
  fromFilters.length = 0;
});

describe('POST /api/squad-invite-links/participation — creation, retry, and guardian isolation', () => {
  it('creates a new participation on first request (created: true)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN_A } } });
    mockRpc.mockResolvedValue({ data: { participationId: 'p-1', created: true }, error: null });
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ participationId: 'p-1', created: true, photoDay: null });
    expect(mockRpc).toHaveBeenCalledWith('start_squad_invite_participation', expect.objectContaining({ p_guardian_profile_id: GUARDIAN_A }));
  });

  it('a retry by the same guardian is idempotent (created: false, same participation)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN_A } } });
    mockRpc.mockResolvedValue({ data: { participationId: 'p-1', created: false }, error: null });
    const res = await post();
    const body = await res.json();
    expect(body).toEqual({ participationId: 'p-1', created: false, photoDay: null });
  });

  it('a different guardian on the same link gets their own participation, not the first guardian’s', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN_A } } });
    mockRpc.mockResolvedValue({ data: { participationId: 'p-guardian-a', created: true } });
    const resA = await post();
    const bodyA = await resA.json();

    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN_B } } });
    mockRpc.mockResolvedValue({ data: { participationId: 'p-guardian-b', created: true } });
    const resB = await post();
    const bodyB = await resB.json();

    expect(bodyA.participationId).not.toBe(bodyB.participationId);
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'start_squad_invite_participation', expect.objectContaining({ p_guardian_profile_id: GUARDIAN_A }));
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'start_squad_invite_participation', expect.objectContaining({ p_guardian_profile_id: GUARDIAN_B }));
  });

  it('requires sign-in — never creates a participation for an unauthenticated request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await post();
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('sets the builder credential as an httpOnly cookie, never exposed in the JSON body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN_A } } });
    mockRpc.mockResolvedValue({ data: { participationId: 'p-1', created: true } });
    const res = await post();
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['participationId', 'created', 'photoDay']);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('emblem_squad_builder=');
    expect(setCookie.toLowerCase()).toContain('httponly');
  });
});

describe('POST /api/squad-invite-links/participation — Photo Day state (0106)', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: GUARDIAN_A } } });
    mockRpc.mockResolvedValue({ data: { participationId: 'p-1', created: true }, error: null });
  });

  it('asks for permission when the team has a scheduled photo day and no choice is recorded', async () => {
    tableRows = {
      squad_invite_participations: { id: 'p-1', campaign_id: 'c-1', status: 'started' },
      squad_invite_photo_days: { id: 'd-1', status: 'scheduled', scheduled_for: '2026-11-22', venue_label: 'Astley', photos_deleted_at: null },
    };
    const body = await (await post()).json();
    expect(body.photoDay).toEqual({ scheduledFor: '2026-11-22', venueLabel: 'Astley', canGrant: true, decision: null, published: false });
  });

  it('reads only the signed-in guardian’s own participation', async () => {
    tableRows = { squad_invite_participations: { id: 'p-1', campaign_id: 'c-1', status: 'started' } };
    await post();
    expect(fromFilters).toContainEqual(['squad_invite_participations', 'eq', 'guardian_profile_id', GUARDIAN_A]);
  });

  it('reports a recorded decline, and no photo day once the card is committed', async () => {
    tableRows = {
      squad_invite_participations: { id: 'p-1', campaign_id: 'c-1', status: 'started' },
      squad_invite_photo_days: { id: 'd-1', status: 'shooting', scheduled_for: '2026-11-22', venue_label: 'Astley', photos_deleted_at: null },
      squad_invite_permissions: { granted: false, withdrawn_at: null },
    };
    expect((await (await post()).json()).photoDay).toMatchObject({ canGrant: false, decision: 'declined' });
    tableRows.squad_invite_participations = { id: 'p-1', campaign_id: 'c-1', status: 'commitment_completed' };
    expect((await (await post()).json()).photoDay).toBeNull();
  });
});
