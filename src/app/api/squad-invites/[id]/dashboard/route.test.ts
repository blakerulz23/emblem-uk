import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

/**
 * Same deviation-from-DI reasoning as other route.test.ts files in this
 * repo: a fixed Next.js route signature means the Supabase clients are
 * mocked at the module boundary. squad_invite_participations is queried
 * two different shapes here (a head-count query per status, and a plain
 * select for the joined-players list) — dispatched on whether `select()`
 * was called with the `{head:true}` option, since that's the only thing
 * distinguishing the two chains at the mock boundary.
 */
const mockGetUser = vi.fn();
const mockCampaignMaybeSingle = vi.fn();
const mockCountResolve = vi.fn();
const mockJoinedResolve = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      select: (_columns: string, opts?: { head?: boolean }) => {
        if (table === 'squad_invites') {
          return { eq: () => ({ eq: () => ({ maybeSingle: mockCampaignMaybeSingle }) }) };
        }
        if (opts?.head) {
          return { eq: () => ({ eq: () => mockCountResolve() }) };
        }
        return { eq: () => ({ not: () => mockJoinedResolve() }) };
      },
    }),
  }),
}));

const USER_ID = '11111111-2222-4333-8444-555555555555';
const CAMPAIGN_ID = '66095c4d-f177-442a-bf35-cc4f76245841';

const CAMPAIGN_ROW = {
  id: CAMPAIGN_ID, organiser_profile_id: USER_ID, club_team_name: 'Ashton Juniors', football_age_group: 'Under 10',
  deadline_at: '2026-09-15', grace_ends_at: null, campaign_status: 'active', payment_phase: 'disabled',
  fulfilment_status: 'pending', final_tier: null, final_unit_price_pence: null, final_commitment_count: null,
  coach_card_eligible: false,
};

function get() {
  return GET(new NextRequest(`http://localhost/api/squad-invites/${CAMPAIGN_ID}/dashboard`), { params: { id: CAMPAIGN_ID } });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockCampaignMaybeSingle.mockReset();
  mockCountResolve.mockReset();
  mockJoinedResolve.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockCampaignMaybeSingle.mockResolvedValue({ data: CAMPAIGN_ROW });
  mockCountResolve.mockResolvedValue({ count: 0 });
  mockJoinedResolve.mockResolvedValue({ data: [] });
});

describe('GET /api/squad-invites/[id]/dashboard', () => {
  it('rejects with 401 when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await get();
    expect(res.status).toBe(401);
  });

  it('rejects with 404 when the campaign does not exist or is not owned by this organiser', async () => {
    mockCampaignMaybeSingle.mockResolvedValue({ data: null });
    const res = await get();
    expect(res.status).toBe(404);
  });

  it('returns an empty joinedPlayers list when nobody has joined yet', async () => {
    const res = await get();
    const body = await res.json();
    expect(body.campaign.joinedPlayers).toEqual([]);
  });

  it('maps joined participations to exactly {firstName, surnameInitial} — nothing else', async () => {
    mockJoinedResolve.mockResolvedValue({
      data: [
        { display_first_name: 'Alex', display_surname_initial: 'J' },
        { display_first_name: 'Sam', display_surname_initial: 'K' },
      ],
    });
    const res = await get();
    const body = await res.json();
    expect(body.campaign.joinedPlayers).toEqual([
      { firstName: 'Alex', surnameInitial: 'J' },
      { firstName: 'Sam', surnameInitial: 'K' },
    ]);
    for (const player of body.campaign.joinedPlayers) {
      expect(Object.keys(player).sort()).toEqual(['firstName', 'surnameInitial']);
    }
  });

  it('never includes a photo, email or full-surname field anywhere in the response, even if present on the row', async () => {
    // Defends against a future accidental column addition to the select
    // widening what actually reaches the client — even if the mocked row
    // carried extra fields, the route's own mapping must drop them.
    mockJoinedResolve.mockResolvedValue({
      data: [{ display_first_name: 'Alex', display_surname_initial: 'J', guardian_email: 'leak@example.invalid', storage_key: 'order-assets/x' }],
    });
    const res = await get();
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('leak@example.invalid');
    expect(JSON.stringify(body)).not.toContain('storage_key');
    expect(JSON.stringify(body)).not.toContain('order-assets');
  });

  it('treats a null data response as an empty list rather than throwing', async () => {
    mockJoinedResolve.mockResolvedValue({ data: null });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.campaign.joinedPlayers).toEqual([]);
  });

  it('sets no-store cache headers on the response', async () => {
    const res = await get();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
